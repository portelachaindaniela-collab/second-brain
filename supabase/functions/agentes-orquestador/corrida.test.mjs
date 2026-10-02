import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resultadoCorrida } from './corrida.mjs'

const sitios = { agente: 'monitor_sitios', estado: 'aviso', resumen: '5 ok · 1 avisos · 0 errores', datos: { resumen: { ok: 5, aviso: 1, error: 0 } } }
const tareas = { agente: 'tareas_estancadas', estado: 'aviso', resumen: '2 tareas', datos: [{ id: 1 }, { id: 2 }] }
const sync = { agente: 'sync_estado', estado: 'ok', resumen: 'Google vinculado', datos: {} }
const maria = { agente: 'maria', estado: 'ok', resumen: '5 trabajadores: 5 al día.', datos: { trabajadores: [] } }

test('encontrar problemas no es un error de la corrida: se cuentan', () => {
  const r = resultadoCorrida([sitios, tareas, sync, maria])
  assert.equal(r.estado, 'ok')
  assert.equal(r.cantidad, 3)
  assert.deepEqual(r.payload.agentes.map(a => a.agente), ['monitor_sitios', 'tareas_estancadas', 'sync_estado', 'maria'])
  assert.equal(r.payload.agentes[0].datos, undefined)
})

test('los trabajadores atrasados o con error también son cosas para mirar', () => {
  const sinDatos = { agente: 'monitor_sitios', estado: 'error', resumen: 'No hay datos de los sitios', datos: null }
  const r = resultadoCorrida([sinDatos, tareas, sync, maria], [{ estado: 'error' }, { estado: 'ok' }, { estado: 'aviso' }])
  assert.equal(r.estado, 'ok')
  assert.equal(r.cantidad, 4)
})
