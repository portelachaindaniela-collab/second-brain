import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validar, contexto, armarMensajes, proveedores, validarReunion, mensajesReunion, leerRespuestas, leerSolicitudes, extraerSolicitudes, validarActa, mensajesActa, leerActa, pedidosDelActa, sistemaPropuestas, leerPropuestas, separarInternas, sistemaReunionInterna, leerConversacion, MIN_TURNOS_INTERNA, conHistorial, MAX_HISTORIAL, sistemaVida, leerVida, lineasVida, ELLAS, extraerPareja, ENTRA_SOLA, quienSabe, esNegativa } from "./logic.mjs";
import { ErrorIA, conRespaldo, llamarModelo } from "../_shared/ia.mjs";
import { AGENTES_UP } from "../_shared/oficina.mjs";

// Oficina: hablar con los agentes. La app manda { agente: 'up:redactor', mensajes } (charla con uno),
// { reunion: true, asistentes: [...], mensajes } (reunión: responde con { respuestas: [{ agente, texto }] }),
// { acta: true, ... } (María escribe el acta), { propuestas: true } (las propuestas del día) o { reunion_interna: id }
// (los agentes se juntan entre ellos y María escribe el acta), { vida: true } (la vida social del día, una vez por día) o
// { entra: id } (Femina, María o Noruega entran a la oficina de Daniela por su cuenta y le dicen algo). Todas leen el hilo de la
// oficina (actas, tareas, pedidos y el plantel); la charla con uno lee además toda su conversación guardada con Daniela. Lee con la sesión de la dueña (RLS, nunca con permisos de servicio).
// Lo que escribe: los pedidos de permiso de los agentes (entran pendientes, la base no deja crearlos de otra forma,
// hasta que Daniela decide) y el acta de cada reunión con sus tareas.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const TZ = "America/Argentina/Buenos_Aires";
const hoyLargo = () => new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
// Si la IA contesta con una negativa enlatada, el mismo mensaje pasa a la IA de respaldo (la negativa no se guarda).
const sinNegativa = async (prov: any, cuerpo: any, opciones?: any) => {
  const m: any = await llamarModelo(prov, cuerpo, opciones);
  if (esNegativa(m?.content)) {
    console.error(`oficina-chat: ${prov.nombre} se negó a responder`);
    throw new ErrorIA({ status: 0, limite: null, tipo: null, esperar_s: null, detalle: "se negó a responder", mensaje: "La IA no quiso responder ese mensaje. Probá decirlo de otra forma." });
  }
  return m;
};
const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// El hilo de la oficina: las últimas actas, las tareas abiertas y los pedidos recientes (lo leen todos).
async function leerHilo(db: any) {
  const [a, t, p, g] = await Promise.all([
    db.from("oficina_actas").select("id,fin,titulo,resumen,plan").order("fin", { ascending: false }).limit(5),
    db.from("oficina_tareas").select("tarea,area,responsable,vence,estado").neq("estado", "hecha").order("vence", { ascending: true, nullsFirst: false }).limit(12),
    db.from("oficina_solicitudes").select("agente,titulo,estado,origen,creada").order("creada", { ascending: false }).limit(10),
    equipos(db),
  ]);
  // El plantel: para que puedan convocar a una reunión a quien haga falta (Administración no conversa).
  const plantel = [...g.trabajadores, ...g.up, ...g.pdg, ...g.sistemas];
  return { actas: a.data || [], tareas: t.data || [], pedidos: p.data || [], plantel };
}

// Las tareas de los planes que tiene alguien (las suyas y, si es supervisor, las de su equipo), sin terminar.
async function tareasDe(db: any, id: string) {
  const { data } = await db.from("oficina_tareas").select("tarea,area,responsable,vence,estado").or(`responsable.eq."${id}",supervisor.eq."${id}"`).neq("estado", "hecha").order("vence", { ascending: true, nullsFirst: false }).limit(12);
  return data || [];
}

