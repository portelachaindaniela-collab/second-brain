import test from 'node:test'
import assert from 'node:assert/strict'
import { filasCalendarios } from './calendarios.mjs'

test('filasCalendarios guarda el principal como primary, el nombre que ve ella y el color', () => {
  const filas = filasCalendarios([
    { id: 'dani@gmail.com', primary: true, summary: 'dani@gmail.com', summaryOverride: 'Daniela', backgroundColor: '#9FE1E7' },
    { id: 'abc@group.calendar.google.com', summary: 'Salud', backgroundColor: '#16a765' },
    { id: 'raro', summary: 'Raro', backgroundColor: 'azul' },
    { id: 'viejo', summary: 'Viejo', deleted: true },
  ], 'u1', 'T')
  assert.deepEqual(filas, [
    { owner_id: 'u1', calendar_id: 'primary', nombre: 'Daniela', color: '#9fe1e7', updated_at: 'T' },
    { owner_id: 'u1', calendar_id: 'abc@group.calendar.google.com', nombre: 'Salud', color: '#16a765', updated_at: 'T' },
    { owner_id: 'u1', calendar_id: 'raro', nombre: 'Raro', color: null, updated_at: 'T' },
  ])
  assert.deepEqual(filasCalendarios(undefined, 'u1'), [])
})
