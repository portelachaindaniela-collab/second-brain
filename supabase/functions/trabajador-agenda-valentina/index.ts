import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { identificarCorrida, abrirCorrida, cerrarCorrida, HEADER_SECRETO } from "../_shared/trabajador.mjs";
import {
  TRABAJADOR, leerParametros, estadoPages, contarLogs, revisarGroq, revisarCole, revisarChat, usoDino, resultadoAgenda, avisarYa, diaAR,
} from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const PROYECTO = "itultpcdafpxpgtblgfb";

async function estado(url: string) {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    await r.body?.cancel();
    return r.status;
  } catch { return 0; }
}

async function revisarSitio(url: string) {
  const [status, manifest, sw] = await Promise.all([estado(url), estado(url + "manifest.webmanifest"), estado(url + "sw.js")]);
  return { status, manifest, sw };
}

async function revisarPages(repo: string) {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "second-brain-agenda-valentina" };
  const token = Deno.env.get("GITHUB_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=10`, { headers, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { pages: null, pagesError: `GitHub ${r.status}` };
    return { pages: estadoPages(await r.json()), pagesError: null };
  } catch (e) { return { pages: null, pagesError: String(e).slice(0, 80) }; }
}

// Sin código de familia agenda-dulce contesta 401 {"error":"codigo"}: eso prueba que arranca y lee la base.
async function revisarFuncion(base: string, funcion: string, apikey: string) {
  try {
    const r = await fetch(`${base}/functions/v1/${funcion}`, { method: "POST", headers: { apikey, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20000) });
    const cuerpo = await r.json().catch(() => null);
    return { ok: r.status === 401 && cuerpo?.error === "codigo", status: r.status };
  } catch { return { ok: false, status: 0 }; }
}

// El calendario que tiene suscripto mamá. Solo se mira el tipo: el contenido no se lee ni se guarda.
async function revisarIcs(base: string, funcion: string, token: string | null) {
  if (!token) return { probado: false, ok: false, status: 0 };
  try {
    const r = await fetch(`${base}/functions/v1/${funcion}?ics=${token}`, { signal: AbortSignal.timeout(20000) });
    await r.body?.cancel();
    return { ok: r.ok && /text\/calendar/i.test(r.headers.get("content-type") ?? ""), status: r.status };
  } catch { return { ok: false, status: 0 }; }
}

// Listar modelos es gratis: no gasta mensajes del Dino.
async function modelosGroq() {
  const clave = Deno.env.get("GROQ_API_KEY");
  if (!clave) return null;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${clave}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return ((await r.json())?.data ?? []).filter((m: any) => m.active !== false).map((m: any) => m.id);
  } catch { return null; }
}

// El respaldo del Dino: que la clave de OpenRouter valga y queden créditos. Leer los créditos no gasta.
async function revisarOpenRouter() {
  const clave = Deno.env.get("OPENROUTER_API_KEY");
  if (!clave) return "sin_clave";
  try {
    const pedir = (ruta: string) => fetch(`https://openrouter.ai/api/v1/${ruta}`, { headers: { Authorization: `Bearer ${clave}` }, signal: AbortSignal.timeout(15000) });
    const r = await pedir("credits");
    if (!r.ok) return (await pedir("key")).ok ? "ok" : "error";
    const d = (await r.json().catch(() => null))?.data;
    return d && d.total_credits - d.total_usage > 0 ? "ok" : "error";
  } catch { return "error"; }
}

// Los logs de agenda-dulce salen de la Management API: hace falta un token personal en el secreto SUPABASE_GESTION_TOKEN.
// Sin él, el resto de los chequeos sigue y el reporte dice "sin acceso".
async function leerLogs(funcion: string, ahora: number) {
  const token = Deno.env.get("SUPABASE_GESTION_TOKEN");
  if (!token) return null;
  const pedir = async (sql: string) => {
    const q = new URLSearchParams({ sql, iso_timestamp_start: new Date(ahora - 24 * 3600_000).toISOString(), iso_timestamp_end: new Date(ahora).toISOString() });
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/analytics/endpoints/logs.all?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    const cuerpo = await r.json().catch(() => null);
    if (!r.ok || cuerpo?.error) throw new Error(`logs ${r.status}`);
    return cuerpo?.result ?? [];
  };
  try {
    const [cincos, mensajes] = await Promise.all([
      pedir(`select count(*) as n from function_edge_logs cross join unnest(metadata) as m cross join unnest(m.request) as q cross join unnest(m.response) as r where q.pathname like '%/${funcion}%' and r.status_code >= 500`),
      pedir(`select event_message from function_logs where event_message like '%${funcion}%' and (event_message like '%IA %' or event_message like '%no anda, paso a%' or event_message like '%openrouter%' or event_message like '%OpenRouter%') limit 1000`),
    ]);
    return contarLogs({ errores5xx: cincos[0]?.n ?? 0, mensajes });
  } catch (e) {
    console.warn("trabajador-agenda-valentina: no se pudieron leer los logs", String(e));
    return null;
  }
}

