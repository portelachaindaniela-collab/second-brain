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

test('junta el mismo horario en dos calendarios y muestra los dos nombres, el corto primero', () => {
  const bloque = { id: 'p', title: 'Testing QA', calendar_id: 'propio', all_day: false, starts_at: '2026-10-20T21:30:00+00:00', ends_at: '2026-10-20T23:30:00+00:00' }
  const clase = { id: 'c', title: 'Módulo 5: Ejecución de Pruebas', calendar_id: 'curso', description: 'link', all_day: false, starts_at: '2026-10-20 21:30:00+00', ends_at: '2026-10-20 23:30:00+00' }
  for (const orden of [[bloque, clase], [clase, bloque]]) {
    const [unido, ...resto] = unirRepetidos(orden)
    assert.equal(resto.length, 0)
    assert.equal(unido.id, 'c')
    assert.equal(unido.title, 'Testing QA · Módulo 5: Ejecución de Pruebas')
    assert.equal(unido.titulo_original, 'Módulo 5: Ejecución de Pruebas')
  }
})

test('no junta horarios iguales del mismo calendario ni horarios que solo se pisan', () => {
  const a = { id: 'a', title: 'Reunión A', calendar_id: 'x', all_day: false, starts_at: '2026-10-20T13:00:00Z', ends_at: '2026-10-20T14:00:00Z' }
  const b = { ...a, id: 'b', title: 'Reunión B' }
  const c = { ...a, id: 'c', title: 'Reunión C', calendar_id: 'y', ends_at: '2026-10-20T14:30:00Z' }
  assert.equal(unirRepetidos([a, b]).length, 2)
  assert.equal(unirRepetidos([a, c]).length, 2)
})
