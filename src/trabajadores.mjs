// Lógica pura del panel de trabajadores. pg_cron corre en UTC; se muestra en hora de Buenos Aires (UTC-3).
const DESFASE_AR = -3

export const TIPOS_TRABAJADOR = { scraper: 'Scraper', cliente_api: 'Cliente de API', monitor: 'Monitor' }

export const PRESETS_FRECUENCIA = [
  { valor: '*/15 * * * *', label: 'Cada 15 minutos' },
  { valor: '*/30 * * * *', label: 'Cada 30 minutos' },
  { valor: '7 * * * *', label: 'Cada hora' },
  { valor: '7 */6 * * *', label: 'Cada 6 horas' },
  { valor: '0 11 * * *', label: 'Todos los días a las 08:00' },
]

const dos = n => String(n).padStart(2, '0')

export function describirFrecuencia(expr) {
  const f = String(expr || '').trim()
  let m
  if (f === '* * * * *') return 'Cada minuto'
  if ((m = f.match(/^\*\/(\d+) \* \* \* \*$/))) return `Cada ${m[1]} minutos`
  if ((m = f.match(/^(\d+) \* \* \* \*$/))) return `Cada hora (a los ${m[1]} min)`
  if ((m = f.match(/^(\d+) \*\/(\d+) \* \* \*$/))) return `Cada ${m[2]} horas`
  if ((m = f.match(/^(\d+) (\d+) \* \* \*$/))) {
    const hora = (Number(m[2]) + DESFASE_AR + 24) % 24
    return `Todos los días a las ${dos(hora)}:${dos(m[1])}`
  }
  return `Personalizada (${f})`
}

// Chequeo de forma nomás; la validación real la hace pg_cron al guardar.
export function frecuenciaValida(expr) {
  const partes = String(expr || '').trim().split(/\s+/)
  return partes.length === 5 && partes.every(p => /^[0-9*/,-]+$/.test(p))
}

