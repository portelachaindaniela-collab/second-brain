import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@1.7.0";
import { extractText, getDocumentProxy } from "npm:unpdf@1.9.1";
import { PROMPT_SISTEMA } from "./prompt.mjs";
import {
  modeloDe, hayClave, respaldoDe, MAX_VUELTAS, HOJA_ID, PESTANA, permisos, TIPOS_DOC, TIPOS_CV, HERRAMIENTAS, NOMBRES_HERRAMIENTAS, validar,
  filasDeValores, filaNueva, proximaFila, duplicado, buscarFilas, procesosAbiertos, consultaEnviados, consultasRechazos, resumenMensaje,
  mimeBorrador, formatoDoc, textoDocx, limpiarTexto, rutaValida, ordenarDocs, armarSistema, armarMensajes, validarImagenes, textoFinal,
  resumenAccion, ddmm,
} from "./logic.mjs";
import { urlPermiso, mismaPostulacion, motivoErrorGoogle } from "../postulaciones/logic.mjs";
import { urlPermitida, htmlATexto } from "../bs67-chat/logic.mjs";

// Agente de Postulaciones. La app manda, con la sesión de Daniela:
//   { accion: 'estado' }                          ¿hay clave de Claude, permisos de Google y qué documentos hay?
//   { accion: 'conectar' }                        link para sumar los permisos de planillas y borradores de Gmail
//   { accion: 'subir_doc', tipo, ruta, archivo }  el archivo ya está en Storage: se extrae el texto y se guarda
//   { accion: 'borrar_doc', id }                  borra un documento (fila y archivo)
//   { mensaje, historial, imagenes }              charla: el modelo usa las herramientas y contesta
// El modelo es la API de Claude (secret ANTHROPIC_API_KEY; modelo en POSTULACIONES_MODELO). Sin clave, no se llama.
// Ninguna herramienta manda mails (solo crea borradores) ni borra o reordena filas de la planilla.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const ZONA = "America/Argentina/Buenos_Aires";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const BUCKET = "postulaciones-docs";
const SIN_CLAVE = "Falta configurar la API de Claude";

class ErrorGoogle extends Error {
  status: number;
  constructor(status: number, cuerpo: unknown) { super(motivoErrorGoogle(status, cuerpo)); this.status = status; }
}

async function tokenVigente(admin: any, cuenta: any): Promise<string> {
  if (cuenta.access_token && cuenta.expires_at && Date.parse(cuenta.expires_at) - 60_000 > Date.now()) return cuenta.access_token;
  if (!cuenta.refresh_token) throw new ErrorGoogle(401, null);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: cuenta.refresh_token, grant_type: "refresh_token" }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new ErrorGoogle(401, t);
  const expires_at = new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString();
  await admin.from("oauth_accounts").update({ access_token: t.access_token, expires_at }).eq("id", cuenta.id);
  cuenta.access_token = t.access_token;
  cuenta.expires_at = expires_at;
  return t.access_token;
}

async function google(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorGoogle(r.status, cuerpo);
  return cuerpo;
}

const rango = (a1: string) => encodeURIComponent(`'${PESTANA}'!${a1}`);
const leerValores = async (token: string) => (await google(token, `${SHEETS}/${HOJA_ID}/values/${rango("A1:J5000")}?valueRenderOption=FORMATTED_VALUE`)).values || [];