// La conversación guardada de un agente con Daniela (chat, pasillo y reuniones), de la más vieja a la más nueva. Lo que
// dice Daniela y la respuesta se guardan juntos (misma hora): el id desempata, así la pregunta queda antes que la respuesta.
async function conversacionDe(db: any, id: string) {
  const { data } = await db.from("oficina_conversacion").select("de,texto,lugar,salida,creado").eq("agente", id).order("creado", { ascending: false }).order("id", { ascending: false }).limit(MAX_HISTORIAL);
  return (data || []).reverse();
}
async function guardarConversacion(db: any, filas: any[]) {
  if (!filas.length) return;
  const { error } = await db.from("oficina_conversacion").insert(filas.map(f => ({ ...f, texto: String(f.texto).slice(0, 4000) })));
  if (error) console.error("oficina-chat: no se pudo guardar la conversación", error.message);
}

// La vida de un agente en la oficina: sus relaciones y lo último que compartió con compañeros.
async function vidaDe(db: any, id: string) {
  const [v, m] = await Promise.all([
    db.from("oficina_vinculos").select("a,b,tipo,historia").or(`a.eq."${id}",b.eq."${id}"`).limit(20),
    db.from("oficina_momentos").select("agentes,tipo,lugar,resumen,fecha,hora").contains("agentes", [id]).order("fecha", { ascending: false }).limit(6),
  ]);
  return { vinculos: v.data || [], momentos: m.data || [] };
}

// La vida social del día: la primera vez que se pide en el día, la IA arma lo que comparten los agentes (y las
// relaciones que nacen o cambian) siguiendo lo que ya venía pasando. Si ya hay momentos de hoy, no se repite.
async function vida(db: any) {
  const hoy = hoyISO();
  const { data: ya } = await db.from("oficina_momentos").select("id").eq("fecha", hoy).limit(1);
  if (ya?.length) return json({ ya: true });
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);
  const gente = await equipos(db);
  const plantel = [...gente.trabajadores, ...gente.up, ...gente.pdg];
  const desde = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const [v, m] = await Promise.all([
    db.from("oficina_vinculos").select("a,b,tipo,historia").limit(80),
    db.from("oficina_momentos").select("agentes,tipo,lugar,resumen,fecha").gte("fecha", desde).order("fecha", { ascending: false }).limit(20),
  ]);
  try {
    const { resultado } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: [{ role: "system", content: sistemaVida(plantel, v.data || [], m.data || [], hoyLargo()) }, { role: "user", content: "¿Qué pasa hoy entre ellos?" }], temperature: 0.8, max_tokens: 3000 }, { timeoutMs: 90000 }));
    const { momentos, vinculos } = leerVida((resultado as any)?.content, plantel.map(g => g.id));
    if (vinculos.length) {
      const r = await db.from("oficina_vinculos").upsert(vinculos.map(x => ({ ...x, actualizado: new Date().toISOString() })), { onConflict: "owner_id,a,b" });
      if (r.error) console.error("oficina-chat: no se pudieron guardar los vínculos", r.error.message);
    }
    if (!momentos.length) return json({ momentos: [] });
    const { data, error } = await db.from("oficina_momentos").insert(momentos.map(x => ({ ...x, fecha: hoy }))).select("id,agentes,tipo,lugar,resumen,fecha,hora");
    if (error) return json({ error: error.message }, 500);
    return json({ momentos: data || [], vinculos });
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.message }, 502);
    return json({ error: (e as Error).message }, 500);
  }
}