export function duracionLegible(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min ${Math.floor(s % 60)} s`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

export function haceCuanto(iso, ahora = Date.now()) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const min = Math.floor((ahora - t) / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

// Mete una fila nueva o actualizada (Realtime) en un historial ordenado del más reciente al más viejo.
export function aplicarCorrida(historial, fila, maximo = Infinity) {
  const sinEsa = historial.filter(c => c.id !== fila.id)
  return [...sinEsa, fila].sort((a, b) => Date.parse(b.iniciado_at) - Date.parse(a.iniciado_at)).slice(0, maximo)
}

export function parsearParametros(texto) {
  let valor
  try { valor = JSON.parse(texto) } catch { throw new Error('Los parámetros no son un JSON válido.') }
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Los parámetros tienen que ser un objeto: { "clave": valor, … }.')
  return valor
}

// ---------- Consola de monitoreo ----------
const HORA_MS = 3600_000
const AR_MS = DESFASE_AR * HORA_MS
// Margen para no marcar como hueco una corrida que está por arrancar (pg_cron + pg_net tardan unos segundos).
const GRACIA_MS = 2 * 60_000
// Umbral de "trabado" si el trabajador no trae el suyo en trabajadores.minutos_trabado.
export const MINUTOS_TRABADO = 10

// Argentina tiene desfase de horas enteras, así que las horas UTC y las de AR empiezan en el mismo instante.
export function horaAR(ms, conSegundos = false) {
  const d = new Date(ms + AR_MS)
  const base = `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`
  return conSegundos ? `${base}:${dos(d.getUTCSeconds())}` : base
}

export function fechaAR(ms) {
  return new Date(ms + AR_MS).toISOString().slice(0, 10)
}

function campoCron(texto, min, max) {
  const valores = new Set()
  for (const parte of texto.split(',')) {
    const [rango, pasoTexto] = parte.split('/')
    const paso = pasoTexto === undefined ? 1 : Number(pasoTexto)
    if (!Number.isInteger(paso) || paso < 1) return null
    let desde, hasta
    if (rango === '*') { desde = min; hasta = max }
    else if (/^\d+-\d+$/.test(rango)) [desde, hasta] = rango.split('-').map(Number)
    else if (/^\d+$/.test(rango)) { desde = Number(rango); hasta = pasoTexto === undefined ? desde : max }
    else return null
    if (desde < min || hasta > max || desde > hasta) return null
    for (let v = desde; v <= hasta; v += paso) valores.add(v)
  }
  return valores
}

// Expresión cron de 5 campos (como pg_cron, en UTC). Devuelve null si no se entiende.
export function parsearCron(expr) {
  const partes = String(expr || '').trim().split(/\s+/)
  if (partes.length !== 5) return null
  const [minutos, horas, dias, meses, semanaCruda] = [
    campoCron(partes[0], 0, 59), campoCron(partes[1], 0, 23), campoCron(partes[2], 1, 31), campoCron(partes[3], 1, 12), campoCron(partes[4], 0, 7),
  ]
  if (!minutos || !horas || !dias || !meses || !semanaCruda) return null
  const semana = new Set([...semanaCruda].map(d => d % 7))
  return { minutos: [...minutos].sort((a, b) => a - b), horas, dias, meses, semana, diaLibre: partes[2] === '*', semanaLibre: partes[4] === '*' }
}

// Minutos de esa hora (UTC) en los que el cron dispara; vacío si no le toca en esa hora.
export function minutosProgramados(cron, inicioHora) {
  if (!cron) return []
  const d = new Date(inicioHora)
  if (!cron.horas.has(d.getUTCHours()) || !cron.meses.has(d.getUTCMonth() + 1)) return []
  const porDia = cron.dias.has(d.getUTCDate()), porSemana = cron.semana.has(d.getUTCDay())
  const diaOk = cron.diaLibre && cron.semanaLibre ? true : cron.diaLibre ? porSemana : cron.semanaLibre ? porDia : porDia || porSemana
  return diaOk ? cron.minutos : []
}

// Cómo se evalúan los huecos de un trabajador: su cron actual, desde que existe y solo si está activo.
export function programaDe(trabajador) {
  const desde = Date.parse(trabajador?.created_at)
  return { cron: trabajador?.activo ? parsearCron(trabajador.frecuencia) : null, desde: Number.isFinite(desde) ? desde : -Infinity }
}

function debiaCorrer(programa, inicio, ahora) {
  return minutosProgramados(programa?.cron, inicio).some(m => {
    const t = inicio + m * 60_000
    return t >= programa.desde && t + GRACIA_MS <= ahora
  })
}

function estadoDe(corridas) {
  if (corridas.some(c => c.estado === 'error')) return 'error'
  if (corridas.some(c => c.estado === 'corriendo')) return 'corriendo'
  return 'ok'
}

// estado: ok | error | corriendo | hueco (le tocaba y no corrió) | libre (no le tocaba, o todavía no).
function bloque(inicio, corridas, programa, ahora) {
  const delBloque = corridas.filter(c => { const t = Date.parse(c.iniciado_at); return t >= inicio && t < inicio + HORA_MS })
  const ultima = delBloque.reduce((a, c) => (!a || Date.parse(c.iniciado_at) > Date.parse(a.iniciado_at) ? c : a), null)
  const estado = delBloque.length ? estadoDe(delBloque) : debiaCorrer(programa, inicio, ahora) ? 'hueco' : 'libre'
  return { inicio, estado, corrida: ultima, cantidad: delBloque.length }
}

// 24 bloques de una hora, del más viejo al más nuevo; el último es la hora en curso.
export function franjaHoras(corridas, ahora = Date.now(), programa = null, horas = 24) {
  const actual = Math.floor(ahora / HORA_MS) * HORA_MS
  return Array.from({ length: horas }, (_, i) => bloque(actual - (horas - 1 - i) * HORA_MS, corridas, programa, ahora))
}

// Una franja de 24 horas (hora de Argentina) por día, del día más nuevo al más viejo, sin saltear días.
// Arranca en `desdeMs` (cuándo se creó el trabajador, o la corrida más vieja cargada) y llega hasta hoy.
export function franjasPorDia(corridas, ahora = Date.now(), programa = null, desdeMs = null) {
  const inicios = corridas.map(c => Date.parse(c.iniciado_at))
  const primero = Math.min(...inicios, ...(Number.isFinite(desdeMs) ? [desdeMs] : []))
  if (!Number.isFinite(primero)) return []
  const dias = []
  for (let dia = fechaAR(ahora); dia >= fechaAR(primero); dia = fechaAR(Date.parse(`${dia}T12:00:00Z`) - 24 * HORA_MS)) {
    const inicioDia = Date.parse(`${dia}T00:00:00Z`) - AR_MS
    dias.push({ dia, bloques: Array.from({ length: 24 }, (_, h) => bloque(inicioDia + h * HORA_MS, corridas, programa, ahora)) })
  }
  return dias
}

export function resumenFranja(bloques) {
  const r = { ok: 0, error: 0, corriendo: 0, huecos: 0 }
  for (const b of bloques) {
    if (b.estado === 'hueco') r.huecos++
    else if (b.estado !== 'libre') r[b.estado]++
  }
  return r
}

export function trabada(corrida, ahora = Date.now(), minutos = MINUTOS_TRABADO) {
  return corrida?.estado === 'corriendo' && ahora - Date.parse(corrida.iniciado_at) > (minutos || MINUTOS_TRABADO) * 60_000
}

// Contadores de la cabecera, sobre las últimas 24 horas.
export function contadores24h(trabajadores, corridasPor, ahora = Date.now()) {
  const desde = ahora - 24 * HORA_MS
  const r = { trabajadores: trabajadores.length, ok: 0, error: 0, huecos: 0, trabados: 0 }
  for (const t of trabajadores) {
    const corridas = corridasPor[t.clave] || []
    for (const c of corridas) {
      if (Date.parse(c.iniciado_at) < desde) continue
      if (c.estado === 'ok') r.ok++
      if (c.estado === 'error') r.error++
      if (trabada(c, ahora, t.minutos_trabado)) r.trabados++
    }
    r.huecos += resumenFranja(franjaHoras(corridas, ahora, programaDe(t))).huecos
  }
  return r
}

const NIVELES = '▁▂▃▄▅▆▇█'
export function sparkline(valores) {
  const numeros = valores.filter(v => Number.isFinite(v))
  if (!numeros.length) return ''
  const min = Math.min(...numeros), max = Math.max(...numeros)
  return valores.map(v => {
    if (!Number.isFinite(v)) return '·'
    if (max === min) return NIVELES[3]
    return NIVELES[Math.round(((v - min) / (max - min)) * (NIVELES.length - 1))]
  }).join('')
}

export function barraBloques(valor, maximo, ancho = 20) {
  if (!Number.isFinite(valor) || !Number.isFinite(maximo) || maximo <= 0) return '░'.repeat(ancho)
  const llenos = Math.max(valor > 0 ? 1 : 0, Math.min(ancho, Math.round((valor / maximo) * ancho)))
  return '█'.repeat(llenos) + '░'.repeat(ancho - llenos)
}
