export function inputFecha(iso, todoElDia) {
  if (!iso) return ''
  if (todoElDia) return iso.slice(0, 10)
  const d = new Date(iso)
  const z = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}
export function sumarDia(fecha, cantidad) {
  const d = new Date(fecha.slice(0,10) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate()+cantidad)
  return d.toISOString().slice(0,10)
}
export function fechaEvento(evento) {
  return new Date(evento.all_day ? evento.starts_at.slice(0,10)+'T12:00:00' : evento.starts_at)
}
