import test from 'node:test'
import assert from 'node:assert/strict'
import { unirRepetidos, diasDelEvento } from './eventosUnicos.mjs'

const importado = { id: 'a', title: 'Olé Summit Argentina 2026', all_day: true, starts_at: '2026-09-29T00:00:00+00:00', ends_at: '2026-10-01T00:00:00+00:00' }
const deGmail = { id: 'b', title: 'Olé Summit Argentina 2026', all_day: false, starts_at: '2026-09-29T11:30:00+00:00', ends_at: '2026-09-30T21:30:00+00:00' }

test('junta el mismo evento cargado dos veces y se queda con el que tiene horario', () => {
  assert.deepEqual(unirRepetidos([importado, deGmail]).map(e => e.id), ['b'])
  assert.deepEqual(unirRepetidos([deGmail, importado]).map(e => e.id), ['b'])
})

test('no junta eventos con el mismo nombre en días distintos', () => {
  const lunes = { id: '1', title: 'Entrenar', all_day: false, starts_at: '2026-09-28T12:00:00+00:00', ends_at: '2026-09-28T13:00:00+00:00' }
  const martes = { id: '2', title: 'Entrenar', all_day: false, starts_at: '2026-09-29T12:00:00+00:00', ends_at: '2026-09-29T13:00:00+00:00' }
  assert.equal(unirRepetidos([lunes, martes]).length, 2)
  const vispera = { id: '3', title: 'Año Nuevo Judío', all_day: true, starts_at: '2026-09-12T00:00:00+00:00', ends_at: '2026-09-13T00:00:00+00:00' }
  const dia = { id: '4', title: 'Año Nuevo Judío', all_day: true, starts_at: '2026-09-13T00:00:00+00:00', ends_at: '2026-09-14T00:00:00+00:00' }
  assert.equal(unirRepetidos([vispera, dia]).length, 2)
})

test('un evento de todo el día ocupa sus días reales, sin correrse por la zona horaria', () => {
  assert.deepEqual(diasDelEvento(importado), ['2026-09-29', '2026-09-30'])
})
