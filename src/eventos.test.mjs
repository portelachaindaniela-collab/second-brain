import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aInputLocal, desdeInputLocal, fechaEvento, textoCalculo, esPasado, reglasMasNuevas } from './eventos.mjs'

test('el input local va y vuelve en hora argentina', () => {
  assert.equal(desdeInputLocal('2026-10-10T09:00'), '2026-10-10T12:00:00.000Z')
  assert.equal(aInputLocal('2026-10-10T12:00:00.000Z'), '2026-10-10T09:00')
  assert.equal(desdeInputLocal(''), null)
})

test('fecha del evento con y sin fin', () => {
  assert.match(fechaEvento('2026-10-10T12:00:00Z'), /10\/10 09:00$/)
  assert.match(fechaEvento('2026-10-10T12:00:00Z', '2026-10-10T21:00:00Z'), /09:00–18:00$/)
  assert.match(fechaEvento('2026-10-10T12:00:00Z', '2026-10-11T21:00:00Z'), /09:00–11\/10 18:00$/)
})

test('texto del cálculo de la hora de levantarse', () => {
  assert.equal(textoCalculo({ llegada: '09:00', viaje_min: 60, preparacion_min: 45, levantarse: '07:15', dia_anterior: false }),
    '09:00 − viaje 60′ − prepararte 45′ = levantarte 07:15')
  assert.equal(textoCalculo(null), null)
})

test('pasado se mide por el fin si lo hay', () => {
  const ahora = Date.parse('2026-10-10T15:00:00Z')
  assert.equal(esPasado({ inicio_at: '2026-10-10T12:00:00Z', fin_at: '2026-10-10T21:00:00Z' }, ahora), false)
  assert.equal(esPasado({ inicio_at: '2026-10-10T12:00:00Z' }, ahora), true)
})

test('avisa si las reglas cambiaron después de evaluar', () => {
  assert.equal(reglasMasNuevas({ evaluado_at: '2026-10-01T00:00:00Z' }, '2026-10-02T00:00:00Z'), true)
  assert.equal(reglasMasNuevas({ evaluado_at: '2026-10-03T00:00:00Z' }, '2026-10-02T00:00:00Z'), false)
  assert.equal(reglasMasNuevas({ evaluado_at: null }, '2026-10-02T00:00:00Z'), false)
})
