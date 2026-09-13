import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarEvento, cambiosGoogle } from './event.mjs'

const idValido = '11111111-2222-3333-4444-555555555555'

test('acepta un evento con horario válido', () => {
  const evento = validarEvento({ id: idValido, title: 'Reunión', all_day: false, starts_at: '2026-09-15T10:00:00.000Z', ends_at: '2026-09-15T11:00:00.000Z' })
  assert.equal(evento.title, 'Reunión')
  assert.equal(evento.time_zone, 'America/Argentina/Buenos_Aires')
})

test('acepta un evento de todo el día con fechas de calendario', () => {
  const evento = validarEvento({ id: idValido, title: 'Feriado', all_day: true, starts_at: '2026-09-15', ends_at: '2026-09-16' })
  assert.equal(evento.starts_at, '2026-09-15')
  assert.equal(evento.all_day, true)
})

test('rechaza un id que no es uuid', () => {
  assert.throws(() => validarEvento({ id: 'no-es-un-uuid', title: 'x', all_day: false, starts_at: '2026-09-15T10:00:00Z', ends_at: '2026-09-15T11:00:00Z' }))
})

test('rechaza título vacío', () => {
  assert.throws(() => validarEvento({ id: idValido, title: '  ', all_day: false, starts_at: '2026-09-15T10:00:00Z', ends_at: '2026-09-15T11:00:00Z' }))
})

test('rechaza cuando el final es anterior o igual al inicio', () => {
  assert.throws(() => validarEvento({ id: idValido, title: 'x', all_day: false, starts_at: '2026-09-15T11:00:00Z', ends_at: '2026-09-15T10:00:00Z' }))
})

test('rechaza fechas de todo el día que no coinciden con el formato de calendario', () => {
  assert.throws(() => validarEvento({ id: idValido, title: 'x', all_day: true, starts_at: '2026-09-15T10:00:00Z', ends_at: '2026-09-16' }))
})

test('cambiosGoogle arma el payload correcto para evento con horario', () => {
  const evento = validarEvento({ id: idValido, title: 'Reunión', location: 'Oficina', all_day: false, starts_at: '2026-09-15T10:00:00.000Z', ends_at: '2026-09-15T11:00:00.000Z' })
  const cambios = cambiosGoogle(evento)
  assert.equal(cambios.summary, 'Reunión')
  assert.equal(cambios.location, 'Oficina')
  assert.equal(cambios.start.dateTime, evento.starts_at)
  assert.equal(cambios.start.date, null)
})

test('cambiosGoogle arma el payload correcto para evento de todo el día', () => {
  const evento = validarEvento({ id: idValido, title: 'Feriado', all_day: true, starts_at: '2026-09-15', ends_at: '2026-09-16' })
  const cambios = cambiosGoogle(evento)
  assert.equal(cambios.start.date, '2026-09-15')
  assert.equal(cambios.start.dateTime, null)
})
