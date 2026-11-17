import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planoOficina, poseDe, DESCANSO } from './oficinaEscena.mjs'

const agentes = [
  ...Array.from({ length: 9 }, (_, i) => ({ id: `trabajadores:${i}`, equipo: 'trabajadores' })),
  ...Array.from({ length: 7 }, (_, i) => ({ id: `up:${i}`, equipo: 'up' })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `pdg:${i}`, equipo: 'pdg' })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `admin:${i}`, equipo: 'admin' })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `sistemas:${i}`, equipo: 'sistemas' })),
]

const pisan = (a, b) => a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.z < b.z + b.fondo && b.z < a.z + a.fondo

test('cada agente tiene un puesto propio dentro de la zona de su equipo', () => {
  const p = planoOficina(agentes)
  assert.equal(p.puestos.length, agentes.length)
  assert.equal(new Set(p.puestos.map(x => `${x.x},${x.z}`)).size, agentes.length)
  for (const pu of p.puestos) {
    const z = p.zonas.find(z => z.equipo === pu.equipo)
    assert.ok(pu.x > z.x && pu.x < z.x + z.ancho && pu.z > z.z && pu.z < z.z + z.fondo, pu.id)
  }
})

test('las zonas no se pisan y entran en el salón; hay rincón de descanso', () => {
  const p = planoOficina(agentes)
  for (const [i, a] of p.zonas.entries()) {
    assert.ok(a.x >= 0 && a.z >= 0 && a.x + a.ancho <= p.ancho + 1e-9 && a.z + a.fondo <= p.fondo + 1e-9)
    for (const b of p.zonas.slice(i + 1)) assert.ok(!pisan(a, b), `${a.equipo} pisa ${b.equipo}`)
  }
  const d = p.zonas.find(z => z.equipo === 'descanso')
  assert.equal(d.ancho, DESCANSO.ancho)
})

test('dos filas enfrentadas: la de atrás mira adelante y la de adelante mira atrás', () => {
  const p = planoOficina(agentes)
  const up = p.puestos.filter(x => x.equipo === 'up')
  assert.deepEqual(up.map(x => x.mira).slice(0, 2), [0, Math.PI])
  assert.equal(new Set(up.map(x => x.z)).size, 2)
})

test('un equipo de uno solo queda en una fila; los equipos desconocidos van al final', () => {
  const p = planoOficina([{ id: 'x:1', equipo: 'otro' }, { id: 'up:1', equipo: 'up' }])
  assert.deepEqual(p.zonas.map(z => z.equipo), ['up', 'otro', 'descanso'])
  assert.equal(p.puestos.find(x => x.id === 'up:1').mira, 0)
})

test('es siempre igual para los mismos agentes', () => {
  assert.deepEqual(planoOficina(agentes), planoOficina(agentes))
})

test('sin agentes queda solo el descanso', () => {
  const p = planoOficina([])
  assert.deepEqual(p.zonas.map(z => z.equipo), ['descanso'])
  assert.equal(p.puestos.length, 0)
})

test('poseDe: cada estado y el café de los libres', () => {
  assert.equal(poseDe('trabajando', 3).estado, 'trabajando')
  assert.equal(poseDe('error', 3).estado, 'error')
  assert.equal(poseDe('pausado', 3).estado, 'pausado')
  assert.equal(poseDe('nuevo', 3).estado, 'libre')
  assert.equal(poseDe('libre', 1).objeto, 'taza')
  assert.equal(poseDe('libre', 20).objeto, null)
})

test('varianteDe: María es mujer, siempre el mismo muñequito', async () => {
  const { varianteDe } = await import('./oficinaEscena.mjs')
  assert.ok([1, 2].includes(varianteDe('trabajadores:maria').pelo))
  assert.deepEqual(varianteDe('up:redactor'), varianteDe('up:redactor'))
})
