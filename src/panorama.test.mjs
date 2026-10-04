import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nombreCorto, resumenTrabajador, proximas, temasDeCanillita, duracionCorta, puntosDeLinea } from './panorama.mjs'

const AHORA = Date.parse('2026-10-04T15:20:00Z')
const hace = h => new Date(AHORA - h * 3_600_000).toISOString()

test('resumenTrabajador: solo 24 h para contar, últimas duraciones en orden para la línea', () => {
  const corridas = [
    { iniciado_at: hace(0.1), estado: 'corriendo' },
    { iniciado_at: hace(1), estado: 'ok', cantidad_resultados: 10, duracion_ms: 300 },
    { iniciado_at: hace(2), estado: 'error', duracion_ms: 100 },
    { iniciado_at: hace(30), estado: 'ok', cantidad_resultados: 99, duracion_ms: 200 },
  ]
  const r = resumenTrabajador(corridas, AHORA)
  assert.equal(r.corridas, 2)
  assert.equal(r.ok, 1)
  assert.equal(r.error, 1)
  assert.equal(r.resultados, 10)
  assert.deepEqual(r.duraciones, [200, 100, 300])
  assert.equal(r.duracionPromedio, 200)
})

test('proximas: corridas de la próxima hora según el cron, en orden; pausados afuera', () => {
  const t = [
    { clave: 'a', activo: true, frecuencia: '41 * * * *' },
    { clave: 'b', activo: true, frecuencia: '*/15 * * * *' },
    { clave: 'c', activo: false, frecuencia: '* * * * *' },
  ]
  const p = proximas(t, AHORA)
  assert.deepEqual(p.map(x => [x.clave, new Date(x.cuando).toISOString().slice(11, 16)]),
    [['b', '15:30'], ['a', '15:41'], ['b', '15:45'], ['b', '16:00'], ['b', '16:15']])
})

test('temasDeCanillita, duracionCorta y puntosDeLinea', () => {
  const c = [{ iniciado_at: hace(1), payload: { por_tema: { ia: 3, datos: 1 } } }, { iniciado_at: hace(2), payload: { por_tema: { ia: 2 } } }, { iniciado_at: hace(40), payload: { por_tema: { ia: 50 } } }]
  assert.deepEqual(temasDeCanillita(c, AHORA), [['ia', 5], ['datos', 1]])
  assert.equal(duracionCorta(255), '255 ms')
  assert.equal(duracionCorta(4300), '4.3 s')
  assert.equal(duracionCorta(43_143), '43 s')
  assert.equal(puntosDeLinea([1, 2, 3], 10, 10, 0), '0.0,10.0 5.0,5.0 10.0,0.0')
  assert.equal(puntosDeLinea([5], 10, 10), '')
})

test('nombreCorto: saca la aclaración entre paréntesis', () => {
  assert.equal(nombreCorto('Google (calendario y mail)'), 'Google')
  assert.equal(nombreCorto('Canillita'), 'Canillita')
})