// Mensajes de Gmail que cumplen una búsqueda, con remitente, destinatario, asunto, fecha y extracto.
async function buscarGmail(token: string, q: string, max = 15) {
  const lista = await google(token, `${GMAIL}/messages?${new URLSearchParams({ q, maxResults: String(max) })}`);
  const ids = (lista.messages || []).map((m: any) => m.id);
  const mensajes = await Promise.all(ids.map((id: string) =>
    google(token, `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)));
  return mensajes.map(resumenMensaje);
}

async function leerLink(valor: string) {
  const url = urlPermitida(valor);
  if (!url) return { error: "Solo puedo leer páginas públicas (http o https)." };
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Second Brain)" }, signal: AbortSignal.timeout(15000) });
    if (!urlPermitida(r.url)) return { error: "La página redirige a una dirección que no puedo leer." };
    if (!r.ok) return { error: `La página respondió HTTP ${r.status}. Pedile a Daniela el texto o capturas.` };
    const tipo = r.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(tipo)) return { error: `No es una página de texto (${tipo || "tipo desconocido"}).` };
    const html = (await r.text()).slice(0, 2_000_000);
    const texto = htmlATexto(html);
    if (texto.length < 200) return { url: r.url, texto, aviso: "La página trajo muy poco texto (puede pedir iniciar sesión). Si falta el aviso, pedile a Daniela el texto o capturas." };
    return { url: r.url, titulo: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null, texto };
  } catch (e) {
    return { error: `No pude leer la página (${e instanceof Error ? e.message : String(e)}).` };
  }
}

async function extraerTexto(bytes: Uint8Array, formato: string) {
  if (formato === "docx") return limpiarTexto(await textoDocx(bytes));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return limpiarTexto(Array.isArray(text) ? text.join("\n") : text);
}

async function leerDocs(db: any) {
  const { data, error } = await db.from("postulaciones_documentos").select("id,tipo,archivo,ruta,mime,texto,subido_at");
  if (error) throw new Error(`No pude leer los documentos: ${error.message}`);
  return ordenarDocs(data || []);
}

const hoyLargo = () => {
  const d = new Date();
  return `${new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, dateStyle: "full" }).format(d)} (${ddmm(d.getTime())})`;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: u, error: eU } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  if (eU || !u?.user) return json({ error: "Iniciá sesión." }, 401);
  const ownerId = u.user.id;
  // Todo lo de la base y Storage, con la sesión de Daniela (RLS). Solo el token de Google se lee y renueva con el admin.
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  let body: any = {};
  try { body = await req.json(); } catch { /* sin cuerpo: estado */ }

  const { data: cuenta } = await admin.from("oauth_accounts").select("*").eq("owner_id", ownerId).eq("provider", "google").maybeSingle();
  const p = permisos(cuenta?.scopes);
  let token: string | null = null;
  const tokenGoogle = async () => {
    if (!cuenta) throw new ErrorGoogle(401, null);
    return token ??= await tokenVigente(admin, cuenta);
  };

  try {
    if (body?.accion === "conectar") {
      if (!env.GOOGLE_CLIENT_ID) return json({ error: "Falta GOOGLE_CLIENT_ID en los secrets." }, 500);
      const state = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
      const { error } = await admin.from("oauth_states").insert({ state, owner_id: ownerId, provider: "google" });
      if (error) return json({ error: `No se pudo preparar la conexión: ${error.message}` }, 500);
      return json({ url: urlPermiso({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: `${env.SUPABASE_URL}/functions/v1/google-callback`, state }) });
    }

    if (body?.accion === "subir_doc") {
      const tipo = String(body.tipo || "");
      const ruta = String(body.ruta || "");
      const archivo = String(body.archivo || "").slice(0, 200);
      if (!TIPOS_DOC.includes(tipo)) return json({ error: "Elegí el tipo de documento." }, 400);
      if (!rutaValida(ruta, ownerId)) return json({ error: "El archivo no está en tu carpeta." }, 400);
      const formato = formatoDoc(archivo, String(body.mime || ""));
      if (!formato) return json({ error: "Solo se aceptan PDF o .docx." }, 400);
      const { data: blob, error: eD } = await db.storage.from(BUCKET).download(ruta);
      if (eD || !blob) return json({ error: `No encontré el archivo subido (${eD?.message ?? "vacío"}).` }, 400);
      let texto = "";
      let aviso: string | null = null;
      try { texto = await extraerTexto(new Uint8Array(await blob.arrayBuffer()), formato); } catch (e) { aviso = `No pude leer el texto (${e instanceof Error ? e.message : String(e)}).`; }
      if (!texto && !aviso) aviso = "El archivo no tiene texto para leer (puede ser una imagen escaneada). El agente no va a poder usarlo como referencia.";
      const fila = { tipo, archivo, ruta, mime: formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", texto, subido_at: new Date().toISOString() };
      // Un archivo por tipo de CV: el nuevo reemplaza al anterior (se pisa la fila y se borra el archivo viejo).
      const anterior = tipo === "Otros" ? null : (await db.from("postulaciones_documentos").select("id,ruta").eq("tipo", tipo).maybeSingle()).data;
      const r = anterior
        ? await db.from("postulaciones_documentos").update(fila).eq("id", anterior.id).select("id,tipo,archivo,subido_at").single()
        : await db.from("postulaciones_documentos").insert(fila).select("id,tipo,archivo,subido_at").single();
      if (r.error) return json({ error: `No se pudo guardar: ${r.error.message}` }, 500);
      if (anterior?.ruta && anterior.ruta !== ruta) await db.storage.from(BUCKET).remove([anterior.ruta]);
      return json({ ok: true, doc: { ...r.data, con_texto: !!texto }, aviso });
    }

    if (body?.accion === "borrar_doc") {
      const { data: d } = await db.from("postulaciones_documentos").select("id,ruta").eq("id", String(body.id || "")).maybeSingle();
      if (!d) return json({ error: "No encontré ese documento." }, 404);
      const { error } = await db.from("postulaciones_documentos").delete().eq("id", d.id);
      if (error) return json({ error: error.message }, 500);
      await db.storage.from(BUCKET).remove([d.ruta]);
      return json({ ok: true });
    }

    if (body?.accion === "estado" || (!body?.mensaje && !body?.imagenes)) {
      const docs = await leerDocs(db);
      return json({
        claude: hayClave(env), modelo: modeloDe(env), google: !!cuenta, cuenta: cuenta?.handle ?? null, permisos: p,
        docs: docs.map((d: any) => ({ id: d.id, tipo: d.tipo, archivo: d.archivo, subido_at: d.subido_at, con_texto: !!d.texto })),
      });
    }

    // ---------- Charla ----------
    if (!hayClave(env)) return json({ error: SIN_CLAVE, sin_clave: true }, 503);
    const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim().slice(0, 20000) : "";
    const vi: any = validarImagenes(body.imagenes);
    if (!vi.ok) return json({ error: vi.error }, 400);
    if (!mensaje && !vi.imagenes.length) return json({ error: "Escribí un mensaje o pasá capturas." }, 400);

    const docs = await leerDocs(db);
    const modelo = modeloDe(env);
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 1 });
    const sistema = armarSistema(PROMPT_SISTEMA, docs, hoyLargo());
    const mensajes: any[] = armarMensajes(body.historial, mensaje, vi.imagenes);
    const usadas: string[] = [];
    const acciones: string[] = [];

    // Cada herramienta: valida, hace y devuelve un resultado para el modelo (un error vuelve como resultado, no corta).
    const herramienta = async (nombre: string, input: any) => {
      const v: any = validar(nombre, input);
      if (!v.ok) return { error: v.error };
      const a = v.args;
      switch (nombre) {
        case "leer_cv": {
          if (!a.tipo) return { documentos: docs.map((d: any) => ({ id: d.id, tipo: d.tipo, archivo: d.archivo, subido: ddmm(Date.parse(d.subido_at)), tiene_texto: !!d.texto })), sin_subir: TIPOS_CV.filter(t => !docs.some((d: any) => d.tipo === t)) };
          const de = docs.filter((d: any) => d.tipo === a.tipo);
          if (!de.length) return { error: `No hay ${a.tipo === "Otros" ? "documentos Otros" : `CV ${a.tipo}`} subido. Usá los DATOS DE DANIELA y avisale que falta subirlo.` };
          return { documentos: de.map((d: any) => ({ id: d.id, archivo: d.archivo, subido: ddmm(Date.parse(d.subido_at)), texto: d.texto || "(sin texto legible)" })) };
        }
        case "abrir_link": return await leerLink(a.url);
      }
      // Lo que sigue usa Google.
      if (!cuenta) return { error: "Google no está conectado en Second Brain." };
      if (["leer_planilla", "agregar_fila", "actualizar_estado"].includes(nombre) && !p.planilla) return { error: "Falta el permiso de Google para la planilla. Daniela tiene que tocar «Dar permisos de Google» en el panel." };
      if (["buscar_enviados", "buscar_rechazos"].includes(nombre) && !p.leer_mail) return { error: "Falta el permiso de Google para leer el mail. Daniela tiene que tocar «Conectar Google» en el menú." };
      if (nombre === "crear_borrador" && !p.borradores) return { error: "Falta el permiso de Google para crear borradores. Daniela tiene que tocar «Dar permisos de Google» en el panel. Mientras tanto, pasale el mail en el chat." };
      const t = await tokenGoogle();
      switch (nombre) {
        case "leer_planilla": {
          const filas = filasDeValores(await leerValores(t));
          const vistas = buscarFilas(filas, a.buscar);
          return { total_filas: filas.length, mostradas: vistas.length, filas: vistas };
        }
        case "agregar_fila": {
          const valores = await leerValores(t);
          const dup = duplicado(filasDeValores(valores), a.puesto, a.empresa);
          if (dup && !a.forzar) return { duplicado: true, aviso: "Ya está cargado: no agregué nada.", fila_existente: dup };
          const n = proximaFila(valores);
          // RAW: se escribe tal cual (un texto que empieza con = no se vuelve fórmula).
          await google(t, `${SHEETS}/${HOJA_ID}/values/${rango(`A${n}:J${n}`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [filaNueva(a)] }) });
          return { ok: true, fila: n };
        }
        case "actualizar_estado": {
          const filas = filasDeValores(await leerValores(t));
          const actual = filas.find((f: any) => f.fila === a.fila);
          if (!actual) return { error: `La fila ${a.fila} está vacía.` };
          if (!mismaPostulacion(actual, a)) return { error: `La fila ${a.fila} es «${actual.puesto} · ${actual.empresa}», no coincide. Volvé a buscarla con leer_planilla.` };
          await google(t, `${SHEETS}/${HOJA_ID}/values/${rango(`I${a.fila}`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[a.estado]] }) });
          return { ok: true, fila: a.fila, estado_anterior: actual.estado, estado: a.estado };
        }
        case "crear_borrador": {
          const elegidos = [
            ...(a.cv ? docs.filter((d: any) => d.tipo === a.cv) : []),
            ...docs.filter((d: any) => d.tipo === "Otros" && a.otros.includes(d.id)),
          ];
          const adjuntos: any[] = [];
          const sinAdjuntar: string[] = [];
          for (const d of elegidos) {
            const { data: blob } = await db.storage.from(BUCKET).download(d.ruta);
            if (blob) adjuntos.push({ nombre: d.archivo, mime: d.mime, bytes: new Uint8Array(await blob.arrayBuffer()) });
            else sinAdjuntar.push(d.archivo);
          }
          if (a.cv && !elegidos.some((d: any) => d.tipo === a.cv)) sinAdjuntar.push(`CV ${a.cv} (no está subido)`);
          const raw = mimeBorrador({ para: a.para, asunto: a.asunto, html: a.html, plano: a.plano, adjuntos }, `sb${crypto.randomUUID().replace(/-/g, "")}`);
          const r = await google(t, `${GMAIL}/drafts`, { method: "POST", body: JSON.stringify({ message: { raw } }) });
          return {
            ok: true, borrador_id: r.id, adjuntos: adjuntos.map(x => x.nombre),
            ...(sinAdjuntar.length && { sin_adjuntar: sinAdjuntar, aviso: "Decile a Daniela qué CV adjuntar a mano." }),
          };
        }
        case "buscar_enviados": {
          const mails = await buscarGmail(t, consultaEnviados(a));
          return mails.length ? { mails } : { mails: [], aviso: "No encontré mails enviados a ese destinatario en esas fechas." };
        }
        case "buscar_rechazos": {
          const procesos = procesosAbiertos(filasDeValores(await leerValores(t)));
          const vistos = new Map();
          for (const q of consultasRechazos(procesos, a.desde)) for (const m of await buscarGmail(t, q, 30)) vistos.set(m.id, m);
          return { procesos_abiertos: procesos, mails: [...vistos.values()] };
        }
      }
      return { error: "Herramienta desconocida." };
    };

    const respaldo = respaldoDe(modelo);
    let respuesta = "";
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r: any = await client.beta.messages.create({
        model: modelo,
        max_tokens: 16000,
        system: sistema,
        tools: HERRAMIENTAS as any,
        messages: mensajes,
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        ...respaldo,
      } as any);
      if (r.stop_reason === "refusal") { respuesta = "El modelo no quiso responder ese mensaje. Probá decirlo de otra forma."; break; }
      // Se devuelve el contenido completo (con los bloques de pensamiento) para que el modelo siga su propio hilo.
      mensajes.push({ role: "assistant", content: r.content });
      const llamadas = r.content.filter((b: any) => b.type === "tool_use");
      if (r.stop_reason !== "tool_use" || !llamadas.length) {
        respuesta = textoFinal(r.content) || (r.stop_reason === "max_tokens" ? "La respuesta quedó cortada. Pedímelo de nuevo, por partes." : "No tengo una respuesta para eso.");
        break;
      }
      const resultados = [];
      for (const l of llamadas) {
        usadas.push(l.name);
        let resultado: any;
        try {
          resultado = NOMBRES_HERRAMIENTAS.has(l.name) ? await herramienta(l.name, l.input) : { error: "Herramienta desconocida." };
        } catch (e) {
          resultado = { error: e instanceof Error ? e.message : String(e) };
        }
        const linea = resumenAccion(l.name, validar(l.name, l.input).args ?? {}, resultado);
        if (linea) acciones.push(linea);
        resultados.push({ type: "tool_result", tool_use_id: l.id, content: JSON.stringify(resultado).slice(0, 60000), ...(resultado?.error && { is_error: true }) });
      }
      mensajes.push({ role: "user", content: resultados });
      if (vuelta === MAX_VUELTAS - 1) respuesta = "Me trabé con las herramientas. ¿Me lo pedís de nuevo, de a un aviso?";
    }
    return json({ respuesta, acciones, herramientas: usadas });
  } catch (e) {
    if (e instanceof ErrorGoogle) return json({ error: e.message, conectar: e.status === 401 || e.status === 403 }, 502);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "La clave de la API de Claude no es válida. Revisá el secret ANTHROPIC_API_KEY." }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "La API de Claude está recibiendo demasiados pedidos. Esperá un minuto y probá de nuevo." }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `La API de Claude respondió con un error (${e.status ?? "sin respuesta"}): ${e.message}`.slice(0, 500) }, 502);
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("postulaciones-agente:", detalle);
    return json({ error: `No pude responder (${detalle}).` }, 500);
  }
});
