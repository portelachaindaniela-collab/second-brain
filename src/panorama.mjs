// Cálculos de los paneles de gráficos de Trabajadores (el volumen de 24 h también lo usa el sistema orbital).
// Todo sale de `trabajadores` y `trabajos_corridas`; acá no se toca la red.
import { parsearCron, minutosProgramados } from './trabajadores.mjs'

const HORA_MS = 3600_000
const MIN_MS = 60_000

// Nombre para los gráficos: sin la aclaración entre paréntesis ("Google (calendario y mail)" → "Google").
export const nombreCorto = nombre => String(nombre ?? '').replace(/\s*\(.*\)\s*$/, '')

export const de24h = (corridas, ahora) => corridas.filter(c => Date.parse(c.iniciado_at) >= ahora - 24 * HORA_MS)

// Lo de un trabajador en 24 h, y sus últimas duraciones (de la más vieja a la más nueva) para la línea.
export function resumenTrabajador(corridas, ahora = Date.now(), cuantas = 40) {
  const dia = de24h(corridas, ahora)
  const terminadas = dia.filter(c => c.estado !== 'corriendo')
  const conDuracion = corridas.filter(c => Number.isFinite(c.duracion_ms))
  const duraciones = conDuracion.slice(0, cuantas).map(c => c.duracion_ms).reverse()
  return {
    corridas: terminadas.length,
    ok: terminadas.filter(c => c.estado === 'ok').length,
    error: terminadas.filter(c => c.estado === 'error').length,
    resultados: dia.reduce((s, c) => s + (Number(c.cantidad_resultados) || 0), 0),
    duracionPromedio: duraciones.length ? Math.round(duraciones.reduce((s, d) => s + d, 0) / duraciones.length) : null,
    duraciones,
  }
}

// Corridas programadas desde ahora hasta dentro de `minutos` (UTC, como pg_cron), en orden.
export function proximas(trabajadores, ahora = Date.now(), minutos = 60) {
  const hasta = ahora + minutos * MIN_MS
  const salida = []
  for (const t of trabajadores) {
    if (!t.activo) continue
    const cron = parsearCron(t.frecuencia)
    if (!cron) continue
    for (let hora = Math.floor(ahora / HORA_MS) * HORA_MS; hora <= hasta; hora += HORA_MS) {
      for (const m of minutosProgramados(cron, hora)) {
        const cuando = hora + m * MIN_MS
        if (cuando > ahora && cuando <= hasta) salida.push({ clave: t.clave, color: t.color, nombre: t.nombre, cuando })
      }
    }
  }
  return salida.sort((a, b) => a.cuando - b.cuando)
}

// Notas por tema que cargó Canillita en 24 h, sumando el resumen de cada corrida.
export function temasDeCanillita(corridas, ahora = Date.now()) {
  const total = {}
  for (const c of de24h(corridas, ahora)) {
    for (const [tema, n] of Object.entries(c.payload?.por_tema ?? {})) total[tema] = (total[tema] ?? 0) + (Number(n) || 0)
  }
  return Object.entries(total).sort((a, b) => b[1] - a[1])
}

export function duracionCorta(ms) {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  return `${Math.round(ms / 60_000)} min`
}

// Puntos de una línea dentro de ancho × alto, para el atributo `points` de un polyline.
export function puntosDeLinea(valores, ancho, alto, margen = 2) {
  const v = valores.filter(Number.isFinite)
  if (v.length < 2) return ''
  const min = Math.min(...v), max = Math.max(...v)
  return v.map((x, i) => `${((i / (v.length - 1)) * ancho).toFixed(1)},${(alto - margen - ((x - min) / ((max - min) || 1)) * (alto - 2 * margen)).toFixed(1)}`).join(' ')
}
