import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  MAX_VUELTAS, ZONA, HERRAMIENTAS, ACCIONES, proveedor, sistema, validarAccion, describirAccion, urlPermitida, htmlATexto,
  historialParaModelo, contiene, ultimoPorAgente, venceISO, slugProyecto,
} from "./logic.mjs";

// BS67, el asistente de Second Brain. La app manda { mensaje, historial, pantalla, proyecto_id } (la conversación) o
// { ejecutar: { nombre, args } } (una acción que Daniela confirmó). Lee y escribe con la sesión de Daniela (RLS).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const hoyAR = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const masDias = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const inicioDia = (f: string) => new Date(`${f}T00:00:00-03:00`).toISOString();
const esFecha = (f: any) => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f);
const hora = (iso: string) => new Date(iso).toLocaleString("es-AR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA });

async function modelo(prov: any, messages: any[], conHerramientas = true) {
  const r = await fetch(prov.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${prov.clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: prov.modelo, messages, temperature: 0.4, max_tokens: 2000, ...(conHerramientas && { tools: HERRAMIENTAS, tool_choice: "auto" }) }),
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
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (BS67)" }, signal: AbortSignal.timeout(12000) });
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

const nombresProyectos = async (db: any) => new Map(((await db.from("projects").select("id,name")).data || []).map((p: any) => [p.id, p.name]));

// Herramientas de lectura: corren solas y devuelven datos para el modelo.
async function leer(db: any, prov: any, nombre: string, a: any) {
  const hoy = hoyAR();
  switch (nombre) {
    case "resumen_del_dia": {
      const [ev, ta, ma, rep] = await Promise.all([
        db.from("calendar_events").select("title,starts_at,ends_at,all_day,location").gte("starts_at", inicioDia(hoy)).lt("starts_at", inicioDia(masDias(hoy, 2))).order("starts_at"),
        db.from("tasks").select("id,title,due_at,status,project_id").eq("done", false).not("due_at", "is", null).lt("due_at", inicioDia(masDias(hoy, 1))).order("due_at"),
        db.from("emails").select("from_name,from_addr,subject,received_at").eq("is_unread", true).order("received_at", { ascending: false }).limit(8),
        db.from("process_reports").select("agente,estado,resumen,iniciado_at").order("iniciado_at", { ascending: false }).limit(40),
      ]);
      const { count } = await db.from("emails").select("id", { count: "exact", head: true }).eq("is_unread", true);
      return {
        hoy,
        eventos: (ev.data || []).map((e: any) => ({ titulo: e.title, cuando: e.all_day ? "todo el día " + e.starts_at.slice(0, 10) : hora(e.starts_at), lugar: e.location })),
        tareas_vencidas_o_de_hoy: (ta.data || []).map((t: any) => ({ id: t.id, titulo: t.title, vence: t.due_at.slice(0, 10), columna: t.status })),
        mails_sin_leer: count ?? (ma.data || []).length,
        ultimos_sin_leer: (ma.data || []).map((m: any) => `${m.from_name || m.from_addr}: ${m.subject || "(sin asunto)"}`),
        avisos: ultimoPorAgente(rep.data || []).filter((r: any) => r.estado !== "ok").map((r: any) => `${r.agente}: ${r.resumen}`),
      };
    }
    case "ver_proyectos": {
      let q = db.from("projects").select("id,name,status,summary").order("created_at");
      if (a?.estado) q = q.eq("status", a.estado);
      const [p, t] = await Promise.all([q, db.from("tasks").select("project_id").eq("done", false)]);
      const abiertas = (t.data || []).reduce((m: any, x: any) => ((m[x.project_id] = (m[x.project_id] || 0) + 1), m), {});
      return { proyectos: (p.data || []).map((x: any) => ({ id: x.id, nombre: x.name, estado: x.status, resumen: x.summary, tareas_abiertas: abiertas[x.id] || 0 })) };
    }
    case "ver_tareas": {
      let q = db.from("tasks").select("id,title,status,done,due_at,project_id,priority").order("due_at", { ascending: true, nullsFirst: false }).limit(200);
      if (a?.proyecto_id) q = q.eq("project_id", a.proyecto_id);
      const estado = a?.estado || "abiertas";
      if (estado === "abiertas") q = q.eq("done", false);
      else if (estado !== "todas") q = q.eq("status", estado);
      const [{ data }, proyectos] = await Promise.all([q, nombresProyectos(db)]);
      const lista = (data || []).filter((t: any) => contiene(t.title, a?.texto));
      return { tareas: lista.slice(0, 60).map((t: any) => ({ id: t.id, titulo: t.title, columna: t.status, vence: t.due_at?.slice(0, 10) ?? null, proyecto: proyectos.get(t.project_id) ?? null })), total: lista.length };
    }
    case "ver_agenda": {
      const desde = esFecha(a?.desde) ? a.desde : hoy;
      const hasta = esFecha(a?.hasta) ? a.hasta : masDias(desde, 7);
      const { data } = await db.from("calendar_events").select("id,title,starts_at,ends_at,all_day,location,description").gte("starts_at", inicioDia(desde)).lt("starts_at", inicioDia(masDias(hasta, 1))).order("starts_at").limit(150);
      return { desde, hasta, eventos: (data || []).filter((e: any) => contiene(`${e.title} ${e.location ?? ""}`, a?.texto)).map((e: any) => ({ id: e.id, titulo: e.title, cuando: e.all_day ? "todo el día " + e.starts_at.slice(0, 10) : `${hora(e.starts_at)} a ${hora(e.ends_at)}`, lugar: e.location, nota: e.description?.slice(0, 300) ?? null })) };
    }
    case "ver_mails": {
      let q = db.from("emails").select("from_name,from_addr,subject,snippet,received_at,is_unread").order("received_at", { ascending: false }).limit(a?.texto ? 300 : 25);
      if (a?.solo_sin_leer) q = q.eq("is_unread", true);
      const { data } = await q;
      return { mails: (data || []).filter((m: any) => contiene(`${m.from_name} ${m.from_addr} ${m.subject} ${m.snippet}`, a?.texto)).slice(0, 25).map((m: any) => ({ de: m.from_name || m.from_addr, asunto: m.subject, extracto: m.snippet, cuando: m.received_at && hora(m.received_at), sin_leer: m.is_unread })) };
    }
    case "buscar_docs": {
      let q = db.from("docs").select("id,title,body,project_id,updated_at").order("updated_at", { ascending: false }).limit(a?.texto ? 300 : 15);
      if (a?.proyecto_id) q = q.eq("project_id", a.proyecto_id);
      const [{ data }, proyectos] = await Promise.all([q, nombresProyectos(db)]);
      return { docs: (data || []).filter((d: any) => contiene(`${d.title} ${d.body ?? ""}`, a?.texto)).slice(0, 15).map((d: any) => ({ id: d.id, titulo: d.title, proyecto: proyectos.get(d.project_id) ?? null, comienzo: (d.body || "").slice(0, 200) })) };
    }
    case "leer_doc": {
      const { data } = await db.from("docs").select("title,body,updated_at").eq("id", a?.id).maybeSingle();
      return data ? { titulo: data.title, texto: (data.body || "").slice(0, 15000) } : { error: "No encontré ese doc." };
    }
    case "ver_cursos": {
      const { data } = await db.from("cursos").select("id,title,plataforma,progreso,estado,url,notas").order("updated_at", { ascending: false });
      return { cursos: (data || []).map((c: any) => ({ id: c.id, titulo: c.title, plataforma: c.plataforma, progreso: c.progreso, estado: c.estado, notas: c.notas?.slice(0, 200) ?? null })) };
    }
    case "ver_archivos": {
      let q = db.from("assets").select("name,kind,caption,project_id,external_url,created_at").order("created_at", { ascending: false }).limit(a?.texto ? 300 : 20);
      if (a?.proyecto_id) q = q.eq("project_id", a.proyecto_id);
      const { data } = await q;
      return { archivos: (data || []).filter((x: any) => contiene(`${x.name} ${x.caption ?? ""}`, a?.texto)).slice(0, 20).map((x: any) => ({ nombre: x.name, tipo: x.kind, descripcion: x.caption, link: x.external_url })) };
    }
    case "ver_eventos_para_ir": {
      const { data } = await db.from("eventos").select("nombre,inicio_at,lugar,url,precio,estado,veredicto").gte("inicio_at", inicioDia(masDias(hoy, -7))).order("inicio_at").limit(40);
      return { eventos: (data || []).map((e: any) => ({ nombre: e.nombre, cuando: hora(e.inicio_at), lugar: e.lugar, precio: e.precio, estado: e.estado, link: e.url, veredicto: e.veredicto ? JSON.stringify(e.veredicto).slice(0, 400) : null })) };
    }
    case "ver_noticias": {
      let q = db.from("noticias").select("titulo,resumen,medio,pais,url,publicada_at,leida,temas").order("publicada_at", { ascending: false }).limit(a?.texto ? 300 : 20);
      if (a?.solo_no_leidas) q = q.eq("leida", false);
      const { data } = await q;
      return { noticias: (data || []).filter((n: any) => contiene(`${n.titulo} ${n.resumen ?? ""} ${(n.temas || []).join(" ")}`, a?.texto)).slice(0, 20).map((n: any) => ({ titulo: n.titulo, medio: n.medio, pais: n.pais, cuando: hora(n.publicada_at), resumen: n.resumen?.slice(0, 300) ?? null, link: n.url })) };
    }
    case "estado_trabajadores": {
      const [rep, cor] = await Promise.all([
        db.from("process_reports").select("agente,estado,resumen,iniciado_at").order("iniciado_at", { ascending: false }).limit(60),
        db.from("trabajos_corridas").select("trabajador,estado,iniciado_at,cantidad_resultados,error").order("iniciado_at", { ascending: false }).limit(60),
      ]);
      const ult = new Map();
      for (const c of cor.data || []) if (!ult.has(c.trabajador)) ult.set(c.trabajador, c);
      return {
        chequeos_de_maria: ultimoPorAgente(rep.data || []).map((r: any) => ({ agente: r.agente, estado: r.estado, resumen: r.resumen, cuando: hora(r.iniciado_at) })),
        trabajadores: [...ult.values()].map((c: any) => ({ trabajador: c.trabajador, estado: c.estado, cuando: hora(c.iniciado_at), resultados: c.cantidad_resultados, error: c.error })),
      };
    }
    case "ver_up": {
      const [d, p] = await Promise.all([
        db.from("up_calendario").select("fecha,tema_dia,redes,salteado").gte("fecha", hoy).lte("fecha", masDias(hoy, 7)).order("fecha"),
        db.from("up_piezas").select("fecha,red,estado").or(`estado.eq.falta_info,estado.eq.revision,and(estado.eq.aprobado,fecha.gte.${hoy})`),
      ]);
      return { proximos_dias: d.data || [], necesita_a_daniela: (p.data || []).map((x: any) => `${x.fecha} ${x.red}: ${x.estado}`), nota: "Para cambiar algo de UP, Daniela lo hace adentro de UP (ahí BS67 tiene herramientas de UP)." };
    }
    case "buscar_web": return await buscarWeb(prov, String(a?.consulta ?? "").slice(0, 500));
    case "leer_link": return await leerLink(String(a?.url ?? ""));
    default: return { error: "Herramienta desconocida." };
  }
}

// Los nombres actuales de lo que toca una acción, para la tarjeta de confirmación.
async function nombresDe(db: any, nombre: string, a: any) {
  const n: Record<string, string> = {};
  const uno = async (tabla: string, campo: string, idv: string) => (await db.from(tabla).select(campo).eq("id", idv).maybeSingle()).data?.[campo];
  if (["editar_tarea", "borrar_tarea"].includes(nombre)) n.tarea = await uno("tasks", "title", a.id);
  if (nombre === "editar_proyecto") n.proyecto = await uno("projects", "name", a.id);
  else if (a.proyecto_id) n.proyecto = await uno("projects", "name", a.proyecto_id);
  if (nombre === "editar_curso") n.curso = await uno("cursos", "title", a.id);
  if (nombre === "borrar_evento") {
    const { data } = await db.from("calendar_events").select("title,starts_at,all_day").eq("id", a.id).maybeSingle();
    if (data) n.evento = `${data.title}, ${data.all_day ? data.starts_at.slice(0, 10) : hora(data.starts_at)}`;
  }
  return n;
}

async function calendario(jwt: string, body: any) {
  const r = await fetch(`${env.SUPABASE_URL}/functions/v1/google-calendar-edit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json().catch(() => ({}));
  return r.ok && !data.error ? { ok: true, data } : { ok: false, error: data.error || `HTTP ${r.status}` };
}

// Acciones confirmadas por Daniela.
async function ejecutar(db: any, jwt: string, nombre: string, a: any) {
  const ahora = new Date().toISOString();
  switch (nombre) {
    case "crear_tarea": {
      const { error } = await db.from("tasks").insert({ title: a.titulo, project_id: a.proyecto_id, status: a.estado, done: a.estado === "listo", due_at: a.vence ? venceISO(a.vence) : null, source: "bs67" });
      return error ? `No se pudo crear la tarea: ${error.message}` : "Listo, la tarea está en el Flujo.";
    }
    case "editar_tarea": {
      const c: any = { touched_at: ahora };
      if (a.titulo) c.title = a.titulo;
      if (a.estado) { c.status = a.estado; c.done = a.estado === "listo"; }
      if (a.vence !== undefined) c.due_at = a.vence ? venceISO(a.vence) : null;
      if (a.proyecto_id) c.project_id = a.proyecto_id;
      const { data, error } = await db.from("tasks").update(c).eq("id", a.id).select("id");
      if (error) return `No se pudo cambiar la tarea: ${error.message}`;
      return data?.length ? (a.estado === "listo" ? "Hecho, la tarea quedó en Listo." : "Listo, la tarea quedó cambiada.") : "No encontré esa tarea (puede que ya no exista).";
    }
    case "borrar_tarea": {
      const { data, error } = await db.from("tasks").delete().eq("id", a.id).select("id");
      return error ? `No se pudo borrar: ${error.message}` : data?.length ? "Borré la tarea." : "No encontré esa tarea.";
    }
    case "crear_proyecto": {
      const { error } = await db.from("projects").insert({ name: a.nombre, summary: a.resumen, slug: slugProyecto(a.nombre, crypto.randomUUID().slice(0, 8)) });
      return error ? `No se pudo crear el proyecto: ${error.message}` : `Listo, creé el proyecto «${a.nombre}». Lo ves en el menú de proyectos.`;
    }
    case "editar_proyecto": {
      const c: any = {};
      if (a.nombre) c.name = a.nombre;
      if (a.resumen !== undefined) c.summary = a.resumen;
      if (a.estado) c.status = a.estado;
      const { data, error } = await db.from("projects").update(c).eq("id", a.id).select("id");
      return error ? `No se pudo cambiar el proyecto: ${error.message}` : data?.length ? "Listo, el proyecto quedó cambiado." : "No encontré ese proyecto.";
    }
    case "crear_doc": {
      const { error } = await db.from("docs").insert({ title: a.titulo, body: a.cuerpo, project_id: a.proyecto_id });
      return error ? `No se pudo crear el doc: ${error.message}` : `Listo, el doc «${a.titulo}» está guardado${a.proyecto_id ? " en el proyecto" : ""}.`;
    }
    case "crear_eventos": {
      let ok = 0;
      const fallas: string[] = [];
      for (const e of a.eventos) {
        const r = await calendario(jwt, { accion: "crear", title: e.titulo, location: e.lugar, description: e.descripcion, all_day: e.todo_el_dia, starts_at: e.inicio, ends_at: e.fin, time_zone: ZONA, project_id: a.proyecto_id });
        if (r.ok) ok++; else fallas.push(`${e.titulo}: ${r.error}`);
      }
      if (!fallas.length) return ok === 1 ? "Listo, el evento está en tu calendario (y en Google si está conectado)." : `Listo, agendé los ${ok} eventos.`;
      return `Agendé ${ok} de ${a.eventos.length}. No pude con: ${fallas.join("; ")}.`;
    }
    case "borrar_evento": {
      const r = await calendario(jwt, { accion: "eliminar", id: a.id });
      return r.ok ? "Listo, borré el evento." : `No pude borrar el evento: ${r.error}`;
    }
    case "editar_curso": {
      const c: any = { updated_at: ahora };
      if (a.progreso !== undefined) c.progreso = a.progreso;
      if (a.estado) c.estado = a.estado;
      const { data, error } = await db.from("cursos").update(c).eq("id", a.id).select("id");
      return error ? `No se pudo actualizar el curso: ${error.message}` : data?.length ? "Listo, el curso quedó actualizado." : "No encontré ese curso.";
    }
    case "crear_curso": {
      const { error } = await db.from("cursos").insert({ title: a.titulo, plataforma: a.plataforma, url: a.url });
      return error ? `No se pudo anotar el curso: ${error.message}` : "Listo, el curso está en Cursos.";
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
  const ownerId = u.user.id;
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Cuerpo inválido." }, 400); }

  if (body?.ejecutar) {
    const v: any = validarAccion(body.ejecutar.nombre, body.ejecutar.args);
    if (!v.ok) return json({ respuesta: v.error });
    const respuesta = await ejecutar(db, jwt, body.ejecutar.nombre, v.args);
    await db.from("bot_messages").insert({ owner_id: ownerId, channel: "web", role: "assistant", content: respuesta });
    return json({ respuesta, cambio: true });
  }

  const mensaje = typeof body?.mensaje === "string" ? body.mensaje.trim().slice(0, 8000) : "";
  if (!mensaje) return json({ error: "Escribí un mensaje para BS67." }, 400);
  const prov = proveedor(env);
  if (!prov) return json({ error: "BS67 no está configurado todavía (falta la clave de la IA)." }, 503);

  const proyectoId = typeof body.proyecto_id === "string" && /^[0-9a-f-]{36}$/i.test(body.proyecto_id) ? body.proyecto_id : null;
  const proyecto = proyectoId ? (await db.from("projects").select("name").eq("id", proyectoId).maybeSingle()).data?.name : null;
  const hoy = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, dateStyle: "full" }).format(new Date()) + ` (${hoyAR()})`;
  const mensajes: any[] = [
    { role: "system", content: sistema({ hoy, pantalla: typeof body.pantalla === "string" ? body.pantalla.slice(0, 60) : null, proyecto }) },
    ...historialParaModelo(body.historial),
    { role: "user", content: mensaje },
  ];
  const usadas: string[] = [];
  const responder = async (resp: any) => {
    await db.from("bot_messages").insert([
      { owner_id: ownerId, project_id: proyectoId, channel: "web", role: "user", content: mensaje },
      { owner_id: ownerId, project_id: proyectoId, channel: "web", role: "assistant", content: resp.respuesta || resp.propuesta?.descripcion || "" },
    ]);
    return json({ ...resp, herramientas: usadas, ia: prov.nombre });
  };

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const m = await modelo(prov, mensajes);
      const llamadas = m.tool_calls || [];
      if (!llamadas.length) return await responder({ respuesta: (m.content || "").trim() || "No tengo una respuesta para eso." });
      const accion = llamadas.find((l: any) => ACCIONES.has(l.function?.name));
      if (accion) {
        let args: any = {};
        try { args = JSON.parse(accion.function.arguments || "{}"); } catch { /* args vacíos */ }
        const v: any = validarAccion(accion.function.name, args);
        if (!v.ok) {
          mensajes.push({ role: "assistant", content: m.content ?? "", tool_calls: [accion] }, { role: "tool", tool_call_id: accion.id, content: JSON.stringify({ error: v.error }) });
          continue;
        }
        const descripcion = describirAccion(accion.function.name, v.args, await nombresDe(db, accion.function.name, v.args));
        return await responder({ respuesta: (m.content || "").trim(), propuesta: { nombre: accion.function.name, args: v.args, descripcion } });
      }
      mensajes.push({ role: "assistant", content: m.content ?? "", tool_calls: llamadas });
      for (const l of llamadas) {
        let args: any = {};
        try { args = JSON.parse(l.function?.arguments || "{}"); } catch { /* args vacíos */ }
        usadas.push(l.function?.name);
        let resultado: any;
        try { resultado = await leer(db, prov, l.function?.name, args); } catch (e) { resultado = { error: e instanceof Error ? e.message : String(e) }; }
        mensajes.push({ role: "tool", tool_call_id: l.id, content: JSON.stringify(resultado).slice(0, 16000) });
      }
    }
    return await responder({ respuesta: "Me trabé buscando la respuesta. ¿Me lo pedís de otra forma?" });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("bs67-chat:", detalle);
    await admin.from("process_reports").insert({ owner_id: ownerId, agente: "bs67_chat", estado: "error", resumen: detalle, detalle: { ia: prov.nombre, modelo: prov.modelo }, iniciado_at: new Date().toISOString(), finalizado_at: new Date().toISOString() });
    return json({ error: `No pude responder en este momento (${detalle}).` }, 502);
  }
});
