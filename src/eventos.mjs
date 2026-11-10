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

// Lo que se manda a google-calendar-edit para agregar un plan al calendario. Sin hora de fin, dura una hora
// (igual que un evento nuevo del calendario). La descripción junta la web y la entrada para tenerlas a mano.
export function eventoParaCalendario(evento, timeZone = 'America/Argentina/Buenos_Aires') {
  const inicio = new Date(evento.inicio_at)
  const fin = evento.fin_at && Date.parse(evento.fin_at) > inicio.getTime() ? new Date(evento.fin_at) : new Date(inicio.getTime() + 3600_000)
  const descripcion = [
    evento.url,
    evento.tiene_entrada ? `Entrada: ${evento.precio || 'con entrada'}` : null,
  ].filter(Boolean).join('\n')
  return {
    accion: 'crear',
    title: evento.nombre,
    location: [evento.lugar, evento.direccion].filter(Boolean).join(', '),
    description: descripcion,
    all_day: false,
    starts_at: inicio.toISOString(),
    ends_at: fin.toISOString(),
    time_zone: timeZone,
    project_id: null,
  }
}

// Descripción para leer: sin las marcas de Markdown que usan algunas páginas (Meetup): **negrita**, # títulos, [texto](link).
export function textoDescripcion(texto) {
  if (typeof texto !== 'string') return ''
  return texto
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
