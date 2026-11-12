import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validar, contexto, armarMensajes, proveedores, validarReunion, mensajesReunion, leerRespuestas, leerSolicitudes, extraerSolicitud, validarActa, mensajesActa, leerActa, pedidosDelActa } from "./logic.mjs";
import { ErrorIA, conRespaldo, llamarModelo } from "../_shared/ia.mjs";
import { AGENTES_UP } from "../_shared/oficina.mjs";

// Oficina: hablar con un agente. La app manda { agente: 'up:redactor', mensajes } (charla con uno) o
// { reunion: true, asistentes: [...], mensajes } (reunión con todos los que vinieron: responde con
// { respuestas: [{ agente, texto }] }). Lee los datos con la sesión de la dueña (RLS, nunca con permisos de servicio)
// y responde con la IA. Lo único que escribe: los pedidos que María o Noruega le derivan a Sistemas, que entran
// pendientes (la base no deja crearlos de otra forma) hasta que Daniela los aprueba, y el acta de cada reunión
// ({ acta: true, ... }: el plan, las tareas a cargo de cada supervisor y los pedidos técnicos para Sistemas).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const TZ = "America/Argentina/Buenos_Aires";
const hoyLargo = () => new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// Las tareas de los planes que tiene alguien (las suyas y, si es supervisor, las de su equipo), sin terminar.
async function tareasDe(db: any, id: string) {
  const { data } = await db.from("oficina_tareas").select("tarea,area,responsable,vence,estado").or(`responsable.eq."${id}",supervisor.eq."${id}"`).neq("estado", "hecha").order("vence", { ascending: true, nullsFirst: false }).limit(12);
  return data || [];
}

async function leerDatos(db: any, equipo: string, clave: string) {
  const datos: any = await leerDatosBase(db, equipo, clave);
  datos.tareas = await tareasDe(db, `${equipo}:${clave}`);
  return datos;
}

// Los equipos de cada área (para que María reparta las tareas del plan entre gente real).
async function equipos(db: any) {
  const [t, p] = await Promise.all([
    db.from("trabajadores").select("clave,nombre").order("id"),
    db.from("pdg_agentes").select("clave,nombre").order("orden"),
  ]);
  return {
    trabajadores: (t.data || []).map((x: any) => ({ id: `trabajadores:${x.clave}`, nombre: x.nombre })),
    up: Object.entries(AGENTES_UP).map(([clave, def]: any) => ({ id: `up:${clave}`, nombre: def.nombre })),
    pdg: (p.data || []).map((x: any) => ({ id: `pdg:${x.clave}`, nombre: x.nombre })),
    sistemas: [{ id: "sistemas:mesa_entrada", nombre: "Mesa de entrada" }, { id: "sistemas:guardian", nombre: "Guardián de claves" }, { id: "sistemas:operador", nombre: "Operador" }],
    admin: [],
  };
}

async function leerDatosBase(db: any, equipo: string, clave: string) {
  if (equipo === "trabajadores") {
    const [t, c] = await Promise.all([
      db.from("trabajadores").select("nombre,descripcion,tipo,frecuencia,activo").eq("clave", clave).maybeSingle(),
      db.from("trabajos_corridas").select("estado,iniciado_at,duracion_ms,cantidad_resultados,error,payload").eq("trabajador", clave).order("iniciado_at", { ascending: false }).limit(10),
    ]);
    if (t.error || c.error) throw new Error((t.error || c.error).message);
    return { trabajador: t.data, corridas: c.data || [] };
  }
  if (equipo === "up") {
    if (clave === "noruega") {
      const { data, error } = await db.from("up_chequeos").select("estado,chequeos,at").order("at", { ascending: false }).limit(3);
      if (error) throw new Error(error.message);
      return { chequeos: data || [] };
    }
    const { data, error } = await db.from("up_corridas").select("estado,error,pasos,iniciado_at").order("iniciado_at", { ascending: false }).limit(15);
    if (error) throw new Error(error.message);
    const pasos = (data || []).flatMap((c: any) => (c.pasos || []).filter((p: any) => p.agente === clave).reverse()).slice(0, 20);
    // Lo que este agente le dejó pendiente a la dueña.
    const filtro: Record<string, [string, string]> = { investigador: ["falta_info", "pregunta"], revisor: ["revision", "motivo_revision"], publicador: ["aprobado", "error_publicacion"] };
    let pendientes: any[] = [];
    if (filtro[clave]) {
      const [estado, campo] = filtro[clave];
      const r = await db.from("up_piezas").select(`fecha,red,${campo}`).eq("estado", estado).gte("fecha", hoyISO()).not(campo, "is", null).order("fecha").limit(8);
      if (r.error) throw new Error(r.error.message);
      pendientes = (r.data || []).map((p: any) => ({ fecha: p.fecha, red: p.red, texto: p[campo] }));
    }
    return { pasos, pendientes };
  }
  const [a, t] = await Promise.all([
    db.from("pdg_agentes").select("nombre,rol,instrucciones").eq("clave", clave).maybeSingle(),
    db.from("pdg_trabajos").select("estado,pedido,texto,created_at,pdg_cuentas(nombre)").eq("agente", clave).order("created_at", { ascending: false }).limit(8),
  ]);
  if (a.error || t.error) throw new Error((a.error || t.error).message);
  return { agente: a.data, trabajos: t.data || [] };
}

