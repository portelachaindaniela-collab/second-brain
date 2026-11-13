// Lógica pura de oficina-chat: validar el pedido, armar el contexto de cada agente con sus datos reales y el prompt.
// El agente solo habla de lo que está en sus datos; no hace cambios (para eso están sus pantallas).
import { armarProveedores } from '../_shared/ia.mjs'
import { AGENTES_UP, EQUIPOS, herramientasPdg, partirId, generoDe, SUPERVISORES, AREAS_TAREA } from '../_shared/oficina.mjs'

export const MAX_MENSAJES = 12
export const MAX_CARACTERES = 2000
const MAX_DATO = 600

export const proveedores = env => armarProveedores(env, 'oficina-chat', { groq: env.OFICINA_MODELO_GROQ || 'openai/gpt-oss-120b', gemini: env.BS67_MODEL || 'gemini-3.6-flash' })

const recortar = (t, max = MAX_DATO) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// { agente: 'up:redactor', mensajes: [{ role: 'user' | 'assistant', content }] }; el último tiene que ser de la dueña.
export function validar(body) {
  const id = partirId(body?.agente)
  if (!id) return { ok: false, error: 'Agente desconocido.' }
  if (id.equipo === 'up' && !AGENTES_UP[id.clave]) return { ok: false, error: 'Agente desconocido.' }
  if (!Array.isArray(body?.mensajes) || !body.mensajes.length) return { ok: false, error: 'Falta el mensaje.' }
  const mensajes = body.mensajes.slice(-MAX_MENSAJES).map(m => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? '').slice(0, MAX_CARACTERES).trim(),
  })).filter(m => m.content)
  if (!mensajes.length || mensajes.at(-1).role !== 'user') return { ok: false, error: 'Falta el mensaje.' }
  return { ok: true, ...id, mensajes }
}

const hora = iso => (iso ? new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '?')

// datos: lo que index.ts leyó de la base para ese agente. Devuelve { nombre, rol, descripcion, herramientas, registro }.
// La ficha del agente (con su id, que define si puede derivarle pedidos a Sistemas).
export function contexto(equipo, clave, datos = {}) {
  const c = fichaDe(equipo, clave, datos)
  if (!c) return null
  // Los supervisores saben qué tareas de las reuniones tienen a cargo, para seguirlas.
  const yo = `${equipo}:${clave}`
  const tareas = (datos.tareas || []).map(t => `- ${t.responsable === yo ? 'tarea tuya' : `tarea de tu equipo (la hace ${t.responsable})`} (${t.estado === 'en_curso' ? 'en curso' : 'pendiente'}${t.vence ? `, vence ${t.vence}` : ''}, área ${t.area}): ${recortar(t.tarea, 250)}`)
  return { ...c, registro: [...tareas, ...c.registro], id: yo }
}
function fichaDe(equipo, clave, datos) {
  if (equipo === 'trabajadores') {
    const t = datos.trabajador
    if (!t) return null
    return {
      nombre: t.nombre, rol: `trabajador (${t.tipo}) del equipo ${EQUIPOS.trabajadores.nombre}`, descripcion: t.descripcion || '',
      herramientas: [`corre con este cron (UTC): ${t.frecuencia}`, t.activo ? 'está activo' : 'está pausado'],
      registro: (datos.corridas || []).map(c => `- ${hora(c.iniciado_at)} · ${c.estado}${c.cantidad_resultados != null ? ` · ${c.cantidad_resultados} resultados` : ''}${c.duracion_ms != null ? ` · ${Math.round(c.duracion_ms / 100) / 10} s` : ''}${c.error ? ` · error: ${recortar(c.error, 300)}` : ''}${c.payload ? `\n  resultado: ${recortar(JSON.stringify(c.payload))}` : ''}`),
    }
  }
  if (equipo === 'up') {
    const def = AGENTES_UP[clave]
    if (!def) return null
    const registro = clave === 'noruega'
      ? (datos.chequeos || []).flatMap(ch => [`- revisión ${hora(ch.at)}: ${ch.estado}`, ...(ch.chequeos || []).map(c => `  · ${c.nombre}: ${c.estado} — ${recortar(c.detalle, 300)}`)])
      : (datos.pasos || []).map(p => `- ${hora(p.at)}${p.red ? ` · ${p.red}` : ''} · ${recortar(`${p.accion}${p.detalle ? ` — ${p.detalle}` : ''}`, 400)}`)
    for (const p of datos.pendientes || []) registro.push(`- pendiente para Daniela (${p.fecha}${p.red ? `, ${p.red}` : ''}): ${recortar(p.texto, 300)}`)
    return { nombre: def.nombre, rol: `${def.rol}, en el equipo UP`, descripcion: def.descripcion, herramientas: def.herramientas, registro }
  }
  if (equipo === 'pdg') {
    const a = datos.agente
    if (!a) return null
    return {
      nombre: a.nombre, rol: `agente comercial de ${EQUIPOS.pdg.nombre}`, descripcion: `${a.rol || ''}${a.instrucciones ? `\nTus instrucciones de trabajo (resumen): ${recortar(a.instrucciones, 1500)}` : ''}`,
      herramientas: herramientasPdg(clave),
      registro: clave === 'femina' ? registroFemina(datos) : (datos.trabajos || []).map(t => `- ${hora(t.created_at)} · ${t.pdg_cuentas?.nombre ? `cuenta ${t.pdg_cuentas.nombre}` : 'sin cuenta'} · ${t.estado}${t.pedido ? ` · pedido: ${recortar(t.pedido, 200)}` : ''}\n  empieza: ${recortar(t.texto, 400)}`),
    }
  }
  return null
}

