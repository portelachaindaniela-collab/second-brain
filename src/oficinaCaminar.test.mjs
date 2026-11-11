import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obstaculos, grilla, buscarCamino, esLibre, libreCercano, CELDA } from './oficinaCaminar.mjs'
import { lugares, DANIELA, VISITA, DESCANSOS, ZONAS, DIRECCION, asientosEspera } from './oficinaPlano.mjs'

const REALES = ['tareas_estancadas', 'opera', 'canillita', 'agenda_valentina', 'scraper_empleo', 'maria', 'google_sync', 'monitor_sitios', 'buscador_eventos']
const todos = [...lugares('trabajadores', REALES), ...lugares('pdg', ['a', 'b', 'c', 'd', 'e']), ...lugares('up', ['a', 'b', 'c', 'd', 'e', 'f', 'g'])]
const g = grilla(obstaculos(todos, 7, 5))

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
const salida = { x: VISITA.x, y: VISITA.y + 0.9 } // al lado de su escritorio, del lado de la puerta

test('Daniela puede ir de su oficina a cada zona sin atravesar nada', () => {
  for (const [nombre, z] of Object.entries(ZONAS)) {
    if (nombre === 'reuniones') continue
    const destino = { x: (z.x0 + z.x1) / 2, y: z.y1 - 0.6 }
    const c = buscarCamino(g, salida, destino)
    assert.ok(c, nombre)
    assert.ok(caminable(c), `${nombre}: ${JSON.stringify(c)}`)
  }
})

test('entra a la sala de reuniones por la puerta y a cada oficina por la suya', () => {
  const c = buscarCamino(g, salida, { x: 24.6, y: 11.6 }) // adentro de la sala, del lado de la pantalla
  assert.ok(c && caminable(c))
  assert.ok(c.some((p, i) => i > 0 && Math.min(c[i - 1].y, p.y) <= 13 && Math.max(c[i - 1].y, p.y) >= 13), 'cruza el frente de la sala')
  for (const l of todos.filter(x => x.oficina)) {
    const dentro = { x: l.puerta.x, y: 3.9 }
    const camino = buscarCamino(g, salida, dentro)
    assert.ok(camino && caminable(camino), l.oficina.id)
  }
})

test('un doble click sobre un mueble lleva al lugar libre más cercano', () => {
  const mesa = { x: 31.7, y: 17.8 } // la mesa de ping pong
  assert.equal(esLibre(g, mesa), false)
  const p = libreCercano(g, mesa)
  assert.ok(p && esLibre(g, p))
  assert.ok(Math.hypot(p.x - mesa.x, p.y - mesa.y) < 2)
  const c = buscarCamino(g, salida, mesa)
  assert.ok(c && caminable(c))
})

test('los lugares de descanso, la espera y su escritorio son alcanzables', () => {
  for (const d of DESCANSOS) assert.ok(buscarCamino(g, salida, d), d.id)
  for (const a of asientosEspera()) assert.ok(buscarCamino(g, salida, a))
  const vuelta = buscarCamino(g, { x: 14, y: 13.75 }, salida)
  assert.ok(vuelta && caminable(vuelta))
  assert.ok(vuelta.at(-1).x > DIRECCION.x0 && vuelta.at(-1).y < DIRECCION.y1, 'vuelve adentro de su oficina')
  assert.ok(DANIELA.sentado.y < DANIELA.escritorio.y)
})
