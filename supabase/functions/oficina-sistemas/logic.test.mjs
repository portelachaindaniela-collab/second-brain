import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarPedido, accionValida, notaResultado } from './logic.mjs'

test('validarPedido y accionValida', () => {
  assert.deepEqual(validarPedido({ solicitud: 3 }), { ok: true, id: 3 })
  assert.equal(validarPedido({ solicitud: 'x' }).ok, false)
  assert.equal(accionValida({ tipo: 'frenar_pieza', piezas: ['a'] }), true)
  assert.equal(accionValida({ tipo: 'borrar_todo', piezas: [] }), false)
  assert.equal(accionValida(null), false)
})

test('notaResultado cuenta lo que se hizo y lo que no', () => {
  assert.match(notaResultado({ pedidas: 2, frenadas: 2, cancelacion: { estado: 'canceladas', n: 1 } }), /2 piezas volvieron a revisión.*Cancelé 1 corrida/)
  assert.match(notaResultado({ pedidas: 2, frenadas: 1, cancelacion: { estado: 'sin_corridas' } }), /1 de 2 piezas/)
  assert.match(notaResultado({ pedidas: 0, frenadas: 0, cancelacion: { estado: 'sin_token' } }), /No había piezas.*falta un token/)
  assert.match(notaResultado({ pedidas: 1, frenadas: 1, cancelacion: { estado: 'error', detalle: 'GitHub 403' } }), /GitHub 403/)
})