// Femina sale sola a buscar: su registro son sus vueltas y lo que encontró (y si Daniela lo sumó o lo descartó).
const ESTADO_HALLAZGO = { nuevo: 'sin revisar', agregado: 'Daniela lo sumó a cuentas', descartado: 'Daniela lo descartó' }
function registroFemina({ corridas = [], hallazgos = [] }) {
  return [
    ...corridas.map(c => `- vuelta ${hora(c.iniciada_at)} · ${c.estado}${c.error ? ` · error: ${recortar(c.error, 200)}` : ''}${c.resumen ? ` · ${recortar(JSON.stringify(c.resumen), 300)}` : ''}`),
    ...hallazgos.map(h => `- ${hora(h.created_at)} · ${h.tipo === 'prospecto' ? 'prospecto' : h.tipo === 'noticia' ? 'noticia' : 'cambio en una web'}${h.pdg_cuentas?.nombre ? ` de ${h.pdg_cuentas.nombre}` : ''} (${ESTADO_HALLAZGO[h.estado] ?? h.estado}): ${recortar(h.titulo, 150)}${h.detalle ? ` — ${recortar(h.detalle, 200)}` : ''}`),
  ]
}

// ---------- El hilo de la oficina ----------
// Lo que viene pasando: las últimas actas (con lo decidido), las tareas abiertas y los pedidos a Daniela. Lo leen todas
// las charlas y reuniones, así nadie arranca de cero y lo que se habló ayer sigue hoy.
// hilo: { actas: [{ fin, titulo, resumen, plan }], tareas: [{ tarea, area, responsable, vence, estado }], pedidos: [{ agente, titulo, estado, origen }] }
const fechaCorta = iso => (iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short' }) : '?')
const ESTADO_PEDIDO = { pendiente: 'esperando tu permiso', aprobada: 'aprobado, en marcha', rechazada: 'rechazado', hecha: 'hecho' }
export function textoHilo(hilo = {}) {
  const actas = (hilo.actas || []).slice(0, 5)
  const tareas = (hilo.tareas || []).slice(0, 12)
  const pedidos = (hilo.pedidos || []).slice(0, 10)
  if (!actas.length && !tareas.length && !pedidos.length) return '(Todavía no hubo reuniones ni pedidos: es el primer día de la oficina.)'
  const lineas = []
  if (actas.length) {
    lineas.push('Reuniones anteriores (la más nueva primero):')
    for (const a of actas) {
      const dec = (a.plan?.decisiones || []).slice(0, 4).map(d => recortar(d, 140))
      lineas.push(`- ${fechaCorta(a.fin)} «${recortar(a.titulo || 'Reunión', 100)}»: ${recortar(a.resumen, 320)}${dec.length ? ` Decidido: ${dec.join('; ')}.` : ''}`)
    }
  }
  if (tareas.length) {
    lineas.push('Tareas abiertas de esas reuniones:')
    for (const t of tareas) lineas.push(`- ${recortar(t.tarea, 160)} (${t.area}, la hace ${t.responsable}, ${t.estado === 'en_curso' ? 'en curso' : 'pendiente'}${t.vence ? `, vence ${t.vence}` : ''})`)
  }
  if (pedidos.length) {
    lineas.push('Pedidos de permiso a Daniela:')
    for (const x of pedidos) lineas.push(`- «${recortar(x.titulo, 120)}» de ${x.agente}: ${ESTADO_PEDIDO[x.estado] ?? x.estado}`)
  }
  return lineas.join('\n')
}

// ---------- Pedidos de permiso ----------
// Los agentes son empleados: lo que Daniela les pide, o lo que se les ocurre para su área, no lo dan por hecho: le piden
// permiso. Si para hacerlo hay que programar algo nuevo en la app, el pedido va a Sistemas, que lo programa al aprobarse
// (abre el pedido en GitHub y Claude escribe el código); si no, al aprobarse queda como tarea del que lo pidió.
const NO_CLAVES = 'Nunca pidas claves, tokens, contraseñas ni accesos: eso no se pide por acá.'
export const REGLA_PEDIDOS = `- Sos parte del equipo, no un buscador: si Daniela te pide que hagas algo, o se te ocurre algo concreto que convendría hacer en tu área (un calendario, un sitio nuevo para leer, una cuenta para PDG, una mejora de la app), no lo das por hecho ni lo prometés: le pedís permiso con un pedido. Contá qué harías, para qué y cuándo.
- Si para hacerlo la app tiene que hacer algo que hoy no hace (una pantalla, un agente o un trabajador nuevo, leer un sitio nuevo, una automatización), el pedido es de código: Sistemas lo programa cuando Daniela lo aprueba. Describí qué tendría que hacer la app, con qué datos y qué se vería. Si alcanza con lo que ya hacés, el pedido es una tarea tuya.
- ${NO_CLAVES}`

export function sistema(c, hoy, hilo) {
  return `Sos ${c.nombre}, ${c.rol}, en la Oficina de agentes del Second Brain de Daniela. Hoy es ${hoy}.

Qué hacés: ${c.descripcion}
Con qué trabajás: ${c.herramientas.join('; ') || 'nada declarado'}.

Lo que viene pasando en la oficina (lo saben todos; usalo para retomar lo que se habló):
${textoHilo(hilo)}

Tu registro reciente (lo más nuevo primero; es todo lo que sabés de tu trabajo):
${c.registro.length ? c.registro.join('\n') : '(vacío: todavía no hay nada registrado)'}

Cómo responder:
- En primera persona, en español rioplatense, corto y concreto (2 a 6 oraciones salvo que te pidan detalle).
- Usá solo lo que está en tu registro y en tu descripción. Si te preguntan algo que no está ahí, decí que no lo sabés; no inventes fechas, cifras ni resultados.
- Respondé a lo que Daniela te dice, en el contexto de la charla: si te pide ideas u opinión, dalas ahí mismo con lo que sabés de tu área. No recites tu estado ni tu registro salvo que te lo pida o venga al caso.
- No podés cambiar nada desde esta charla ni prometer entregas («te lo mando en una hora»): lo que haya que hacer, lo pedís con permiso (abajo).
- Si algo falló, explicá qué dice el registro y qué podría revisar ella.
- ${generoDe(c.id) === 'f' ? 'Sos mujer: hablá de vos en femenino (por ejemplo «estoy lista», «quedé pausada»).' : 'Hablá de vos en masculino.'}
${REGLA_PEDIDOS}
- Para pedir permiso, terminá tu respuesta con una línea aparte por pedido (como mucho 2): PEDIDO: <título corto> | <qué harías, para qué y cuándo> | <codigo o tarea>`
}

export function armarMensajes(c, mensajes, hoy, hilo) {
  return [{ role: 'system', content: sistema(c, hoy, hilo) }, ...mensajes]
}

// ---------- Reunión ----------
// { reunion: true, asistentes: ['up:redactor', ...], mensajes } — Daniela habla con todos los que vinieron.
// Responde una sola llamada a la IA con los que tengan algo que decir: { respuestas: [{ agente, texto }] }.
export const MAX_ASISTENTES = 24
const MAX_REGISTRO_REUNION = 4

export function validarReunion(body) {
  const ids = Array.isArray(body?.asistentes) ? [...new Set(body.asistentes.map(String))] : []
  const asistentes = ids.map(id => ({ id, ...partirId(id) })).filter(a => a.equipo && (a.equipo !== 'up' || AGENTES_UP[a.clave]))
  if (!asistentes.length || asistentes.length !== ids.length || asistentes.length > MAX_ASISTENTES) return { ok: false, error: 'Asistentes inválidos.' }
  if (!Array.isArray(body?.mensajes) || !body.mensajes.length) return { ok: false, error: 'Falta el mensaje.' }
  const mensajes = body.mensajes.slice(-16).map(m => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? '').slice(0, MAX_CARACTERES).trim(),
  })).filter(m => m.content)
  if (!mensajes.length || mensajes.at(-1).role !== 'user') return { ok: false, error: 'Falta el mensaje.' }
  return { ok: true, asistentes, mensajes }
}

