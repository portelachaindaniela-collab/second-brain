import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colorIdentidad, actividadPorHora, alertas, grafoFlujo, caminoDe, destinosDe, corriendoAhora } from './tablero.mjs'

const ahora = Date.parse('2026-09-30T20:30:00Z')
const c = (id, inicio, estado = 'ok', extra = {}) => ({ id, iniciado_at: inicio, estado, ...extra })
const trabajadores = [
  { clave: 'google_sync', nombre: 'Google', color: 'azul', activo: true, frecuencia: '*/15 * * * *', created_at: '2026-09-30T00:00:00Z', minutos_trabado: 5 },
  { clave: 'maria', nombre: 'María', color: 'violeta', activo: true, frecuencia: '37 * * * *', created_at: '2026-09-30T20:00:00Z', minutos_trabado: 5 },
  { clave: 'nuevo', nombre: 'Nuevo', color: 'lima', activo: false, frecuencia: '0 * * * *', created_at: '2026-09-30T00:00:00Z' },
]

test('color de identidad sale de un token de tema', () => {
  assert.equal(colorIdentidad('azul'), 'var(--id-azul, var(--gray-500))')
  assert.equal(colorIdentidad(null), 'var(--gray-500)')
})

test('actividad: corridas por hora de todos juntos, por trabajador', () => {
  const corridasPor = { google_sync: [c(2, '2026-09-30T20:15:00Z'), c(1, '2026-09-30T20:00:00Z'), c(0, '2026-09-30T18:00:00Z')], maria: [c(3, '2026-09-30T20:07:00Z')] }
  const horas = actividadPorHora(trabajadores, corridasPor, ahora)
  assert.equal(horas.length, 24)
  assert.deepEqual(horas[23].partes, [{ clave: 'google_sync', n: 2 }, { clave: 'maria', n: 1 }])
  assert.equal(horas[23].total, 3)
  assert.equal(horas[21].total, 1)
  assert.equal(horas[22].total, 0)
})

test('alertas: trabado, última corrida con error y lo que encontró María', () => {
  const corridasPor = {
    google_sync: [c(2, '2026-09-30T20:15:00Z', 'corriendo'), c(1, '2026-09-30T20:00:00Z')],
    maria: [c(3, '2026-09-30T20:07:00Z', 'ok', { payload: { agentes: [{ agente: 'monitor_sitios', estado: 'error', resumen: '5 ok · 1 errores' }, { agente: 'tareas_estancadas', estado: 'aviso', resumen: '2' }] } })],
  }
  const recientes = trabajadores.map(t => ({ ...t, created_at: '2026-09-30T20:00:00Z' }))
  const a = alertas({ trabajadores: recientes, corridasPor, ahora, salud: { trabajadores_sin_job: ['maria'], fallos_cron_24h: 0 } })
  assert.deepEqual(a.map(x => x.nivel), ['error', 'error', 'aviso'])
  assert.match(a[0].texto, /^Google: trabado hace 15 min/)
  assert.match(a[1].texto, /María: está activo pero su job de cron no/)
  assert.equal(a[2].texto, 'María · monitor sitios: 5 ok · 1 errores')
})

test('alertas: error de la última corrida terminada y horas sin correr', () => {
  const corridasPor = { google_sync: [c(1, '2026-09-30T20:00:00Z', 'error', { error: 'Google pide reconectar la cuenta.' })] }
  const a = alertas({ trabajadores: [trabajadores[0]], corridasPor, ahora })
  assert.equal(a[0].texto, 'Google: la última corrida falló (Google pide reconectar la cuenta.)')
  assert.match(a[1].texto, /^Google: \d+ horas sin correr cuando le tocaba$/)
  assert.deepEqual(alertas({ trabajadores: [trabajadores[2]], corridasPor: {}, ahora }), [], 'pausado no alerta')
})

test('grafo: tres columnas y trabajos_corridas abajo, adonde llegan todos', () => {
  const g = grafoFlujo(trabajadores)
  const ids = g.nodos.map(n => n.id)
  assert.deepEqual(ids.filter(i => i.startsWith('f:')), ['f:google', 'f:sitios', 'f:github_pages'])
  assert.deepEqual(ids.filter(i => i.startsWith('d:')), ['d:calendar_events', 'd:emails', 'd:process_reports', 'd:trabajos_corridas'])
  const registro = g.nodos.find(n => n.id === 'd:trabajos_corridas')
  assert.ok(g.nodos.filter(n => n.tipo === 'destino' && !n.registro).every(n => n.y < registro.y))
  assert.deepEqual(g.hilos.filter(h => h.hasta === 'd:trabajos_corridas').map(h => h.clave), ['google_sync', 'maria', 'nuevo'])
  assert.equal(g.nodos.find(n => n.id === 't:maria').color, 'violeta')
})

test('camino: un trabajador resalta sus fuentes y destinos; un destino, solo quien le escribe', () => {
  const g = grafoFlujo(trabajadores)
  const deMaria = caminoDe('t:maria', g)
  assert.deepEqual([...deMaria.nodos].sort(), ['d:process_reports', 'd:trabajos_corridas', 'f:github_pages', 'f:sitios', 't:maria'])
  const deEmails = caminoDe('d:emails', g)
  assert.deepEqual([...deEmails.nodos].sort(), ['d:emails', 'f:google', 't:google_sync'])
  assert.equal(caminoDe(null, g), null)
  assert.deepEqual(destinosDe('google_sync', g), ['d:calendar_events', 'd:emails', 'd:trabajos_corridas'])
})

test('corriendo en el mapa: última corrida en curso y no trabada', () => {
  const corridasPor = { google_sync: [c(2, '2026-09-30T20:28:00Z', 'corriendo')], maria: [c(3, '2026-09-30T20:07:00Z', 'corriendo')] }
  assert.deepEqual(corriendoAhora(trabajadores, corridasPor, ahora), ['google_sync'])
})
