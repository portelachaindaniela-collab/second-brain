import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  MAX_VUELTAS, HERRAMIENTAS, ACCIONES, proveedor, sistema, validarAccion, describirAccion, urlPermitida, htmlATexto, historialParaModelo,
} from "./logic.mjs";

// Asistente de UP. La app manda { mensajes } (la conversación) o { ejecutar: { nombre, args } } (una acción que la
// dueña confirmó). Lee y escribe con la sesión de la dueña (RLS), nunca con permisos de servicio.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const TZ = "America/Argentina/Buenos_Aires";
const hoyAR = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const masDias = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const env = Deno.env.toObject();

async function modelo(prov: any, messages: any[], conHerramientas = true) {
  const r = await fetch(prov.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${prov.clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: prov.modelo, messages, temperature: 0.4, max_tokens: 1500, ...(conHerramientas && { tools: HERRAMIENTAS, tool_choice: "auto" }) }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json().catch(() => null);
  if (r.status === 429) throw new Error("La IA llegó a su límite de consultas gratis por ahora. Probá de nuevo en un rato.");
  if (!r.ok) throw new Error(data?.error?.message || `La IA respondió HTTP ${r.status}.`);
  return data?.choices?.[0]?.message ?? {};
}

// Búsqueda web: con Groq, su modelo Compound (busca solo); con Gemini, la búsqueda de Google integrada.
async function buscarWeb(prov: any, consulta: string) {
  if (prov.nombre === "groq") {
    const m = await modelo({ ...prov, modelo: "groq/compound" }, [{ role: "user", content: `Buscá en internet y respondé en español con las fuentes (URLs): ${consulta}` }], false);
    return { resultado: m.content || "Sin resultados." };
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(prov.modelo)}:generateContent?key=${prov.clave}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Buscá en internet y respondé en español: ${consulta}` }] }], tools: [{ google_search: {} }] }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) return { error: `La búsqueda web no está disponible ahora (${data?.error?.message || r.status}).` };
  const c = data?.candidates?.[0];
  const fuentes = (c?.groundingMetadata?.groundingChunks || []).map((g: any) => g.web && `${g.web.title}: ${g.web.uri}`).filter(Boolean).slice(0, 6);
  return { resultado: (c?.content?.parts || []).map((p: any) => p.text ?? "").join(""), fuentes };
}

async function leerLink(valor: string) {
  const url = urlPermitida(valor);
  if (!url) return { error: "Solo puedo leer páginas públicas (http o https)." };
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (UP asistente)" }, signal: AbortSignal.timeout(12000) });
    if (!urlPermitida(r.url)) return { error: "La página redirige a una dirección que no puedo leer." };
    if (!r.ok) return { error: `La página respondió HTTP ${r.status}.` };
    const tipo = r.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(tipo)) return { error: `No es una página de texto (${tipo || "tipo desconocido"}).` };
    const html = (await r.text()).slice(0, 2_000_000);
    return { url: r.url, titulo: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null, texto: htmlATexto(html) };
  } catch (e) {
    return { error: `No pude leer la página (${e instanceof Error ? e.message : String(e)}).` };
  }
}

async function correrPipeline(jwt: string, fecha: string) {
  const r = await fetch(`${env.SUPABASE_URL}/functions/v1/up-pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ fecha }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) return `Los agentes no pudieron generar: ${data.error || `HTTP ${r.status}`}.`;
  if (data.cortado) return data.mensaje;
  if (!data.dias?.length) return "Ese día no tiene publicación en el calendario.";
  return "Los agentes generaron los borradores: están en Hoy (o en «Necesito que me cuentes» si falta un dato).";
}