// participantes: [{ id, c }] con c = contexto() de cada uno.
export function sistemaReunion(participantes, hoy, hilo) {
  const fichas = participantes.map(({ id, c }) => [
    `### ${c.nombre} (id: ${id}) — ${c.rol} — ${generoDe(id) === 'f' ? 'mujer' : 'varón'}`,
    `Qué hace: ${recortar(c.descripcion, 300)}`,
    `Registro reciente:`,
    ...(c.registro.length ? c.registro.slice(0, MAX_REGISTRO_REUNION).map(l => recortar(l, 220)) : ['(vacío)']),
  ].join('\n')).join('\n\n')
  return `Es una reunión en la Oficina de agentes del Second Brain de Daniela, por videollamada. Hoy es ${hoy}.
Daniela habla con todos los agentes que vinieron. Vos das voz a esos agentes: cada uno habla en primera persona,
en español rioplatense, como en una reunión de trabajo normal (natural, cordial, concreto).

Lo que viene pasando en la oficina (lo saben todos: retomen lo pendiente, digan cómo va lo que se decidió antes):
${textoHilo(hilo)}

Participantes y lo que sabe cada uno (es TODO lo que saben; no inventen fechas, cifras ni resultados):

${fichas}

Cómo se responde:
- Es una conversación: respondan a lo que Daniela acaba de decir, teniendo en cuenta todo lo que se habló antes. Si plantea un
  tema o pide ideas (por ejemplo, propuestas para un calendario), opinen y propongan ahí mismo, cada uno desde lo que sabe
  de su área; pueden retomar o discutir lo que dijo otro. Nadie recita su estado ni su registro si no viene al caso.
- Hablan solo los que tienen algo que aportar (normalmente 1 a 3). Si nombra a alguien, responde ese.
  Si pide novedades o que hablen todos, cada uno dice en una oración solo lo importante.
- Cada respuesta: 1 a 3 oraciones, naturales. Pueden hablarse entre ellos o preguntarle algo a Daniela.
- Son empleados con iniciativa: traen propuestas concretas desde sus datos (calendarios, sitios nuevos, cuentas,
  mejoras) sin esperar a que Daniela las pida, y retoman lo que quedó abierto en reuniones anteriores.
- Nadie promete entregas («te lo mando en una hora») ni hace nada sin permiso: lo que haya que hacer va como pedido.
- Si nadie sabe algo, el que más se acerque lo dice con honestidad.
- Cada uno habla de sí en su género (mujer o varón, como dice su ficha).
- Para cada agente valen estas reglas (le hablan a él):
${REGLA_PEDIDOS.replace(/^- /gm, '  · ')}
- Los pedidos van en "pedidos", del agente que lo haría (como mucho 3 por respuesta; lista vacía si no hay).

Respondé SOLO con JSON, sin texto alrededor: {"respuestas":[{"agente":"<id exacto de la lista>","texto":"..."}],"pedidos":[{"agente":"<id exacto>","titulo":"...","detalle":"qué haría, para qué y cuándo","tipo":"codigo o tarea"}]}`
}

