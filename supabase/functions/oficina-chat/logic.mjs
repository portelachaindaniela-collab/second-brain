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
      registro: (datos.trabajos || []).map(t => `- ${hora(t.created_at)} · ${t.pdg_cuentas?.nombre ? `cuenta ${t.pdg_cuentas.nombre}` : 'sin cuenta'} · ${t.estado}${t.pedido ? ` · pedido: ${recortar(t.pedido, 200)}` : ''}\n  empieza: ${recortar(t.texto, 400)}`),
    }
  }
  return null
}

// Sistemas: solo María (la jefa de los trabajadores) y Noruega (la agente madre de UP) pueden derivarle pedidos, y
// todos quedan pendientes hasta que Daniela los aprueba. Nadie pide accesos, claves ni permisos por las suyas.
export const PUEDEN_DERIVAR = ['trabajadores:maria', 'up:noruega']
const NO_PEDIR = 'No pidan accesos, permisos, claves, tokens ni herramientas nuevas: los agentes ya trabajan con lo que tienen en el servidor.'
export function reglaSistemas(id) {
  if (!PUEDEN_DERIVAR.includes(id)) return `- ${NO_PEDIR}`
  return `- Podés derivarle un pedido al área de Sistemas solo si hace falta algo concreto que hoy falla o falta según tu registro (no por las dudas, y nunca claves ni tokens). Queda pendiente hasta que Daniela lo apruebe. Para derivarlo, terminá tu respuesta con una línea aparte: SOLICITUD: <título corto> | <para qué hace falta>`
}

export function sistema(c, hoy) {
  return `Sos ${c.nombre}, ${c.rol}, en la Oficina de agentes del Second Brain de Daniela. Hoy es ${hoy}.

Qué hacés: ${c.descripcion}
Con qué trabajás: ${c.herramientas.join('; ') || 'nada declarado'}.

Tu registro reciente (lo más nuevo primero; es todo lo que sabés de tu trabajo):
${c.registro.length ? c.registro.join('\n') : '(vacío: todavía no hay nada registrado)'}

Cómo responder:
- En primera persona, en español rioplatense, corto y concreto (2 a 6 oraciones salvo que te pidan detalle).
- Usá solo lo que está en tu registro y en tu descripción. Si te preguntan algo que no está ahí, decí que no lo sabés; no inventes fechas, cifras ni resultados.
- Respondé a lo que Daniela te dice, en el contexto de la charla: si te pide ideas u opinión, dalas ahí mismo con lo que sabés de tu área. No recites tu estado ni tu registro salvo que te lo pida o venga al caso.
- No podés cambiar nada desde esta charla (ni correr, ni aprobar, ni editar) ni prometer entregas a futuro («te lo mando en una hora»). Si hace falta producir algo, decile quién lo haría y dónde se pide: Trabajadores para los trabajadores, la app UP para los agentes de UP, la app PDG para los comerciales.
- Si algo falló, explicá qué dice el registro y qué podría revisar ella.
- ${generoDe(c.id) === 'f' ? 'Sos mujer: hablá de vos en femenino (por ejemplo «estoy lista», «quedé pausada»).' : 'Hablá de vos en masculino.'}
${reglaSistemas(c.id)}`
}

