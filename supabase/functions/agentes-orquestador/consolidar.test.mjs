import test from 'node:test'
import assert from 'node:assert/strict'
import { turnos, saludTrabajador, reporteSitios, reporteTareas, reporteGoogle, reporteMaria, peor } from './consolidar.mjs'

const T = iso => Date.parse(iso)
const c = (iso, estado = 'ok', extra = {}) => ({ iniciado_at: iso, estado, ...extra })
const cadaHora = { clave: 'scraper', nombre: 'Scraper', activo: true, frecuencia: '7 * * * *', minutos_trabado: 10, created_at: '2026-09-01T00:00:00Z' }
const ahora = T('2026-10-01T18:37:00Z')

function corridasCadaHora(saltear = [], estados = {}) {
  const lista = []
  for (let i = 0; i < 25; i++) {
    const t = T('2026-10-01T18:07:00Z') - i * 3600_000
    if (saltear.includes(i)) continue
    lista.push(c(new Date(t + 500).toISOString(), estados[i] ?? 'ok', estados[i] === 'error' ? { error: 'HTTP 503' } : {}))
  }
  return lista
}

test('turnos lista los horarios del cron en el rango', () => {
  assert.equal(turnos('7 * * * *', T('2026-10-01T00:00:00Z'), T('2026-10-01T05:59:00Z')).length, 6)
  assert.deepEqual(turnos('0 11 * * *', T('2026-09-30T12:00:00Z'), T('2026-10-01T12:00:00Z')), [T('2026-10-01T11:00:00Z')])
  assert.deepEqual(turnos('basura', 0, 1), [])
})

test('saludTrabajador: al día', () => {
  const s = saludTrabajador(cadaHora, corridasCadaHora(), ahora)
  assert.equal(s.estado, 'ok')
  assert.equal(s.huecos24, 0)
  assert.match(s.resumen, /^Corrió hace 30 min\.$/)
})

test('saludTrabajador: huecos y fallas viejas son aviso; la última atrasada o fallida es error', () => {
  const conHueco = saludTrabajador(cadaHora, corridasCadaHora([5], { 8: 'error' }), ahora)
  assert.equal(conHueco.estado, 'aviso')
  assert.equal(conHueco.huecos24, 1)
  assert.equal(conHueco.fallas24, 1)
  assert.match(conHueco.resumen, /en 24 h: 1 sin correr y 1 con error/)

  const atrasado = saludTrabajador(cadaHora, corridasCadaHora([0]), ahora)
  assert.equal(atrasado.estado, 'error')
  assert.equal(atrasado.atrasado, true)
  assert.equal(atrasado.resumen, 'No corrió a las 15:07.')

  const fallo = saludTrabajador(cadaHora, corridasCadaHora([], { 0: 'error' }), ahora)
  assert.equal(fallo.estado, 'error')
  assert.equal(fallo.resumen, 'Su última corrida falló: HTTP 503')
})

test('saludTrabajador: un turno que todavía está dentro del margen no cuenta como atrasado', () => {
  const s = saludTrabajador(cadaHora, corridasCadaHora([0]), T('2026-10-01T18:12:00Z'))
  assert.equal(s.atrasado, false)
})

test('saludTrabajador: trabada según su propio umbral', () => {
  const corridas = [c('2026-10-01T18:07:00Z', 'corriendo'), ...corridasCadaHora().slice(1)]
  assert.equal(saludTrabajador(cadaHora, corridas, ahora).trabada, true)
  assert.equal(saludTrabajador({ ...cadaHora, minutos_trabado: 60 }, corridas, ahora).trabada, false)
})

test('saludTrabajador: pausado o recién creado no se marca', () => {
  assert.equal(saludTrabajador({ ...cadaHora, activo: false }, [], ahora).resumen, 'Pausado.')
  const nuevo = saludTrabajador({ ...cadaHora, created_at: '2026-10-01T18:30:00Z' }, [], ahora)
  assert.equal(nuevo.estado, 'ok')
  assert.equal(nuevo.resumen, 'Todavía no le tocó correr.')
})

test('reporteSitios mantiene la forma de siempre y avisa si los datos son viejos', () => {
  const payload = { resumen: { sitios: 6, ok: 5, aviso: 0, error: 1, estado_general: 'error' }, sitios: [] }
  const r = reporteSitios({ iniciado_at: '2026-10-01T18:27:00Z', payload }, null, ahora)
  assert.deepEqual(r, { agente: 'monitor_sitios', estado: 'error', resumen: '5 ok · 0 avisos · 1 errores', datos: payload })
  const viejo = reporteSitios({ iniciado_at: '2026-10-01T10:27:00Z', payload: { ...payload, resumen: { ...payload.resumen, error: 0, ok: 6, estado_general: 'ok' } } }, null, ahora)
  assert.equal(viejo.estado, 'aviso')
  assert.match(viejo.resumen, /datos de hace 8 h/)
  assert.equal(reporteSitios(null, { resumen: 'No corrió a las 15:27.' }, ahora).datos, null)
})

test('reporteTareas deja la lista como detalle, como lee Hoy', () => {
  const tareas = [{ id: 't1' }, { id: 't2' }]
  const r = reporteTareas({ iniciado_at: '2026-10-01T18:17:00Z', payload: { dias_sin_tocar: 3, tareas } }, null, ahora)
  assert.equal(r.estado, 'aviso')
  assert.deepEqual(r.datos, tareas)
  assert.equal(reporteTareas({ iniciado_at: '2026-10-01T18:17:00Z', payload: { tareas: [] } }, null, ahora).resumen, 'Ninguna tarea estancada.')
})

test('reporteGoogle sale de las corridas de google_sync', () => {
  const ok = { estado: 'ok', iniciado_at: '2026-10-01T18:30:00Z', finalizado_at: '2026-10-01T18:30:12Z', payload: { conectado: true } }
  assert.equal(reporteGoogle(ok, ok, ahora).estado, 'ok')
  assert.deepEqual(reporteGoogle({ estado: 'error', payload: { conectado: false } }, ok, ahora).datos, { vinculado: false })
  assert.deepEqual(reporteGoogle({ estado: 'error', payload: { conectado: false, reconectar: true } }, ok, ahora).datos, { vinculado: true, refrescable: false })
  const viejo = { ...ok, iniciado_at: '2026-09-30T12:00:00Z', finalizado_at: '2026-09-30T12:00:10Z' }
  assert.equal(reporteGoogle({ estado: 'error', error: 'timeout', payload: null }, viejo, ahora).estado, 'error')
  assert.equal(reporteGoogle(null, null, ahora).estado, 'aviso')
})

test('reporteMaria resume a todos y nombra los que tienen problemas', () => {
  const r = reporteMaria([
    { nombre: 'Scraper', activo: true, estado: 'ok', resumen: 'Corrió hace 30 min.' },
    { nombre: 'Google', activo: true, estado: 'error', resumen: 'No corrió a las 15:30.' },
    { nombre: 'Eventos', activo: false, estado: 'ok', resumen: 'Pausado.' },
  ])
  assert.equal(r.estado, 'error')
  assert.equal(r.resumen, '3 trabajadores: 1 al día, 1 pausado. Google: No corrió a las 15:30.')
  assert.equal(peor('ok', 'aviso', 'ok'), 'aviso')
})