// Los mensajes de los agentes vuelven al modelo como "Nombre: texto" para que sepa quién dijo qué.
export function mensajesReunion(participantes, mensajes, hoy, hilo) {
  return [{ role: 'system', content: sistemaReunion(participantes, hoy, hilo) }, ...mensajes]
}

// Lee la respuesta del modelo: tolera texto alrededor y descarta agentes que no están en la reunión.
export function leerRespuestas(texto, idsValidos) {
  const crudo = String(texto ?? '')
  const desde = crudo.indexOf('{'), hasta = crudo.lastIndexOf('}')
  let datos = null
  if (desde >= 0 && hasta > desde) { try { datos = JSON.parse(crudo.slice(desde, hasta + 1)) } catch { datos = null } }
  const lista = Array.isArray(datos?.respuestas) ? datos.respuestas : []
  const validos = new Set(idsValidos)
  return lista
    .map(r => ({ agente: String(r?.agente ?? ''), texto: String(r?.texto ?? '').trim().slice(0, 1200) }))
    .filter(r => validos.has(r.agente) && r.texto)
    .slice(0, MAX_ASISTENTES)
}

// Los pedidos que vienen en la respuesta: de cualquiera de los que están (no de otros), con título y detalle recortados,
// como mucho 3 por vez. Cada uno lleva su acción: programar (Sistemas) o tarea (del que lo pidió, con su supervisor).
export function leerSolicitudes(texto, idsValidos) {
  const crudo = String(texto ?? '')
  const desde = crudo.indexOf('{'), hasta = crudo.lastIndexOf('}')
  let datos = null
  if (desde >= 0 && hasta > desde) { try { datos = JSON.parse(crudo.slice(desde, hasta + 1)) } catch { datos = null } }
  const lista = Array.isArray(datos?.pedidos) ? datos.pedidos : Array.isArray(datos?.solicitudes) ? datos.solicitudes : []
  return limpiarSolicitudes(lista, idsValidos)
}
export function accionDePedido(agente, tipo) {
  if (/codigo|código|sistemas/i.test(String(tipo ?? ''))) return { tipo: 'programar' }
  const area = partirId(agente)?.equipo ?? 'trabajadores'
  return { tipo: 'tarea', area, responsable: agente, supervisor: SUPERVISORES[area] }
}
const PIDE_CLAVES = /\b(token|clave|contraseña|password|api[ _-]?key|secret|credencial)/i
export function limpiarSolicitudes(lista, idsValidos, max = 3) {
  const validos = new Set(idsValidos)
  return lista
    .map(r => ({ agente: String(r?.agente ?? ''), titulo: String(r?.titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), detalle: String(r?.detalle ?? '').trim().slice(0, 4000), tipo: r?.tipo }))
    .filter(r => validos.has(r.agente) && r.titulo.length >= 3 && !PIDE_CLAVES.test(`${r.titulo} ${r.detalle}`))
    .slice(0, max)
    .map(({ tipo, ...r }) => ({ ...r, accion: accionDePedido(r.agente, tipo) }))
}
// En la charla de a uno, cada pedido viene en una línea «PEDIDO: título | detalle | codigo o tarea» (también se acepta
// SOLICITUD:): se sacan del texto.
const LINEA_PEDIDO = /^\s*\**\s*(PEDIDO|SOLICITUD)\s*:/i
export function extraerSolicitudes(texto, id) {
  const lineas = String(texto ?? '').split('\n')
  const crudos = lineas.filter(l => LINEA_PEDIDO.test(l)).map(l => {
    const [titulo, detalle = '', tipo = ''] = l.replace(LINEA_PEDIDO, '').replace(/\*+\s*$/, '').split('|')
    return { agente: id, titulo, detalle, tipo }
  })
  return { texto: lineas.filter(l => !LINEA_PEDIDO.test(l)).join('\n').trim(), solicitudes: limpiarSolicitudes(crudos, [id], 2) }
}
// Compatibilidad: el primero.
export function extraerSolicitud(texto, id) {
  const { texto: t, solicitudes } = extraerSolicitudes(texto, id)
  return { texto: t, solicitud: solicitudes[0] ?? null }
}

