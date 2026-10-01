import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resultadoCorrida } from './corrida.mjs'

const sitios = { agente: 'monitor_sitios', estado: 'aviso', resumen: '5 ok · 1 avisos · 0 errores', datos: { resumen: { ok: 5, aviso: 1, error: 0 } } }
const tareas = { agente: 'tareas_estancadas', estado: 'aviso', resumen: '2 tareas', datos: [{ id: 1 }, { id: 2 }] }
const sync = { agente: 'sync_estado', estado: 'ok', resumen: 'Google vinculado', datos: {} }

test('encontrar problemas no es un error de la corrida: se cuentan', () => {
  const r = resultadoCorrida([sitios, tareas, sync])
  assert.equal(r.estado, 'ok')
  assert.equal(r.cantidad, 3)
  assert.deepEqual(r.payload.agentes.map(a => a.agente), ['monitor_sitios', 'tareas_estancadas', 'sync_estado'])
  assert.equal(r.payload.agentes[0].datos, undefined)
})

test('un chequeo que no pudo correr hace la corrida error', () => {
  const r = resultadoCorrida([{ agente: 'monitor_sitios', estado: 'error', resumen: 'Secreto de trabajador inválido.', fallo: true }, tareas, sync])
  assert.equal(r.estado, 'error')
  assert.equal(r.cantidad, null)
  assert.match(r.error, /^monitor_sitios: Secreto/)
})
