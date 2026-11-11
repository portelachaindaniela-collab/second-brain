// Lógica pura de la Oficina: los agentes de Trabajadores, UP y PDG en un solo plantel, qué está haciendo cada uno
// y lo que te toca a vos. Todo sale de datos reales (trabajos_corridas, up_corridas, up_chequeos, pdg_trabajos…);
// nada es decorativo: si un agente está en su escritorio trabajando es porque tiene una corrida en curso.
import { trabada, haceCuanto, duracionLegible } from './trabajadores.mjs'
import { RECORRIDOS, FUENTES, vidaDeTrabajador, textoTrabajador, alertas as calcularAlertas } from './tablero.mjs'
import { NOMBRE_DESTINO } from './orbital.mjs'
import { AGENTES_UP, ORDEN_UP, herramientasPdg, idAgente } from '../supabase/functions/_shared/oficina.mjs'

import { EQUIPOS as EQUIPOS_SERVIDOR } from '../supabase/functions/_shared/oficina.mjs'
export { partirId } from '../supabase/functions/_shared/oficina.mjs'

// Administración solo existe en la pantalla: son tareas programadas (cron), no conversan con la IA.
export const EQUIPOS = {
  ...EQUIPOS_SERVIDOR,
  admin: { nombre: 'Administración', descripcion: 'Tareas programadas de apoyo: corren solas a su hora.' },
}

// Estados: trabajando (corrida en curso), libre (hizo lo suyo y espera su turno), error (la última falló o quedó
// trabada), pausado (desactivado), nuevo (todavía no hizo nada).
export const ESTADOS = {
  trabajando: 'Trabajando',
  libre: 'Libre',
  error: 'Con un problema',
  pausado: 'Pausado',
  nuevo: 'Todavía no trabajó',
}

const recortar = (texto, max = 160) => {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
const ms = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null }

// ---------- Trabajadores ----------
function herramientasTrabajador(clave) {
  const r = RECORRIDOS[clave]
  if (!r) return []
  return [...r.fuentes.map(f => `Lee: ${FUENTES[f] ?? f}`), ...r.destinos.map(d => `Escribe en: ${NOMBRE_DESTINO[d] ?? d}`)]
}

function textoCorrida(c, ahora) {
  if (c.estado === 'corriendo') return trabada(c, ahora) ? 'Quedó trabada' : 'Corriendo'
  if (c.estado === 'error') return `Falló${c.error ? `: ${recortar(c.error, 120)}` : ''}`
  return [c.cantidad_resultados != null ? `${c.cantidad_resultados} resultados` : 'Terminó bien', c.duracion_ms != null ? duracionLegible(c.duracion_ms) : null].filter(Boolean).join(' · ')
}

export function agenteTrabajador(t, corridas = [], ahora = Date.now()) {
  const ultima = corridas[0]
  const terminada = corridas.find(c => c.estado !== 'corriendo')
  const estaTrabada = ultima && trabada(ultima, ahora, t.minutos_trabado)
  const corriendo = ultima?.estado === 'corriendo' && !estaTrabada
  let estado = 'libre'
  if (!t.activo) estado = 'pausado'
  else if (corriendo) estado = 'trabajando'
  else if (estaTrabada || terminada?.estado === 'error') estado = 'error'
  else if (!ultima) estado = 'nuevo'
  let ahoraTexto = textoTrabajador(t, vidaDeTrabajador(t, corridas, ahora), corriendo, ahora)
  if (t.activo && estaTrabada) ahoraTexto = `trabado desde ${haceCuanto(ultima.iniciado_at, ahora)}`
  else if (t.activo && estado === 'error') ahoraTexto = `la última corrida falló ${haceCuanto(terminada.finalizado_at || terminada.iniciado_at, ahora)}`
  return {
    id: idAgente('trabajadores', t.clave), equipo: 'trabajadores', clave: t.clave,
    nombre: t.nombre, rol: t.tipo === 'monitor' ? 'Monitor' : t.tipo === 'scraper' ? 'Scraper' : 'Cliente de API',
    descripcion: t.descripcion || '', color: t.color || null, estado, ahora: ahoraTexto,
    ultima: ms(ultima?.iniciado_at),
    tareas: corridas.slice(0, 8).map(c => ({ at: ms(c.iniciado_at), texto: textoCorrida(c, ahora), nivel: c.estado === 'error' || trabada(c, ahora, t.minutos_trabado) ? 'error' : c.estado === 'corriendo' ? 'trabajando' : 'ok' })),
    herramientas: herramientasTrabajador(t.clave),
  }
}