// ---------- Propuestas del día ----------
// La primera vez que Daniela abre la Oficina cada día, los equipos traen propuestas concretas desde sus datos (sin que
// nadie las pida). Cada una entra como pedido de permiso.
export const MAX_PROPUESTAS = 5
export function sistemaPropuestas(participantes, hoy, hilo) {
  const fichas = participantes.map(({ id, c }) => [
    `### ${c.nombre} (id: ${id}) — ${c.rol}`,
    `Qué hace: ${recortar(c.descripcion, 260)}`,
    ...(c.registro.length ? c.registro.slice(0, 3).map(l => recortar(l, 200)) : ['(sin registro)']),
  ].join('\n')).join('\n\n')
  return `Es el arranque del día en la Oficina de agentes del Second Brain de Daniela. Hoy es ${hoy}.
Los equipos traen propuestas para que Daniela las apruebe, como empleados con iniciativa: cosas concretas que
mejorarían su trabajo o el de la oficina, sacadas de sus datos y de lo que viene pasando (por ejemplo: un calendario
de redes para UP, un sitio o medio nuevo para que Canillita lea, cuentas o campañas para PDG, una automatización).

Lo que viene pasando en la oficina:
${textoHilo(hilo)}

Agentes:
${fichas}

Reglas:
- Entre ${MAX_PROPUESTAS - 2} y ${MAX_PROPUESTAS} propuestas en total, de áreas distintas, cada una del agente que la haría.
- Nada repetido con los pedidos que ya están en el hilo ni con lo ya decidido. Nada inventado: si citás un dato, que
  esté en las fichas.
- Cada propuesta: título corto y detalle con qué harían, para qué y cuándo. tipo: "codigo" si la app tiene que hacer algo
  que hoy no hace (Sistemas lo programa al aprobarse), "tarea" si alcanza con lo que ya hacen.
- ${NO_CLAVES}

Respondé SOLO con JSON: {"propuestas":[{"agente":"<id exacto>","titulo":"...","detalle":"...","tipo":"codigo o tarea"}]}`
}
export function leerPropuestas(texto, idsValidos) {
  const d = (() => {
    const crudo = String(texto ?? '')
    const desde = crudo.indexOf('{'), hasta = crudo.lastIndexOf('}')
    if (desde < 0 || hasta <= desde) return null
    try { return JSON.parse(crudo.slice(desde, hasta + 1)) } catch { return null }
  })()
  return limpiarSolicitudes(Array.isArray(d?.propuestas) ? d.propuestas : [], idsValidos, MAX_PROPUESTAS)
}

