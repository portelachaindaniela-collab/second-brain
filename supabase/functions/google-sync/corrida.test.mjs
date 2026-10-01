import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resultadoCorrida } from './corrida.mjs'

test('sin cuenta o pidiendo reconectar es error', () => {
  assert.deepEqual(resultadoCorrida({ conectado: false }).error, 'Google no está vinculado.')
  assert.deepEqual(resultadoCorrida({ conectado: false, reconectar: true }).error, 'Google pide reconectar la cuenta.')
})

test('si Calendar rechazó todo es error', () => {
  const r = resultadoCorrida({ conectado: true, error: 'Calendar rechazó la consulta' })
  assert.equal(r.estado, 'error')
  assert.equal(r.error, 'Calendar rechazó la consulta')
})

test('ok cuenta eventos más mails, aunque falle la revisión de eliminados', () => {
  const r = resultadoCorrida({ conectado: true, eventos: 12, mails: 3, eliminados: 0, error: 'No se pudieron comprobar todos los eventos eliminados: x' })
  assert.equal(r.estado, 'ok')
  assert.equal(r.cantidad, 15)
  assert.match(r.payload.error, /eliminados/)
})