// ---------- UP ----------
// corridas: las últimas de up_corridas (la más nueva primero). Cada agente toma sus pasos de las corridas donde aparece.
// chequeo: la última revisión de Noruega; si marca una falla de un agente (su id es el del agente), ese agente está en problemas.
export function agentesUp(corridas = [], chequeo = null, ahora = Date.now()) {
  const fallas = Object.fromEntries((chequeo?.chequeos ?? []).filter(c => c.estado === 'falla' && AGENTES_UP[c.id]).map(c => [c.id, c.detalle]))
  return ORDEN_UP.map(clave => {
    const def = AGENTES_UP[clave]
    const base = { id: idAgente('up', clave), equipo: 'up', clave, nombre: def.nombre, rol: def.rol, descripcion: def.descripcion, color: null, herramientas: def.herramientas }
    if (clave === 'noruega') {
      const items = chequeo?.chequeos ?? []
      const malos = items.filter(c => c.estado !== 'ok')
      return {
        ...base, estado: chequeo ? 'libre' : 'nuevo', ultima: ms(chequeo?.at),
        ahora: chequeo ? `revisó ${haceCuanto(chequeo.at, ahora)}: ${malos.length ? malos.map(c => c.nombre).join(', ') : 'todo en orden'}` : 'todavía no revisó',
        tareas: items.map(c => ({ at: ms(chequeo.at), texto: `${c.nombre}: ${recortar(c.detalle)}`, nivel: c.estado === 'falla' ? 'error' : c.estado === 'aviso' ? 'aviso' : 'ok' })),
      }
    }
    const suyas = corridas.filter(c => (c.pasos || []).some(p => p.agente === clave))
    const ultima = suyas[0]
    const pasosUltima = (ultima?.pasos || []).filter(p => p.agente === clave)
    const ultimoPaso = (ultima?.pasos || []).at(-1)
    const enCurso = ultima?.estado === 'corriendo' && ultimoPaso?.agente === clave
    const fallo = ultima?.estado === 'error' && ultimoPaso?.agente === clave
    let estado = ultima ? 'libre' : 'nuevo'
    let ahoraTexto = ultima ? `trabajó ${haceCuanto(pasosUltima.at(-1)?.at || ultima.iniciado_at, ahora)}: ${recortar(pasosUltima.at(-1)?.accion, 80)}` : 'todavía no trabajó'
    if (enCurso) { estado = 'trabajando'; ahoraTexto = recortar(ultimoPaso.accion, 120) }
    else if (fallas[clave]) { estado = 'error'; ahoraTexto = `Noruega avisa: ${recortar(fallas[clave], 140)}` }
    else if (fallo) { estado = 'error'; ahoraTexto = `la corrida falló${ultima.error ? `: ${recortar(ultima.error, 120)}` : ''}` }
    const pasos = suyas.flatMap(c => (c.pasos || []).filter(p => p.agente === clave).reverse())
    return {
      ...base, estado, ahora: ahoraTexto, ultima: ms(pasosUltima.at(-1)?.at || ultima?.iniciado_at),
      tareas: pasos.slice(0, 8).map(p => ({ at: ms(p.at), texto: recortar(`${p.accion}${p.detalle ? ` — ${p.detalle}` : ''}`), nivel: /^(marcó|no pudo|error|cortó)/.test(p.accion) ? 'error' : 'ok' })),
    }
  })
}