async function avisarPorPush(admin: any, ownerId: string, texto: string) {
  const publica = Deno.env.get("VAPID_PUBLIC_KEY"), privada = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publica || !privada) return 0;
  webpush.setVapidDetails("https://danielaportelachain.vercel.app", publica, privada);
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("owner_id", ownerId).eq("activo", true);
  let enviados = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ titulo: "Agenda de Valentina", texto }));
      enviados++;
    } catch (e) { console.error("trabajador-agenda-valentina: falló el push", sub.id, String(e)); }
  }
  return enviados;
}

// verify_jwt apagado: la corre pg_cron con el secreto de Vault o el botón [correr] del panel con la sesión.
// Solo lee la app de Valentina y su backend; nunca escribe en dulce_* ni le manda nada a ella o a mamá.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const base = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(base, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    await identificarCorrida({ admin, req, clave: TRABAJADOR, body });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, e?.status ?? 500);
  }

  let corrida = null;
  try {
    corrida = await abrirCorrida(admin, TRABAJADOR);
    const ahora = Date.now();
    const [{ data: config }, { data: anterior }] = await Promise.all([
      admin.from("trabajadores").select("parametros").eq("clave", TRABAJADOR).maybeSingle(),
      admin.from("trabajos_corridas").select("payload").eq("trabajador", TRABAJADOR).eq("estado", "ok")
        .order("iniciado_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const p = leerParametros(config?.parametros);

    const { data: familias, error: errorFamilia } = await admin.from("dulce_familias").select("id,nombre,ics_token").order("creada");
    if (errorFamilia) throw new Error(`No se pudo leer dulce_familias: ${errorFamilia.message}`);
    const familia = (familias ?? []).find((f: any) => f.nombre === p.familia) ?? familias?.[0] ?? null;

    const desde24 = new Date(ahora - 24 * 3600_000).toISOString();
    const desdeUso = new Date(ahora - 8 * 24 * 3600_000);
    const sinFamilia = Promise.resolve({ data: null });
    const [sitio, pagesRes, funcion, ics, ids, openrouter, logs, agendaRes, recientesRes, sinLeerRes, usoRes] = await Promise.all([
      revisarSitio(p.url),
      revisarPages(p.repo),
      revisarFuncion(base, p.funcion, Deno.env.get("SUPABASE_ANON_KEY")!),
      revisarIcs(base, p.funcion, familia?.ics_token ?? null),
      modelosGroq(),
      revisarOpenRouter(),
      leerLogs(p.funcion, ahora),
      familia ? admin.from("dulce_agenda").select("datos,actualizado").eq("familia_id", familia.id).maybeSingle() : sinFamilia,
      familia ? admin.from("dulce_mensajes").select("id,de,leido,creado").eq("familia_id", familia.id).gte("creado", desde24).limit(2000) : sinFamilia,
      familia ? admin.from("dulce_mensajes").select("id,de,leido,creado").eq("familia_id", familia.id).eq("de", "mama").eq("leido", false).limit(500) : sinFamilia,
      familia ? admin.from("dulce_uso").select("dia,cantidad").eq("familia_id", familia.id).gte("dia", diaAR(desdeUso.getTime())) : sinFamilia,
    ]);

    const agenda = agendaRes.data ?? null;
    const porId = new Map<number, any>();
    for (const m of [...(recientesRes.data ?? []), ...(sinLeerRes.data ?? [])]) porId.set(m.id, m);
    const chequeos = {
      sitio, ...pagesRes, funcion, ics,
      groq: ids ? revisarGroq(ids, p.modelo) : null,
      openrouter,
      logs,
      agenda: agenda ? { actualizado: agenda.actualizado } : null,
      cole: agenda ? revisarCole(agenda, { ahora, diasExamenes: p.dias_examenes, idsConNotaAntes: anterior?.payload?.cole?.ids_con_nota ?? null }) : null,
      chat: familia ? revisarChat([...porId.values()], { ahora, horasSinLeer: p.horas_sin_leer }) : null,
      dino: usoDino(usoRes.data ?? [], { ahora }),
    };
    const resultado = resultadoAgenda(chequeos, p, ahora);
    await cerrarCorrida(admin, corrida, resultado);

    let push = 0;
    if (avisarYa(resultado.payload.semaforo, anterior?.payload?.semaforo)) {
      const { data: fila } = await admin.from("trabajadores").select("owner_id").eq("clave", TRABAJADOR).maybeSingle();
      if (fila?.owner_id) push = await avisarPorPush(admin, fila.owner_id, resultado.payload.resumen);
    }
    return json({ id: corrida.id, estado: "ok", semaforo: resultado.payload.semaforo, resumen: resultado.payload.resumen, push });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await cerrarCorrida(admin, corrida, { estado: "error", error: mensaje });
    return json({ id: corrida?.id, estado: "error", error: mensaje }, 502);
  }
});