// Herramientas de lectura: corren solas y devuelven datos para el modelo.
async function leer(db: any, prov: any, nombre: string, a: any) {
  const hoy = hoyAR();
  switch (nombre) {
    case "estado_hoy": {
      const [d, p] = await Promise.all([
        db.from("up_calendario").select("fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,salteado").eq("fecha", hoy).maybeSingle(),
        db.from("up_piezas").select("red,estado,pregunta,motivo_revision,error_publicacion,url_publicada").eq("fecha", hoy),
      ]);
      return { hoy, dia: d.data, piezas: p.data };
    }
    case "pendientes": {
      const { data } = await db.from("up_piezas").select("fecha,red,estado,pregunta,motivo_revision,error_publicacion")
        .or(`estado.eq.falta_info,estado.eq.revision,and(estado.eq.aprobado,fecha.gte.${hoy})`).order("fecha");
      const p = data || [];
      return {
        preguntas: [...new Map(p.filter((x: any) => x.estado === "falta_info").map((x: any) => [x.fecha, { fecha: x.fecha, pregunta: x.pregunta }])).values()],
        en_revision: p.filter((x: any) => x.estado === "revision").map((x: any) => ({ fecha: x.fecha, red: x.red, motivo: x.motivo_revision })),
        aprobados_sin_publicar: p.filter((x: any) => x.estado === "aprobado").map((x: any) => ({ fecha: x.fecha, red: x.red, error_publicacion: x.error_publicacion })),
      };
    }
    case "ver_calendario": {
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(a?.desde) ? a.desde : hoy;
      const hasta = /^\d{4}-\d{2}-\d{2}$/.test(a?.hasta) ? a.hasta : masDias(desde, 14);
      const [d, p] = await Promise.all([
        db.from("up_calendario").select("fecha,tema_semana,tema_dia,redes,formato_instagram,salteado").gte("fecha", desde).lte("fecha", hasta).order("fecha"),
        db.from("up_piezas").select("fecha,red,estado").gte("fecha", desde).lte("fecha", hasta),
      ]);
      return { desde, hasta, dias: (d.data || []).map((x: any) => ({ ...x, piezas: (p.data || []).filter((q: any) => q.fecha === x.fecha).map((q: any) => `${q.red}: ${q.estado}`) })) };
    }
    case "ver_borrador": {
      const { data } = await db.from("up_piezas").select("fecha,red,estado,texto,problemas").eq("fecha", a?.fecha).eq("red", a?.red).maybeSingle();
      return data ?? { error: "No hay pieza para esa fecha y red." };
    }
    case "buscar_ficha": {
      let q = db.from("up_ficha_datos").select("grupo,dato,fuente").order("grupo").order("orden");
      if (a?.grupo) q = q.eq("grupo", a.grupo);
      const { data } = await q;
      const t = typeof a?.texto === "string" ? a.texto.toLowerCase() : "";
      return { datos: (data || []).filter((d: any) => !t || d.dato.toLowerCase().includes(t)) };
    }
    case "estado_noruega": {
      const { data } = await db.from("up_chequeos").select("estado,chequeos,at").order("at", { ascending: false }).limit(1).maybeSingle();
      return data ?? { error: "Noruega todavía no revisó." };
    }
    case "buscar_web": return await buscarWeb(prov, String(a?.consulta ?? "").slice(0, 500));
    case "leer_link": return await leerLink(String(a?.url ?? ""));
    default: return { error: "Herramienta desconocida." };
  }
}

