import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { HEADER_SECRETO } from "../_shared/trabajador.mjs";
import {
  MODELO_DEFAULT, MAX_VUELTAS_REVISION, piezaParaTrabajar, ErrorCuota, esperaPedida,
  hoyAR, leerFecha, planificar,
  promptInvestigador, leerInvestigacion,
  promptRedactor, armarPieza, chequearLargos,
  promptRevisor, leerRevision, describirProblemas, parsearJson,
} from "./logic.mjs";

// Pipeline de texto de UP. Lo dispara pg_cron cada mañana (con x-trabajador-secreto) para el día de hoy,
// o la dueña desde la app (con su sesión) para una fecha puntual.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Gemini saturado o con error interno (503/500): se reintenta dos veces. Límite de cuota (429): si pide esperar poco se espera una vez;
// si no, la corrida se corta con ErrorCuota y lo que falta queda para la próxima.
const ESPERAS_SATURADO_MS = [3000, 8000];
const ESPERA_CUOTA_MAX_S = 20;

async function gemini(geminiKey: string, modelo: string, prompt: { sistema: string; usuario: string }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${geminiKey}`;
  let esperoCuota = false;
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.sistema }] },
        contents: [{ role: "user", parts: [{ text: prompt.usuario }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await r.json();
    if ((r.status === 503 || r.status === 500) && intento < ESPERAS_SATURADO_MS.length) {
      await new Promise(res => setTimeout(res, ESPERAS_SATURADO_MS[intento]));
      continue;
    }
    if (r.status === 429) {
      const espera = esperaPedida(data);
      if (!esperoCuota && espera !== null && espera <= ESPERA_CUOTA_MAX_S) {
        esperoCuota = true;
        await new Promise(res => setTimeout(res, Math.ceil(espera * 1000) + 500));
        continue;
      }
      throw new ErrorCuota(data?.error?.message || "Gemini llegó al límite de consultas.");
    }
    if (!r.ok) throw new Error(data?.error?.message || `Gemini respondió HTTP ${r.status}.`);
    return parsearJson(data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "");
  }
}

type Dia = { id: string; owner_id: string; fecha: string; tema_semana: string; tema_dia: string; redes: string[]; formato_instagram: string; tema_instagram: string | null; fotos_propias: boolean };

async function procesarDia(admin: any, llamar: (p: any) => Promise<any>, dia: Dia, regenerar: boolean) {
  const redes = planificar(dia);
  const { data: existentes, error } = await admin.from("up_piezas").select("id,red,estado,respuesta,texto").eq("owner_id", dia.owner_id).eq("fecha", dia.fecha);
  if (error) throw new Error(error.message);

  // Agente 1: crea las piezas que falten; solo se trabaja sobre las que todavía se pueden reescribir.
  const porRed = new Map<string, any>((existentes ?? []).map((p: any) => [p.red, p]));
  for (const red of redes) {
    if (!porRed.has(red)) {
      const { data, error: e } = await admin.from("up_piezas").insert({ owner_id: dia.owner_id, calendario_id: dia.id, fecha: dia.fecha, red }).select("id,red,estado,respuesta,texto").single();
      if (e) throw new Error(e.message);
      porRed.set(red, data);
    }
  }
  const aTrabajar: any[] = redes.map(r => porRed.get(r)).filter((p: any) => piezaParaTrabajar(p, regenerar));
  if (!aTrabajar.length) return { fecha: dia.fecha, piezas: [] };

  // La respuesta de Daniela (pantalla "Necesito que me cuentes") vale para todo el día.
  const respuesta = (existentes ?? []).map((p: any) => p.respuesta).find((r: string | null) => r && r.trim()) ?? null;
  const { data: ficha, error: errorFicha } = await admin.from("up_ficha_datos").select("id,grupo,dato").eq("owner_id", dia.owner_id).order("grupo").order("orden");
  if (errorFicha) throw new Error(errorFicha.message);

  // Agente 2: investigador, una vez por día.
  const investigacion = leerInvestigacion(await llamar(promptInvestigador({ dia, ficha, respuesta })), ficha);
  if (!investigacion.suficiente) {
    await admin.from("up_piezas").update({ estado: "falta_info", pregunta: investigacion.pregunta, texto: null, motivo_revision: null }).in("id", aTrabajar.map((p: any) => p.id));
    return { fecha: dia.fecha, piezas: aTrabajar.map((p: any) => ({ red: p.red, estado: "falta_info" })) };
  }
  const datos = ficha.filter((d: any) => investigacion.datos.includes(d.id));

  // Agentes 3 y 4 por red, de a una (la cuota gratuita de Gemini es de pocas consultas por minuto):
  // redactor, revisor y hasta MAX_VUELTAS_REVISION correcciones.
  const resultados: any[] = [];
  for (const p of aTrabajar) {
    try {
      let pieza = armarPieza(p.red, dia, await llamar(promptRedactor({ red: p.red, dia, datos, respuesta })));
      let vueltas = 0;
      let problemas: any[] = [];
      while (true) {
        problemas = chequearLargos(p.red, pieza);
        if (!problemas.length) problemas = leerRevision(await llamar(promptRevisor({ red: p.red, pieza, datos, respuesta }))).problemas;
        if (!problemas.length || vueltas >= MAX_VUELTAS_REVISION) break;
        vueltas++;
        pieza = armarPieza(p.red, dia, await llamar(promptRedactor({ red: p.red, dia, datos, respuesta, correccion: { motivos: describirProblemas(problemas), anterior: pieza.texto } })));
      }
      const estado = problemas.length ? "revision" : "pendiente";
      await admin.from("up_piezas").update({
        texto: pieza.texto, contenido: pieza.contenido, estado, intentos_revision: vueltas,
        motivo_revision: problemas.length ? describirProblemas(problemas) : null, problemas: problemas.length ? problemas : null,
        datos_usados: investigacion.datos, pregunta: null,
      }).eq("id", p.id);
      resultados.push({ red: p.red, estado, vueltas });
    } catch (e) {
      if (e instanceof ErrorCuota) throw e;
      const mensaje = e instanceof Error ? e.message : String(e);
      await admin.from("up_piezas").update({ estado: "error", motivo_revision: mensaje }).eq("id", p.id);
      resultados.push({ red: p.red, estado: "error", error: mensaje });
    }
  }
  return { fecha: dia.fecha, piezas: resultados };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!geminiKey || !supabaseUrl || !serviceKey) return json({ error: "UP no está configurado: falta GEMINI_API_KEY o la conexión a la base." }, 503);
  const admin = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try { body = await req.json(); } catch { /* el cron no manda cuerpo */ }
  let fecha: string;
  try { fecha = leerFecha(body) ?? hoyAR(); } catch (e) { return json({ error: (e as Error).message }, 400); }

  // Quién corre: el cron (todas las filas del día) o la dueña con su sesión (solo sus filas).
  let ownerId: string | null = null;
  const secreto = req.headers.get(HEADER_SECRETO);
  if (secreto) {
    const { data: valido } = await admin.rpc("trabajador_secreto_valido", { p_secreto: secreto });
    if (valido !== true) return json({ error: "Secreto inválido." }, 401);
  } else {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
    const { data, error } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
    if (error || !data?.user) return json({ error: "Iniciá sesión." }, 401);
    ownerId = data.user.id;
  }

  let consulta = admin.from("up_calendario").select("id,owner_id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias").eq("fecha", fecha);
  if (ownerId) consulta = consulta.eq("owner_id", ownerId);
  const { data: dias, error } = await consulta;
  if (error) return json({ error: error.message }, 500);
  if (!dias?.length) return json({ fecha, dias: [], mensaje: "No hay publicación en el calendario para esa fecha." });

  const modelo = Deno.env.get("UP_MODEL") || MODELO_DEFAULT;
  const llamar = (p: any) => gemini(geminiKey, modelo, p);
  const regenerar = body?.regenerar === true;
  try {
    const resultado: any[] = [];
    for (const dia of dias) resultado.push(await procesarDia(admin, llamar, dia, regenerar));
    return json({ fecha, modelo, dias: resultado });
  } catch (e) {
    if (e instanceof ErrorCuota) {
      return json({ fecha, modelo, cortado: true, mensaje: "Gemini llegó a su límite de consultas. Lo que falta se completa en la próxima corrida (o probá de nuevo en un minuto)." });
    }
    console.error("up-pipeline:", e instanceof Error ? e.message : String(e));
    return json({ error: `No se pudieron generar los borradores (${e instanceof Error ? e.message : "error desconocido"}).` }, 500);
  }
});