// ---------- PDG ----------
// trabajos: los últimos de pdg_trabajos (el más nuevo primero), con la cuenta si la tiene.
const ESTADO_TRABAJO = { borrador: 'borrador sin revisar', aprobado: 'aprobado', descartado: 'descartado' }
export function agentesPdg(agentes = [], trabajos = [], ahora = Date.now()) {
  return [...agentes].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map(a => {
    const suyos = trabajos.filter(t => t.agente === a.clave)
    const ultimo = suyos[0]
    const sobre = t => t.cuenta?.nombre ? `para ${t.cuenta.nombre}` : t.pedido ? `«${recortar(t.pedido, 60)}»` : 'sin cuenta'
    return {
      id: idAgente('pdg', a.clave), equipo: 'pdg', clave: a.clave, nombre: a.nombre, rol: recortar(a.rol?.split('.')[0], 70),
      descripcion: a.rol || '', color: null, estado: ultimo ? 'libre' : 'nuevo', ultima: ms(ultimo?.created_at),
      ahora: ultimo ? `escribió ${haceCuanto(ultimo.created_at, ahora)} ${sobre(ultimo)} (${ESTADO_TRABAJO[ultimo.estado] ?? ultimo.estado})` : 'todavía no escribió nada',
      tareas: suyos.slice(0, 8).map(t => ({ at: ms(t.created_at), texto: `${sobre(t)} · ${ESTADO_TRABAJO[t.estado] ?? t.estado}`, nivel: t.estado === 'borrador' ? 'aviso' : 'ok' })),
      herramientas: herramientasPdg(a.clave),
    }
  })
}

// ---------- Administración ----------
// Las tareas programadas que no son trabajadores. corridas: lo que devuelve la función oficina_administracion()
// (una fila por corrida, las últimas 5 de cada tarea; una tarea sin corridas viene con inicio null).
export const AGENTES_ADMIN = {
  search_console: { nombre: 'Search Console', jobs: ['search-console'], rol: 'Trae los datos de Google Search Console', descripcion: 'Una vez por día baja de Google Search Console cómo te encuentran en Google (búsquedas, clics, posiciones) y lo guarda para tus tableros.' },
  resumen_diario: { nombre: 'Resumen diario', jobs: ['resumen-diario-push'], rol: 'Te manda el resumen del día', descripcion: 'Cada día arma el resumen de lo que pasó y te lo manda como notificación.' },
  agenda_dulce: { nombre: 'Agenda dulce', jobs: ['agenda-dulce-1410', 'agenda-dulce-1900'], rol: 'Avisos de la agenda dulce', descripcion: 'Dos veces por día (14:10 y 19:00) manda los avisos de la agenda dulce.' },
  historial_up: { nombre: 'Historial de UP', jobs: ['up-historial'], rol: 'Guarda el historial de UP', descripcion: 'Guarda el historial de lo publicado en UP para que los agentes de UP no repitan.' },
  limpieza: { nombre: 'Limpieza', jobs: ['limpiar-historial'], rol: 'Limpia los registros viejos', descripcion: 'Borra los registros viejos de las corridas para que la base no crezca sin fin.' },
}
const ESTADO_CRON = { succeeded: 'Terminó bien', failed: 'Falló', running: 'Corriendo', starting: 'Arrancando' }

export function agentesAdmin(corridas = [], ahora = Date.now()) {
  return Object.entries(AGENTES_ADMIN).map(([clave, def]) => {
    const filas = corridas.filter(c => def.jobs.includes(c.jobname))
    const suyas = filas.filter(c => c.inicio).sort((a, b) => (ms(b.inicio) ?? 0) - (ms(a.inicio) ?? 0))
    const activo = filas.some(c => c.activo)
    const ultima = suyas[0]
    let estado = 'libre'
    if (filas.length && !activo) estado = 'pausado'
    else if (!ultima) estado = 'nuevo'
    else if (ultima.estado === 'running' || ultima.estado === 'starting') estado = 'trabajando'
    else if (ultima.estado === 'failed') estado = 'error'
    const horario = [...new Set(filas.map(c => c.schedule).filter(Boolean))].join(' y ')
    return {
      id: idAgente('admin', clave), equipo: 'admin', clave, nombre: def.nombre, rol: def.rol,
      descripcion: `${def.descripcion}${horario ? ` Horario (cron, UTC): ${horario}.` : ''}`, color: null, estado, ultima: ms(ultima?.inicio),
      ahora: estado === 'pausado' ? 'Está desactivada.'
        : !ultima ? 'Todavía no corrió.'
          : `Corrió ${haceCuanto(ultima.inicio, ahora)}: ${ESTADO_CRON[ultima.estado] ?? ultima.estado}${ultima.estado === 'failed' && ultima.mensaje ? ` (${recortar(ultima.mensaje, 120)})` : ''}`,
      tareas: suyas.slice(0, 8).map(c => ({ at: ms(c.inicio), texto: `${ESTADO_CRON[c.estado] ?? c.estado}${c.mensaje && c.estado === 'failed' ? `: ${recortar(c.mensaje, 100)}` : ''}`, nivel: c.estado === 'failed' ? 'error' : 'ok' })),
      herramientas: def.jobs.map(j => `Tarea programada: ${j}`),
      sinCharla: true,
    }
  })
}