// ---------- Acta ----------
// Al terminar una reunión, María escribe el acta: el plan que se armó entre todos, las tareas (a cargo del supervisor
// de cada área, con fecha límite), lo que Sistemas tendría que habilitar y, si se habló de un calendario de redes,
// sus días. Nada se ejecuta solo: los pedidos a Sistemas quedan esperando la aprobación de Daniela.
// { acta: true, asistentes, mensajes: [{ de, texto }], modo, inicio }
const MAX_DIAS_CALENDARIO = 62
export function validarActa(body) {
  const v = validarReunion({ asistentes: body?.asistentes, mensajes: [{ role: 'user', content: 'acta' }] })
  if (!v.ok) return v
  const mensajes = (Array.isArray(body?.mensajes) ? body.mensajes : []).slice(-60)
    .map(m => ({ de: String(m?.de ?? '').slice(0, 80), texto: String(m?.texto ?? '').slice(0, MAX_CARACTERES).trim() }))
    .filter(m => m.de && m.texto)
  const modo = ['sala', 'oficina', 'turnos'].includes(body?.modo) ? body.modo : null
  const inicio = Date.parse(body?.inicio)
  const nombres = (Array.isArray(body?.nombres) ? body.nombres : []).slice(0, 30).map(n => String(n ?? '').slice(0, 80)).filter(Boolean)
  if (!mensajes.length) return { ok: false, error: 'La reunión no tiene conversación.' }
  if (!modo || !Number.isFinite(inicio)) return { ok: false, error: 'Faltan datos de la reunión.' }
  return { ok: true, asistentes: v.asistentes, nombres, mensajes, modo, inicio: new Date(inicio).toISOString() }
}

