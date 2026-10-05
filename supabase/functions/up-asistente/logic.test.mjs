import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proveedor, validarAccion, describirAccion, urlPermitida, htmlATexto, historialParaModelo, HERRAMIENTAS, ACCIONES } from './logic.mjs'

test('usa Groq si hay clave y si no, Gemini', () => {
  assert.equal(proveedor({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'x' }).nombre, 'groq')
  assert.equal(proveedor({ GEMINI_API_KEY: 'x' }).nombre, 'gemini')
  assert.equal(proveedor({}), null)
})

test('todas las acciones están entre las herramientas', () => {
  const nombres = HERRAMIENTAS.map(h => h.function.name)
  for (const a of ACCIONES) assert.ok(nombres.includes(a), a)
})

test('valida y normaliza una idea', () => {
  const r = validarAccion('cargar_idea', { fecha: '2026-10-08', tema_dia: '  Acreditaciones en la AFA ', redes: ['x', 'linkedin', 'tiktok', 'instagram'], formato_instagram: 'otro' })
  assert.deepEqual(r, { ok: true, args: { fecha: '2026-10-08', tema_dia: 'Acreditaciones en la AFA', tema_semana: null, redes: ['linkedin', 'x', 'instagram'], formato_instagram: 'carrusel', tema_instagram: null } })
  assert.equal(validarAccion('cargar_idea', { fecha: '8/10', tema_dia: 'a', redes: ['x'] }).ok, false)
  assert.equal(validarAccion('cargar_idea', { fecha: '2026-10-08', tema_dia: 'a', redes: [] }).ok, false)
  assert.equal(validarAccion('borrar_todo', {}).ok, false)
})

test('valida el resto de las acciones', () => {
  assert.equal(validarAccion('aprobar_pieza', { fecha: '2026-10-08', red: 'linkedin' }).ok, true)
  assert.equal(validarAccion('aprobar_pieza', { fecha: '2026-10-08', red: 'tiktok' }).ok, false)
  assert.equal(validarAccion('responder_pregunta', { fecha: '2026-10-08', respuesta: ' ' }).ok, false)
  assert.deepEqual(validarAccion('agregar_dato_ficha', { grupo: 'AFA', dato: 'Copa Federal 2024', fuente: '' }), { ok: true, args: { grupo: 'AFA', dato: 'Copa Federal 2024', fuente: null } })
  assert.equal(validarAccion('agregar_dato_ficha', { grupo: 'Otro', dato: 'x' }).ok, false)
})

test('describe la acción para confirmar', () => {
  assert.equal(describirAccion('aprobar_pieza', { fecha: '2026-10-08', red: 'linkedin' }), 'Aprobar el borrador de LinkedIn del jueves, 8 de octubre.')
  assert.match(describirAccion('cargar_idea', { fecha: '2026-10-08', tema_dia: 'Idea', redes: ['linkedin', 'instagram'], formato_instagram: 'reel' }), /Instagram: reel/)
})

test('solo lee links públicos', () => {
  assert.equal(urlPermitida('https://www.lanacion.com.ar/nota'), 'https://www.lanacion.com.ar/nota')
  for (const u of ['http://localhost:3000', 'http://127.0.0.1', 'http://10.0.0.1/x', 'http://192.168.1.1', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'ftp://x.com', 'no es url']) assert.equal(urlPermitida(u), null, u)
})

test('pasa HTML a texto', () => {
  assert.equal(htmlATexto('<html><head><title>x</title></head><body><script>alert(1)</script><h1>Título</h1><p>Uno &amp; dos</p></body></html>'), 'Título\n Uno & dos')
})

test('historial: solo texto, últimos 20', () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({ rol: i % 2 ? 'asistente' : 'usuario', texto: `m${i}` }))
  const h = historialParaModelo([...muchos, { rol: 'sistema', texto: 'ignorar' }, { rol: 'usuario', texto: '' }])
  assert.equal(h.length, 20)
  assert.deepEqual(h.at(-1), { role: 'assistant', content: 'm29' })
})
