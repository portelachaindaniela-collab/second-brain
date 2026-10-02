import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { identificarCorrida, abrirCorrida, cerrarCorrida, HEADER_SECRETO } from "../_shared/trabajador.mjs";
import {
  TRABAJADOR, leerParametros, leerFeed, leerPostsX, leerPostsBluesky, filasDeItems, mediosATocar, ogImage, codificacionDe,
} from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const NAVEGADOR = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", "Accept": "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8" };
const EN_PARALELO = 12;
const X_EN_PARALELO = 3;
const MAX_FOTOS_POR_CORRIDA = 20;

async function traerTexto(url: string, ms = 12000): Promise<string> {
  const r = await fetch(url, { headers: NAVEGADOR, redirect: "follow", signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return new TextDecoder(codificacionDe(bytes, r.headers.get("content-type") ?? "")).decode(bytes);
}

async function enTandas<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const salida: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += n) salida.push(...await Promise.allSettled(items.slice(i, i + n).map(fn)));
  return salida;
}

const motivo = (e: unknown) => (e instanceof Error ? (e.name === "TimeoutError" ? "no respondió a tiempo" : e.message) : String(e));

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

async function leerWeb(medio: any, p: ReturnType<typeof leerParametros>) {
  try {
    return { filas: filasDeItems(leerFeed(await traerTexto(medio.rss), medio.sitio ?? medio.rss), medio, "web", p), error: null };
  } catch (e) { return { filas: [], error: `web: ${motivo(e)}` }; }
}

