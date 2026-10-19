import test from 'node:test'
import assert from 'node:assert/strict'
import { tipoEvento, proximoEvento, cuandoFalta } from './calendarioMes.mjs'
import { MARCA_COMUNIDAD } from './comunidadEventos.mjs'

test('tipoEvento distingue Comunidad, feriados, el calendario propio y los demás', () => {
  assert.equal(tipoEvento({ calendar_id: 'primary', description: MARCA_COMUNIDAD }), 'comunidad')
  assert.equal(tipoEvento({ calendar_id: 'es.ar#holiday@group.v.calendar.google.com' }), 'feriado')
  assert.equal(tipoEvento({ calendar_id: 'primary' }), 'principal')
  assert.equal(tipoEvento({ calendar_id: null }), 'principal')
  assert.equal(tipoEvento({ calendar_id: 'abc@group.calendar.google.com' }), 'otro')
})

const ahora = new Date(2026, 9, 19, 8, 20)
const d = (dia, h, m = 0) => new Date(2026, 9, dia, h, m).toISOString()

test('proximoEvento salta lo que ya terminó y toma el que está en curso', () => {
  const eventos = [
    { id: 1, starts_at: d(19, 7), ends_at: d(19, 8), all_day: false },
    { id: 2, starts_at: d(19, 8), ends_at: d(19, 9), all_day: false },
    { id: 3, starts_at: d(19, 10), ends_at: d(19, 11), all_day: false },
  ]
  assert.equal(proximoEvento(eventos, ahora).id, 2)
})

test('proximoEvento cae en uno de todo el día si no hay con hora', () => {
  const eventos = [{ id: 1, starts_at: '2026-10-18T00:00:00+00:00', all_day: true }, { id: 2, starts_at: '2026-10-21T00:00:00+00:00', all_day: true }]
  assert.equal(proximoEvento(eventos, ahora).id, 2)
  assert.equal(proximoEvento([], ahora), null)
})

test('cuandoFalta en minutos, horas, mañana o día', () => {
  assert.equal(cuandoFalta({ starts_at: d(19, 10), all_day: false }, ahora), 'en 1 h 40 min')
  assert.equal(cuandoFalta({ starts_at: d(19, 8, 50), all_day: false }, ahora), 'en 30 min')
  assert.equal(cuandoFalta({ starts_at: d(19, 8), all_day: false }, ahora), 'ahora')
  assert.equal(cuandoFalta({ starts_at: d(20, 9), all_day: false }, ahora), 'mañana')
  assert.equal(cuandoFalta({ starts_at: '2026-10-19T00:00:00+00:00', all_day: true }, ahora), 'hoy')
})

import { calendarioDe, leyendaCalendarios, colorLegible, contraste } from './calendarioMes.mjs'

const calendarios = new Map([
  ['primary', { nombre: 'Daniela', color: '#9fe1e7' }],
  ['abc@group.calendar.google.com', { nombre: 'Salud', color: '#16a765' }],
  ['es.ar#holiday@group.v.calendar.google.com', { nombre: 'Feriados en Argentina', color: '#0b8043' }],
])

test('colorLegible aclara los colores oscuros y deja los claros', () => {
  assert.equal(colorLegible('#9fe1e7'), '#9fe1e7')
  const oscuro = colorLegible('#3f51b5')
  assert.notEqual(oscuro, '#3f51b5')
  assert.ok(contraste(oscuro) >= 4.5)
  assert.ok(contraste(colorLegible('#000000')) >= 4.5)
  assert.equal(colorLegible(null), null)
  assert.equal(colorLegible('rojo'), null)
})

test('calendarioDe usa nombre y color reales, Comunidad aparte y respaldo genérico', () => {
  const salud = calendarioDe({ calendar_id: 'abc@group.calendar.google.com' }, calendarios)
  assert.equal(salud.nombre, 'Salud')
  assert.equal(salud.tipo, 'otro')
  assert.ok(contraste(salud.color) >= 4.5)
  assert.equal(calendarioDe({ calendar_id: null }, calendarios).nombre, 'Daniela')
  assert.deepEqual(calendarioDe({ calendar_id: 'primary', description: MARCA_COMUNIDAD }, calendarios), { clave: 'comunidad', tipo: 'comunidad', nombre: 'Comunidad', color: null })
  assert.deepEqual(calendarioDe({ calendar_id: 'nuevo@group.calendar.google.com' }, calendarios), { clave: 'otro', tipo: 'otro', nombre: 'Otros calendarios', color: null })
  assert.equal(calendarioDe({ calendar_id: 'primary' }).nombre, 'Tu calendario')
})

test('leyendaCalendarios: principal primero, feriados al final, Comunidad y desconocidos una vez', () => {
  const eventos = [{ calendar_id: 'x@group.calendar.google.com' }, { calendar_id: 'y@group.calendar.google.com' }]
  assert.deepEqual(leyendaCalendarios(calendarios, eventos).map(c => c.nombre), ['Daniela', 'Otros calendarios', 'Salud', 'Comunidad', 'Feriados en Argentina'])
  assert.deepEqual(leyendaCalendarios(new Map()).map(c => c.nombre), ['Tu calendario', 'Otros calendarios', 'Comunidad', 'Feriados'])
})

import { prepararCalendarios } from './calendarioMes.mjs'

test('prepararCalendarios: el principal con nombre de mail es "Tu calendario" y los colores repetidos se separan', () => {
  const listo = prepararCalendarios([
    { calendar_id: 'primary', nombre: 'dani@gmail.com', color: '#c2c2c2' },
    { calendar_id: 'test@group.calendar.google.com', nombre: 'Testing', color: '#c2c2c2' },
    { calendar_id: 'salud@group.calendar.google.com', nombre: 'Salud', color: '#16a765' },
    { calendar_id: 'es.ar#holiday@group.v.calendar.google.com', nombre: 'Festivos en Argentina', color: '#16a765' },
  ])
  const leyenda = leyendaCalendarios(listo)
  assert.deepEqual(leyenda.map(c => c.nombre), ['Tu calendario', 'Salud', 'Testing', 'Comunidad', 'Festivos en Argentina'])
  assert.equal(listo.get('primary').color, '#c2c2c2')
  assert.equal(listo.get('salud@group.calendar.google.com').color, '#16a765')
  const colores = leyenda.map(c => c.color)
  assert.equal(new Set(colores).size, colores.length)
  assert.ok(colores.every(c => contraste(c) >= 4.5))
  assert.equal(prepararCalendarios([]).size, 0)
})
