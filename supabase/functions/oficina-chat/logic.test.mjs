import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validar, contexto, sistema, armarMensajes, MAX_MENSAJES } from './logic.mjs'

test('validar: agente conocido y último mensaje de la dueña', () => {
  const v = validar({ agente: 'up:redactor', mensajes: [{ role: 'user', content: ' ¿qué hiciste hoy? ' }] })
  assert.equal(v.ok, true)
  assert.equal(v.equipo, 'up')
  assert.equal(v.clave, 'redactor')
  assert.equal(v.mensajes[0].content, '¿qué hiciste hoy?')
  assert.equal(validar({ agente: 'up:inventado', mensajes: [{ role: 'user', content: 'hola' }] }).ok, false)
  assert.equal(validar({ agente: 'otro:x', mensajes: [{ role: 'user', content: 'hola' }] }).ok, false)
  assert.equal(validar({ agente: 'pdg:demo', mensajes: [{ role: 'assistant', content: 'hola' }] }).ok, false)
  assert.equal(validar({ agente: 'pdg:demo', mensajes: [] }).ok, false)
})

test('validar: un rol raro pasa como user y se queda con los últimos mensajes', () => {
  const mensajes = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'system', content: `m${i}` }))
  mensajes.push({ role: 'user', content: 'último' })
  const v = validar({ agente: 'trabajadores:canillita', mensajes })
  assert.equal(v.mensajes.length, MAX_MENSAJES)
  assert.ok(v.mensajes.every(m => m.role === 'user' || m.role === 'assistant'))
})

test('contexto de un trabajador: sus corridas', () => {
  const c = contexto('trabajadores', 'canillita', {
    trabajador: { nombre: 'Canillita', tipo: 'scraper', descripcion: 'Lee medios.', frecuencia: '0 * * * *', activo: true },
    corridas: [{ iniciado_at: '2026-11-11T12:00:00Z', estado: 'error', error: 'HTTP 500' }],
  })
  assert.equal(c.nombre, 'Canillita')
  assert.match(c.registro[0], /error · error: HTTP 500/)
  assert.equal(contexto('trabajadores', 'x', {}), null)
})

test('contexto de UP y de Noruega', () => {
  const r = contexto('up', 'investigador', { pasos: [{ at: '2026-11-11T09:02:00Z', accion: 'preguntó', detalle: '¿Qué querés contar?' }], pendientes: [{ fecha: '2026-11-12', texto: '¿Cuál fue el resultado?' }] })
  assert.equal(r.nombre, 'Investigador')
  assert.match(r.registro[0], /preguntó — ¿Qué querés contar\?/)
  assert.match(r.registro[1], /pendiente para Daniela \(2026-11-12\)/)
  const n = contexto('up', 'noruega', { chequeos: [{ at: '2026-11-11T01:35:00Z', estado: 'falla', chequeos: [{ nombre: 'Diseñador', estado: 'falla', detalle: 'placas atrasadas' }] }] })
  assert.equal(n.registro.length, 2)
  assert.match(n.registro[1], /Diseñador: falla — placas atrasadas/)
})

test('contexto de PDG y prompt', () => {
  const c = contexto('pdg', 'prospector', { agente: { nombre: 'Prospector', rol: 'Busca cuentas.', instrucciones: 'Investigá.' }, trabajos: [{ created_at: '2026-11-10T12:00:00Z', estado: 'borrador', texto: 'Hola club', pdg_cuentas: { nombre: 'Club A' } }] })
  assert.match(c.registro[0], /cuenta Club A · borrador/)
  const s = sistema(c, 'martes 11 de noviembre')
  assert.match(s, /Sos Prospector/)
  assert.match(s, /no inventes/)
  assert.match(s, /Lee la web de la cuenta/)
  const m = armarMensajes(c, [{ role: 'user', content: 'hola' }], 'hoy')
  assert.equal(m[0].role, 'system')
  assert.equal(m.length, 2)
  const vacio = sistema(contexto('up', 'publicador', {}), 'hoy')
  assert.match(vacio, /todavía no hay nada registrado/)
})
