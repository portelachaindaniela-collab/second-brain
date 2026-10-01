// Geometría y lectura del sistema orbital de Trabajadores. Solo cálculos: el dibujo está en SistemaOrbital.jsx.
// Núcleo (Second Brain) en el centro; cada trabajador en su propia órbita; fuentes y destinos en el anillo exterior,
// fuentes a la izquierda y destinos a la derecha, para que el flujo se lea de izquierda a derecha.
import { RECORRIDOS, REGISTRO, FUENTES } from './tablero.mjs'
import { trabada } from './trabajadores.mjs'

export const LIENZO = { ancho: 880, alto: 600, cx: 440, cy: 300, nucleo: 46, nodo: 18, tarjeta: { ancho: 136, alto: 42 } }
const ORBITA_BASE = 104, ORBITA_PASO = 32, ACHATADO = 0.62
const EXTERIOR = { rx: 348, ry: 232 }
// Vuelta completa en 20 minutos: se nota que se mueve, sin distraer.
export const GRADOS_POR_SEGUNDO = 0.3

export const DESCRIPCION_FUENTE = {
  github_pages: 'Documentación y reportes',
  google: 'Calendario y mails',
  sitios: 'Blogs y webs',
  eventbrite: 'Eventos y actividades',
}
export const DESCRIPCION_DESTINO = {
  eventos: 'Eventos encontrados',
  calendar_events: 'Eventos de calendario',
  emails: 'Emails procesados',
  process_reports: 'Reportes de María',
  [REGISTRO]: 'Registro de corridas',
}

const rad = g => (g * Math.PI) / 180
const punto = (rx, ry, grados) => ({ x: LIENZO.cx + rx * Math.cos(rad(grados)), y: LIENZO.cy + ry * Math.sin(rad(grados)) })

function repartir(cantidad, desde, hasta) {
  if (cantidad === 1) return [(desde + hasta) / 2]
  return Array.from({ length: cantidad }, (_, i) => desde + ((hasta - desde) * i) / (cantidad - 1))
}

// rotacion: grados que giró el sistema. elegido: el trabajador que pasa al frente (arriba, en su órbita).
export function disposicion(trabajadores, { rotacion = 0, elegido = null } = {}) {
  const n = trabajadores.length || 1
  const nodos = trabajadores.map((t, i) => {
    const orbita = { rx: ORBITA_BASE + i * ORBITA_PASO, ry: (ORBITA_BASE + i * ORBITA_PASO) * ACHATADO }
    const angulo = t.clave === elegido ? -90 : -90 + (360 / n) * i + rotacion
    return { id: `t:${t.clave}`, tipo: 'trabajador', clave: t.clave, etiqueta: t.nombre, color: t.color, orbita, angulo, ...punto(orbita.rx, orbita.ry, angulo) }
  })
  const recorridos = trabajadores.map(t => ({ clave: t.clave, ...(RECORRIDOS[t.clave] ?? { fuentes: [], destinos: [] }) }))
  const fuentes = [...new Set(recorridos.flatMap(r => r.fuentes))]
  const destinos = [...new Set([...recorridos.flatMap(r => r.destinos), REGISTRO])]
  const alto = Math.min(46, 12 * fuentes.length)
  repartir(fuentes.length, 180 - alto, 180 + alto).forEach((g, i) => {
    const id = fuentes[i]
    nodos.push({ id: `f:${id}`, tipo: 'fuente', etiqueta: FUENTES[id] ?? id, descripcion: DESCRIPCION_FUENTE[id] ?? '', ...punto(EXTERIOR.rx, EXTERIOR.ry, g) })
  })
  const altoD = Math.min(56, 12 * destinos.length)
  repartir(destinos.length, -altoD, altoD).forEach((g, i) => {
    const id = destinos[i]
    nodos.push({ id: `d:${id}`, tipo: 'destino', etiqueta: id, descripcion: DESCRIPCION_DESTINO[id] ?? '', registro: id === REGISTRO, ...punto(EXTERIOR.rx, EXTERIOR.ry, g) })
  })
  const enlaces = recorridos.flatMap(({ clave, fuentes: fs, destinos: ds }) => [
    ...fs.map(f => ({ id: `f:${f}>t:${clave}`, desde: `f:${f}`, hasta: `t:${clave}`, clave })),
    ...[...ds, REGISTRO].map(d => ({ id: `t:${clave}>d:${d}`, desde: `t:${clave}`, hasta: `d:${d}`, clave })),
  ])
  return { nodos, enlaces, orbitas: nodos.filter(x => x.tipo === 'trabajador').map(x => ({ clave: x.clave, ...x.orbita })) }
}