// Acciones confirmadas por la dueña.
async function ejecutar(db: any, jwt: string, nombre: string, a: any) {
  switch (nombre) {
    case "cargar_idea": {
      let semana = a.tema_semana;
      if (!semana) {
        const { data } = await db.from("up_calendario").select("tema_semana").lte("fecha", a.fecha).order("fecha", { ascending: false }).limit(1).maybeSingle();
        semana = data?.tema_semana ?? "Ideas";
      }
      const { error } = await db.from("up_calendario").insert({ fecha: a.fecha, tema_semana: semana, tema_dia: a.tema_dia, redes: a.redes, formato_instagram: a.formato_instagram, tema_instagram: a.tema_instagram });
      if (error) return error.code === "23505" ? "Ya hay una publicación ese día: elegí otra fecha o editala desde el Calendario." : `No se pudo cargar: ${error.message}`;
      return "Listo, la idea quedó en el calendario. Los agentes la escriben la mañana de ese día (o pedime que genere ahora).";
    }
    case "aprobar_pieza": {
      const { data, error } = await db.from("up_piezas").update({ estado: "aprobado" }).eq("fecha", a.fecha).eq("red", a.red).in("estado", ["pendiente", "revision"]).not("texto", "is", null).select("id");
      if (error) return `No se pudo aprobar: ${error.message}`;
      return data?.length ? "Aprobado. Si la red está conectada y tiene horario, sale sola ese día." : "No encontré un borrador para aprobar en esa fecha y red (puede que ya esté aprobado o que todavía no exista).";
    }
    case "responder_pregunta": {
      const { data, error } = await db.from("up_piezas").update({ respuesta: a.respuesta }).eq("fecha", a.fecha).eq("estado", "falta_info").select("id");
      if (error) return `No se pudo guardar la respuesta: ${error.message}`;
      if (!data?.length) return "Ese día no tiene preguntas pendientes.";
      return `Respuesta guardada. ${await correrPipeline(jwt, a.fecha)}`;
    }
    case "generar_borradores": return await correrPipeline(jwt, a.fecha);
    case "agregar_dato_ficha": {
      const { data: ult } = await db.from("up_ficha_datos").select("orden").eq("grupo", a.grupo).order("orden", { ascending: false }).limit(1).maybeSingle();
      const { error } = await db.from("up_ficha_datos").insert({ grupo: a.grupo, dato: a.dato, fuente: a.fuente, orden: (ult?.orden ?? 0) + 1 });
      return error ? `No se pudo agregar: ${error.message}` : "Listo, el dato está en la Ficha. Los agentes lo pueden usar desde el próximo borrador.";
    }
  }
  return "Acción desconocida.";
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

  if (body?.ejecutar) {
    const v: any = validarAccion(body.ejecutar.nombre, body.ejecutar.args);
    if (!v.ok) return json({ respuesta: v.error });
    return json({ respuesta: await ejecutar(db, jwt, body.ejecutar.nombre, v.args) });
  }

  const prov = proveedor(env);
  if (!prov) return json({ error: "Falta configurar la IA (GROQ_API_KEY o GEMINI_API_KEY)." }, 503);
  const mensajes: any[] = [{ role: "system", content: sistema(hoyAR()) }, ...historialParaModelo(body?.mensajes)];
  const usadas: string[] = [];
  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const m = await modelo(prov, mensajes);
      const llamadas = m.tool_calls || [];
      if (!llamadas.length) return json({ respuesta: (m.content || "").trim() || "No tengo una respuesta para eso.", herramientas: usadas, ia: prov.nombre });
      const accion = llamadas.find((l: any) => ACCIONES.has(l.function?.name));
      if (accion) {
        let args: any = {};
        try { args = JSON.parse(accion.function.arguments || "{}"); } catch { /* args vacíos */ }
        const v: any = validarAccion(accion.function.name, args);
        if (!v.ok) {
          mensajes.push({ role: "assistant", content: m.content ?? "", tool_calls: [accion] }, { role: "tool", tool_call_id: accion.id, content: JSON.stringify({ error: v.error }) });
          continue;
        }
        return json({
          respuesta: (m.content || "").trim(), herramientas: usadas, ia: prov.nombre,
          propuesta: { nombre: accion.function.name, args: v.args, descripcion: describirAccion(accion.function.name, v.args) },
        });
      }
      mensajes.push({ role: "assistant", content: m.content ?? "", tool_calls: llamadas });
      for (const l of llamadas) {
        let args: any = {};
        try { args = JSON.parse(l.function?.arguments || "{}"); } catch { /* args vacíos */ }
        usadas.push(l.function?.name);
        const resultado = await leer(db, prov, l.function?.name, args);
        mensajes.push({ role: "tool", tool_call_id: l.id, content: JSON.stringify(resultado).slice(0, 16000) });
      }
    }
    return json({ respuesta: "Me trabé buscando la respuesta. ¿Me lo pedís de otra forma?", herramientas: usadas, ia: prov.nombre });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