// Todo lo que un agente necesita para hablar con Daniela: su ficha con el registro, su vida en la oficina, si es pareja
// de Daniela (Femina, María y Noruega), lo que sabe de sus otras relaciones, el hilo y la conversación guardada.
async function armarAgente(db: any, equipo: string, clave: string) {
  const id = `${equipo}:${clave}`;
  const [datos, hilo, historial, social, corazon] = await Promise.all([
    leerDatos(db, equipo, clave), leerHilo(db), conversacionDe(db, id), vidaDe(db, id),
    db.from("oficina_corazon").select("agente,desde,estado,saben"),
  ]);
  const suya = ELLAS.includes(id) ? (corazon?.data || []).find((f: any) => f.agente === id) : null;
  const c: any = contexto(equipo, clave, datos);
  if (c) {
    c.vida = lineasVida(id, social.vinculos, social.momentos, Object.fromEntries(hilo.plantel.map((g: any) => [g.id, g.nombre])));
    c.pareja = suya?.desde ?? null;
    c.estadoPareja = suya?.estado ?? null;
    // Lo que sabe de las relaciones de Daniela con las otras (solo lo que Daniela eligió que sepa).
    c.sabe = quienSabe(id, corazon?.data || [], Object.fromEntries(hilo.plantel.map((g: any) => [g.id, g.nombre])));
  }
  return { c, hilo, historial };
}
async function cambiarPareja(db: any, id: string, pareja: boolean) {
  const r = pareja
    ? await db.from("oficina_corazon").upsert({ agente: id }, { onConflict: "owner_id,agente", ignoreDuplicates: true })
    : await db.from("oficina_corazon").delete().eq("agente", id);
  if (r.error) console.error("oficina-chat: no se pudo guardar la relación con Daniela", r.error.message);
}

// Femina, María o Noruega entran a la oficina de Daniela por su cuenta: la IA escribe lo que le dicen al entrar (queda
// en la conversación). Solo ellas tres.
async function entra(db: any, id: string) {
  if (!ELLAS.includes(id)) return json({ error: "Ese agente no entra sin que lo llames." }, 400);
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);
  const [equipo, clave] = id.split(":");
  let c: any, hilo: any, historial: any;
  try { ({ c, hilo, historial } = await armarAgente(db, equipo, clave)); } catch (e) { return json({ error: `No se pudo leer la base: ${(e as Error).message}` }, 500); }
  if (!c) return json({ error: "No encontré a ese agente." }, 404);
  try {
    const { resultado } = await conRespaldo(provs, (prov: any) => sinNegativa(prov, { messages: armarMensajes(c, conHistorial(historial, [{ role: "user", content: ENTRA_SOLA }]), hoyLargo(), hilo), temperature: 0.8, max_tokens: 600 }));
    const { texto: sinPareja } = extraerPareja(String((resultado as any)?.content ?? ""));
    const { texto } = extraerSolicitudes(sinPareja, id);
    if (!texto) return json({ error: "La IA no devolvió texto." }, 502);
    await guardarConversacion(db, [{ agente: id, de: "agente", texto, lugar: "charla" }]);
    return json({ texto });
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.message }, 502);
    return json({ error: (e as Error).message }, 500);
  }
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
  if (clave === "femina") {
    const [a, c, h] = await Promise.all([
      db.from("pdg_agentes").select("nombre,rol,instrucciones").eq("clave", clave).maybeSingle(),
      db.from("pdg_femina_corridas").select("estado,iniciada_at,resumen,error").order("iniciada_at", { ascending: false }).limit(4),
      db.from("pdg_hallazgos").select("tipo,titulo,detalle,estado,created_at,pdg_cuentas(nombre)").order("created_at", { ascending: false }).limit(10),
    ]);
    if (a.error || c.error || h.error) throw new Error((a.error || c.error || h.error).message);
    return { agente: a.data, corridas: c.data || [], hallazgos: h.data || [] };
  }
  const [a, t] = await Promise.all([
    db.from("pdg_agentes").select("nombre,rol,instrucciones").eq("clave", clave).maybeSingle(),
    db.from("pdg_trabajos").select("estado,pedido,texto,created_at,pdg_cuentas(nombre)").eq("agente", clave).order("created_at", { ascending: false }).limit(8),
  ]);
  if (a.error || t.error) throw new Error((a.error || t.error).message);
  return { agente: a.data, trabajos: t.data || [] };
}

