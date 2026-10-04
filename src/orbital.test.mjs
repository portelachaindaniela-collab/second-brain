import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIENZO, LIENZO_VERTICAL, ETIQUETA, disposicion, trazo, estadoTrabajador, pasaFiltro, contarFiltros, coincideBusqueda, focoDe, ubicarEtiquetas, anchoTexto } from './orbital.mjs'

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

const choca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const cajaTarjeta = (n, L) => ({ x: n.x - L.tarjeta.ancho / 2, y: n.y - L.tarjeta.alto / 2, w: L.tarjeta.ancho, h: L.tarjeta.alto })

for (const vertical of [false, true]) {
  const nombre = vertical ? 'celular' : 'compu'
  test(`${nombre}: todo entra en el lienzo, tarjetas incluidas, sin pisarse`, () => {
    for (let giro = 0; giro < 360; giro += 15) {
      const dd = disposicion(trabajadores, { rotacion: giro, vertical })
      const L = dd.lienzo
      for (const n of dd.nodos) {
        const [mx, my] = n.tipo === 'trabajador' ? [L.nodo, L.nodo] : [L.tarjeta.ancho / 2, L.tarjeta.alto / 2]
        assert.ok(n.x - mx >= 0 && n.x + mx <= L.ancho, `${n.id} x`)
        assert.ok(n.y - my >= 0 && n.y + my <= L.alto, `${n.id} y`)
      }
      const tarjetas = dd.nodos.filter(n => n.tipo !== 'trabajador').map(n => cajaTarjeta(n, L))
      for (let i = 0; i < tarjetas.length; i++) for (let j = i + 1; j < tarjetas.length; j++) assert.ok(!choca(tarjetas[i], tarjetas[j]), 'tarjetas pisadas')
      for (const n of dd.nodos.filter(x => x.tipo === 'trabajador')) {
        const circulo = { x: n.x - L.nodo, y: n.y - L.nodo, w: L.nodo * 2, h: L.nodo * 2 }
        assert.ok(tarjetas.every(t => !choca(t, circulo)), `giro ${giro}: ${n.id} pisa una tarjeta`)
      }
    }
  })

  test(`${nombre}: etiquetas sin pisarse entre ellas, ni el núcleo, y sin salirse por los costados, en cualquier giro`, () => {
    for (let giro = 0; giro < 360; giro += 7) {
      for (const elegido of [null, 'google_sync']) {
        const dd = disposicion(trabajadores, { rotacion: giro, vertical, elegido })
        const L = dd.lienzo
        const ws = dd.nodos.filter(n => n.tipo === 'trabajador').sort((a, b) => (b.clave === elegido) - (a.clave === elegido))
        const etiquetas = ws.map(n => ({ id: n.id, x: n.x, y: n.y, w: Math.max(anchoTexto(n.etiqueta, 14), anchoTexto('hace 51 min · vuelve en 22 h', 12)) + 18, arriba: n.y < L.cy - 4 }))
        const lugar = ubicarEtiquetas(etiquetas, dd.nodos, L)
        const cajas = etiquetas.map(e => ({ x: lugar[e.id].x - e.w / 2, y: lugar[e.id].y, w: e.w, h: ETIQUETA.alto }))
        for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) assert.ok(!choca(cajas[i], cajas[j]), `giro ${giro}: ${etiquetas[i].id} pisa ${etiquetas[j].id}`)
        const nucleo = { x: L.cx - L.nucleo, y: L.cy - L.nucleo, w: L.nucleo * 2, h: L.nucleo * 2 }
        assert.ok(cajas.every(c => !choca(c, nucleo)), `giro ${giro}: una etiqueta pisa el núcleo`)
        assert.ok(cajas.every(c => c.x >= 0 && c.x + c.w <= L.ancho && c.y >= 0 && c.y + c.h <= L.alto), `giro ${giro}: una etiqueta se sale del lienzo`)
        // La pastilla siempre queda encima o debajo de su nodo, para que se lea de quién es.
        assert.ok(etiquetas.every(e => Math.abs(lugar[e.id].x - e.x) <= e.w / 2 - L.nodo), `giro ${giro}: una etiqueta quedó lejos de su nodo`)
      }
    }
  })
}

test('celular: fuentes arriba, destinos abajo, en dos columnas que entran en 340', () => {
  const dv = disposicion(trabajadores, { vertical: true })
  const L = dv.lienzo
  assert.equal(L.ancho, LIENZO_VERTICAL.ancho)
  const ws = dv.nodos.filter(n => n.tipo === 'trabajador')
  assert.ok(dv.nodos.filter(n => n.tipo === 'fuente').every(f => ws.every(w => f.y < w.y)))
  assert.ok(dv.nodos.filter(n => n.tipo === 'destino').every(t => ws.every(w => t.y > w.y)))
  assert.match(trazo(dv.nodos.find(n => n.id === 'f:google'), dv.nodos.find(n => n.id === 't:google_sync'), L), /^M[\d.]+ [\d.]+ C/)
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
  assert.equal(coincideBusqueda('google_sync', 'mail', d), true)
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

test('el núcleo tiene lugar para su texto y ningún trabajador lo toca', () => {
  // "SECOND BRAIN" en 10px con .12em de espacio entre letras: entra en la cuerda del círculo a esa altura.
  const anchoTitulo = 'SECOND BRAIN'.length * 10 * (0.62 + 0.12)
  const cuerda = y => 2 * Math.sqrt(LIENZO.nucleo ** 2 - y ** 2)
  assert.ok(anchoTitulo + 8 < cuerda(-10), `el título (${anchoTitulo}) no entra en ${cuerda(-10)}`)
  for (const vertical of [false, true]) for (let giro = 0; giro < 360; giro += 5) {
    const dd = disposicion(trabajadores, { rotacion: giro, vertical })
    for (const n of dd.nodos.filter(x => x.tipo === 'trabajador')) {
      const distancia = Math.hypot(n.x - dd.lienzo.cx, n.y - dd.lienzo.cy)
      assert.ok(distancia - dd.lienzo.nodo > dd.lienzo.nucleo + 4, `giro ${giro}: ${n.id} toca el núcleo`)
    }
  }
})
