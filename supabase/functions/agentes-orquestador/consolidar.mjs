// María no ejecuta trabajo: lee las corridas que dejaron los trabajadores y consolida qué corrió, qué falló
// y qué quedó pendiente. Todo acá es puro (sin red ni base) para poder probarlo.
import { parsearCron, minutosProgramados } from '../_shared/cron.mjs'

const MIN = 60_000
const HORA = 60 * MIN
const AR = -3 * HORA
// Una corrida que arranca hasta 10 minutos después de su horario cuenta como a tiempo.
export const MARGEN_MIN = 10
const ESTADOS = ['ok', 'aviso', 'error']

export const peor = (...estados) => estados.reduce((a, b) => (ESTADOS.indexOf(b) > ESTADOS.indexOf(a) ? b : a), 'ok')

const dos = n => String(n).padStart(2, '0')
function horaAR(ms) {
  const d = new Date(ms + AR)
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`
}

function hace(ms, ahora) {
  const min = Math.max(0, Math.round((ahora - ms) / MIN))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

// Momentos (ms) en los que el cron de `frecuencia` dispara entre `desde` y `hasta`, inclusive.
export function turnos(frecuencia, desde, hasta) {
  const cron = parsearCron(frecuencia)
  if (!cron || !(hasta >= desde)) return []
  const lista = []
  for (let h = Math.floor(desde / HORA) * HORA; h <= hasta; h += HORA) {
    for (const m of minutosProgramados(cron, h)) {
      const t = h + m * MIN
      if (t >= desde && t <= hasta) lista.push(t)
    }
  }
  return lista
}

// trabajador: fila de `trabajadores`. corridas: las suyas de las últimas ~26 h (más la última, aunque sea vieja).
export function saludTrabajador(trabajador, corridas, ahora = Date.now()) {
  const ordenadas = [...corridas].sort((a, b) => Date.parse(b.iniciado_at) - Date.parse(a.iniciado_at))
  const ultima = ordenadas[0] ?? null
  const terminada = ordenadas.find(c => c.estado !== 'corriendo') ?? null
  const hace24 = ahora - 24 * HORA
  const en24 = ordenadas.filter(c => Date.parse(c.iniciado_at) >= hace24)
  const fallas24 = en24.filter(c => c.estado === 'error').length
  const base = {
    clave: trabajador.clave, nombre: trabajador.nombre, activo: trabajador.activo, frecuencia: trabajador.frecuencia,
    ultima: ultima ? { estado: ultima.estado, iniciado_at: ultima.iniciado_at, error: ultima.error ?? null } : null,
    corridas24: en24.length, fallas24, huecos24: 0, atrasado: false, trabada: false,
  }
  if (!trabajador.activo) return { ...base, estado: 'ok', resumen: 'Pausado.' }

  const alta = Date.parse(trabajador.created_at)
  const vencidos = turnos(trabajador.frecuencia, Math.max(hace24, Number.isFinite(alta) ? alta : -Infinity), ahora - MARGEN_MIN * MIN)
  const cubierto = t => ordenadas.some(c => { const i = Date.parse(c.iniciado_at); return i >= t - MIN && i <= t + MARGEN_MIN * MIN })
  const huecos = vencidos.filter(t => !cubierto(t))
  const atrasado = vencidos.length > 0 && !cubierto(vencidos[vencidos.length - 1])
  const trabada = ultima?.estado === 'corriendo' && ahora - Date.parse(ultima.iniciado_at) > (trabajador.minutos_trabado || 10) * MIN
  const ultimaFallo = terminada?.estado === 'error'

  const estado = trabada || atrasado || ultimaFallo ? 'error' : huecos.length || fallas24 ? 'aviso' : 'ok'
  let resumen
  if (trabada) resumen = `Trabada: corriendo desde las ${horaAR(Date.parse(ultima.iniciado_at))}.`
  else if (atrasado) resumen = `No corrió a las ${horaAR(vencidos[vencidos.length - 1])}.`
  else if (ultimaFallo) resumen = `Su última corrida falló: ${terminada.error || 'sin mensaje'}`
  else if (!ultima) resumen = 'Todavía no le tocó correr.'
  else {
    const extra = [huecos.length && `${huecos.length} sin correr`, fallas24 && `${fallas24} con error`].filter(Boolean).join(' y ')
    resumen = `Corrió ${hace(Date.parse(ultima.iniciado_at), ahora)}${extra ? ` · en 24 h: ${extra}` : ''}.`
  }
  return { ...base, estado, resumen, huecos24: huecos.length, atrasado, trabada }
}

// Lo que sigue arma los reportes que ya leen Hoy, BS67 y el tablero, con la misma forma que antes,
// pero a partir de lo que dejaron los trabajadores en vez de salir a buscarlo.

const VIEJO_H = 3

function antiguedad(corrida, ahora) {
  const h = (ahora - Date.parse(corrida.iniciado_at)) / HORA
  return h > VIEJO_H ? ` (datos de ${hace(Date.parse(corrida.iniciado_at), ahora)})` : ''
}

export function reporteSitios(corrida, salud, ahora = Date.now()) {
  const r = corrida?.payload?.resumen
  if (!r) return { agente: 'monitor_sitios', estado: 'error', resumen: `No hay datos de los sitios: ${salud?.resumen ?? 'el monitor de sitios no está configurado.'}`, datos: null }
  const viejo = antiguedad(corrida, ahora)
  return {
    agente: 'monitor_sitios',
    estado: viejo ? peor(r.estado_general ?? 'ok', 'aviso') : r.estado_general ?? 'ok',
    resumen: `${r.ok ?? 0} ok · ${r.aviso ?? 0} avisos · ${r.error ?? 0} errores${viejo}`,
    datos: corrida.payload,
  }
}

export function reporteTareas(corrida, salud, ahora = Date.now()) {
  const lista = corrida?.payload?.tareas
  if (!Array.isArray(lista)) return { agente: 'tareas_estancadas', estado: 'error', resumen: `No hay datos de tareas: ${salud?.resumen ?? 'el trabajador de tareas no está configurado.'}`, datos: null }
  const dias = corrida.payload.dias_sin_tocar ?? 3
  const viejo = antiguedad(corrida, ahora)
  const estado = lista.length > 5 ? 'error' : lista.length > 0 ? 'aviso' : 'ok'
  return {
    agente: 'tareas_estancadas',
    estado: viejo ? peor(estado, 'aviso') : estado,
    resumen: (lista.length ? `${lista.length} tareas sin tocar hace más de ${dias} días.` : 'Ninguna tarea estancada.') + viejo,
    datos: lista,
  }
}

// ultima: la última corrida de google_sync (cualquier estado); ultimaOk: la última que sincronizó.
export function reporteGoogle(ultima, ultimaOk, ahora = Date.now()) {
  if (!ultima) return { agente: 'sync_estado', estado: 'aviso', resumen: 'Todavía no hay sincronizaciones con Google.', datos: {} }
  if (ultima.payload?.conectado === false) {
    return ultima.payload.reconectar
      ? { agente: 'sync_estado', estado: 'aviso', resumen: 'Google pide reconectar la cuenta.', datos: { vinculado: true, refrescable: false } }
      : { agente: 'sync_estado', estado: 'aviso', resumen: 'Google no está vinculado.', datos: { vinculado: false } }
  }
  if (!ultimaOk) return { agente: 'sync_estado', estado: 'error', resumen: `Google todavía no pudo sincronizar: ${ultima.error ?? 'sin mensaje'}`, datos: { vinculado: true } }
  const horas = (ahora - Date.parse(ultimaOk.finalizado_at ?? ultimaOk.iniciado_at)) / HORA
  return {
    agente: 'sync_estado',
    estado: horas > 26 ? 'error' : horas > 2 ? 'aviso' : 'ok',
    resumen: `Google vinculado · última sincronización hace ${Math.round(horas)} h.`,
    datos: { vinculado: true, horas },
  }
}

export function reporteMaria(saludes) {
  const activos = saludes.filter(s => s.activo)
  const problemas = saludes.filter(s => s.estado !== 'ok')
  const alDia = activos.length - problemas.length
  const cabeza = `${saludes.length} trabajador${saludes.length === 1 ? '' : 'es'}: ${alDia} al día${saludes.length > activos.length ? `, ${saludes.length - activos.length} pausado${saludes.length - activos.length === 1 ? '' : 's'}` : ''}.`
  return {
    agente: 'maria',
    estado: peor(...saludes.map(s => s.estado)),
    resumen: [cabeza, ...problemas.map(s => `${s.nombre}: ${s.resumen}`)].join(' '),
    datos: { trabajadores: saludes },
  }
}