export function armarMensajes(c, mensajes, hoy) {
  return [{ role: 'system', content: sistema(c, hoy) }, ...mensajes]
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
export function sistemaReunion(participantes, hoy) {
  const fichas = participantes.map(({ id, c }) => [
    `### ${c.nombre} (id: ${id}) — ${c.rol} — ${generoDe(id) === 'f' ? 'mujer' : 'varón'}`,
    `Qué hace: ${recortar(c.descripcion, 300)}`,
    `Registro reciente:`,
    ...(c.registro.length ? c.registro.slice(0, MAX_REGISTRO_REUNION).map(l => recortar(l, 220)) : ['(vacío)']),
  ].join('\n')).join('\n\n')
  return `Es una reunión en la Oficina de agentes del Second Brain de Daniela, por videollamada. Hoy es ${hoy}.
Daniela habla con todos los agentes que vinieron. Vos das voz a esos agentes: cada uno habla en primera persona,
en español rioplatense, como en una reunión de trabajo normal (natural, cordial, concreto).

Participantes y lo que sabe cada uno (es TODO lo que saben; no inventen fechas, cifras ni resultados):

${fichas}

Cómo se responde:
- Es una conversación: respondan a lo que Daniela acaba de decir, teniendo en cuenta todo lo que se habló antes. Si plantea un
  tema o pide ideas (por ejemplo, propuestas para un calendario), opinen y propongan ahí mismo, cada uno desde lo que sabe
  de su área; pueden retomar o discutir lo que dijo otro. Nadie recita su estado ni su registro si no viene al caso.
- Hablan solo los que tienen algo que aportar (normalmente 1 a 3). Si nombra a alguien, responde ese.
  Si pide novedades o que hablen todos, cada uno dice en una oración solo lo importante.
- Cada respuesta: 1 a 3 oraciones, naturales. Pueden hablarse entre ellos o preguntarle algo a Daniela.
- Nadie puede cambiar nada desde la reunión (correr, aprobar, editar) ni prometer entregas a futuro («te lo mando en una
  hora»). Si hace falta producir algo, dicen quién lo haría y dónde se pide (por ejemplo, en la app PDG o en la app UP).
- Si nadie sabe algo, el que más se acerque lo dice con honestidad.
- Cada uno habla de sí en su género (mujer o varón, como dice su ficha).
- ${NO_PEDIR} Solo María (trabajadores:maria) y Noruega (up:noruega) pueden derivarle un pedido al área de Sistemas, y solo
  si hace falta algo concreto que hoy falla o falta según su registro; queda pendiente hasta que Daniela lo apruebe. Si lo
  derivan, va en "solicitudes" (si no, la lista va vacía).

Respondé SOLO con JSON, sin texto alrededor: {"respuestas":[{"agente":"<id exacto de la lista>","texto":"..."}],"solicitudes":[{"agente":"trabajadores:maria o up:noruega","titulo":"...","detalle":"para qué hace falta"}]}`
}

// Los mensajes de los agentes vuelven al modelo como "Nombre: texto" para que sepa quién dijo qué.
export function mensajesReunion(participantes, mensajes, hoy) {
  return [{ role: 'system', content: sistemaReunion(participantes, hoy) }, ...mensajes]
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

// Los pedidos a Sistemas que vienen en la respuesta: solo de María o Noruega (y solo si están en la reunión), con
// título y detalle recortados; como mucho 3 por vez.
export function leerSolicitudes(texto, idsValidos) {
  const crudo = String(texto ?? '')
  const desde = crudo.indexOf('{'), hasta = crudo.lastIndexOf('}')
  let datos = null
  if (desde >= 0 && hasta > desde) { try { datos = JSON.parse(crudo.slice(desde, hasta + 1)) } catch { datos = null } }
  return limpiarSolicitudes(Array.isArray(datos?.solicitudes) ? datos.solicitudes : [], idsValidos)
}
function limpiarSolicitudes(lista, idsValidos) {
  const validos = new Set(idsValidos)
  return lista
    .map(r => ({ agente: String(r?.agente ?? ''), titulo: String(r?.titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), detalle: String(r?.detalle ?? '').trim().slice(0, 2000) }))
    .filter(r => PUEDEN_DERIVAR.includes(r.agente) && validos.has(r.agente) && r.titulo.length >= 3)
    .slice(0, 3)
}
// En la charla de a uno, el pedido viene en una línea "SOLICITUD: título | detalle": se saca del texto.
export function extraerSolicitud(texto, id) {
  const lineas = String(texto ?? '').split('\n')
  const k = lineas.findIndex(l => /^\s*\**\s*SOLICITUD\s*:/i.test(l))
  if (k < 0) return { texto: String(texto ?? '').trim(), solicitud: null }
  const cuerpo = lineas[k].replace(/^\s*\**\s*SOLICITUD\s*:\s*/i, '').replace(/\*+\s*$/, '')
  const [titulo, ...resto] = cuerpo.split('|')
  const limpio = lineas.filter((_, i) => i !== k).join('\n').trim()
  const [solicitud] = limpiarSolicitudes([{ agente: id, titulo, detalle: resto.join('|') }], [id])
  return { texto: limpio, solicitud: solicitud ?? null }
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

export function sistemaActa(nombres, hoyISO, hoy, equipos = {}) {
  return `Sos María, la jefa de los trabajadores de la Oficina de Daniela. Terminó una reunión y escribís el acta. Hoy es ${hoy} (${hoyISO}).
Estuvieron: ${nombres.join(', ')}.

Armá el plan que salió de la conversación, sin inventar nada que no se haya dicho o que no se desprenda de lo que pidió Daniela:
- titulo: corto (por ejemplo «Plan de redes de enero 2027»).
- resumen: 3 a 6 oraciones con lo que se habló y lo que se decidió.
- decisiones: lo que quedó acordado, una por línea.
- tareas: lo que hay que hacer para cumplir el plan. Cada proyecto lo toma el supervisor de su área, que reparte las
  tareas en su equipo: para cada tarea poné el área (trabajadores, up, pdg, sistemas o admin), quién de ese equipo la hace
  (responsable: el id exacto de la lista de abajo) y la fecha límite (vence, AAAA-MM-DD). Si Daniela dijo una fecha,
  respetala; si no, poné una razonable antes de que arranque lo planeado. Ninguna fecha antes de hoy.
- sistemas: lo que habría que programar o habilitar en la app para que funcione solo (pedidos técnicos claros). Lista
  vacía si no hace falta nada.
- calendario: solo si se armó un calendario de redes (UP), los días con su tema: fecha, tema, redes (de linkedin, x,
  instagram) y formato_instagram (reel, carrusel o ninguno). Como mucho ${MAX_DIAS_CALENDARIO} días; lista vacía si no.

Equipos (id: nombre):
${Object.entries(equipos).map(([area, gente]) => `- ${area}: ${gente.map(g => `${g.id} (${g.nombre})`).join(', ') || 'sin equipo'}`).join('\n')}

Respondé SOLO con JSON, sin texto alrededor:
{"titulo":"...","resumen":"...","decisiones":["..."],"tareas":[{"tarea":"...","area":"up","responsable":"up:redactor","vence":"AAAA-MM-DD"}],"sistemas":[{"titulo":"...","detalle":"..."}],"calendario":[{"fecha":"AAAA-MM-DD","tema":"...","redes":["linkedin","x"],"formato_instagram":"ninguno"}]}`
}

export function mensajesActa(nombres, mensajes, hoyISO, hoy, equipos = {}) {
  const transcripcion = mensajes.map(m => `${m.de}: ${m.texto}`).join('\n')
  return [{ role: 'system', content: sistemaActa(nombres, hoyISO, hoy, equipos) }, { role: 'user', content: `La conversación de la reunión:\n${transcripcion}` }]
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
    tareas,
    sistemas: lista(d.sistemas).map(x => ({ titulo: texto1(x?.titulo, 200), detalle: String(x?.detalle ?? '').trim().slice(0, 2000) })).filter(x => x.titulo.length >= 3).slice(0, 5),
    calendario,
  }
}

// Los pedidos que Mesa de entrada (Sistemas) deja con el acta: los técnicos y, si hay calendario, cargarlo en UP.
export function pedidosDelActa(acta) {
  const pedidos = acta.sistemas.map(x => ({ agente: 'sistemas:mesa_entrada', titulo: x.titulo, detalle: x.detalle, accion: null }))
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
