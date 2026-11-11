import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puestos, rutinas, retrasoAnimacion, variante, agujas, iso, ZONAS, DESCANSOS, PUFS, CICLO_S } from './oficinaPlano.mjs'

const dentro = (p, z) => p.x - 0.75 >= z.x0 && p.x + 0.75 <= z.x1 && p.y - 1.1 >= z.y0 && p.y + 0.4 <= z.y1

test('los escritorios quedan dentro de su zona', () => {
  for (const [equipo, n] of [['trabajadores', 9], ['trabajadores', 12], ['up', 7], ['pdg', 5]]) {
    const lista = puestos(equipo, n)
    assert.equal(lista.length, n)
    for (const p of lista) assert.ok(dentro(p, ZONAS[equipo]), `${equipo} ${JSON.stringify(p)}`)
  }
})

test('la última fila incompleta va centrada', () => {
  const up = puestos('up', 7)
  assert.equal(up[6].x, up[1].x)
  assert.equal(puestos('pdg', 1)[0].x, 4.5)
})

test('rutinas: libres van de descanso, pausados duermen, el resto se queda en su escritorio', () => {
  const agentes = [
    { id: 'a', estado: 'libre' }, { id: 'b', estado: 'trabajando' }, { id: 'c', estado: 'pausado' },
    { id: 'd', estado: 'nuevo' }, { id: 'e', estado: 'error' }, { id: 'f', estado: 'pausado' }, { id: 'g', estado: 'pausado' },
  ]
  const r = rutinas(agentes)
  assert.equal(r.a.tipo, 'rutina')
  assert.equal(r.a.descanso.id, DESCANSOS[0].id)
  assert.equal(r.d.descanso.id, DESCANSOS[1].id)
  assert.equal(r.b.tipo, 'escritorio')
  assert.equal(r.e.tipo, 'escritorio')
  assert.deepEqual(r.c.puf, PUFS[0])
  assert.deepEqual(r.f.puf, PUFS[1])
  assert.equal(r.g.puf, null)
})

test('dos agentes con el mismo lugar de descanso salen en medio ciclo distinto', () => {
  const agentes = Array.from({ length: DESCANSOS.length + 1 }, (_, i) => ({ id: `x${i}`, estado: 'libre' }))
  const r = rutinas(agentes)
  const primero = r.x0
  const otro = r[`x${DESCANSOS.length}`]
  assert.equal(otro.descanso.id, primero.descanso.id)
  assert.equal(otro.retraso - primero.retraso, CICLO_S / 2)
})

test('los dos de ping pong juegan a la vez', () => {
  const [p1, p2] = DESCANSOS.filter(d => d.objeto === 'paleta')
  assert.equal(p1.tanda, p2.tanda)
})

test('retraso de la animación: negativo y dentro del ciclo', () => {
  const d = retrasoAnimacion(5, 1_000_000)
  assert.ok(d <= 0 && d > -CICLO_S)
  assert.equal(retrasoAnimacion(0, 48_000), 0)
})

test('variante fija por agente y reloj de Buenos Aires', () => {
  assert.deepEqual(variante('up:redactor'), variante('up:redactor'))
  const v = variante('trabajadores:maria')
  assert.ok(v.pelo < 4 && v.colorPelo < 5 && v.piel < 3)
  assert.deepEqual(agujas(Date.parse('2026-11-11T18:30:00Z')), { hora: 105, minuto: 180 })
  assert.deepEqual(iso(1, 1, 0, 10), { x: 0, y: 10 })
})
