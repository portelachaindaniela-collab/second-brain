import test from 'node:test'
import assert from 'node:assert/strict'
import { diasSinTocar, limiteTouched, resultadoTareas } from './logic.mjs'

test('diasSinTocar sale de los parámetros y vuelve a 3 si no es un número razonable', () => {
  assert.equal(diasSinTocar({ dias_sin_tocar: 5 }), 5)
  assert.equal(diasSinTocar({}), 3)
  assert.equal(diasSinTocar({ dias_sin_tocar: 0 }), 3)
  assert.equal(diasSinTocar({ dias_sin_tocar: '7' }), 7)
  assert.equal(diasSinTocar({ dias_sin_tocar: 2.5 }), 3)
  assert.equal(diasSinTocar(null), 3)
})

test('limiteTouched resta días exactos', () => {
  assert.equal(limiteTouched(3, Date.parse('2026-10-01T12:00:00Z')), '2026-09-28T12:00:00.000Z')
})

test('resultadoTareas cuenta y guarda la lista', () => {
  const r = resultadoTareas([{ id: 't1' }, { id: 't2' }], 3)
  assert.deepEqual(r, { estado: 'ok', cantidad: 2, payload: { dias_sin_tocar: 3, tareas: [{ id: 't1' }, { id: 't2' }] } })
})
