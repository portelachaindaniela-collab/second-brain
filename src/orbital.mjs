// Geometría y lectura del sistema orbital de Trabajadores. Solo cálculos: el dibujo está en SistemaOrbital.jsx.
// Núcleo (Second Brain) en el centro; cada trabajador en su propia órbita; fuentes y destinos en el anillo exterior,
// fuentes a la izquierda y destinos a la derecha, para que el flujo se lea de izquierda a derecha.
// En el celular el lienzo es vertical (LIENZO_VERTICAL): fuentes arriba, núcleo en el medio y destinos abajo, todo dentro
// del ancho de la pantalla, sin deslizar de costado.
import { RECORRIDOS, REGISTRO, FUENTES } from './tablero.mjs'
import { trabada } from './trabajadores.mjs'

export const LIENZO = { ancho: 880, alto: 600, cx: 440, cy: 300, nucleo: 54, nodo: 18, tarjeta: { ancho: 152, alto: 44 } }
const ORBITA_BASE = 124, ORBITA_PASO = 32, ACHATADO = 0.62
const EXTERIOR = { rx: 348, ry: 232 }
// Vertical: 340 de ancho (lo que entra en un celular sin achicar la letra), órbitas más altas que anchas y tarjetas
// en dos columnas. El alto y el centro dependen de cuántas fuentes y destinos hay: los calcula disposicion().
export const LIENZO_VERTICAL = { vertical: true, ancho: 340, cx: 170, nucleo: 54, nodo: 18, tarjeta: { ancho: 162, alto: 38 } }
const VERTICAL = { base: 92, paso: 16, alargado: 1, margen: 6, hueco: 8, aireOrbita: 70 }
// Vuelta completa en 20 minutos: se nota que se mueve, sin distraer.
export const GRADOS_POR_SEGUNDO = 0.3

export const DESCRIPCION_FUENTE = {
  github_pages: 'Reporte del scraper',
  google: 'Calendario y mails',
  sitios: 'Webs que vigilás',
  tareas: 'Tareas quietas',
  eventbrite: 'Eventos y actividades',
  medios: 'Webs, X y Bluesky',
}
// Nombre de cada destino para la persona (la clave es la tabla adonde escribe).
export const NOMBRE_DESTINO = {
  eventos: 'Eventos',
  calendar_events: 'Calendario',
  emails: 'Mail',
  process_reports: 'Avisos en Hoy',
  noticias: 'Mi nicho',
  empleos: 'Empleos',
  [REGISTRO]: 'Registro',
}
export const DESCRIPCION_DESTINO = {
  eventos: 'Eventos encontrados',
  calendar_events: 'Eventos de los 7 días',
  emails: 'Mails sin leer',
  process_reports: 'Lo que consolida María',
  noticias: 'Notas y posts',
  empleos: 'Ofertas publicadas',
  [REGISTRO]: 'Todas las corridas',
}

const rad = g => (g * Math.PI) / 180
const punto = (rx, ry, grados, L = LIENZO) => ({ x: L.cx + rx * Math.cos(rad(grados)), y: L.cy + ry * Math.sin(rad(grados)) })

function repartir(cantidad, desde, hasta) {
  if (cantidad === 1) return [(desde + hasta) / 2]
  return Array.from({ length: cantidad }, (_, i) => desde + ((hasta - desde) * i) / (cantidad - 1))
}

// rotacion: grados que giró el sistema. elegido: el trabajador que pasa al frente (arriba, en su órbita).
// En dos columnas, de a filas; si la última fila queda con una sola tarjeta, va al medio.
function grilla(cantidad, L, arriba) {
  const { ancho, alto } = L.tarjeta, { margen, hueco } = VERTICAL
  const xs = [margen + ancho / 2, L.ancho - margen - ancho / 2]
  return Array.from({ length: cantidad }, (_, i) => {
    const solo = i === cantidad - 1 && cantidad % 2 === 1
    return { x: solo ? L.cx : xs[i % 2], y: arriba + alto / 2 + Math.floor(i / 2) * (alto + hueco) }
  })
}
const alturaGrilla = (cantidad, L) => Math.ceil(cantidad / 2) * (L.tarjeta.alto + VERTICAL.hueco) - VERTICAL.hueco

