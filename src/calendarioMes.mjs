import { MARCA_COMUNIDAD } from './comunidadEventos.mjs'

// De qué calendario viene un evento, para pintarlo: el de la cuenta, los feriados, lo importado de Comunidad
// o cualquier otro calendario compartido.
export function tipoEvento(evento) {
  if (evento.description === MARCA_COMUNIDAD) return 'comunidad'
  if (evento.calendar_id?.includes('#holiday@')) return 'feriado'
  if (!evento.calendar_id || evento.calendar_id === 'primary') return 'principal'
  return 'otro'
}

export const TIPOS_EVENTO = [
  { tipo: 'principal', etiqueta: 'Tu calendario' },
  { tipo: 'otro', etiqueta: 'Otros calendarios' },
  { tipo: 'comunidad', etiqueta: 'Comunidad' },
  { tipo: 'feriado', etiqueta: 'Feriados' },
]

// Fondo de las tarjetas (--surface del tema oscuro): contra él se mide si un color se lee.
const FONDO = '#171f29'
const ETIQUETA_TIPO = Object.fromEntries(TIPOS_EVENTO.map(t => [t.tipo, t.etiqueta]))

const canal = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
function luminancia(rgb) {
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contraste(a, b = FONDO) {
  const [l1, l2] = [luminancia(canal(a)), luminancia(canal(b))].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// El color de Google, aclarado (mezclado con blanco) hasta que la hora en ese color se lea sobre el tema oscuro.
export function colorLegible(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return null
  const base = canal(hex.toLowerCase())
  for (let t = 0; t <= 1; t += 0.05) {
    const mezcla = '#' + base.map(v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('')
    if (contraste(mezcla) >= 4.5) return mezcla
  }
  return '#ffffff'
}

// Cómo se pinta y se llama el calendario de un evento. `calendarios` es un Map calendar_id → { nombre, color }
// (tabla calendarios, la llena google-sync). Comunidad es su propio grupo; sin datos, se cae a los grupos genéricos
// y a su color de CSS (color null).
export function calendarioDe(evento, calendarios = new Map()) {
  const tipo = tipoEvento(evento)
  if (tipo === 'comunidad') return { clave: 'comunidad', tipo, nombre: ETIQUETA_TIPO.comunidad, color: calendarios.get(CLAVE_COMUNIDAD)?.color ?? null }
  const id = evento.calendar_id || 'primary'
  const fila = calendarios.get(id)
  // El principal se llama como el mail de la cuenta: se muestra "Tu calendario", salvo que ella lo haya renombrado.
  const nombre = fila?.nombre && !(tipo === 'principal' && fila.nombre.includes('@')) ? fila.nombre : ETIQUETA_TIPO[tipo]
  return { clave: fila ? id : tipo, tipo, nombre, color: colorLegible(fila?.color) }
}

// Comunidad no es un calendario de Google, pero entra en el reparto de colores con el suyo de CSS (--green-600).
const CLAVE_COMUNIDAD = ' comunidad'
const COLOR_COMUNIDAD = '#6fce98'
// Colores de repuesto (se leen sobre el tema oscuro; sin el naranja de acento, que marca hoy) para cuando dos calendarios quedan con el mismo color.
const REPUESTOS = ['#6ea8ff', '#e879c6', '#5fd4c4', '#c9a0ff', '#ff8a7a', '#a3d65c', '#ffd166', '#8fd3ff']
const distancia = (a, b) => Math.hypot(...canal(a).map((v, i) => v - canal(b)[i]))

// Filas de la tabla calendarios → Map calendar_id → { nombre, color } con colores legibles y distintos entre sí:
// en el orden de la leyenda, el que choca con uno ya usado (Google repite colores) toma un repuesto libre.
export function prepararCalendarios(filas = []) {
  const crudo = new Map(filas.map(f => [f.calendar_id, f]))
  if (!crudo.size) return crudo
  crudo.set(CLAVE_COMUNIDAD, { calendar_id: CLAVE_COMUNIDAD, nombre: ETIQUETA_TIPO.comunidad, color: COLOR_COMUNIDAD })
  const listo = new Map()
  const usados = []
  const libre = c => usados.every(u => distancia(u, c) >= 60)
  for (const c of leyendaCalendarios(crudo)) {
    const id = c.clave === 'comunidad' ? CLAVE_COMUNIDAD : c.clave
    let color = c.color && libre(c.color) ? c.color : REPUESTOS.find(libre) ?? c.color
    if (color) usados.push(color)
    listo.set(id, { ...crudo.get(id), color })
  }
  return listo
}

// Leyenda: todos los calendarios conocidos (el principal primero, los feriados al final), más Comunidad y los
// calendarios de eventos que todavía no están en la tabla. Sin tabla, los cuatro grupos de siempre.
export function leyendaCalendarios(calendarios = new Map(), eventos = []) {
  if (!calendarios.size) return TIPOS_EVENTO.map(t => ({ clave: t.tipo, tipo: t.tipo, nombre: t.etiqueta, color: null }))
  const orden = c => c.tipo === 'principal' ? 0 : c.tipo === 'feriado' ? 3 : c.tipo === 'comunidad' ? 2 : 1
  const vistos = new Map()
  for (const id of calendarios.keys()) if (id !== CLAVE_COMUNIDAD) vistos.set(id, calendarioDe({ calendar_id: id }, calendarios))
  vistos.set('comunidad', calendarioDe({ description: MARCA_COMUNIDAD }, calendarios))
  for (const e of eventos) { const c = calendarioDe(e, calendarios); if (!vistos.has(c.clave)) vistos.set(c.clave, c) }
  return [...vistos.values()].sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre, 'es'))
}

// El próximo evento con hora que todavía no terminó (incluye el que está en curso). Si no hay ninguno,
// el primero de todo el día desde hoy. `eventos` vienen ordenados por inicio.
export function proximoEvento(eventos, ahora = new Date()) {
  const conHora = eventos.find(e => !e.all_day && new Date(e.ends_at || e.starts_at) > ahora)
  if (conHora) return conHora
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
  return eventos.find(e => e.all_day && e.starts_at.slice(0, 10) >= hoy) || null
}

// "ahora", "en 40 min", "en 1 h 40 min", "mañana", "jue 23".
export function cuandoFalta(evento, ahora = new Date()) {
  const inicio = evento.all_day ? new Date(evento.starts_at.slice(0, 10) + 'T00:00:00') : new Date(evento.starts_at)
  const dia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((dia(inicio) - dia(ahora)) / 86400000)
  if (evento.all_day) return dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : inicio.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }).replace('.', '')
  const minutos = Math.round((inicio - ahora) / 60000)
  if (minutos <= 0) return 'ahora'
  if (dias === 0) return minutos < 60 ? `en ${minutos} min` : `en ${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`
  if (dias === 1) return 'mañana'
  return inicio.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }).replace('.', '')
}
