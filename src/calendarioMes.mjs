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
