// Lógica pura de la Oficina: los agentes de Trabajadores, UP y PDG en un solo plantel, qué está haciendo cada uno
// y lo que te toca a vos. Todo sale de datos reales (trabajos_corridas, up_corridas, up_chequeos, pdg_trabajos…);
// nada es decorativo: si un agente está en su escritorio trabajando es porque tiene una corrida en curso.
import { trabada, haceCuanto, duracionLegible } from './trabajadores.mjs'
import { RECORRIDOS, FUENTES, vidaDeTrabajador, textoTrabajador, alertas as calcularAlertas } from './tablero.mjs'
import { NOMBRE_DESTINO } from './orbital.mjs'
import { AGENTES_UP, ORDEN_UP, herramientasPdg, idAgente } from '../supabase/functions/_shared/oficina.mjs'

export { EQUIPOS, partirId } from '../supabase/functions/_shared/oficina.mjs'

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
  ]
  const alertas = calcularAlertas({ trabajadores: d.trabajadores, corridasPor: d.corridasPor, ahora, salud: d.salud })
  const pendientes = teToca({ alertas, piezas: d.piezas, chequeo: d.chequeo, trabajos: d.pdgTrabajos, cuentas: d.pdgCuentas, hoy: d.hoy })
  return { agentes, pendientes }
}

export function contarEstados(agentes) {
  const r = { total: agentes.length, trabajando: 0, libre: 0, error: 0, pausado: 0, nuevo: 0 }
  for (const a of agentes) r[a.estado] = (r[a.estado] ?? 0) + 1
  return r
}

// ---------- Plano isométrico ----------
// Cada sala es una grilla de puestos (3 por fila). Las medidas van en baldosas; iso() las pasa a la pantalla.
export const PLANO = { porFila: 3, puesto: 3, margen: 1, baldosa: 34 }

export function planoSala(cantidad, porFila = PLANO.porFila) {
  const cols = Math.min(Math.max(cantidad, 1), porFila)
  const filas = Math.max(1, Math.ceil(cantidad / porFila))
  const ancho = cols * PLANO.puesto + PLANO.margen * 2
  const fondo = filas * PLANO.puesto + PLANO.margen * 2
  const puestos = Array.from({ length: cantidad }, (_, i) => ({
    x: PLANO.margen + (i % porFila) * PLANO.puesto + PLANO.puesto / 2,
    y: PLANO.margen + Math.floor(i / porFila) * PLANO.puesto + PLANO.puesto / 2,
  }))
  return { ancho, fondo, puestos }
}

// Proyección isométrica clásica (30°): x hacia abajo a la derecha, y hacia abajo a la izquierda, z hacia arriba.
const COS = Math.cos(Math.PI / 6)
export function iso(x, y, z = 0, b = PLANO.baldosa) {
  return { x: Math.round((x - y) * COS * b * 100) / 100, y: Math.round(((x + y) / 2 - z) * b * 100) / 100 }
}
export const puntos = lista => lista.map(p => `${p.x},${p.y}`).join(' ')

// Hoy en Buenos Aires, 'AAAA-MM-DD'.
export function hoyAR(ahora = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ahora))
}
