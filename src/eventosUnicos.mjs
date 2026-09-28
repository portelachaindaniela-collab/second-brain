function diaLocal(fecha) {
  const z = n => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${z(fecha.getMonth()+1)}-${z(fecha.getDate())}`
}

export function diasDelEvento(evento) {
  if (evento.all_day) {
    const desde = evento.starts_at.slice(0, 10)
    const finExclusivo = (evento.ends_at || evento.starts_at).slice(0, 10)
    const d = new Date(finExclusivo + 'T12:00:00Z')
    if (finExclusivo > desde) d.setUTCDate(d.getUTCDate() - 1)
    return [desde, d.toISOString().slice(0, 10)]
  }
  const desde = diaLocal(new Date(evento.starts_at))
  const hasta = evento.ends_at ? diaLocal(new Date(evento.ends_at)) : desde
  return [desde, hasta < desde ? desde : hasta]
}

const nombre = e => (e.title || '').trim().toLowerCase()

// Mismo título y días que se pisan = el mismo evento cargado dos veces (ej. el importado de
// Comunidad y el que Gmail crea solo desde el mail de la entrada). Se queda el que tiene horario.
export function unirRepetidos(eventos) {
  const resultado = []
  for (const evento of eventos) {
    const [desde, hasta] = diasDelEvento(evento)
    const i = resultado.findIndex(otro => {
      if (!nombre(evento) || nombre(otro) !== nombre(evento)) return false
      const [otroDesde, otroHasta] = diasDelEvento(otro)
      return desde <= otroHasta && otroDesde <= hasta
    })
    if (i === -1) resultado.push(evento)
    else if (resultado[i].all_day && !evento.all_day) resultado[i] = evento
  }
  return resultado
}