// FxTwitter corta (404/429) cuando le llegan muchos pedidos juntos del mismo servidor: de a pocos y un reintento.
async function leerX(medio: any, p: ReturnType<typeof leerParametros>) {
  let ultimo = "";
  for (let intento = 0; intento < 2; intento++) {
    if (intento) await esperar(2000);
    try {
      const datos = JSON.parse(await traerTexto(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(medio.x)}/statuses`, 15000));
      if (datos?.code && datos.code !== 200) throw new Error(datos.message ?? `FxTwitter ${datos.code}`);
      return { filas: filasDeItems(leerPostsX(datos, medio.x), medio, "x", p), error: null };
    } catch (e) { ultimo = motivo(e); }
  }
  return { filas: [], error: `X: ${ultimo}` };
}

async function leerBluesky(medio: any, p: ReturnType<typeof leerParametros>) {
  try {
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(medio.bluesky)}&limit=30&filter=posts_no_replies`;
    return { filas: filasDeItems(leerPostsBluesky(JSON.parse(await traerTexto(url)), medio.bluesky), medio, "bluesky", p), error: null };
  } catch (e) { return { filas: [], error: `Bluesky: ${motivo(e)}` }; }
}

// Quien está en X y en Bluesky suele publicar lo mismo en los dos: Bluesky se lee solo si no hay X o X falló.
async function leerMedios(tanda: any[], p: ReturnType<typeof leerParametros>) {
  const lecturas = new Map(tanda.map(m => [m.id, { medio: m, filas: [] as any[], errores: [] as string[] }]));
  const sumar = (id: number, r: { filas: any[]; error: string | null }) => {
    const l = lecturas.get(id)!;
    l.filas.push(...r.filas);
    if (r.error) l.errores.push(r.error);
  };
  const social = async (m: any) => {
    const deX = m.x ? await leerX(m, p) : null;
    if (deX && !deX.error) return sumar(m.id, deX);
    if (m.bluesky) {
      const deBluesky = await leerBluesky(m, p);
      if (!deBluesky.error || !deX) return sumar(m.id, deBluesky);
    }
    if (deX) sumar(m.id, deX);
  };
  await Promise.all([
    enTandas(tanda.filter(m => m.rss), EN_PARALELO, async m => sumar(m.id, await leerWeb(m, p))),
    enTandas(tanda.filter(m => m.x || m.bluesky), X_EN_PARALELO, social),
  ]);
  return [...lecturas.values()];
}

async function correr(admin: any, ownerId: string, parametros: unknown) {
  const p = leerParametros(parametros);
  const { data: medios, error } = await admin.from("noticias_medios").select("*").eq("owner_id", ownerId);
  if (error) throw new Error(`No se pudo leer la lista de medios: ${error.message}`);
  const tanda = mediosATocar(medios ?? [], p.medios_por_corrida);
  if (!tanda.length) throw new Error("No hay medios activos para leer.");

  const lecturas = await leerMedios(tanda, p);
  const filas = lecturas.flatMap(l => l.filas);

  // Una misma nota puede llegar dos veces en la tanda (dos secciones del mismo medio): queda una.
  const unicas = [...new Map(filas.map(f => [f.url, f])).values()];
  // De a 40: la lista va en la URL de la consulta y con cientos de links se pasa del largo permitido.
  const ya = new Set<string>();
  for (let i = 0; i < unicas.length; i += 40) {
    const { data, error: errorLectura } = await admin.from("noticias").select("url").eq("owner_id", ownerId).in("url", unicas.slice(i, i + 40).map(f => f.url));
    if (errorLectura) throw new Error(`No se pudieron leer las noticias guardadas: ${errorLectura.message}`);
    for (const e of data ?? []) ya.add(e.url);
  }
  const nuevas = unicas.filter(f => !ya.has(f.url));

  // A las notas de la web que llegaron sin foto se les busca la de la página (og:image), con tope por corrida.
  const sinFoto = nuevas.filter(f => !f.imagen && f.canal === "web").slice(0, MAX_FOTOS_POR_CORRIDA);
  await enTandas(sinFoto, EN_PARALELO, async f => { f.imagen = ogImage(await traerTexto(f.url, 8000), f.url); });

  if (nuevas.length) {
    const { error: errorAlta } = await admin.from("noticias")
      .upsert(nuevas.map(f => ({ ...f, owner_id: ownerId })), { onConflict: "owner_id,url", ignoreDuplicates: true });
    if (errorAlta) throw new Error(`No se pudieron guardar las noticias: ${errorAlta.message}`);
  }

  const ahora = new Date().toISOString();
  await enTandas(lecturas, EN_PARALELO, l => admin.from("noticias_medios")
    .update({ ultima_lectura_at: ahora, ultimo_error: l.errores.length ? l.errores.join(" · ") : null }).eq("id", l.medio.id));

  const limite = new Date(Date.now() - p.dias_conservar * 86_400_000).toISOString();
  const { count: borradas } = await admin.from("noticias").delete({ count: "exact" })
    .eq("owner_id", ownerId).eq("guardada", false).lt("publicada_at", limite);

  const porTema: Record<string, number> = {};
  for (const f of nuevas) for (const t of f.temas) porTema[t] = (porTema[t] ?? 0) + 1;
  const conError = lecturas.filter(l => l.errores.length);
  return {
    nuevas: nuevas.length,
    resumen: {
      medios_leidos: lecturas.length,
      medios_totales: (medios ?? []).length,
      notas_de_tema: unicas.length,
      ya_estaban: unicas.length - nuevas.length,
      nuevas: nuevas.length,
      por_tema: porTema,
      fotos_buscadas: sinFoto.length,
      borradas_por_viejas: borradas ?? 0,
      ...(conError.length ? { errores: conError.map(l => `${l.medio.medio} (${l.medio.pais}) · ${l.errores.join(" · ")}`) } : {}),
    },
  };
}

// verify_jwt apagado: la corre pg_cron con el secreto de Vault o el botón [correr] del panel con la sesión.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let quien;
  try {
    const body = await req.json().catch(() => ({}));
    quien = await identificarCorrida({ admin, req, clave: TRABAJADOR, body });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, e?.status ?? 500);
  }

  let corrida = null;
  try {
    corrida = quien.anotar ? await abrirCorrida(admin, TRABAJADOR) : null;
    const { data: config, error } = await admin.from("trabajadores").select("parametros").eq("clave", TRABAJADOR).maybeSingle();
    if (error || !config) throw new Error("No hay configuración para Canillita.");
    const { nuevas, resumen } = await correr(admin, quien.ownerId, config.parametros);
    await cerrarCorrida(admin, corrida, { estado: "ok", cantidad: nuevas, payload: resumen });
    return json({ id: corrida?.id, estado: "ok", nuevas });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await cerrarCorrida(admin, corrida, { estado: "error", error: mensaje });
    return json({ id: corrida?.id, estado: "error", error: mensaje }, 502);
  }
});