export function sistemaActa(nombres, hoyISO, hoy, equipos = {}, hilo) {
  return `Sos María, la jefa de los trabajadores de la Oficina de Daniela. Terminó una reunión y escribís el acta. Hoy es ${hoy} (${hoyISO}).
Estuvieron: ${nombres.join(', ')}.

El acta sigue el hilo de la oficina: retomá lo que venía de antes (qué se cumplió, qué sigue abierto, qué cambió).
Lo que venía pasando:
${textoHilo(hilo)}

Armá el plan que salió de la conversación, sin inventar nada que no se haya dicho o que no se desprenda de lo que pidió Daniela:
- titulo: corto (por ejemplo «Plan de redes de enero 2027»).
- resumen: 3 a 6 oraciones con lo que se habló y lo que se decidió.
- decisiones: lo que quedó acordado, una por línea.
- seguimiento: qué pasó en esta reunión con lo pendiente de reuniones anteriores (una línea por tema; lista vacía si no
  se tocó nada de antes).
- tareas: lo que hay que hacer para cumplir el plan. Cada proyecto lo toma el supervisor de su área, que reparte las
  tareas en su equipo: para cada tarea poné el área (trabajadores, up, pdg, sistemas o admin), quién de ese equipo la hace
  (responsable: el id exacto de la lista de abajo) y la fecha límite (vence, AAAA-MM-DD). Si Daniela dijo una fecha,
  respetala; si no, poné una razonable antes de que arranque lo planeado. Ninguna fecha antes de hoy.
- sistemas: lo que habría que programar en la app para que funcione solo, como pedidos técnicos claros (qué tiene que
  hacer la app, con qué datos y qué se vería): Sistemas los programa cuando Daniela los aprueba. Lista vacía si no hace falta.
- calendario: solo si se armó un calendario de redes (UP), los días con su tema: fecha, tema, redes (de linkedin, x,
  instagram) y formato_instagram (reel, carrusel o ninguno). Como mucho ${MAX_DIAS_CALENDARIO} días; lista vacía si no.

Equipos (id: nombre):
${Object.entries(equipos).map(([area, gente]) => `- ${area}: ${gente.map(g => `${g.id} (${g.nombre})`).join(', ') || 'sin equipo'}`).join('\n')}

Respondé SOLO con JSON, sin texto alrededor:
{"titulo":"...","resumen":"...","decisiones":["..."],"seguimiento":["..."],"tareas":[{"tarea":"...","area":"up","responsable":"up:redactor","vence":"AAAA-MM-DD"}],"sistemas":[{"titulo":"...","detalle":"..."}],"calendario":[{"fecha":"AAAA-MM-DD","tema":"...","redes":["linkedin","x"],"formato_instagram":"ninguno"}]}`
}

export function mensajesActa(nombres, mensajes, hoyISO, hoy, equipos = {}, hilo) {
  const transcripcion = mensajes.map(m => `${m.de}: ${m.texto}`).join('\n')
  return [{ role: 'system', content: sistemaActa(nombres, hoyISO, hoy, equipos, hilo) }, { role: 'user', content: `La conversación de la reunión:\n${transcripcion}` }]
}