// Dónde toca el enlace a cada nodo: el borde de la tarjeta que mira al centro, o el borde del círculo del trabajador.
function anclaje(nodo, haciaX, haciaY) {
  if (nodo.tipo === 'trabajador') {
    const d = Math.hypot(haciaX - nodo.x, haciaY - nodo.y) || 1
    const r = LIENZO.nodo + 4
    return { x: nodo.x + ((haciaX - nodo.x) / d) * r, y: nodo.y + ((haciaY - nodo.y) / d) * r }
  }
  const medio = LIENZO.tarjeta.ancho / 2
  return { x: nodo.tipo === 'fuente' ? nodo.x + medio : nodo.x - medio, y: nodo.y }
}

// Curva que se arquea hacia el núcleo: se lee como un camino que pasa por el sistema, no una recta.
export function trazo(desde, hasta) {
  const a = anclaje(desde, hasta.x, hasta.y)
  const b = anclaje(hasta, desde.x, desde.y)
  const tira = (p, f) => ({ x: p.x + (LIENZO.cx - p.x) * f, y: p.y + (LIENZO.cy - p.y) * f })
  const c1 = tira(a, 0.28), c2 = tira(b, 0.28)
  const r = n => Math.round(n * 10) / 10
  return `M${r(a.x)} ${r(a.y)} C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(b.x)} ${r(b.y)}`
}

export function estadoTrabajador(trabajador, corridas = [], ahora = Date.now()) {
  if (!trabajador.activo) return 'pausado'
  const ultima = corridas[0]
  if (ultima?.estado === 'corriendo') return trabada(ultima, ahora, trabajador.minutos_trabado) ? 'trabado' : 'corriendo'
  const terminada = corridas.find(c => c.estado !== 'corriendo')
  return terminada?.estado === 'error' ? 'error' : terminada ? 'ok' : 'sin_corridas'
}

export const FILTROS = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'activos', etiqueta: 'Activos' },
  { id: 'pausados', etiqueta: 'Pausados' },
  { id: 'errores', etiqueta: 'Con errores' },
]

export function pasaFiltro(estado, filtro) {
  if (filtro === 'activos') return estado !== 'pausado'
  if (filtro === 'pausados') return estado === 'pausado'
  if (filtro === 'errores') return estado === 'error' || estado === 'trabado'
  return true
}

export function contarFiltros(estados) {
  return Object.fromEntries(FILTROS.map(f => [f.id, estados.filter(e => pasaFiltro(e, f.id)).length]))
}

const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Búsqueda: un trabajador coincide si coincide él, alguna de sus fuentes o alguno de sus destinos.
export function coincideBusqueda(clave, texto, { nodos, enlaces }) {
  const q = normal(texto).trim()
  if (!q) return true
  const propios = new Set([`t:${clave}`, ...enlaces.filter(e => e.clave === clave).flatMap(e => [e.desde, e.hasta])])
  return nodos.some(n => propios.has(n.id) && (normal(n.etiqueta).includes(q) || normal(n.descripcion).includes(q)))
}

// Lo que se resalta cuando un trabajador tiene el foco: él, sus enlaces y las puntas de esos enlaces.
export function focoDe(clave, { enlaces }) {
  if (!clave) return null
  const propios = enlaces.filter(e => e.clave === clave)
  return { nodos: new Set([`t:${clave}`, ...propios.flatMap(e => [e.desde, e.hasta])]), enlaces: new Set(propios.map(e => e.id)) }
}
