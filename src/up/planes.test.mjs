import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moverMes, colorLibre, diasVisibles, cuantosPorPlan, bloqueoDeDia, separarBorrables, COLORES_PLAN, SIN_PLAN } from './planes.mjs'

test('moverMes cruza años en los dos sentidos', () => {
  assert.equal(moverMes('2026-10', 1), '2026-11')
  assert.equal(moverMes('2026-12', 1), '2027-01')
  assert.equal(moverMes('2026-01', -1), '2025-12')
  assert.equal(moverMes('2026-10', 0), '2026-10')
})

test('colorLibre da el primero sin usar', () => {
  assert.equal(colorLibre([]), COLORES_PLAN[0])
  assert.equal(colorLibre([{ color: COLORES_PLAN[0].toLowerCase() }]), COLORES_PLAN[1])
  assert.equal(colorLibre(COLORES_PLAN.map(color => ({ color }))), COLORES_PLAN[0])
})

const planes = [{ id: 'a', visible: true }, { id: 'b', visible: false }]
const dias = [{ fecha: '1', plan_id: 'a' }, { fecha: '2', plan_id: 'b' }, { fecha: '3', plan_id: null }, { fecha: '4', plan_id: 'borrado' }]

test('diasVisibles respeta los planes tildados y el "Sin plan"', () => {
  assert.deepEqual(diasVisibles(dias, planes).map(d => d.fecha), ['1', '3', '4'])
  assert.deepEqual(diasVisibles(dias, planes, false).map(d => d.fecha), ['1'])
})

test('cuantosPorPlan junta los huérfanos en Sin plan', () => {
  assert.deepEqual(cuantosPorPlan(dias, planes), { a: 1, b: 1, [SIN_PLAN]: 2 })
})

test('bloqueoDeDia frena lo aprobado o publicado', () => {
  assert.equal(bloqueoDeDia([]), '')
  assert.equal(bloqueoDeDia([{ estado: 'pendiente' }, { estado: 'revision' }]), '')
  assert.match(bloqueoDeDia([{ estado: 'aprobado' }]), /aprobadas/)
  assert.match(bloqueoDeDia([{ estado: 'publicado' }]), /publicadas/)
})

test('separarBorrables deja afuera lo aprobado o publicado', () => {
  const piezas = { a: [{ estado: 'pendiente' }], b: [{ estado: 'aprobado' }], c: [], d: [{ estado: 'publicado' }] }
  const r = separarBorrables(['a', 'b', 'c', 'd'].map(fecha => ({ fecha })), f => piezas[f])
  assert.deepEqual(r.borrables.map(d => d.fecha), ['a', 'c'])
  assert.deepEqual(r.bloqueados.map(d => d.fecha), ['b', 'd'])
})
