// Postulaciones: en qué grupo cae cada fila de la planilla según el texto libre de su Estado, cuántos días lleva
// esperando y qué estado nuevo se escribe con cada botón. Se mantiene el vocabulario que ya usa la planilla.

export const GRUPOS = [
  { clave: 'hacer', titulo: 'Para hacer' },
  { clave: 'esperando', titulo: 'Esperando respuesta' },
  { clave: 'respondieron', titulo: 'Respondieron' },
  { clave: 'rechazadas', titulo: 'Rechazadas' },
  { clave: 'cerradas', titulo: 'Descartadas y cerradas' },
]

const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function grupoDe(estado) {
  const e = normal(estado)
  // La empresa dijo que no (en la planilla: "RECHAZADA 12/05", "RECHAZADA 03/11 - vacante cubierta").
  if (/rechazad/.test(e)) return 'rechazadas'
  if (/descartad|cerrad|vencid/.test(e)) return 'cerradas'
  // "POSTULADA - preguntas respondidas ... - sin respuesta": la que respondió fue Daniela, la empresa no.
  if (/sin respuesta/.test(e)) return 'esperando'
  if (/respond|acuse|entrevista|llamad|contactaron|devolucion/.test(e)) return 'respondieron'
  if (/postulad|enviad/.test(e)) return 'esperando'
  return 'hacer'
}

export function semaforoDe(texto) {
  const s = normal(texto)
  return ['verde', 'amarillo', 'rojo', 'negro'].find(c => s.includes(c)) || ''
}

// "15/10", "15/10/2026" o "15/10/26" → fecha. Sin año, el más reciente que no quede en el futuro.
export function leerFecha(texto, hoy = new Date()) {
  const m = String(texto || '').match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (!m) return null
  const [, d, mes, a] = m
  let anio = a ? Number(a.length === 2 ? `20${a}` : a) : hoy.getFullYear()
  let f = new Date(anio, Number(mes) - 1, Number(d))
  if (!a && f > hoy) f = new Date(anio - 1, Number(mes) - 1, Number(d))
  return Number.isNaN(f.getTime()) ? null : f
}

// La última fecha que aparece en el texto: "POSTULADA 19/06 - reenviada 02/11" → 02/11.
export function ultimaFecha(texto, hoy = new Date()) {
  const fechas = String(texto || '').match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)
  return fechas ? leerFecha(fechas[fechas.length - 1], hoy) : null
}

// Días desde el último envío: la última fecha del estado ("POSTULADA 15/10 - reenviada 05/11") o, si no tiene, la de la fila.
export function diasEsperando(p, hoy = new Date()) {
  const f = ultimaFecha(p.estado, hoy) || leerFecha(p.fecha, hoy)
  if (!f) return null
  const dia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.max(0, Math.round((dia(hoy) - dia(f)) / 86400000))
}

export const DIAS_SEGUIMIENTO = 14

const hoyCorto = (hoy = new Date()) => `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}`

// Botones de cambio de estado: el texto que queda escrito en la planilla.
export const ACCIONES = [
  { clave: 'postulada', etiqueta: 'Ya me postulé', texto: hoy => `POSTULADA ${hoyCorto(hoy)} - sin respuesta` },
  { clave: 'respondieron', etiqueta: 'Me respondieron', texto: hoy => `Respondido ${hoyCorto(hoy)}` },
  { clave: 'descartada', etiqueta: 'Descartar', texto: () => 'Descartado' },
]

// Lo que falta mandar: para hacer y en verde, primero lo que ya tiene algo listo (carta, propuesta).
export function faltaEnviar(postulaciones) {
  const listo = p => /lista|redactad/.test(normal(p.estado) + ' ' + normal(p.porque))
  return postulaciones
    .filter(p => grupoDe(p.estado) === 'hacer' && semaforoDe(p.semaforo) === 'verde')
    .sort((a, b) => Number(listo(b)) - Number(listo(a)) || b.fila - a.fila)
}

const ORDEN_SEMAFORO = { verde: 0, amarillo: 1, '': 2, rojo: 3, negro: 4 }

// Esperando: lo que lleva más días arriba (es lo que pide seguimiento). El resto: lo más nuevo arriba.
export function agrupar(postulaciones, hoy = new Date()) {
  const grupos = Object.fromEntries(GRUPOS.map(g => [g.clave, []]))
  for (const p of postulaciones) grupos[grupoDe(p.estado)].push({ ...p, dias: diasEsperando(p, hoy) })
  grupos.esperando.sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1))
  grupos.hacer.sort((a, b) => ORDEN_SEMAFORO[semaforoDe(a.semaforo)] - ORDEN_SEMAFORO[semaforoDe(b.semaforo)] || b.fila - a.fila)
  grupos.respondieron.sort((a, b) => b.fila - a.fila)
  grupos.cerradas.sort((a, b) => b.fila - a.fila)
  return grupos
}

export function coincide(p, busqueda) {
  const q = normal(busqueda).trim()
  if (!q) return true
  return [p.puesto, p.empresa, p.zona, p.fuente, p.porque].some(c => normal(c).includes(q))
}

// "CV anterior (Mkt y Datos)" → "Mkt y Datos"; "Operativo (si va)" → "Operativo". Para los filtros alcanza con un nombre corto.
export function nombreCv(cv) {
  const t = String(cv || '').trim()
  const entre = t.match(/\(([^)]+)\)/)
  if (entre && /^cv\b/i.test(t)) return entre[1].trim()
  return t.replace(/\s*\([^)]*\)/g, '').trim()
}

export const esLink = s => /^https?:\/\//i.test(String(s || '').trim())
export const esMail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(String(s || '').trim())

// Esperando respuesta, por antigüedad: el gráfico de barras de la pantalla. Lo que no tiene fecha va aparte.
export const TRAMOS = [
  { clave: 'semana', titulo: 'Esta semana', hasta: 7 },
  { clave: 'quincena', titulo: '1 a 2 semanas', hasta: 14 },
  { clave: 'mes', titulo: '2 a 4 semanas', hasta: 30 },
  { clave: 'viejas', titulo: 'Más de un mes', hasta: Infinity },
]

export function tramoDe(dias) {
  if (dias == null) return 'viejas'
  return TRAMOS.find(t => dias <= t.hasta).clave
}

export function porTramo(esperando) {
  const r = Object.fromEntries(TRAMOS.map(t => [t.clave, 0]))
  for (const p of esperando) r[tramoDe(p.dias)]++
  return r
}
