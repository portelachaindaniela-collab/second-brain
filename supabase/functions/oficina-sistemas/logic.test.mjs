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

test('cargar el calendario de UP: valida los días y no pisa los que ya tienen publicación', async () => {
  const { accionValida, filasCalendario, notaCalendario } = await import('./logic.mjs')
  const accion = { tipo: 'cargar_calendario_up', titulo: 'Plan de enero 2027', dias: [
    { fecha: '2027-01-04', tema: 'Arranque del año', redes: ['linkedin', 'x'], formato_instagram: 'ninguno' },
    { fecha: '2027-01-06', tema: 'Tendencias', redes: ['instagram'], formato_instagram: 'carrusel' },
  ] }
  assert.equal(accionValida(accion), true)
  assert.equal(accionValida({ ...accion, dias: [{ fecha: 'mañana', tema: 'x', redes: [], formato_instagram: 'reel' }] }), false)
  const filas = filasCalendario(accion, ['2027-01-04'])
  assert.deepEqual(filas, [{ fecha: '2027-01-06', tema_semana: 'Plan de enero 2027', tema_dia: 'Tendencias', redes: ['instagram'], formato_instagram: 'carrusel' }])
  assert.match(notaCalendario({ pedidos: 2, cargados: 1 }), /Cargué 1 día.*1 día ya tenía publicación/)
})
