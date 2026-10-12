import { diasDelEvento } from './eventosUnicos.mjs'

function diaLocal(fecha) {
  const z = n => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${z(fecha.getMonth()+1)}-${z(fecha.getDate())}`
}

// Lunes 00:00 (hora de la computadora) de la semana que contiene a `fecha`.
export function inicioSemana(fecha = new Date()) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function moverSemana(inicio, n) {
  return new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 7 * n)
}

export function tituloSemana(inicio) {
  const fin = moverSemana(inicio, 1)
  fin.setDate(fin.getDate() - 1)
  const mes = d => d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')
  const desde = inicio.getMonth() === fin.getMonth() ? `${inicio.getDate()}` : `${inicio.getDate()} ${mes(inicio)}`
  return `${desde} – ${fin.getDate()} ${mes(fin)} ${fin.getFullYear()}`
}

// Los 7 días de la semana, cada uno con sus eventos. Un evento de varios días aparece en cada día que ocupa;
// los que tienen hora van ordenados por hora y los de todo el día primero.
export function diasDeSemana(inicio, eventos) {
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)
    const clave = diaLocal(fecha)
    const items = eventos
      .filter(e => { const [desde, hasta] = diasDelEvento(e); return desde <= clave && clave <= hasta })
      .map(e => ({ evento: e, continua: !e.all_day && diasDelEvento(e)[0] < clave }))
      .sort((a, b) => (b.evento.all_day || b.continua) - (a.evento.all_day || a.continua) || a.evento.starts_at.localeCompare(b.evento.starts_at))
    return { fecha, clave, items }
  })
}