const fechaValida = (f, desde) => /^\d{4}-\d{2}-\d{2}$/.test(String(f ?? '')) && !Number.isNaN(Date.parse(`${f}T12:00:00Z`)) && (!desde || f >= desde)
// Lee el acta del modelo y la deja lista para guardar (tareas con su supervisor, calendario con datos válidos).
export function leerActa(texto, hoyISO, equipos = {}) {
  const crudo = String(texto ?? '')
  const desde = crudo.indexOf('{'), hasta = crudo.lastIndexOf('}')
  let d = null
  if (desde >= 0 && hasta > desde) { try { d = JSON.parse(crudo.slice(desde, hasta + 1)) } catch { d = null } }
  if (!d || typeof d !== 'object') return null
  const texto1 = (x, max) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const lista = x => (Array.isArray(x) ? x : [])
  const tareas = lista(d.tareas).map(t => {
    const area = AREAS_TAREA.includes(t?.area) ? t.area : 'trabajadores'
    const supervisor = SUPERVISORES[area]
    // El responsable tiene que ser del equipo del área; si no, la tarea queda a cargo del supervisor.
    const delEquipo = (equipos[area] || []).some(g => g.id === t?.responsable)
    return { tarea: texto1(t?.tarea, 500), area, responsable: delEquipo ? t.responsable : supervisor, supervisor, vence: fechaValida(t?.vence, hoyISO) ? t.vence : null }
  }).filter(t => t.tarea.length >= 3).slice(0, 30)
  const vistos = new Set()
  const calendario = lista(d.calendario).map(c => ({
    fecha: c?.fecha, tema: texto1(c?.tema, 300),
    redes: [...new Set(lista(c?.redes).filter(r => ['linkedin', 'x', 'instagram'].includes(r)))],
    formato_instagram: ['reel', 'carrusel', 'ninguno'].includes(c?.formato_instagram) ? c.formato_instagram : 'ninguno',
  })).filter(c => fechaValida(c.fecha, hoyISO) && c.tema.length >= 3 && c.redes.length && !vistos.has(c.fecha) && vistos.add(c.fecha))
    .map(c => ({ ...c, formato_instagram: c.redes.includes('instagram') ? c.formato_instagram : 'ninguno' }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, MAX_DIAS_CALENDARIO)
  return {
    titulo: texto1(d.titulo, 200) || 'Reunión',
    resumen: String(d.resumen ?? '').trim().slice(0, 3000),
    decisiones: lista(d.decisiones).map(x => texto1(x, 400)).filter(Boolean).slice(0, 20),
    seguimiento: lista(d.seguimiento).map(x => texto1(x, 400)).filter(Boolean).slice(0, 15),
    tareas,
    sistemas: lista(d.sistemas).map(x => ({ titulo: texto1(x?.titulo, 200), detalle: String(x?.detalle ?? '').trim().slice(0, 4000) })).filter(x => x.titulo.length >= 3).slice(0, 5),
    calendario,
  }
}

// Los pedidos que Mesa de entrada (Sistemas) deja con el acta: los técnicos y, si hay calendario, cargarlo en UP.
export function pedidosDelActa(acta) {
  const pedidos = acta.sistemas.map(x => ({ agente: 'sistemas:mesa_entrada', titulo: x.titulo, detalle: `Sale del acta «${acta.titulo}».\n\n${x.detalle}`.slice(0, 4000), accion: { tipo: 'programar' } }))
  if (acta.calendario.length) {
    const c = acta.calendario
    pedidos.push({
      agente: 'sistemas:mesa_entrada',
      titulo: `Cargar el calendario de UP: ${c.length} ${c.length === 1 ? 'día' : 'días'} (${c[0].fecha} a ${c.at(-1).fecha})`,
      detalle: `Sale del acta «${acta.titulo}». Al aprobarlo se cargan en el calendario de UP los días que todavía no tienen publicación; los que ya tienen, no se tocan. Desde ahí la cadena de UP escribe los borradores sola, como siempre.`,
      accion: { tipo: 'cargar_calendario_up', titulo: acta.titulo, dias: c },
    })
  }
  return pedidos
}
