import test from 'node:test'
import assert from 'node:assert/strict'
import { inicioSemana, moverSemana, diasDeSemana } from './semana.mjs'

test('la semana empieza el lunes, también si hoy es domingo', () => {
  assert.equal(inicioSemana(new Date(2026, 9, 11)).getDate(), 5)
  assert.equal(inicioSemana(new Date(2026, 9, 6)).getDate(), 5)
  assert.equal(inicioSemana(new Date(2026, 9, 5, 23, 30)).getDate(), 5)
})

test('moverSemana cruza de mes', () => {
  const siguiente = moverSemana(new Date(2026, 8, 28), 1)
  assert.deepEqual([siguiente.getMonth(), siguiente.getDate()], [9, 5])
})

test('siempre hay 7 días, con los vacíos incluidos', () => {
  const dias = diasDeSemana(new Date(2026, 9, 5), [])
  assert.equal(dias.length, 7)
  assert.ok(dias.every(d => d.items.length === 0))
})

test('reparte eventos por día, ordenados por hora, y repite los de varios días', () => {
  const tarde = { id: 't', all_day: false, starts_at: new Date(2026, 9, 6, 18).toISOString(), ends_at: new Date(2026, 9, 6, 19).toISOString() }
  const manana = { id: 'm', all_day: false, starts_at: new Date(2026, 9, 6, 9).toISOString(), ends_at: new Date(2026, 9, 6, 10).toISOString() }
  const congreso = { id: 'c', all_day: true, starts_at: '2026-10-08T00:00:00+00:00', ends_at: '2026-10-10T00:00:00+00:00' }
  const dias = diasDeSemana(new Date(2026, 9, 5), [tarde, congreso, manana])
  assert.deepEqual(dias.map(d => d.items.map(i => i.evento.id).join('')), ['', 'mt', '', 'c', 'c', '', ''])
})

test('un evento con hora que sigue al día siguiente queda marcado como continuación', () => {
  const noche = { id: 'n', all_day: false, starts_at: new Date(2026, 9, 9, 22).toISOString(), ends_at: new Date(2026, 9, 10, 2).toISOString() }
  const dias = diasDeSemana(new Date(2026, 9, 5), [noche])
  assert.deepEqual(dias.slice(4, 6).map(d => d.items[0].continua), [false, true])
})
