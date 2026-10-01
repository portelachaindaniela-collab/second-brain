const ZONA = 'America/Argentina/Buenos_Aires'

export const ESTADOS_EVENTO = [
  { id: 'anotado', label: 'anotado' },
  { id: 'evaluado', label: 'evaluado' },
  { id: 'descartado', label: 'descartado' },
  { id: 'fui', label: 'fui' },
  { id: 'no_fui', label: 'no fui' },
]

export const VEREDICTO_TEXTO = { viable: 'viable', recortado: 'viable recortado', no_viable: 'no viable' }

// Argentina no tiene horario de verano: el input datetime-local se interpreta siempre como -03:00,
// sin importar la zona de la computadora.
export function aInputLocal(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('sv-SE', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso)).replace(' ', 'T')
}

export function desdeInputLocal(valor) {
  if (!valor) return null
  const d = new Date(`${valor.length === 16 ? `${valor}:00` : valor}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function partes(iso) {
  const [fecha, hora] = aInputLocal(iso).split('T')
  const [, m, d] = fecha.split('-')
  return { dia: `${d}/${m}`, hora, semana: DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()], fecha }
}

export function fechaEvento(inicio, fin) {
  const i = partes(inicio)
  if (!fin) return `${i.semana} ${i.dia} ${i.hora}`
  const f = partes(fin)
  return `${i.semana} ${i.dia} ${i.hora}–${f.fecha === i.fecha ? '' : `${f.dia} `}${f.hora}`
}

export function textoCalculo(c) {
  if (!c) return null
  return `${c.llegada} − viaje ${c.viaje_min}′ − prepararte ${c.preparacion_min}′ = levantarte ${c.levantarse}${c.dia_anterior ? ' (del día anterior)' : ''}`
}

export function esPasado(evento, ahora = Date.now()) {
  return Date.parse(evento.fin_at || evento.inicio_at) < ahora
}

export function reglasMasNuevas(evento, reglasActualizadas) {
  return !!(evento.evaluado_at && reglasActualizadas && Date.parse(reglasActualizadas) > Date.parse(evento.evaluado_at))
}

// Fecha corta para la tarjeta: "jue 01/10 · 09:00", y cuántos días dura si son varios.
export function fechaTarjeta(inicio, fin) {
  const i = partes(inicio)
  const base = `${i.semana} ${i.dia} · ${i.hora}`
  if (!fin) return base
  const f = partes(fin)
  const dias = Math.round((Date.parse(`${f.fecha}T12:00:00Z`) - Date.parse(`${i.fecha}T12:00:00Z`)) / 86_400_000) + 1
  return dias > 1 ? `${base} · ${dias} días` : base
}
