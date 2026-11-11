import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PISO, ZONAS, PASILLO, FONDO_OFICINAS, oficinasFondo, oficinasIzquierda, mesaUp, lugares, DESCANSOS, PUFS, rutinas,
  camino, largo, puntoEn, momentoRutina, VELOCIDAD, TIEMPOS, variante, agujas, CICLO_REFERENCIA,
} from './oficinaPlano.mjs'

const enPiso = p => p.x > 0 && p.x < PISO.ancho && p.y > 0 && p.y < PISO.fondo
const dentro = (p, z) => p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1

test('cada trabajador tiene su oficina en el fondo, sin pisarse', () => {
  const ofs = oficinasFondo(9)
  assert.equal(ofs.length, 9)
  for (let i = 1; i < ofs.length; i++) assert.ok(ofs[i].x0 >= ofs[i - 1].x1 - 1e-9)
  for (const o of ofs) {
    assert.ok(o.x0 >= 0 && o.x1 <= PISO.ancho)
    assert.ok(o.escritorio.x - 0.82 > o.x0 && o.escritorio.x + 0.82 < o.x1)
    assert.ok(o.puerta.x - 0.5 > o.escritorio.x + 0.82 && o.puerta.x + 0.5 <= o.x1 + 1e-9, 'la puerta no choca con el escritorio')
    assert.equal(o.puerta.y, FONDO_OFICINAS)
  }
})

test('la jefa tiene la mejor oficina: la del rincón y del doble de ancho', () => {
  const ofs = oficinasFondo(9, 5)
  const jefa = ofs[5]
  assert.ok(jefa.jefa)
  assert.ok(Math.abs(jefa.x1 - PISO.ancho) < 1e-9, 'es la del rincón')
  const comun = ofs[0].x1 - ofs[0].x0
  assert.ok(Math.abs(jefa.x1 - jefa.x0 - comun * 2) < 1e-9)
  assert.ok(jefa.puerta.x - 0.5 >= jefa.x0 && jefa.puerta.x + 0.5 < jefa.escritorio.x - 0.82, 'la puerta no choca con el escritorio')
  for (let i = 0; i < 9; i++) if (i !== 5) assert.ok(!ofs[i].jefa && ofs[i].x1 <= jefa.x0 + 1e-9)
})

test('cada comercial de PDG tiene su oficina a la izquierda', () => {
  const ofs = oficinasIzquierda(5)
  assert.equal(ofs.length, 5)
  assert.ok(ofs.at(-1).y1 <= PISO.fondo + 1e-9)
  for (const o of ofs) assert.ok(o.escritorio.y - 0.82 > o.y0 && o.puerta.y + 0.5 <= o.y1 + 1e-9)
})

test('UP comparte un tablón: enfrentados de a pares y uno en la cabecera, dentro de su zona', () => {
  const { mesa, asientos } = mesaUp(7)
  assert.equal(asientos.length, 7)
  assert.equal(asientos.filter(a => a.mira === 0).length, 3)
  assert.equal(asientos.filter(a => a.mira === Math.PI).length, 3)
  assert.ok(asientos.at(-1).cabecera)
  assert.equal(asientos[0].sentado.x, asientos[1].sentado.x, 'el primer par queda enfrentado')
  assert.ok(mesa.x1 + 1.5 < ZONAS.up.x1)
  for (const a of asientos) assert.ok(dentro(a.sentado, ZONAS.up))
  assert.equal(lugares('up', 7).length, 7)
})

test('los descansos están en sus zonas y los de ping pong juegan juntos', () => {
  for (const d of DESCANSOS) assert.ok(dentro(d, ZONAS[d.zona]), d.id)
  const [p1, p2] = DESCANSOS.filter(d => d.objeto === 'paleta')
  assert.equal(p1.tanda, p2.tanda)
  for (const p of PUFS) assert.ok(dentro(p, ZONAS.ocio))
})

test('rutinas: libres salen de descanso, pausados duermen, el resto se queda en su lugar', () => {
  const r = rutinas([{ id: 'a', estado: 'libre' }, { id: 'b', estado: 'trabajando' }, { id: 'c', estado: 'pausado' }, { id: 'd', estado: 'error' }])
  assert.equal(r.a.tipo, 'rutina')
  assert.equal(r.a.descanso.id, DESCANSOS[0].id)
  assert.equal(r.b.tipo, 'escritorio')
  assert.equal(r.d.tipo, 'escritorio')
  assert.deepEqual(r.c.puf, PUFS[0])
  const muchos = rutinas(Array.from({ length: DESCANSOS.length + 1 }, (_, i) => ({ id: `x${i}`, estado: 'libre' })))
  assert.equal(muchos[`x${DESCANSOS.length}`].retraso - muchos.x0.retraso, CICLO_REFERENCIA / 2)
})

test('caminos: de cada lugar a cada descanso, siempre por el piso y pasando por el pasillo del medio', () => {
  const todos = [...lugares('trabajadores', 9), ...lugares('pdg', 5), ...lugares('up', 7)]
  for (const l of todos) for (const d of DESCANSOS) {
    const c = camino(l, d)
    assert.deepEqual(c[0], l.sentado)
    assert.deepEqual(c.at(-1), { x: d.x, y: d.y })
    assert.ok(c.some(p => p.y === PASILLO))
    for (const p of c) assert.ok(enPiso(p), JSON.stringify(p))
    // Solo tramos rectos (horizontales o verticales): así se caminan por los pasillos.
    for (let i = 1; i < c.length; i++) assert.ok(c[i].x === c[i - 1].x || c[i].y === c[i - 1].y, `${d.id} ${JSON.stringify([c[i - 1], c[i]])}`)
  }
})

test('las oficinas se salen por la puerta', () => {
  const o = oficinasFondo(9)[3]
  assert.ok(camino(o, DESCANSOS[0]).some(p => p.x === o.puerta.x && p.y === o.puerta.y))
  const p = oficinasIzquierda(5)[2]
  assert.ok(camino(p, DESCANSOS[0]).some(q => q.x === p.puerta.x && q.y === p.puerta.y))
})

test('punto en el camino y momento de la rutina', () => {
  const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]
  assert.equal(largo(pts), 7)
  assert.deepEqual(puntoEn(pts, 5), { x: 3, y: 2, dx: 0, dy: 1 })
  assert.deepEqual(puntoEn(pts, 99), { x: 3, y: 4, dx: 0, dy: 1 })
  const ida = 7 / VELOCIDAD
  assert.equal(momentoRutina(1, 7).fase, 'sentado')
  assert.equal(momentoRutina(TIEMPOS.sentado + ida / 2, 7).fase, 'yendo')
  assert.equal(momentoRutina(TIEMPOS.sentado + ida + 1, 7).fase, 'descanso')
  const vuelta = momentoRutina(TIEMPOS.sentado + ida + TIEMPOS.descanso + ida / 2, 7)
  assert.equal(vuelta.fase, 'volviendo')
  assert.ok(Math.abs(vuelta.d - 3.5) < 1e-9)
})

test('variante fija por agente y reloj de Buenos Aires', () => {
  assert.deepEqual(variante('up:redactor'), variante('up:redactor'))
  const v = variante('trabajadores:maria')
  assert.ok(v.pelo < 4 && v.colorPelo < 5 && v.piel < 3)
  assert.deepEqual(agujas(Date.parse('2026-11-11T18:30:00Z')), { hora: 105, minuto: 180 })
})
