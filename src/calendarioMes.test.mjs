import test from 'node:test'
import assert from 'node:assert/strict'
import { tipoEvento, proximoEvento, cuandoFalta } from './calendarioMes.mjs'
import { MARCA_COMUNIDAD } from './comunidadEventos.mjs'

test('tipoEvento distingue Comunidad, feriados, el calendario propio y los demás', () => {
  assert.equal(tipoEvento({ calendar_id: 'primary', description: MARCA_COMUNIDAD }), 'comunidad')
  assert.equal(tipoEvento({ calendar_id: 'es.ar#holiday@group.v.calendar.google.com' }), 'feriado')
  assert.equal(tipoEvento({ calendar_id: 'primary' }), 'principal')
  assert.equal(tipoEvento({ calendar_id: null }), 'principal')
  assert.equal(tipoEvento({ calendar_id: 'abc@group.calendar.google.com' }), 'otro')
})

const ahora = new Date(2026, 9, 19, 8, 20)
const d = (dia, h, m = 0) => new Date(2026, 9, dia, h, m).toISOString()

test('proximoEvento salta lo que ya terminó y toma el que está en curso', () => {
  const eventos = [
    { id: 1, starts_at: d(19, 7), ends_at: d(19, 8), all_day: false },
    { id: 2, starts_at: d(19, 8), ends_at: d(19, 9), all_day: false },
    { id: 3, starts_at: d(19, 10), ends_at: d(19, 11), all_day: false },
  ]
  assert.equal(proximoEvento(eventos, ahora).id, 2)
})

test('proximoEvento cae en uno de todo el día si no hay con hora', () => {
  const eventos = [{ id: 1, starts_at: '2026-10-18T00:00:00+00:00', all_day: true }, { id: 2, starts_at: '2026-10-21T00:00:00+00:00', all_day: true }]
  assert.equal(proximoEvento(eventos, ahora).id, 2)
  assert.equal(proximoEvento([], ahora), null)
})

test('cuandoFalta en minutos, horas, mañana o día', () => {
  assert.equal(cuandoFalta({ starts_at: d(19, 10), all_day: false }, ahora), 'en 1 h 40 min')
  assert.equal(cuandoFalta({ starts_at: d(19, 8, 50), all_day: false }, ahora), 'en 30 min')
  assert.equal(cuandoFalta({ starts_at: d(19, 8), all_day: false }, ahora), 'ahora')
  assert.equal(cuandoFalta({ starts_at: d(20, 9), all_day: false }, ahora), 'mañana')
  assert.equal(cuandoFalta({ starts_at: '2026-10-19T00:00:00+00:00', all_day: true }, ahora), 'hoy')
})