// Guarda los pedidos a Sistemas (pendientes) y devuelve los que quedaron guardados.
async function derivar(db: any, solicitudes: any[]) {
  if (!solicitudes.length) return [];
  const { data, error } = await db.from("oficina_solicitudes").insert(solicitudes.map((s: any) => ({ agente: s.agente, titulo: s.titulo, detalle: s.detalle }))).select("id,agente,titulo");
  if (error) { console.error("oficina-chat: no se pudo guardar el pedido a Sistemas", error.message); return []; }
  return data || [];
}

// Reunión: una sola llamada a la IA con la ficha de cada asistente; responden los que tengan algo que decir.
async function reunion(db: any, body: any) {
  const v: any = validarReunion(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);
  let participantes: any[];
  try {
    participantes = (await Promise.all(v.asistentes.map(async (a: any) => ({ id: a.id, c: contexto(a.equipo, a.clave, await leerDatos(db, a.equipo, a.clave)) }))))
      .filter((p: any) => p.c);
  } catch (e) { return json({ error: `No se pudo leer la base: ${(e as Error).message}` }, 500); }
  if (!participantes.length) return json({ error: "No encontré a los asistentes." }, 404);
  try {
    const { resultado, ia } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: mensajesReunion(participantes, v.mensajes, hoyLargo()), temperature: 0.5, max_tokens: 1400 }, { timeoutMs: 90000 }));
    const respuestas = leerRespuestas((resultado as any)?.content, participantes.map((p: any) => p.id));
    if (!respuestas.length) return json({ error: "Nadie respondió. Probá preguntar de nuevo, o nombrá a alguien." }, 502);
    const solicitudes = await derivar(db, leerSolicitudes((resultado as any)?.content, participantes.map((p: any) => p.id)));
    return json({ respuestas, solicitudes, ia });
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.message }, 502);
    return json({ error: (e as Error).message }, 500);
  }
}

// Acta: María escribe el plan que salió de la reunión y queda guardado en el Archivo, con las tareas (a cargo del
// supervisor de cada área) y los pedidos para Sistemas, que esperan la aprobación de Daniela.
async function acta(db: any, body: any) {
  const v: any = validarActa(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);
  let leida: any;
  try {
    const gente = await equipos(db);
    const { resultado } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: mensajesActa(v.nombres, v.mensajes, hoyISO(), hoyLargo(), gente), temperature: 0.3, max_tokens: 6000 }, { timeoutMs: 120000 }));
    leida = leerActa((resultado as any)?.content, hoyISO(), gente);
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.message }, 502);
    return json({ error: (e as Error).message }, 500);
  }
  if (!leida) return json({ error: "María no pudo armar el acta. Se guarda igual la conversación." }, 502);
  const plan = { decisiones: leida.decisiones, tareas: leida.tareas, sistemas: leida.sistemas, calendario: leida.calendario };
  const fila = await db.from("oficina_actas").insert({ modo: v.modo, inicio: v.inicio, asistentes: v.asistentes.map((a: any) => a.id), mensajes: v.mensajes, resumen: leida.resumen, titulo: leida.titulo, plan }).select("id").single();
  if (fila.error) return json({ error: `No se pudo guardar el acta: ${fila.error.message}` }, 500);
  const actaId = fila.data.id;
  if (leida.tareas.length) {
    const t = await db.from("oficina_tareas").insert(leida.tareas.map((x: any) => ({ ...x, acta_id: actaId })));
    if (t.error) console.error("oficina-chat: no se pudieron guardar las tareas", t.error.message);
  }
  const pedidos = pedidosDelActa(leida);
  if (pedidos.length) {
    const p = await db.from("oficina_solicitudes").insert(pedidos.map((x: any) => ({ ...x, origen: "reunion" })));
    if (p.error) console.error("oficina-chat: no se pudieron guardar los pedidos a Sistemas", p.error.message);
  }
  return json({ id: actaId, titulo: leida.titulo, tareas: leida.tareas.length, pedidos: pedidos.length });
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
  if (body?.acta) return await acta(db, body);
  if (body?.reunion) return await reunion(db, body);
  const v: any = validar(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);

  let datos;
  try { datos = await leerDatos(db, v.equipo, v.clave); } catch (e) { return json({ error: `No se pudo leer la base: ${(e as Error).message}` }, 500); }
  const c = contexto(v.equipo, v.clave, datos);
  if (!c) return json({ error: "No encontré a ese agente." }, 404);

  try {
    const { resultado, ia } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: armarMensajes(c, v.mensajes, hoyLargo()), temperature: 0.4, max_tokens: 900 }));
    const { texto, solicitud } = extraerSolicitud(String((resultado as any)?.content ?? ""), `${v.equipo}:${v.clave}`);
    if (!texto) return json({ error: "La IA no devolvió texto. Probá de nuevo." }, 502);
    const solicitudes = await derivar(db, solicitud ? [solicitud] : []);
    return json({ texto, solicitudes, ia });
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.message }, 502);
    return json({ error: (e as Error).message }, 500);
  }
});