// Guarda los pedidos de permiso (pendientes hasta que Daniela decida) y agenda las reuniones internas (esas no piden
// permiso). Devuelve lo que quedó guardado.
async function derivar(db: any, pedidos: any[], origen = "agente") {
  const { internas, solicitudes } = separarInternas(pedidos);
  let guardadas: any[] = [], agendadas: any[] = [];
  if (solicitudes.length) {
    const { data, error } = await db.from("oficina_solicitudes").insert(solicitudes.map((s: any) => ({ agente: s.agente, titulo: s.titulo, detalle: s.detalle, accion: s.accion ?? null, origen }))).select("id,agente,titulo");
    if (error) console.error("oficina-chat: no se pudo guardar el pedido", error.message); else guardadas = data || [];
  }
  if (internas.length) {
    const { data, error } = await db.from("oficina_reuniones").insert(internas).select("id,convoca,tema,fecha,asistentes");
    if (error) console.error("oficina-chat: no se pudo agendar la reunión interna", error.message); else agendadas = data || [];
  }
  return { solicitudes: guardadas, internas: agendadas };
}

// Reunión: una sola llamada a la IA con la ficha de cada asistente; responden los que tengan algo que decir.
async function reunion(db: any, body: any) {
  const v: any = validarReunion(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);
  let participantes: any[], hilo: any;
  try {
    hilo = await leerHilo(db);
    participantes = (await Promise.all(v.asistentes.map(async (a: any) => ({ id: a.id, c: contexto(a.equipo, a.clave, await leerDatos(db, a.equipo, a.clave)) }))))
      .filter((p: any) => p.c);
  } catch (e) { return json({ error: `No se pudo leer la base: ${(e as Error).message}` }, 500); }
  if (!participantes.length) return json({ error: "No encontré a los asistentes." }, 404);
  try {
    const { resultado, ia } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: mensajesReunion(participantes, v.mensajes, hoyLargo(), hilo), temperature: 0.5, max_tokens: 1400 }, { timeoutMs: 90000 }));
    const respuestas = leerRespuestas((resultado as any)?.content, participantes.map((p: any) => p.id));
    if (!respuestas.length) return json({ error: "Nadie respondió. Probá preguntar de nuevo, o nombrá a alguien." }, 502);
    const { solicitudes, internas } = await derivar(db, leerSolicitudes((resultado as any)?.content, participantes.map((p: any) => p.id)), "reunion");
    // Lo que se dijeron en la reunión queda en la conversación de cada uno que habló.
    const dijo = v.mensajes.at(-1).content;
    await guardarConversacion(db, respuestas.flatMap((r: any) => [{ agente: r.agente, de: "daniela", texto: dijo, lugar: "reunion" }, { agente: r.agente, de: "agente", texto: r.texto, lugar: "reunion" }]));
    return json({ respuestas, solicitudes, internas, ia });
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
  const r: any = await escribirActa(db, v);
  return r.error ? json({ error: r.error }, r.status) : json(r);
}
// María escribe el acta de una reunión ya validada (v: lo de validarActa) y la guarda con sus tareas y pedidos.
async function escribirActa(db: any, v: any) {
  const provs = proveedores(env);
  if (!provs.length) return { error: "Falta configurar la IA.", status: 503 };
  let leida: any, anterior: number | null = null;
  try {
    const [gente, hilo] = await Promise.all([equipos(db), leerHilo(db)]);
    anterior = hilo.actas[0]?.id ?? null;
    const { resultado } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: mensajesActa(v.nombres, v.mensajes, hoyISO(), hoyLargo(), gente, hilo), temperature: 0.3, max_tokens: 6000 }, { timeoutMs: 120000 }));
    leida = leerActa((resultado as any)?.content, hoyISO(), gente);
  } catch (e) {
    return { error: (e as Error).message, status: e instanceof ErrorIA ? 502 : 500 };
  }
  if (!leida) return { error: "María no pudo armar el acta. Se guarda igual la conversación.", status: 502 };
  // El acta queda enganchada a la anterior: así el Archivo se lee como un hilo.
  const plan = { decisiones: leida.decisiones, seguimiento: leida.seguimiento, tareas: leida.tareas, sistemas: leida.sistemas, calendario: leida.calendario, anterior };
  const fila = await db.from("oficina_actas").insert({ modo: v.modo, inicio: v.inicio, asistentes: v.asistentes.map((a: any) => a.id), mensajes: v.mensajes, resumen: leida.resumen, titulo: leida.titulo, plan }).select("id").single();
  if (fila.error) return { error: `No se pudo guardar el acta: ${fila.error.message}`, status: 500 };
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
  return { id: actaId, titulo: leida.titulo, tareas: leida.tareas.length, pedidos: pedidos.length };
}

