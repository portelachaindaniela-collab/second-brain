import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIENZO, disposicion, trazo, estadoTrabajador, pasaFiltro, contarFiltros, coincideBusqueda, focoDe } from './orbital.mjs'

const trabajadores = [
  { clave: 'buscador_eventos', nombre: 'Buscador de eventos', color: 'rosa', activo: true },
  { clave: 'google_sync', nombre: 'Google (calendario y mail)', color: 'azul', activo: true, minutos_trabado: 5 },
  { clave: 'maria', nombre: 'María', color: 'violeta', activo: true },
  { clave: 'scraper_empleo', nombre: 'Scraper de empleo', color: 'ambar', activo: false },
]
const d = disposicion(trabajadores)
const nodo = id => d.nodos.find(n => n.id === id)

test('cada trabajador en su órbita, fuentes a la izquierda y destinos a la derecha', () => {
  const radios = d.orbitas.map(o => o.rx)
  assert.equal(new Set(radios).size, 4, 'órbitas distintas')
  assert.ok(radios.every((r, i) => i === 0 || r > radios[i - 1]))
  assert.ok(d.nodos.filter(n => n.tipo === 'fuente').every(n => n.x < LIENZO.cx))
  assert.ok(d.nodos.filter(n => n.tipo === 'destino').every(n => n.x > LIENZO.cx))
  assert.ok(nodo('d:trabajos_corridas').registro)
})

test('todo entra en el lienzo, tarjetas incluidas', () => {
  const { ancho, alto } = LIENZO.tarjeta
  for (const n of d.nodos) {
    const [mx, my] = n.tipo === 'trabajador' ? [LIENZO.nodo, LIENZO.nodo] : [ancho / 2, alto / 2]
    assert.ok(n.x - mx >= 0 && n.x + mx <= LIENZO.ancho, `${n.id} x`)
    assert.ok(n.y - my >= 0 && n.y + my <= LIENZO.alto, `${n.id} y`)
  }
})

test('el sistema gira, y el elegido pasa al frente (arriba de su órbita)', () => {
  const girado = disposicion(trabajadores, { rotacion: 30 })
  assert.equal(girado.nodos[0].angulo, d.nodos[0].angulo + 30)
  const conElegido = disposicion(trabajadores, { rotacion: 30, elegido: 'google_sync' })
  const g = conElegido.nodos.find(n => n.clave === 'google_sync')
  assert.equal(g.angulo, -90)
  assert.ok(Math.abs(g.x - LIENZO.cx) < 0.001 && g.y < LIENZO.cy)
})

test('enlaces: fuente → trabajador → destinos, y todos al registro', () => {
  const deGoogle = d.enlaces.filter(e => e.clave === 'google_sync').map(e => e.id)
  assert.deepEqual(deGoogle, ['f:google>t:google_sync', 't:google_sync>d:calendar_events', 't:google_sync>d:emails', 't:google_sync>d:trabajos_corridas'])
  assert.match(trazo(nodo('f:google'), nodo('t:google_sync')), /^M[\d.]+ [\d.]+ C/)
})

test('estado de un trabajador', () => {
  const ahora = Date.parse('2026-10-01T12:00:00Z')
  const t = trabajadores[1]
  assert.equal(estadoTrabajador(t, [{ estado: 'ok', iniciado_at: '2026-10-01T11:50:00Z' }], ahora), 'ok')
  assert.equal(estadoTrabajador(t, [{ estado: 'corriendo', iniciado_at: '2026-10-01T11:59:00Z' }], ahora), 'corriendo')
  assert.equal(estadoTrabajador(t, [{ estado: 'corriendo', iniciado_at: '2026-10-01T11:00:00Z' }], ahora), 'trabado')
  assert.equal(estadoTrabajador(t, [{ estado: 'corriendo', iniciado_at: '2026-10-01T11:59:00Z' }, { estado: 'error' }], ahora), 'corriendo')
  assert.equal(estadoTrabajador(t, [{ estado: 'error', iniciado_at: '2026-10-01T11:50:00Z' }], ahora), 'error')
  assert.equal(estadoTrabajador(trabajadores[3], [], ahora), 'pausado')
  assert.equal(estadoTrabajador(t, [], ahora), 'sin_corridas')
})

test('filtros y sus cantidades', () => {
  const estados = ['ok', 'error', 'pausado', 'trabado', 'corriendo']
  assert.deepEqual(contarFiltros(estados), { todos: 5, activos: 4, pausados: 1, errores: 2 })
  assert.equal(pasaFiltro('pausado', 'activos'), false)
})

test('búsqueda por trabajador, fuente o destino, sin tildes', () => {
  assert.equal(coincideBusqueda('google_sync', 'emails', d), true)
  assert.equal(coincideBusqueda('maria', 'maria', d), true)
  assert.equal(coincideBusqueda('maria', 'eventbrite', d), false)
  assert.equal(coincideBusqueda('buscador_eventos', 'EVENTBRITE', d), true)
  assert.equal(coincideBusqueda('maria', '  ', d), true)
})

test('foco: el trabajador, sus enlaces y sus puntas', () => {
  const f = focoDe('google_sync', d)
  assert.deepEqual([...f.nodos].sort(), ['d:calendar_events', 'd:emails', 'd:trabajos_corridas', 'f:google', 't:google_sync'])
  assert.equal(f.enlaces.size, 4)
  assert.equal(focoDe(null, d), null)
})