// ---------- Lo que te toca ----------
// alertas: las de tablero.mjs (trabajadores). piezas: up_piezas de hoy en adelante en falta_info, revision o pendiente.
// chequeo: la última revisión de Noruega. trabajos / cuentas: de PDG. hoy: 'AAAA-MM-DD' en Buenos Aires.
// Cada ítem dice dónde se resuelve (donde) y, si es de un agente, cuál (agente).
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
export function teToca({ alertas = [], piezas = [], chequeo = null, trabajos = [], cuentas = [], hoy }) {
  const lista = alertas.map(a => ({ nivel: a.nivel === 'error' ? 'error' : 'aviso', texto: a.texto, donde: 'Trabajadores' }))
  for (const c of chequeo?.chequeos ?? []) {
    if (c.estado === 'ok') continue
    lista.push({ nivel: c.estado === 'falla' ? 'error' : 'aviso', texto: `Noruega · ${c.nombre}: ${recortar(c.detalle)}`, donde: 'UP › Agentes', agente: idAgente('up', AGENTES_UP[c.id] ? c.id : 'noruega') })
  }
  const futuras = piezas.filter(p => !hoy || p.fecha >= hoy)
  const diasPregunta = new Set(futuras.filter(p => p.estado === 'falta_info').map(p => p.fecha)).size
  if (diasPregunta) lista.push({ nivel: 'aviso', texto: `El Investigador te dejó preguntas para ${plural(diasPregunta, 'día', 'días')}`, donde: 'UP › Preguntas', agente: idAgente('up', 'investigador') })
  const revision = futuras.filter(p => p.estado === 'revision').length
  if (revision) lista.push({ nivel: 'aviso', texto: `El Revisor marcó ${plural(revision, 'borrador', 'borradores')} para que los mires`, donde: 'UP › Hoy', agente: idAgente('up', 'revisor') })
  const aprobar = futuras.filter(p => p.estado === 'pendiente' && p.tiene_texto).length
  if (aprobar) lista.push({ nivel: 'aviso', texto: `${plural(aprobar, 'borrador espera', 'borradores esperan')} tu aprobación`, donde: 'UP › Hoy', agente: idAgente('up', 'redactor') })
  const borradores = trabajos.filter(t => t.estado === 'borrador')
  if (borradores.length) lista.push({ nivel: 'aviso', texto: `PDG: ${plural(borradores.length, 'borrador', 'borradores')} para revisar`, donde: 'PDG › Trabajos', agente: idAgente('pdg', borradores[0].agente) })
  const vencidas = cuentas.filter(c => c.proxima_fecha && hoy && c.proxima_fecha <= hoy && !['ganada', 'perdida'].includes(c.etapa))
  if (vencidas.length) lista.push({ nivel: 'aviso', texto: `PDG: ${plural(vencidas.length, 'cuenta tiene', 'cuentas tienen')} la próxima acción para hoy o vencida (${vencidas.slice(0, 3).map(c => c.nombre).join(', ')}${vencidas.length > 3 ? '…' : ''})`, donde: 'PDG › Cuentas' })
  return lista.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'error' ? -1 : 1))
}