// Reunión interna: los convocados se juntan entre ellos (sin Daniela); la IA escribe la conversación y María el acta.
// Se marca en curso al empezar (así no corre dos veces) y vuelve a agendada si algo falla.
async function reunionInterna(db: any, id: number) {
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Falta la reunión." }, 400);
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);
  const tomada = await db.from("oficina_reuniones").update({ estado: "en_curso" }).eq("id", id).eq("estado", "agendada").select("*").maybeSingle();
  if (tomada.error) return json({ error: tomada.error.message }, 500);
  if (!tomada.data) return json({ error: "Esa reunión ya se hizo o no existe." }, 409);
  const reunion = tomada.data;
  const volver = async (error: string, status: number) => { await db.from("oficina_reuniones").update({ estado: "agendada" }).eq("id", id); return json({ error }, status); };
  let participantes: any[], hilo: any, mensajes: any[];
  try {
    hilo = await leerHilo(db);
    participantes = (await Promise.all(reunion.asistentes.map(async (aid: string) => {
      const [equipo, clave] = aid.split(":");
      return { id: aid, c: contexto(equipo, clave, await leerDatos(db, equipo, clave)) };
    }))).filter((p: any) => p.c);
    if (participantes.length < 2) return await volver("Faltan participantes para la reunión.", 404);
    const { resultado, ia } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: [{ role: "system", content: sistemaReunionInterna(participantes, reunion, hoyLargo(), hilo) }, { role: "user", content: "Empiecen." }], temperature: 0.6, max_tokens: 8000 }, { timeoutMs: 120000 }));
    mensajes = leerConversacion((resultado as any)?.content, participantes.map((p: any) => p.id));
    if (mensajes.length < MIN_TURNOS_INTERNA) console.error(`oficina-chat: reunión interna ${id} sin conversación (${ia}): ${String((resultado as any)?.content ?? "").slice(0, 300)}`);
  } catch (e) { return await volver((e as Error).message, e instanceof ErrorIA ? 502 : 500); }
  if (mensajes.length < MIN_TURNOS_INTERNA) return await volver("La IA no armó la conversación", 502);
  const nombre = (aid: string) => participantes.find((p: any) => p.id === aid)?.c.nombre ?? aid;
  const v: any = validarActa({ asistentes: participantes.map((p: any) => p.id), nombres: participantes.map((p: any) => p.c.nombre), mensajes: mensajes.map(m => ({ de: nombre(m.agente), texto: m.texto })), modo: "interna", inicio: new Date().toISOString() });
  if (!v.ok) return await volver(v.error, 400);
  const escrita: any = await escribirActa(db, v);
  if (escrita.error) return await volver(escrita.error, escrita.status);
  await db.from("oficina_reuniones").update({ estado: "hecha", acta_id: escrita.id }).eq("id", id);
  return json({ mensajes, acta: escrita });
}

