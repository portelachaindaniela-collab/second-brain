import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerUbicacion, hashToken, esRepetido, ErrorUbicacion } from './logic.mjs'

test('lee lo que manda MacroDroid: texto, coma decimal y espacios', () => {
  assert.deepEqual(leerUbicacion({ dispositivo: '  Celular  A32 ', lat: '-34,6037', lon: '-58.3816', precision: '18.4', bateria: '76', motivo: 'periodico' }), {
    dispositivo: 'Celular A32', motivo: 'periodico', lat: -34.6037, lon: -58.3816, precision_m: 18, bateria: 76,
  })
})

test('motivo desconocido cuenta como periódico; precisión y batería raras quedan vacías', () => {
  const u = leerUbicacion({ dispositivo: 'Auriculares', lat: 1, lon: 2, motivo: 'otro', precision: '-3', bateria: '150' })
  assert.equal(u.motivo, 'periodico')
  assert.equal(u.precision_m, null)
  assert.equal(u.bateria, null)
})

test('rechaza lo que no es una ubicación real', () => {
  assert.throws(() => leerUbicacion({ lat: 1, lon: 2 }), ErrorUbicacion)
  assert.throws(() => leerUbicacion({ dispositivo: 'A32', lat: '', lon: '2' }), /Latitud o longitud/)
  assert.throws(() => leerUbicacion({ dispositivo: 'A32', lat: 95, lon: 2 }), /Latitud o longitud/)
  assert.throws(() => leerUbicacion({ dispositivo: 'A32', lat: '0', lon: '0' }), /todavía no tiene ubicación/)
  assert.throws(() => leerUbicacion(null), ErrorUbicacion)
})

test('el token se compara por su hash sha-256, como lo guarda la base', async () => {
  assert.equal(await hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('descarta envíos periódicos repetidos, nunca una desconexión', () => {
  const ahora = Date.parse('2026-11-10T12:00:30Z')
  const ultima = { at: '2026-11-10T12:00:20Z' }
  assert.equal(esRepetido(ultima, { motivo: 'periodico' }, ahora), true)
  assert.equal(esRepetido(ultima, { motivo: 'desconexion' }, ahora), false)
  assert.equal(esRepetido({ at: '2026-11-10T11:59:00Z' }, { motivo: 'periodico' }, ahora), false)
  assert.equal(esRepetido(null, { motivo: 'periodico' }, ahora), false)
})
