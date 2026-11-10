import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aInputLocal, desdeInputLocal, fechaEvento, fechaTarjeta, textoCalculo, esPasado, reglasMasNuevas } from './eventos.mjs'

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

test('fecha corta de la tarjeta, con la duración si son varios días', () => {
  assert.equal(fechaTarjeta('2026-10-01T12:00:00Z', '2026-10-01T21:00:00Z'), 'jue 01/10 · 09:00')
  assert.equal(fechaTarjeta('2026-10-01T12:00:00Z', '2026-10-02T21:00:00Z'), 'jue 01/10 · 09:00 · 2 días')
  assert.equal(fechaTarjeta('2026-10-01T12:00:00Z'), 'jue 01/10 · 09:00')
})

test('un plan va al calendario con lugar, web y entrada, y dura una hora si no tiene fin', async () => {
  const { eventoParaCalendario } = await import('./eventos.mjs')
  const cuerpo = eventoParaCalendario({ nombre: 'Meetup de datos', inicio_at: '2026-11-20T21:00:00Z', fin_at: null, lugar: 'Ciudad Cultural Konex', direccion: 'Sarmiento 3131', url: 'https://ejemplo.com', tiene_entrada: true, precio: '$5000' })
  assert.equal(cuerpo.accion, 'crear')
  assert.equal(cuerpo.title, 'Meetup de datos')
  assert.equal(cuerpo.location, 'Ciudad Cultural Konex, Sarmiento 3131')
  assert.equal(cuerpo.description, 'https://ejemplo.com\nEntrada: $5000')
  assert.equal(cuerpo.starts_at, '2026-11-20T21:00:00.000Z')
  assert.equal(cuerpo.ends_at, '2026-11-20T22:00:00.000Z')
  assert.equal(cuerpo.all_day, false)
})

test('si el plan tiene fin, el evento del calendario termina a esa hora', async () => {
  const { eventoParaCalendario } = await import('./eventos.mjs')
  const cuerpo = eventoParaCalendario({ nombre: 'Taller', inicio_at: '2026-11-20T13:00:00Z', fin_at: '2026-11-20T17:00:00Z', tiene_entrada: false })
  assert.equal(cuerpo.ends_at, '2026-11-20T17:00:00.000Z')
  assert.equal(cuerpo.location, '')
  assert.equal(cuerpo.description, '')
})
