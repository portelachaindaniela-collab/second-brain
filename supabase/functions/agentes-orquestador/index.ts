import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { identificarCorrida, abrirCorrida, cerrarCorrida, HEADER_SECRETO } from "../_shared/trabajador.mjs";
import { resultadoCorrida } from "./corrida.mjs";
import { saludTrabajador, reporteSitios, reporteTareas, reporteGoogle, reporteMaria, reporteBS67 } from "./consolidar.mjs";

// María no ejecuta trabajo: lee lo que dejaron los trabajadores en trabajos_corridas, consolida qué corrió,
// qué falló y qué quedó pendiente, y lo guarda en process_reports. BS67 y Hoy leen de ahí.
const TRABAJADOR = "maria";
const VENTANA_MS = 26 * 3600_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = { ...cors, "Content-Type": "application/json" };

async function ultimaCorrida(admin: any, clave: string, soloOk = false) {
  let q = admin.from("trabajos_corridas").select("id,trabajador,estado,iniciado_at,finalizado_at,error,payload").eq("trabajador", clave);
  if (soloOk) q = q.eq("estado", "ok");
  const { data } = await q.order("iniciado_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

// La prueba de BS67 que hace María en cada vuelta, sin gastar consultas de IA: que las funciones de BS67 arranquen
// (sin sesión contestan "Iniciá sesión") y que las claves de Groq y Gemini sigan valiendo (listar modelos es gratis).
async function probarBS67() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const funcion = async (nombre: string) => {
    try {
      const r = await fetch(`${url}/functions/v1/${nombre}`, { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20000) });
      const cuerpo = await r.json().catch(() => null);
      return r.status === 401 && typeof cuerpo?.error === "string";
    } catch { return false; }
  };
  const ia = async (clave: string | undefined, pedir: (c: string) => Promise<Response>) => {
    if (!clave) return "sin_clave";
    try { return (await pedir(clave)).ok ? "ok" : "error"; } catch { return "error"; }
  };
  const [chat, up, groq, gemini] = await Promise.all([
    funcion("bs67-chat"), funcion("up-asistente"),
    ia(Deno.env.get("GROQ_API_KEY"), c => fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${c}` }, signal: AbortSignal.timeout(15000) })),
    ia(Deno.env.get("GEMINI_API_KEY"), c => fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${c}`, { signal: AbortSignal.timeout(15000) })),
  ]);
  return { funciones: { "bs67-chat": chat, "up-asistente": up }, ias: { groq, gemini } };
}

async function consolidar(admin: any, ownerId: string) {
  const ahora = Date.now();
  const [trabajadoresRes, corridasRes] = await Promise.all([
    admin.from("trabajadores").select("clave,nombre,activo,frecuencia,minutos_trabado,created_at").eq("owner_id", ownerId).neq("clave", TRABAJADOR).order("nombre"),
    admin.from("trabajos_corridas").select("trabajador,estado,iniciado_at,error").neq("trabajador", TRABAJADOR)
      .gte("iniciado_at", new Date(ahora - VENTANA_MS).toISOString()).order("iniciado_at", { ascending: false }).limit(5000),
  ]);
  if (trabajadoresRes.error) throw new Error(`No se pudieron leer los trabajadores: ${trabajadoresRes.error.message}`);
  if (corridasRes.error) throw new Error(`No se pudieron leer las corridas: ${corridasRes.error.message}`);
  const trabajadores = trabajadoresRes.data ?? [];
  const corridas = corridasRes.data ?? [];

  // La última corrida de cada uno, aunque sea más vieja que la ventana (un trabajador semanal, por ejemplo).
  const ultimas = await Promise.all(trabajadores.map((t: any) => ultimaCorrida(admin, t.clave)));
  const saludes = trabajadores.map((t: any, i: number) => {
    const propias = corridas.filter((c: any) => c.trabajador === t.clave);
    const u = ultimas[i];
    if (u && !propias.some((c: any) => c.iniciado_at === u.iniciado_at)) propias.push(u);
    return saludTrabajador(t, propias, ahora);
  });
  const salud = (clave: string) => saludes.find((s: any) => s.clave === clave);

  const [sitios, tareas, googleUltima, googleOk, registroBS67, pruebaBS67] = await Promise.all([
    ultimaCorrida(admin, "monitor_sitios", true),
    ultimaCorrida(admin, "tareas_estancadas", true),
    ultimaCorrida(admin, "google_sync"),
    ultimaCorrida(admin, "google_sync", true),
    admin.from("bs67_registro").select("app,tipo,estado,ia,ms,error,at").eq("owner_id", ownerId).gte("at", new Date(ahora - 24 * 3600_000).toISOString()).limit(2000),
    probarBS67(),
  ]);
  // BS67 va primero: es la prioridad de María.
  const reportes = [
    reporteBS67(registroBS67.data ?? [], pruebaBS67, ahora),
    reporteSitios(sitios, salud("monitor_sitios"), ahora),
    reporteTareas(tareas, salud("tareas_estancadas"), ahora),
    reporteGoogle(googleUltima, googleOk, ahora),
    reporteMaria(saludes),
  ];
  return { reportes, saludes };
}

// verify_jwt está apagado: la corre pg_cron con el secreto de Vault o la pantalla María con la sesión.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const responder = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: json });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let quien;
  try {
    const body = await req.json().catch(() => ({}));
    quien = await identificarCorrida({ admin, req, clave: TRABAJADOR, body });
  } catch (e: any) {
    return responder({ error: e?.message ?? String(e) }, e?.status ?? 500);
  }

  let corrida = null;
  const inicio = new Date().toISOString();
  try {
    if (quien.anotar) corrida = await abrirCorrida(admin, TRABAJADOR);
    const { reportes, saludes } = await consolidar(admin, quien.ownerId);
    const { error } = await admin.from("process_reports").insert(reportes.map(r => ({
      owner_id: quien.ownerId, agente: r.agente, estado: r.estado, resumen: r.resumen, detalle: r.datos,
      iniciado_at: inicio, finalizado_at: new Date().toISOString(),
    })));
    if (error) throw new Error(`No se pudo guardar lo consolidado: ${error.message}`);
    await cerrarCorrida(admin, corrida, resultadoCorrida(reportes, saludes));
    return responder({ generado: new Date().toISOString(), agentes: reportes, trabajadores: saludes });
  } catch (e) {
    await cerrarCorrida(admin, corrida, { estado: "error", error: String(e) });
    return responder({ error: String(e) }, 500);
  }
});