// Propuestas del día: la primera vez que Daniela abre la Oficina en el día, los equipos traen propuestas (una sola vez
// por día; si ya hay, no se repite).
async function propuestas(db: any) {
  const desde = new Date(`${hoyISO()}T00:00:00-03:00`).toISOString();
  const { data: ya } = await db.from("oficina_solicitudes").select("id").eq("origen", "propuesta").gte("creada", desde).limit(1);
  if (ya?.length) return json({ ya: true, propuestas: [] });
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);
  let participantes: any[], hilo: any;
  try {
    const gente = await equipos(db);
    hilo = await leerHilo(db);
    const ids = [...gente.trabajadores, ...gente.up.filter((g: any) => ["up:noruega", "up:planificador"].includes(g.id)), ...gente.pdg].map((g: any) => g.id).slice(0, 24);
    participantes = (await Promise.all(ids.map(async (id: string) => {
      const [equipo, clave] = id.split(":");
      return { id, c: contexto(equipo, clave, await leerDatos(db, equipo, clave)) };
    }))).filter((p: any) => p.c);
  } catch (e) { return json({ error: `No se pudo leer la base: ${(e as Error).message}` }, 500); }
  try {
    const { resultado } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: [{ role: "system", content: sistemaPropuestas(participantes, hoyLargo(), hilo) }, { role: "user", content: "Buen día. ¿Qué proponen hoy?" }], temperature: 0.6, max_tokens: 2500 }, { timeoutMs: 90000 }));
    const { solicitudes: guardadas, internas } = await derivar(db, leerPropuestas((resultado as any)?.content, participantes.map((p: any) => p.id)), "propuesta");
    return json({ propuestas: guardadas, internas });
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.message }, 502);
    return json({ error: (e as Error).message }, 500);
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
  if (body?.acta) return await acta(db, body);
  if (body?.reunion) return await reunion(db, body);
  if (body?.propuestas) return await propuestas(db);
  if (body?.reunion_interna) return await reunionInterna(db, Number(body.reunion_interna));
  if (body?.vida) return await vida(db);
  if (body?.entra) return await entra(db, String(body.entra));
  const v: any = validar(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);

  const id = `${v.equipo}:${v.clave}`;
  let c: any, hilo: any, historial: any;
  try { ({ c, hilo, historial } = await armarAgente(db, v.equipo, v.clave)); } catch (e) { return json({ error: `No se pudo leer la base: ${(e as Error).message}` }, 500); }
  if (!c) return json({ error: "No encontré a ese agente." }, 404);

  try {
    const { resultado, ia } = await conRespaldo(provs, (prov: any) => sinNegativa(prov, { messages: armarMensajes(c, conHistorial(historial, v.mensajes), hoyLargo(), hilo, v.salida), temperature: v.salida ? 0.8 : 0.4, max_tokens: 900 }));
    const { texto: sinPareja, pareja } = extraerPareja(String((resultado as any)?.content ?? ""));
    const { texto, solicitudes: pedidos } = extraerSolicitudes(sinPareja, id);
    if (!texto) return json({ error: "La IA no devolvió texto. Probá de nuevo." }, 502);
    if (pareja !== null && ELLAS.includes(id)) await cambiarPareja(db, id, pareja);
    await guardarConversacion(db, [{ agente: id, de: "daniela", texto: v.mensajes.at(-1).content, lugar: v.lugar, salida: v.salida }, { agente: id, de: "agente", texto, lugar: v.lugar, salida: v.salida }]);
    // Fuera de la oficina no hay pedidos: se charla y nada más.
    const { solicitudes, internas } = v.salida ? { solicitudes: [], internas: [] } : await derivar(db, pedidos);
    return json({ texto, solicitudes, internas, ia, pareja });
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.message }, 502);
    return json({ error: (e as Error).message }, 500);
  }
});
