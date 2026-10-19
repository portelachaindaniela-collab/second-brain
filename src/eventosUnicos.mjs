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

const mismoHorario = (a, b) => !a.all_day && !b.all_day && a.ends_at && b.ends_at
  && new Date(a.starts_at).getTime() === new Date(b.starts_at).getTime()
  && new Date(a.ends_at).getTime() === new Date(b.ends_at).getTime()

// Mismo horario exacto en otro calendario = la misma cosa vista desde dos lados (ej. el bloque "Testing QA" propio
// y la clase "Módulo 5: …" del calendario del curso). Se muestra una sola vez con los dos nombres, el más corto
// primero; `titulo_original` guarda el del evento que queda, para editarlo sin pisarlo en Google.
function unirMismoHorario(a, b) {
  const base = !a.description && b.description ? b : a
  const titulos = [...new Set([a.title, b.title].map(t => (t || '').trim()).filter(Boolean))]
    .sort((x, y) => x.length - y.length)
  return { ...base, title: titulos.join(' · '), titulo_original: base.titulo_original ?? base.title }
}

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
    if (i !== -1) { if (resultado[i].all_day && !evento.all_day) resultado[i] = evento; continue }
    const j = resultado.findIndex(otro => otro.calendar_id !== evento.calendar_id && mismoHorario(otro, evento))
    if (j !== -1) resultado[j] = unirMismoHorario(resultado[j], evento)
    else resultado.push(evento)
  }
  return resultado
}
