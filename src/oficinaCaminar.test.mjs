import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obstaculos, grilla, buscarCamino, esLibre, libreCercano, CELDA } from './oficinaCaminar.mjs'
import { lugares, DANIELA, DESCANSOS, ZONAS, DIRECCION, DIVISOR, PUERTA_REUNION, asientosEspera } from './oficinaPlano.mjs'

const REALES = ['tareas_estancadas', 'opera', 'canillita', 'agenda_valentina', 'scraper_empleo', 'maria', 'google_sync', 'monitor_sitios', 'buscador_eventos']
const ADMIN = ['search_console', 'resumen_diario', 'agenda_dulce', 'historial_up', 'limpieza']
const todos = [...lugares('trabajadores', REALES), ...lugares('up', ['a', 'b', 'c', 'd', 'e', 'f', 'g']), ...lugares('pdg', ['a', 'b', 'c', 'd', 'e']), ...lugares('admin', ADMIN)]
const g = grilla(obstaculos(todos, 7, 5, 5))

// Recorre el camino a pasitos y verifica que nunca pise algo ocupado.
function caminable(pts) {
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    const n = Math.ceil(d / (CELDA / 3))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      if (!esLibre(g, { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t })) return false
    }
  }
  return true
}
const salida = { x: DANIELA.sentado.x + 1.7, y: DANIELA.sentado.y } // al costado de su silla, por donde se levanta

test('Daniela puede ir de su oficina a cada zona sin atravesar nada', () => {
  for (const [nombre, z] of Object.entries(ZONAS)) {
    if (nombre === 'reuniones') continue
    const destino = { x: (z.x0 + z.x1) / 2, y: z.y1 - 0.4 }
    const c = buscarCamino(g, salida, destino)
    assert.ok(c, nombre)
    assert.ok(caminable(c), `${nombre}: ${JSON.stringify(c)}`)
  }
})

test('entra a la sala de reuniones por su puerta y a cada oficina por la suya', () => {
  const sala = buscarCamino(g, salida, { x: PUERTA_REUNION.x - 0.8, y: PUERTA_REUNION.y })
  assert.ok(sala && caminable(sala))
  const oficinas = new Map(todos.filter(l => l.oficina).map(l => [l.oficina.id, l.oficina]))
  for (const o of oficinas.values()) {
    const c = buscarCamino(g, salida, { x: o.puerta.x, y: o.y1 - 0.6 })
    assert.ok(c && caminable(c), o.id)
  }
})

test('no atraviesa la mampara: pasa por su paso o por el pasillo del costado', () => {
  const c = buscarCamino(g, salida, { x: 20, y: 25.5 })
  assert.ok(c && caminable(c))
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i]
    if (Math.min(a.y, b.y) < DIVISOR.y && Math.max(a.y, b.y) > DIVISOR.y) {
      const x = a.x + ((DIVISOR.y - a.y) / (b.y - a.y)) * (b.x - a.x)
      // Por el paso del medio, o por el pasillo vertical del costado (donde la mampara ya no llega).
      assert.ok((x >= DIVISOR.hueco[0] && x <= DIVISOR.hueco[1]) || x < DIVISOR.x0, `cruza en x = ${x}`)
    }
  }
})

test('un doble click sobre un mueble lleva al lugar libre más cercano', () => {
  const mesa = { x: 10.5, y: 3.8 } // la mesa de ping pong
  assert.equal(esLibre(g, mesa), false)
  const p = libreCercano(g, mesa)
  assert.ok(p && esLibre(g, p))
  assert.ok(Math.hypot(p.x - mesa.x, p.y - mesa.y) < 2)
  const c = buscarCamino(g, salida, mesa)
  assert.ok(c && caminable(c))
})

test('los descansos y la espera son alcanzables, y vuelve a su oficina', () => {
  for (const d of DESCANSOS) assert.ok(buscarCamino(g, salida, d), d.id)
  for (const a of asientosEspera()) assert.ok(buscarCamino(g, salida, a))
  const vuelta = buscarCamino(g, { x: 20, y: 13.75 }, salida)
  assert.ok(vuelta && caminable(vuelta))
  assert.ok(vuelta.at(-1).x > DIRECCION.x0 && vuelta.at(-1).y < DIRECCION.y1, 'vuelve adentro de su oficina')
})

test('de su oficina al centro sale por el pasillo junto a la sala de espera (sin dar la vuelta entera)', async () => {
  const { largo } = await import('./oficinaPlano.mjs')
  const c = buscarCamino(g, salida, { x: 30, y: 18 })
  assert.ok(c && caminable(c))
  assert.ok(largo(c) < 30, `largo ${largo(c)}`)
})