// vertical: true para el lienzo del celular. Devuelve también el lienzo usado (en vertical, con su alto y su centro).
export function disposicion(trabajadores, { rotacion = 0, elegido = null, vertical = false } = {}) {
  const n = trabajadores.length || 1
  const recorridos = trabajadores.map(t => ({ clave: t.clave, ...(RECORRIDOS[t.clave] ?? { fuentes: [], destinos: [] }) }))
  const fuentes = [...new Set(recorridos.flatMap(r => r.fuentes))]
  const destinos = [...new Set([...recorridos.flatMap(r => r.destinos), REGISTRO])]
  const orbitaDe = vertical
    ? i => ({ rx: VERTICAL.base + i * VERTICAL.paso, ry: (VERTICAL.base + i * VERTICAL.paso) * VERTICAL.alargado })
    : i => ({ rx: ORBITA_BASE + i * ORBITA_PASO, ry: (ORBITA_BASE + i * ORBITA_PASO) * ACHATADO })
  let L = LIENZO
  if (vertical) {
    const { margen, aireOrbita } = VERTICAL
    const ryMax = orbitaDe(n - 1).ry
    const cy = margen + alturaGrilla(fuentes.length, LIENZO_VERTICAL) + aireOrbita + ryMax
    L = { ...LIENZO_VERTICAL, cy, alto: cy + ryMax + aireOrbita + alturaGrilla(destinos.length, LIENZO_VERTICAL) + margen }
  }
  // Con un elegido, gira todo el sistema hasta dejarlo arriba: así no se le encima el que ocupaba ese lugar.
  const iElegido = trabajadores.findIndex(t => t.clave === elegido)
  const giro = iElegido >= 0 ? -(360 / n) * iElegido : rotacion
  const nodos = trabajadores.map((t, i) => {
    const orbita = orbitaDe(i)
    const angulo = -90 + (360 / n) * i + giro
    return { id: `t:${t.clave}`, tipo: 'trabajador', clave: t.clave, etiqueta: t.nombre, color: t.color, orbita, angulo, ...punto(orbita.rx, orbita.ry, angulo, L) }
  })
  const enlaces = recorridos.flatMap(({ clave, fuentes: fs, destinos: ds }) => [
    ...fs.map(f => ({ id: `f:${f}>t:${clave}`, desde: `f:${f}`, hasta: `t:${clave}`, clave })),
    ...[...ds, REGISTRO].map(d => ({ id: `t:${clave}>d:${d}`, desde: `t:${clave}`, hasta: `d:${d}`, clave })),
  ])
  const orbitas = nodos.map(x => ({ clave: x.clave, ...x.orbita }))
  const fuente = id => ({ id: `f:${id}`, tipo: 'fuente', etiqueta: FUENTES[id] ?? id, descripcion: DESCRIPCION_FUENTE[id] ?? '' })
  const destino = id => ({ id: `d:${id}`, tipo: 'destino', etiqueta: NOMBRE_DESTINO[id] ?? id, descripcion: DESCRIPCION_DESTINO[id] ?? '', registro: id === REGISTRO })
  if (vertical) {
    grilla(fuentes.length, L, VERTICAL.margen).forEach((p, i) => nodos.push({ ...fuente(fuentes[i]), ...p }))
    grilla(destinos.length, L, L.alto - VERTICAL.margen - alturaGrilla(destinos.length, L)).forEach((p, i) => nodos.push({ ...destino(destinos[i]), ...p }))
    return { nodos, enlaces, orbitas, lienzo: L }
  }
  const alto = Math.min(46, 12 * fuentes.length)
  repartir(fuentes.length, 180 - alto, 180 + alto).forEach((g, i) => {
    nodos.push({ ...fuente(fuentes[i]), ...punto(EXTERIOR.rx, EXTERIOR.ry, g) })
  })
  const altoD = Math.min(56, 12 * destinos.length)
  repartir(destinos.length, -altoD, altoD).forEach((g, i) => {
    nodos.push({ ...destino(destinos[i]), ...punto(EXTERIOR.rx, EXTERIOR.ry, g) })
  })
  return { nodos, enlaces, orbitas, lienzo: L }
}