// Junta los datos crudos que carga la pantalla (ver cargarOficina en screens/Oficina.jsx) en el plantel y lo que te toca.
export function armarOficina(d, ahora) {
  const agentes = [
    ...d.trabajadores.map(t => agenteTrabajador(t, d.corridasPor[t.clave] || [], ahora)),
    ...agentesUp(d.upCorridas, d.chequeo, ahora),
    ...agentesPdg(d.pdgAgentes, d.pdgTrabajos, ahora),
    ...agentesAdmin(d.admin ?? [], ahora),
  ]
  const alertas = calcularAlertas({ trabajadores: d.trabajadores, corridasPor: d.corridasPor, ahora, salud: d.salud })
  const pendientes = teToca({ alertas, piezas: d.piezas, chequeo: d.chequeo, trabajos: d.pdgTrabajos, cuentas: d.pdgCuentas, hoy: d.hoy })
  const porAprobar = (d.solicitudes ?? []).filter(x => x.estado === 'pendiente').length
  if (porAprobar) pendientes.push({ nivel: 'aviso', texto: `Sistemas: ${plural(porAprobar, 'pedido espera', 'pedidos esperan')} tu aprobación`, donde: 'Oficina › Sistemas' })
  for (const a of agentes) if (a.equipo === 'admin' && a.estado === 'error') pendientes.push({ nivel: 'error', texto: `${a.nombre}: ${a.ahora}`, donde: 'Oficina › Administración', agente: a.id })
  // Las alertas de los trabajadores empiezan con su nombre ("Ópera: …"): así se sabe de quién son.
  for (const p of pendientes) {
    if (p.agente) continue
    const a = agentes.find(x => x.equipo === 'trabajadores' && (p.texto.startsWith(`${x.nombre}:`) || p.texto.startsWith(`${x.nombre} ·`)))
    if (a) p.agente = a.id
  }
  return { agentes, pendientes }
}

export function contarEstados(agentes) {
  const r = { total: agentes.length, trabajando: 0, libre: 0, error: 0, pausado: 0, nuevo: 0 }
  for (const a of agentes) r[a.estado] = (r[a.estado] ?? 0) + 1
  return r
}

// Hoy en Buenos Aires, 'AAAA-MM-DD'.
export function hoyAR(ahora = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ahora))
}

// ---------- Reunión ----------
// El informe que da cada agente en la reunión, armado con sus datos (sin IA): qué está haciendo, lo último que
// hizo y qué necesita de vos. pendientes: lo de teToca(); los que tienen `agente` son de él.
const minuscula = t => (t ? t[0].toLowerCase() + t.slice(1) : t)
export function informeDe(a, pendientes = [], ahora = Date.now()) {
  const partes = [`Hola, soy ${a.nombre.split(' (')[0]}.`]
  if (a.estado === 'trabajando') partes.push(`Estoy trabajando en este momento: ${minuscula(a.ahora)}.`)
  else if (a.estado === 'error') partes.push(`Tengo un problema: ${minuscula(a.ahora)}.`)
  else if (a.estado === 'pausado') partes.push('Estoy pausado.')
  else if (a.estado === 'nuevo') partes.push('Todavía no me tocó trabajar.')
  else partes.push(`Estoy al día: ${minuscula(a.ahora)}.`)
  const ultima = a.tareas?.[0]
  if (ultima && a.estado !== 'nuevo') partes.push(`Lo último: ${minuscula(ultima.texto)}${ultima.at ? ` (${haceCuanto(new Date(ultima.at).toISOString(), ahora)})` : ''}.`)
  const mios = pendientes.filter(p => p.agente === a.id)
  partes.push(mios.length ? `Necesito de vos: ${mios.map(p => minuscula(p.texto)).join('; ')}.` : 'No necesito nada de vos por ahora.')
  return partes.join(' ').replace(/\.\./g, '.')
}

// Cierre de la jefa: cómo está el equipo que vino a la reunión.
export function resumenReunion(asistentes, pendientes = []) {
  const c = contarEstados(asistentes)
  const partes = [`Resumen: vinieron ${asistentes.length}.`]
  partes.push(c.trabajando ? `${c.trabajando} ${c.trabajando === 1 ? 'está trabajando' : 'están trabajando'} ahora.` : 'Nadie está corriendo ahora.')
  if (c.error) partes.push(`${c.error} ${c.error === 1 ? 'tiene un problema' : 'tienen problemas'}: ${asistentes.filter(a => a.estado === 'error').map(a => a.nombre.split(' (')[0]).join(', ')}.`)
  else partes.push('Nadie tiene problemas.')
  const ids = new Set(asistentes.map(a => a.id))
  const tuyos = pendientes.filter(p => !p.agente || ids.has(p.agente)).length
  partes.push(tuyos ? `Te ${tuyos === 1 ? 'toca 1 cosa' : `tocan ${tuyos} cosas`}: están en "Te toca".` : 'No te toca nada por ahora.')
  return partes.join(' ')
}

// Orden de los turnos: en el orden del plantel, y la jefa (si vino) cierra.
export function turnosReunion(asistentes, idJefa = 'trabajadores:maria') {
  return [...asistentes.filter(a => a.id !== idJefa), ...asistentes.filter(a => a.id === idJefa)]
}
