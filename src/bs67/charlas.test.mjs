import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tituloDe, agruparCharlas, filtrarCharlas, paraGuardar, historialDe, funcionDe, cuerpoPregunta, cuerpoAccion, MAX_MENSAJES_GUARDADOS } from './charlas.mjs'

test('el título es la primera pregunta, cortada en una palabra', () => {
  assert.equal(tituloDe([]), 'Charla nueva')
  assert.equal(tituloDe([{ rol: 'bot', texto: 'hola' }, { rol: 'user', texto: '  ¿Cómo  viene mi día? ' }]), '¿Cómo viene mi día?')
  const largo = tituloDe([{ rol: 'user', texto: 'Quiero armar el calendario de noviembre con tres publicaciones por semana y una campaña' }])
  assert.ok(largo.endsWith('…'))
  assert.ok(largo.length <= 61)
  assert.ok(!largo.includes('  '))
})

test('agrupa las charlas como un menú de chats', () => {
  const ahora = Date.parse('2026-10-12T15:00:00-03:00')
  const c = (id, iso) => ({ id, titulo: id, updated_at: iso })
  const grupos = agruparCharlas([
    c('vieja', '2026-09-20T10:00:00-03:00'), c('hoy', '2026-10-12T09:00:00-03:00'), c('ayer', '2026-10-11T23:00:00-03:00'),
    c('semana', '2026-10-08T10:00:00-03:00'), c('mes', '2026-10-02T10:00:00-03:00'), c('hoy2', '2026-10-12T14:00:00-03:00'),
  ], ahora)
  assert.deepEqual(grupos.map(g => [g.titulo, g.charlas.map(x => x.id)]), [
    ['Hoy', ['hoy2', 'hoy']], ['Ayer', ['ayer']], ['Últimos 7 días', ['semana']], ['Este mes', ['mes']], ['Antes', ['vieja']],
  ])
})

test('filtra por título sin importar tildes', () => {
  const charlas = [{ titulo: 'Campaña Olé Summit' }, { titulo: 'Mails de hoy' }]
  assert.deepEqual(filtrarCharlas(charlas, 'campana ole').map(c => c.titulo), ['Campaña Olé Summit'])
  assert.equal(filtrarCharlas(charlas, '  ').length, 2)
})

test('guarda sin estados a medias y con tope', () => {
  const m = [{ rol: 'bot', texto: 'a', propuesta: { descripcion: 'x' }, decision: 'confirmando' }, { rol: 'bot', texto: 'b', decision: 'confirmada' }]
  assert.deepEqual(paraGuardar(m), [{ rol: 'bot', texto: 'a', propuesta: { descripcion: 'x' } }, { rol: 'bot', texto: 'b', decision: 'confirmada' }])
  assert.equal(paraGuardar(Array.from({ length: 250 }, () => ({ rol: 'user', texto: 'x' }))).length, MAX_MENSAJES_GUARDADOS)
})

test('el historial cuenta qué pasó con cada propuesta', () => {
  const h = historialDe([{ rol: 'user', texto: 'agendá' }, { rol: 'bot', texto: '', propuesta: { descripcion: 'Agendar café' }, decision: 'cancelada' }, { rol: 'error', texto: 'falló' }])
  assert.deepEqual(h, [{ rol: 'user', texto: 'agendá' }, { rol: 'bot', texto: '(Propuse: Agendar café — Daniela canceló)' }])
})

test('le habla a cada app con su formato', () => {
  assert.equal(funcionDe('up'), 'up-asistente')
  assert.equal(funcionDe('pdg'), 'bs67-chat')
  const mensajes = [{ rol: 'user', texto: 'hola' }, { rol: 'bot', texto: 'buenas' }]
  assert.deepEqual(cuerpoPregunta('up', { mensaje: '¿y hoy?', mensajes }).mensajes, [{ rol: 'usuario', texto: 'hola' }, { rol: 'asistente', texto: 'buenas' }, { rol: 'usuario', texto: '¿y hoy?' }])
  assert.deepEqual(cuerpoPregunta('pdg', { mensaje: '¿y hoy?', mensajes, pantalla: 'cuentas' }), { mensaje: '¿y hoy?', historial: mensajes, pantalla: 'cuentas', proyecto_id: null, app: 'pdg' })
  assert.deepEqual(cuerpoAccion('up', { nombre: 'a', args: {} }), { ejecutar: { nombre: 'a', args: {} } })
  assert.equal(cuerpoAccion('bs67', { nombre: 'a', args: {} }).app, 'bs67')
})
