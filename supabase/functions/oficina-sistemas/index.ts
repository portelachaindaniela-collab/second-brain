import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validarPedido, accionValida, notaResultado, notaCalendario, filasCalendario, issueDelPedido, notaProgramar, tareaDelPedido, MOTIVO_FRENO, REPO, WORKFLOW_DISENADOR, ETIQUETA } from "./logic.mjs";

// Sistemas: aprueba y ejecuta un pedido con acción: programar (lo abre en GitHub para que Claude escriba el código),
// tarea (queda en el Archivo a cargo del supervisor del área), el de Noruega cuando el Diseñador se trabó (frenar piezas) o el
// de Mesa de entrada para cargar en UP el calendario que salió de una reunión. Solo lo puede
// pedir la dueña con su sesión: es su aprobación. Frena las piezas (con su sesión, RLS) y cancela la corrida trabada
// de la Action si hay un token de GitHub con permiso; deja en el pedido una nota con lo que hizo.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();

async function cancelarDisenador() {
  const token = env.GITHUB_TOKEN;
  if (!token) return { estado: "sin_token" };
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "second-brain-oficina-sistemas" };
  try {
    const ids: number[] = [];
    for (const status of ["in_progress", "queued"]) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_DISENADOR}/runs?status=${status}&per_page=10`, { headers, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { estado: "error", detalle: `GitHub ${r.status}` };
      ids.push(...((await r.json()).workflow_runs || []).map((w: any) => w.id));
    }
    if (!ids.length) return { estado: "sin_corridas" };
    let n = 0;
    for (const id of ids) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${id}/cancel`, { method: "POST", headers, signal: AbortSignal.timeout(15000) });
      if (r.status === 202) n++;
      else if (!n) return { estado: "error", detalle: `GitHub ${r.status}${r.status === 403 ? ": el token no tiene permiso para cancelar" : ""}` };
    }
    return { estado: "canceladas", n };
  } catch (e) {
    return { estado: "error", detalle: (e as Error).message.slice(0, 80) };
  }
}

// Abre el pedido como issue con la etiqueta de Sistemas (la Action de Claude lo toma de ahí).
async function abrirIssue(s: any) {
  const token = env.GITHUB_TOKEN;
  if (!token) return { estado: "sin_token" };
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "second-brain-oficina-sistemas", "Content-Type": "application/json" };
  try {
    // La etiqueta, por si todavía no existe (si ya está, GitHub responde 422 y sigue).
    await fetch(`https://api.github.com/repos/${REPO}/labels`, { method: "POST", headers, body: JSON.stringify({ name: ETIQUETA, color: "6d3bff", description: "Pedido aprobado en la Oficina: lo programa Claude" }), signal: AbortSignal.timeout(15000) });
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, { method: "POST", headers, body: JSON.stringify(issueDelPedido(s)), signal: AbortSignal.timeout(15000) });
    if (r.status !== 201) return { estado: "error", detalle: `GitHub ${r.status}${r.status === 403 || r.status === 404 ? ": el token no tiene permiso para crear issues" : ""}` };
    return { estado: "abierto", url: (await r.json()).html_url };
  } catch (e) {
    return { estado: "error", detalle: (e as Error).message.slice(0, 80) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: u, error: eU } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  if (eU || !u?.user) return json({ error: "Iniciá sesión." }, 401);
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Cuerpo inválido." }, 400); }
  const v: any = validarPedido(body);
  if (!v.ok) return json({ error: v.error }, 400);

  const { data: s, error } = await db.from("oficina_solicitudes").select("id,estado,accion,agente,titulo,detalle").eq("id", v.id).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!s) return json({ error: "No encontré ese pedido." }, 404);
  if (s.estado !== "pendiente") return json({ error: "Ese pedido ya se decidió." }, 409);
  if (!accionValida(s.accion)) return json({ error: "Ese pedido no tiene una acción que se pueda ejecutar." }, 400);

  // La aprobación queda registrada antes de hacer nada.
  const aprobado = await db.from("oficina_solicitudes").update({ estado: "aprobada", decidida: new Date().toISOString() }).eq("id", s.id).eq("estado", "pendiente").select("id");
  if (aprobado.error || !aprobado.data?.length) return json({ error: "No se pudo aprobar el pedido." }, 409);

  if (s.accion.tipo === "programar") {
    const r: any = await abrirIssue(s);
    const nota = notaProgramar(r);
    // Queda aprobado (en marcha) hasta que Daniela mergee el PR y lo marque hecho; si no se pudo abrir, la nota dice qué falta.
    await db.from("oficina_solicitudes").update({ nota }).eq("id", s.id);
    return json({ ok: true, nota, issue: r.url ?? null });
  }

  if (s.accion.tipo === "tarea") {
    const t = tareaDelPedido(s);
    const { error: eT } = await db.from("oficina_tareas").insert(t);
    const quien = t.responsable.split(":")[1].replace(/_/g, " ");
    const nota = eT ? `Aprobado, pero no pude anotar la tarea: ${eT.message}` : `Aprobado: quedó como tarea de ${quien} en el Archivo, y su supervisor la sigue en las reuniones.`;
    await db.from("oficina_solicitudes").update({ estado: eT ? "aprobada" : "hecha", nota }).eq("id", s.id);
    return json({ ok: true, nota });
  }

  // Cargar en el calendario de UP los días que armó María en el acta (con la sesión de Daniela; no pisa días cargados).
  if (s.accion.tipo === "cargar_calendario_up") {
    const fechas = s.accion.dias.map((d: any) => d.fecha).sort();
    const { data: ya, error: e1 } = await db.from("up_calendario").select("fecha").gte("fecha", fechas[0]).lte("fecha", fechas.at(-1));
    if (e1) return json({ error: e1.message }, 500);
    const filas = filasCalendario(s.accion, (ya || []).map((x: any) => x.fecha));
    if (filas.length) {
      const { error: e2 } = await db.from("up_calendario").insert(filas);
      if (e2) {
        await db.from("oficina_solicitudes").update({ nota: `No pude cargar el calendario: ${e2.message}` }).eq("id", s.id);
        return json({ error: `No pude cargar el calendario: ${e2.message}` }, 500);
      }
    }
    const nota = notaCalendario({ pedidos: fechas.length, cargados: filas.length });
    await db.from("oficina_solicitudes").update({ estado: "hecha", nota }).eq("id", s.id);
    return json({ ok: true, nota, cargados: filas.length });
  }

  const piezas: string[] = s.accion.piezas;
  let frenadas = 0;
  if (piezas.length) {
    const r = await db.from("up_piezas").update({ estado: "revision", motivo_revision: MOTIVO_FRENO }).in("id", piezas).eq("estado", "aprobado").select("id");
    if (r.error) {
      await db.from("oficina_solicitudes").update({ nota: `No pude frenar las piezas: ${r.error.message}` }).eq("id", s.id);
      return json({ error: `No pude frenar las piezas: ${r.error.message}` }, 500);
    }
    frenadas = r.data?.length ?? 0;
  }
  const cancelacion = s.accion.cancelar_disenador ? await cancelarDisenador() : { estado: "no_pedida" };
  const nota = notaResultado({ pedidas: piezas.length, frenadas, cancelacion });
  await db.from("oficina_solicitudes").update({ estado: "hecha", nota }).eq("id", s.id);
  return json({ ok: true, nota, frenadas, cancelacion });
});