// Dónde toca el enlace a cada nodo: el borde de la tarjeta que mira al centro (el costado, o en vertical el borde de
// abajo de las fuentes y el de arriba de los destinos), o el borde del círculo del trabajador.
function anclaje(nodo, haciaX, haciaY, L) {
  if (nodo.tipo === 'trabajador') {
    const d = Math.hypot(haciaX - nodo.x, haciaY - nodo.y) || 1
    const r = L.nodo + 4
    return { x: nodo.x + ((haciaX - nodo.x) / d) * r, y: nodo.y + ((haciaY - nodo.y) / d) * r }
  }
  const signo = nodo.tipo === 'fuente' ? 1 : -1
  if (L.vertical) return { x: nodo.x, y: nodo.y + signo * (L.tarjeta.alto / 2) }
  return { x: nodo.x + signo * (L.tarjeta.ancho / 2), y: nodo.y }
}

// Curva que se arquea hacia el núcleo: se lee como un camino que pasa por el sistema, no una recta.
export function trazo(desde, hasta, L = LIENZO) {
  const a = anclaje(desde, hasta.x, hasta.y, L)
  const b = anclaje(hasta, desde.x, desde.y, L)
  const tira = (p, f) => ({ x: p.x + (L.cx - p.x) * f, y: p.y + (L.cy - p.y) * f })
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

// ---------- Etiquetas de los trabajadores sin choques ----------
// Ancho aproximado de un texto en letra común: alcanza para la pastilla de fondo de cada etiqueta.
export const anchoTexto = (texto, px) => String(texto).length * px * 0.56
export const ETIQUETA = { alto: 40, separacion: 10, aire: 4 }

const choca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// etiquetas: [{ id, x, y, w, arriba }] con x,y del nodo. Devuelve { [id]: { x: centro, y: parte de arriba } } de cada pastilla.
// Cada etiqueta arranca pegada a su nodo, del lado de afuera de la órbita; si choca con algo, se corre en ese mismo
// sentido hasta quedar libre. Las primeras de la lista se ubican primero (la del elegido no se mueve nunca).
// De costado nunca se sale del lienzo: si no entra centrada en su nodo, se corre hacia adentro.
export function ubicarEtiquetas(etiquetas, nodos, L = LIENZO) {
  const { alto, separacion, aire } = ETIQUETA
  const { tarjeta, nodo: radio, nucleo, cx, cy } = L
  const fijos = [
    { x: cx - nucleo, y: cy - nucleo, w: nucleo * 2, h: nucleo * 2 },
    ...nodos.filter(n => n.tipo !== 'trabajador').map(n => ({ x: n.x - tarjeta.ancho / 2, y: n.y - tarjeta.alto / 2, w: tarjeta.ancho, h: tarjeta.alto })),
    ...nodos.filter(n => n.tipo === 'trabajador').map(n => ({ id: n.id, x: n.x - radio - 6, y: n.y - radio - 6, w: (radio + 6) * 2, h: (radio + 6) * 2 })),
  ]
  const puestas = []
  const salida = {}
  // Busca lugar corriéndose en un sentido; null si se sale del lienzo antes de encontrarlo.
  const centro = e => Math.min(Math.max(e.x, e.w / 2 + aire), L.ancho - e.w / 2 - aire)
  const buscar = (e, arriba) => {
    let y = arriba ? e.y - radio - separacion - alto : e.y + radio + separacion
    for (let i = 0; i < 24; i++) {
      if (y < aire || y + alto > L.alto - aire) return null
      const caja = { x: centro(e) - e.w / 2, y, w: e.w, h: alto }
      const golpe = [...fijos.filter(f => f.id !== e.id), ...puestas].find(o => choca(caja, o))
      if (!golpe) return y
      y = arriba ? golpe.y - alto - aire : golpe.y + golpe.h + aire
    }
    return null
  }
  for (const e of etiquetas) {
    // Primero del lado de afuera de la órbita; si ahí no hay lugar, del otro lado del nodo.
    let y = buscar(e, e.arriba) ?? buscar(e, !e.arriba)
    if (y == null) y = Math.min(Math.max(e.arriba ? e.y - radio - separacion - alto : e.y + radio + separacion, aire), L.alto - alto - aire)
    const x = centro(e)
    puestas.push({ x: x - e.w / 2, y, w: e.w, h: alto })
    salida[e.id] = { x, y }
  }
  return salida
}
