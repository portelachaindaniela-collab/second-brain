import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAST, DANI, person } from './oficina2d/dibujo.mjs'
import { PERSONAJES, personajeDe, figuraDe, variacion } from './oficina2d/elenco.mjs'
import { armarEscena, dibujarEscena, dibujarReunion, poseDe, muestra, ALTO_FILA } from './oficina2d/escena.mjs'
import { vozDe } from './oficina2d/reunion.mjs'

const ag = (n, estado, pre = 'up:a') => Array.from({ length: n }, (_, i) => ({ id: `${pre}${estado}${i}`, nombre: `Agente ${i}`, estado }))

test('el estado real de cada agente lleva a su pose', () => {
  assert.equal(poseDe('trabajando'), 'work')
  assert.equal(poseDe('error'), 'problem')
  assert.equal(poseDe('libre'), 'break')
  assert.equal(poseDe('nuevo'), 'break')
  assert.equal(poseDe('pausado'), 'sleep')
})

test('cada agente es siempre la misma persona: 8 personajes, variaciones y uno estable para los nuevos', () => {
  assert.equal(CAST.length, 8)
  assert.equal(DANI.glasses, 'square')
  const usados = Object.values(PERSONAJES).map(([b, v]) => `${b}-${v}`)
  assert.equal(new Set(usados).size, usados.length, 'nadie repite personaje')
  assert.deepEqual(figuraDe('trabajadores:maria'), figuraDe('trabajadores:maria'))
  assert.deepEqual(personajeDe('up:nuevo_agente'), personajeDe('up:nuevo_agente'))
  assert.ok(CAST.some(c => c.id === personajeDe('up:nuevo_agente')[0]))
  assert.deepEqual(variacion('c2', 0), CAST[1], 'la variación 0 es el personaje tal cual')
  assert.notEqual(variacion('c2', 3).bc + variacion('c2', 3).hc, CAST[1].bc + CAST[1].hc)
  assert.equal(figuraDe('dani').l1, 'Daniela')
})

test('cada agente va a la zona de su estado: escritorio, café o sillón', () => {
  const e = armarEscena([...ag(2, 'trabajando'), ...ag(1, 'error'), ...ag(3, 'libre'), ...ag(3, 'pausado')])
  assert.equal(e.filas.length, 1)
  assert.equal(e.filas[0].escritorios.length, 3, 'un escritorio por agente trabajando o con un problema')
  assert.equal(e.filas[0].cafe.length, 3)
  assert.equal(e.filas[0].sillones.length, 2, 'si no entran en un sillón, se suma otro')
  assert.deepEqual(e.filas[0].sillones.map(s => s.gente.length), [2, 1])
  assert.ok(e.filas[0].escritorios.every(d => d.dx >= 110), 'los escritorios empiezan después de vos')
  assert.ok(e.xCafe < e.xDescanso && e.xDescanso < e.ancho)
})

test('la escena crece con los agentes y pasa a varias filas si no entra a lo ancho', () => {
  const chica = armarEscena(ag(2, 'trabajando'))
  const grande = armarEscena(ag(7, 'trabajando'))
  assert.ok(grande.ancho > chica.ancho)
  const filas = armarEscena([...ag(20, 'trabajando'), ...ag(12, 'libre'), ...ag(9, 'pausado')])
  assert.equal(filas.filas.length, 3)
  assert.equal(filas.alto, 3 * ALTO_FILA)
  assert.equal(filas.filas.reduce((n, f) => n + f.escritorios.length, 0), 20, 'nadie se pierde al repartir')
  assert.ok(filas.filas.every(f => f.escritorios.length <= 8))
})

test('si te vas de la oficina no aparecés; quien te visita está al lado tuyo y no en su zona', () => {
  const lista = ag(2, 'trabajando')
  assert.equal(armarEscena(lista, { conDani: false }).dani, null)
  const e = armarEscena(lista, { visitas: [lista[0].id] })
  assert.deepEqual(e.dani.visitas.map(v => v.id), [lista[0].id])
  assert.equal(e.filas[0].escritorios.length, 1)
})

test('el dibujo: sin <use> ni <defs>, con las tres zonas, los colores del diseño y cada agente tocable', () => {
  const lista = [{ id: 'trabajadores:maria', nombre: 'María', estado: 'trabajando' }, { id: 'up:noruega', nombre: 'Noruega (madre)', estado: 'error' }, { id: 'pdg:femina', nombre: 'Femina', estado: 'libre' }, { id: 'up:redactor', nombre: 'Redactor', estado: 'pausado' }]
  const svg = dibujarEscena(armarEscena(lista), { elegidoId: 'pdg:femina' })
  assert.doesNotMatch(svg, /<use|<defs/)
  for (const t of ['TRABAJO', 'CAFÉ', 'DESCANSO', '#f4f3ef', '#e8e5df', '#3fae6e', '#e05252', '#e8973a', '#8a84a8', '#d9c4a5', '#cdd5cc']) assert.ok(svg.includes(t), t)
  for (const a of lista) assert.ok(svg.includes(`data-agente="${a.id}"`), a.id)
  assert.match(svg, />Noruega<\/tspan>/, 'el nombre va sin lo que está entre paréntesis')
  assert.match(svg, /class="of2d-agente is-elegido" data-agente="pdg:femina"/)
  assert.match(svg, />Vos</)
})

test('los personajes tienen sus rasgos: lentes cuadrados y cadenita en Daniela', () => {
  const d = person(DANI, 'stand')
  assert.match(d, /<rect x="-11" y="-174.5" width="10" height="8.5"/)
  assert.match(d, /stroke="#b9bec4"/)
  assert.match(person(CAST[6], 'stand'), /<circle cx="-6" cy="-170" r="4.6"/, 'lentes redondos')
})

test('la reunión y la leyenda usan los mismos dibujos', () => {
  const r = dibujarReunion([{ id: 'up:noruega', nombre: 'Noruega' }, { id: 'pdg:femina', nombre: 'Femina' }], 'pdg:femina')
  assert.ok(r.ancho > 300)
  assert.match(r.svg, /data-agente="pdg:femina"/)
  for (const p of ['work', 'problem', 'break', 'sleep']) assert.match(muestra(p).svg, /<g stroke="#2b2b2b"/)
})

test('la voz de cada agente en las reuniones es fija', () => {
  assert.deepEqual(vozDe('up:noruega'), vozDe('up:noruega'))
  assert.ok(vozDe('up:noruega').tono >= 0.8 && vozDe('up:noruega').tono <= 1.28)
})

test('los nombres largos van en dos renglones para no pisarse', async () => {
  const { renglones } = await import('./oficina2d/escena.mjs')
  assert.deepEqual(renglones('María'), ['María'])
  assert.deepEqual(renglones('Agenda de Valentina'), ['Agenda de', 'Valentina'])
  assert.deepEqual(renglones('Google (calendario y mail)'), ['Google'])
  assert.ok(renglones('Unnombremuylargosinespacios').every(l => l.length <= 14))
})
