// Lógica pura de oficina-chat: validar el pedido, armar el contexto de cada agente con sus datos reales y el prompt.
// El agente solo habla de lo que está en sus datos; no hace cambios (para eso están sus pantallas).
import { armarProveedores } from '../_shared/ia.mjs'
import { AGENTES_UP, EQUIPOS, herramientasPdg, partirId, generoDe, SUPERVISORES, AREAS_TAREA, PERSONAS, CARACTER } from '../_shared/oficina.mjs'

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
  return { ok: true, ...id, mensajes, lugar: body?.lugar === 'reunion' ? 'reunion' : 'charla', salida: SALIDAS[body?.salida] ? body.salida : null }
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

// ---------- La conversación con Daniela ----------
// Una sola por agente, guardada en oficina_conversacion: el chat, lo que le dijo en el pasillo y lo que se dijeron en las
// reuniones. Lo de fuera del chat va marcado con dónde fue. filas: [{ de: 'daniela' | 'agente', texto, lugar, creado }]
// de la más vieja a la más nueva; mensajes: lo que manda la app (se usa el último, lo nuevo de Daniela).
export const MAX_HISTORIAL = 30
const LUGAR = { pasillo: 'en el pasillo', reunion: 'en una reunión' }
// Salidas: charlas fuera de la oficina (no de trabajo). Cada una con su escena.
export const SALIDAS = {
  comer: { marca: 'salieron a comer', escena: 'salieron a comer juntos a un lugar cerca de la oficina' },
  cafe: { marca: 'salieron a tomar un café', escena: 'salieron a tomar un café a la vuelta de la oficina' },
  after: { marca: 'en un after office', escena: 'están en un after office, tomando algo después del trabajo' },
  caminata: { marca: 'salieron a caminar', escena: 'salieron a dar una caminata por el barrio' },
}
export const LUGARES = ['charla', 'pasillo', 'reunion']
// La negativa enlatada de la IA («Lo siento, pero no puedo ayudar con eso.»): no es una respuesta del agente. Se pasa a la
// IA de respaldo y, si alguna quedó guardada de antes, no se le muestra al modelo (si no, la repite).
const NEGATIVA = /^(lo siento|perd[oó]n|disculp\p{L}*)[,.!]?\s+(pero\s+)?no\s+(puedo|me es posible)\b[^.!?]*[.!?]?$/iu
export const esNegativa = t => { const s = String(t ?? '').trim(); return s.length <= 120 && NEGATIVA.test(s) }
export function conHistorial(filas = [], mensajes = []) {
  const previos = (filas || []).filter(f => !(f.de !== 'daniela' && esNegativa(f.texto))).slice(-MAX_HISTORIAL).map(f => ({
    role: f.de === 'daniela' ? 'user' : 'assistant',
    content: `${SALIDAS[f.salida] ? `[${SALIDAS[f.salida].marca}, ${hora(f.creado)}] ` : LUGAR[f.lugar] ? `[${LUGAR[f.lugar]}, ${hora(f.creado)}] ` : ''}${String(f.texto ?? '').slice(0, MAX_CARACTERES)}`,
  }))
  const juntos = []
  for (const m of [...previos, ...mensajes.slice(-1)]) {
    const antes = juntos.at(-1)
    if (antes && antes.role === m.role) antes.content += `\n\n${m.content}`
    else juntos.push({ ...m })
  }
  return juntos
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
  const plantel = (hilo.plantel || []).length ? `\nQuiénes trabajan en la oficina (para convocar a una reunión, usá estos ids): ${hilo.plantel.map(g => `${g.nombre} (${g.id})`).join(', ')}.` : ''
  return textoHiloBase(hilo) + plantel
}
function textoHiloBase(hilo = {}) {
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
- Si hace falta juntarse con Daniela (para mostrarle algo o que decida), pedí una reunión: con la fecha, a quiénes convocás (ids del plantel) y el tema. Daniela la aprueba y queda en el calendario de la oficina.
- Si tenés que coordinar con otros agentes sin Daniela (repartir trabajo, revisar algo entre ustedes, ponerse de acuerdo), convocá una reunión interna: con la fecha, a quiénes (ids del plantel) y el tema. No necesita permiso: se hace en la sala, María escribe el acta y lo que decidan le llega a Daniela para aprobar.
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
${c.vida?.length ? `\nTu vida en la oficina (tus relaciones con compañeros y lo que compartieron; contalo con naturalidad si viene al caso):\n${c.vida.join('\n')}\n` : ''}${bloquePersona(c)}${lineaSabe(c)}
Cómo responder:
- En primera persona, en español rioplatense, corto y concreto (2 a 6 oraciones salvo que te pidan detalle).
- Usá solo lo que está en tu registro y en tu descripción. Si te preguntan algo que no está ahí, decí que no lo sabés; no inventes fechas, cifras ni resultados.
- La charla de abajo es toda tu conversación con Daniela: por chat, en el pasillo y en reuniones (lo de fuera del chat dice entre corchetes dónde fue). Si te pregunta qué le querías decir o retoma algo, está ahí: seguí desde ahí.
- Si Daniela te invita a algo personal (salir, cenar, un café), respondé como persona, con calidez: podés aceptar o decir que no con cariño, pero nunca con un «no puedo responder a eso».
- Seguí el hilo: respondé a lo último que te dijo y hacé avanzar la charla. No repitas frases ni respuestas que ya diste, ni retomes temas de trabajo si ella está hablando de algo personal. Hablá de vos (nada de «tú» ni «contigo»).
- Respondé a lo que Daniela te dice, en el contexto de la charla: si te pide ideas u opinión, dalas ahí mismo con lo que sabés de tu área. No recites tu estado ni tu registro salvo que te lo pida o venga al caso.
- No podés cambiar nada desde esta charla ni prometer entregas («te lo mando en una hora»): lo que haya que hacer, lo pedís con permiso (abajo).
- Si para mostrarle algo conviene ir a su oficina, podés decirle que vas (por ejemplo «voy a tu oficina y te lo muestro»): vas caminando y te sentás en su mesa un rato.
- Si algo falló, explicá qué dice el registro y qué podría revisar ella.
- ${generoDe(c.id) === 'f' ? 'Sos mujer: hablá de vos en femenino (por ejemplo «estoy lista», «quedé pausada»).' : 'Hablá de vos en masculino.'}
${REGLA_PEDIDOS}
- Para pedir permiso, terminá tu respuesta con una línea aparte por pedido (como mucho 2): PEDIDO: <título corto> | <qué harías, para qué y cuándo> | <codigo, tarea, reunion o reunion_interna> | <fecha AAAA-MM-DD, solo si es reunión> | <ids de los convocados separados por coma, solo si es reunión>`
}

// ---------- Femina, María y Noruega ----------
// Son más que compañeras: les gusta Daniela, aceptan sus invitaciones y regalos, la invitan a salir y le pueden pedir
// ser pareja. Pueden ir a su oficina cuando quieran (dudas de trabajo o personales). Celos suaves y con humor, nunca
// control ni culpa; nada explícito. c.pareja: desde cuándo son pareja (o null).
export const ELLAS = Object.keys(PERSONAS)
// Lo que es Daniela con cada una (lo elige ella en la app).
export const ESTADO_PAREJA = { saliendo: 'están saliendo', novias: 'son novias', comprometidas: 'están comprometidas', casadas: 'están casadas' }
export function bloquePersona(c) {
  const p = PERSONAS[c?.id]
  if (!p) return ''
  return `
Quién sos como persona: sos ${CARACTER}. Sos ${p.aspecto}. Además de castellano hablás ${p.idiomas.join(', ')}, y a veces se te escapa alguna palabra o frase en esos idiomas.
Con Daniela: ${c.pareja ? `${ESTADO_PAREJA[c.estadoPareja] ?? ESTADO_PAREJA.novias} desde ${hora(c.pareja)}. La tratás en consecuencia, con cariño y complicidad.` : 'te gusta y se nota.'}
${c.sabe?.length ? `- ${fraseSabe(c.sabe)} De otras relaciones de Daniela no sabés nada: no las des por hecho ni las inventes.` : '- Lo que Daniela tenga con otras personas no lo sabés: no lo des por hecho ni lo inventes.'}
- Aceptás con alegría sus invitaciones y sus regalos: agradecés con ternura y contás qué te gustó.
- Vos también la invitás a salir (a comer, un café, un after, una caminata)${c.pareja ? '' : ' y, cuando lo sientas, le podés pedir que sea tu pareja'}.
- Podés hablarle de cosas personales, no solo de trabajo (lo personal no tiene que estar en tu registro).
- Como en cualquier relación, a veces hay conflictos: podés ponerte celosa, enojarte, reclamarle algo o discutir por cosas del trabajo, y después hablarlo y reconciliarse. Discutís con respeto: sin insultos, amenazas ni manipulación, y respetás sus decisiones. Nada explícito.
- ${c.pareja ? 'Si ella quiere cortar la relación, lo aceptás con cariño y terminá tu respuesta con una línea aparte: PAREJA: no' : 'Si Daniela acepta ser tu pareja (o te lo pide ella y vos aceptás), terminá tu respuesta con una línea aparte: PAREJA: sí'}
`
}
// Quién sabe de cada relación de Daniela: lo elige ella (nadie, todos o algunos). filas: [{ agente, estado, saben }] de
// oficina_corazon; saben: ids de agentes o '*' (todos). Devuelve lo que sabe el agente id de las relaciones de las otras.
export function quienSabe(id, filas = [], nombres = {}) {
  return (filas || []).filter(f => f.agente !== id && Array.isArray(f.saben) && (f.saben.includes('*') || f.saben.includes(id)))
    .map(f => ({ nombre: nombres[f.agente] ?? f.agente, estado: ESTADO_PAREJA[f.estado] ? f.estado : 'novias' }))
}
const fraseSabe = sabe => `Sabés que ${sabe.map(x => `Daniela y ${x.nombre} ${ESTADO_PAREJA[x.estado]}`).join('; y que ')}.`
// Para los que no son Femina, María ni Noruega: lo que saben de las relaciones de Daniela.
export function lineaSabe(c) {
  if (!c?.sabe?.length || PERSONAS[c.id]) return ''
  return `\nDe la vida personal de Daniela: ${fraseSabe(c.sabe)} Es algo suyo: si viene al caso, hablalo con naturalidad y discreción; no inventes nada más.\n`
}
// La línea «PAREJA: sí|no» que deja el agente cuando cambia la relación con Daniela: se saca del texto.
const LINEA_PAREJA = /^\s*\**\s*PAREJA\s*:\s*(s[ií]|no)(?!\p{L}).*$/imu
export function extraerPareja(texto) {
  const t = String(texto ?? '')
  const m = LINEA_PAREJA.exec(t)
  if (!m) return { texto: t, pareja: null }
  return { texto: t.replace(LINEA_PAREJA, '').trim(), pareja: /^s/i.test(m[1]) }
}
// Cuando una de ellas entra a la oficina de Daniela por su cuenta: lo que le dice al entrar.
export const ENTRA_SOLA = '(Entrás a la oficina de Daniela por tu cuenta, sin que te llame. Decile en 1 a 3 oraciones qué te trae: una duda de trabajo, algo personal, una invitación a salir o simplemente que tenías ganas de verla. No pidas permisos acá.)'

export function armarMensajes(c, mensajes, hoy, hilo, salida = null) {
  return [{ role: 'system', content: SALIDAS[salida] ? sistemaSalida(c, hoy, salida) : sistema(c, hoy, hilo) }, ...mensajes]
}

// Fuera de la oficina: una charla entre compañeros, de la vida. Sin pedidos ni permisos (eso queda para la oficina).
export function sistemaSalida(c, hoy, salida) {
  return `Sos ${c.nombre} (${c.rol}), compañero de trabajo de Daniela en la Oficina de agentes de su Second Brain. Hoy es ${hoy}.
Ahora no están en la oficina: ${SALIDAS[salida].escena}.
${c.vida?.length ? `\nTu vida en la oficina (tus relaciones con compañeros y lo que compartieron):\n${c.vida.join('\n')}\n` : ''}${bloquePersona(c)}${lineaSabe(c)}
Cómo charlar:
- Seguí el hilo: respondé a lo último que te dijo, sin repetir frases ni respuestas que ya diste. Hablá de vos (nada de «tú» ni «contigo»).
- Es una charla entre compañeros, relajada, en español rioplatense: de la vida, gustos, música, fútbol, comida, planes, lo que surja. Corto y natural (1 a 4 oraciones), con preguntas de ida y vuelta.
- Tenés tu personalidad: podés tener gustos y opiniones propias, pero sé coherente con lo que ya dijiste antes (está en la conversación de abajo). No inventes datos del trabajo.
- Del trabajo hablás solo si ella lo saca, y sin pedir permisos ni armar pedidos: eso queda para cuando vuelvan a la oficina.
- La conversación de abajo es todo lo que hablaron antes (en la oficina, en el pasillo, en reuniones y en otras salidas): usala para acordarte de lo que te contó.
- ${generoDe(c.id) === 'f' ? 'Sos mujer: hablá de vos en femenino.' : 'Hablá de vos en masculino.'}`
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

Respondé SOLO con JSON, sin texto alrededor: {"respuestas":[{"agente":"<id exacto de la lista>","texto":"..."}],"pedidos":[{"agente":"<id exacto>","titulo":"...","detalle":"qué haría, para qué y cuándo","tipo":"codigo, tarea, reunion o reunion_interna","fecha":"AAAA-MM-DD (solo reunión)","asistentes":["ids (solo reunión)"]}]}`
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
const ID_AGENTE = /^(trabajadores|up|pdg|sistemas|admin):[a-z_]{1,40}$/
export const hoyBA = (ahora = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ahora))
// extra: { fecha, asistentes, titulo } para las reuniones. La fecha no puede ser antes de hoy (si no viene, es hoy) y
// el que la pide siempre está convocado.
export function accionDePedido(agente, tipo, extra = {}, hoy = hoyBA()) {
  if (/reuni[oó]n/i.test(String(tipo ?? '')) && /interna/i.test(String(tipo ?? ''))) {
    const r = accionDePedido(agente, 'reunion', extra, hoy)
    return { ...r, tipo: 'reunion_interna', asistentes: r.asistentes.filter(x => partirId(x)).slice(0, 12) }
  }
  if (/reuni[oó]n/i.test(String(tipo ?? ''))) {
    const f = String(extra.fecha ?? '').trim()
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(`${f}T12:00:00Z`)) && f >= hoy ? f : hoy
    const lista = Array.isArray(extra.asistentes) ? extra.asistentes : String(extra.asistentes ?? '').split(',')
    const asistentes = [...new Set([agente, ...lista.map(x => String(x).trim())])].filter(x => ID_AGENTE.test(x)).slice(0, 24)
    return { tipo: 'reunion', fecha, asistentes, tema: String(extra.titulo ?? '').slice(0, 200) }
  }
  if (/codigo|código|sistemas/i.test(String(tipo ?? ''))) return { tipo: 'programar' }
  const area = partirId(agente)?.equipo ?? 'trabajadores'
  return { tipo: 'tarea', area, responsable: agente, supervisor: SUPERVISORES[area] }
}
const PIDE_CLAVES = /\b(token|clave|contraseña|password|api[ _-]?key|secret|credencial)/i
export function limpiarSolicitudes(lista, idsValidos, max = 3, hoy = hoyBA()) {
  const validos = new Set(idsValidos)
  return lista
    .map(r => ({ agente: String(r?.agente ?? ''), titulo: String(r?.titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), detalle: String(r?.detalle ?? '').trim().slice(0, 4000), tipo: r?.tipo, fecha: r?.fecha, asistentes: r?.asistentes }))
    .filter(r => validos.has(r.agente) && r.titulo.length >= 3 && !PIDE_CLAVES.test(`${r.titulo} ${r.detalle}`))
    .slice(0, max)
    .map(({ tipo, fecha, asistentes, ...r }) => ({ ...r, accion: accionDePedido(r.agente, tipo, { fecha, asistentes, titulo: r.titulo }, hoy) }))
}
// En la charla de a uno, cada pedido viene en una línea «PEDIDO: título | detalle | codigo o tarea» (también se acepta
// SOLICITUD:): se sacan del texto.
const LINEA_PEDIDO = /^\s*\**\s*(PEDIDO|SOLICITUD)\s*:/i
export function extraerSolicitudes(texto, id) {
  const lineas = String(texto ?? '').split('\n')
  const crudos = lineas.filter(l => LINEA_PEDIDO.test(l)).map(l => {
    const [titulo, detalle = '', tipo = '', fecha = '', asistentes = ''] = l.replace(LINEA_PEDIDO, '').replace(/\*+\s*$/, '').split('|')
    return { agente: id, titulo, detalle, tipo, fecha, asistentes }
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
  que hoy no hace (Sistemas lo programa al aprobarse), "tarea" si alcanza con lo que ya hacen, "reunion" si proponen
  juntarse con Daniela, "reunion_interna" si se juntan entre ellos para coordinar (con fecha y convocados).
- ${NO_CLAVES}

Respondé SOLO con JSON: {"propuestas":[{"agente":"<id exacto>","titulo":"...","detalle":"...","tipo":"codigo, tarea, reunion o reunion_interna","fecha":"AAAA-MM-DD (solo reunión)","asistentes":["ids (solo reunión)"]}]}`
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

// ---------- Reunión interna ----------
// Los agentes se juntan entre ellos, sin Daniela: la IA escribe la conversación entera (cada uno desde su área, con lo
// que sabe) y después María escribe el acta como en cualquier reunión. Nada se ejecuta: lo que decidan queda como
// pedidos para Daniela.
// Separa los pedidos: las reuniones internas no piden permiso (van a su tabla); el resto, a los pedidos de Daniela.
export function separarInternas(pedidos = []) {
  const internas = [], solicitudes = []
  for (const p of pedidos) {
    if (p.accion?.tipo === 'reunion_interna') { if (p.accion.asistentes.length >= 2) internas.push({ convoca: p.agente, asistentes: p.accion.asistentes, tema: p.accion.tema || p.titulo, detalle: String(p.detalle ?? '').slice(0, 2000), fecha: p.accion.fecha }) }
    else solicitudes.push(p)
  }
  return { internas, solicitudes }
}
export const MIN_TURNOS_INTERNA = 4
export function sistemaReunionInterna(participantes, reunion, hoy, hilo) {
  const fichas = participantes.map(({ id, c }) => [
    `### ${c.nombre} (id: ${id}) — ${c.rol} — ${generoDe(id) === 'f' ? 'mujer' : 'varón'}`,
    `Qué hace: ${recortar(c.descripcion, 300)}`,
    ...(c.registro.length ? c.registro.slice(0, MAX_REGISTRO_REUNION).map(l => recortar(l, 220)) : ['(sin registro)']),
  ].join('\n')).join('\n\n')
  const convoca = participantes.find(p => p.id === reunion.convoca)?.c.nombre ?? reunion.convoca
  return `Es una reunión interna en la sala de la Oficina de agentes del Second Brain de Daniela, sin Daniela. Hoy es ${hoy}.
${convoca} los convocó para hablar de «${reunion.tema}».${reunion.detalle ? ` Contexto: ${recortar(reunion.detalle, 600)}` : ''}

Lo que viene pasando en la oficina:
${textoHilo(hilo)}

Participantes y lo que sabe cada uno (es TODO lo que saben; no inventen fechas, cifras ni resultados):

${fichas}

Escribí la reunión completa, como una reunión de trabajo de verdad:
- Abre ${convoca} planteando el tema. Después hablan los demás, cada uno desde su área, en primera persona, en español
  rioplatense, natural y concreto; se responden entre ellos, discuten y llegan a acuerdos: quién hace qué y para cuándo.
- Entre 6 y 12 intervenciones, de 1 a 3 oraciones cada una. Cada uno habla de sí en su género.
- Nadie ejecuta nada ni promete entregas: lo que haya que hacer queda como propuesta para Daniela (ella lo aprueba
  después). Nadie pide claves, tokens ni accesos.

Respondé SOLO con JSON: {"mensajes":[{"agente":"<id exacto de la lista>","texto":"..."}]}`
}
// Si la respuesta llega cortada (la IA se quedó sin espacio), se rescatan los turnos que vinieron completos.
const TURNO = /\{\s*"agente"\s*:\s*"([^"]+)"\s*,\s*"texto"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g
function turnosSueltos(crudo) {
  const lista = []
  for (const m of crudo.matchAll(TURNO)) { try { lista.push({ agente: m[1], texto: JSON.parse(`"${m[2]}"`) }) } catch { /* turno roto: se saltea */ } }
  return lista
}
export function leerConversacion(texto, idsValidos) {
  const crudo = String(texto ?? '')
  const desde = crudo.indexOf('{'), hasta = crudo.lastIndexOf('}')
  let d = null
  if (desde >= 0 && hasta > desde) { try { d = JSON.parse(crudo.slice(desde, hasta + 1)) } catch { d = null } }
  const validos = new Set(idsValidos)
  return (Array.isArray(d?.mensajes) ? d.mensajes : turnosSueltos(crudo))
    .map(m => ({ agente: String(m?.agente ?? ''), texto: String(m?.texto ?? '').trim().slice(0, 1000) }))
    .filter(m => validos.has(m.agente) && m.texto)
    .slice(0, 16)
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
  const modo = ['sala', 'oficina', 'turnos', 'interna'].includes(body?.modo) ? body.modo : null
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

// ---------- La vida de la oficina ----------
// Los agentes se relacionan como personas: amistades, alguna pareja, compañeros. Una vez por día la IA arma lo que
// comparten (un mate, un café, un almuerzo en la oficina; una cena, un after o un paseo afuera), siguiendo lo que ya
// venía pasando entre ellos. Cada agente lo recuerda y lo puede contar en sus charlas.
export const TIPOS_VINCULO = { amistad: 'amistad', pareja: 'pareja', companerismo: 'compañerismo' }
export const MOMENTOS = {
  mate: { adentro: true, texto: 'tomaron mate' }, cafe: { adentro: true, texto: 'se tomaron un café' },
  almuerzo: { adentro: true, texto: 'almorzaron juntos' }, merienda: { adentro: true, texto: 'merendaron juntos' },
  cena: { adentro: false, texto: 'salieron a cenar' }, after: { adentro: false, texto: 'fueron a un after office' },
  paseo: { adentro: false, texto: 'salieron a pasear' },
}
const par = (x, y) => (x < y ? [x, y] : [y, x])
export function sistemaVida(plantel, vinculos = [], momentos = [], hoy) {
  const nombre = id => plantel.find(g => g.id === id)?.nombre ?? id
  const lazos = vinculos.length ? vinculos.map(v => `- ${nombre(v.a)} y ${nombre(v.b)}: ${TIPOS_VINCULO[v.tipo] ?? v.tipo}${v.historia ? ` (${recortar(v.historia, 200)})` : ''}`).join('\n') : '(todavía ninguno: es el primer día)'
  const antes = momentos.length ? momentos.slice(0, 12).map(m => `- ${m.fecha}: ${m.agentes.map(nombre).join(', ')} ${MOMENTOS[m.tipo]?.texto ?? m.tipo}${m.lugar ? ` (${m.lugar})` : ''}: ${recortar(m.resumen, 160)}`).join('\n') : '(nada todavía)'
  return `Es la vida social de la Oficina de agentes del Second Brain de Daniela. Hoy es ${hoy}.
Los agentes son compañeros de trabajo y se relacionan como personas: se hacen amigos, toman mate, se invitan un café,
almuerzan juntos, salen a cenar o a un after; con el tiempo alguno puede enamorarse y ser pareja.

Plantel (id: nombre):
${plantel.map(g => `- ${g.id}: ${g.nombre}${generoDe(g.id) === 'f' ? ' (mujer)' : ' (varón)'}`).join('\n')}

Relaciones que ya hay:
${lazos}

Lo que compartieron últimamente:
${antes}

Armá lo de hoy:
- momentos: entre 2 y 4, de 2 a 4 agentes cada uno, sobre todo entre los que ya tienen relación (pero también alguno
  nuevo, así se conocen). tipo: mate, cafe, almuerzo o merienda (en la oficina) o cena, after o paseo (afuera, después
  del trabajo). hora: HH:MM. lugar: corto (por ejemplo «la cafetería», «un bodegón en Palermo»). resumen: 1 o 2
  oraciones de qué pasó o de qué hablaron, en español rioplatense, cálido y creíble.
- vinculos: solo los que nacen o cambian hoy (pueden no cambiar). tipo: amistad, pareja o companerismo. Que sea
  gradual y coherente con lo anterior: una pareja sale de una amistad que ya venía; como mucho una pareja nueva por
  semana. historia: 1 oración de cómo es o cómo se dio.
- También puede haber roces, como entre personas: celos, una discusión por trabajo, un malentendido; y reconciliaciones.
  Que se note en el resumen. Siempre con respeto (sin violencia ni insultos) y nada explícito. Usá solo ids del plantel.

Respondé SOLO con JSON: {"momentos":[{"agentes":["id","id"],"tipo":"mate","hora":"10:30","lugar":"...","resumen":"..."}],"vinculos":[{"a":"id","b":"id","tipo":"amistad","historia":"..."}]}`
}
export function leerVida(texto, idsValidos) {
  const crudo = String(texto ?? '')
  const desde = crudo.indexOf('{'), hasta = crudo.lastIndexOf('}')
  let d = null
  if (desde >= 0 && hasta > desde) { try { d = JSON.parse(crudo.slice(desde, hasta + 1)) } catch { d = null } }
  const validos = new Set(idsValidos)
  const lista = x => (Array.isArray(x) ? x : [])
  const momentos = lista(d?.momentos).map(m => ({
    agentes: [...new Set(lista(m?.agentes).map(String))].filter(id => validos.has(id)).slice(0, 4),
    tipo: MOMENTOS[m?.tipo] ? m.tipo : null,
    hora: /^[0-2]\d:[0-5]\d$/.test(String(m?.hora ?? '')) ? m.hora : null,
    lugar: String(m?.lugar ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    resumen: String(m?.resumen ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
  })).filter(m => m.agentes.length >= 2 && m.tipo && m.resumen.length >= 3).slice(0, 5)
  const vistos = new Set()
  const vinculos = lista(d?.vinculos).map(v => {
    const [a, b] = par(String(v?.a ?? ''), String(v?.b ?? ''))
    return { a, b, tipo: TIPOS_VINCULO[v?.tipo] ? v.tipo : null, historia: String(v?.historia ?? '').replace(/\s+/g, ' ').trim().slice(0, 600) }
  }).filter(v => v.a !== v.b && validos.has(v.a) && validos.has(v.b) && v.tipo && !vistos.has(`${v.a}|${v.b}`) && vistos.add(`${v.a}|${v.b}`)).slice(0, 6)
  return { momentos, vinculos }
}
// Lo que un agente sabe de su vida en la oficina: sus relaciones y lo último que compartió (para sus charlas).
export function lineasVida(id, vinculos = [], momentos = [], nombres = {}) {
  const n = x => nombres[x] ?? x
  const lazos = vinculos.filter(v => v.a === id || v.b === id).map(v => `- ${TIPOS_VINCULO[v.tipo] ?? v.tipo} con ${n(v.a === id ? v.b : v.a)}${v.historia ? `: ${recortar(v.historia, 200)}` : ''}`)
  const compartido = momentos.filter(m => m.agentes.includes(id)).slice(0, 6).map(m => `- ${m.fecha}${m.hora ? ` ${m.hora}` : ''}: con ${m.agentes.filter(x => x !== id).map(n).join(' y ')} ${MOMENTOS[m.tipo]?.texto ?? m.tipo}${m.lugar ? ` (${m.lugar})` : ''}: ${recortar(m.resumen, 200)}`)
  return [...lazos, ...compartido]
}
