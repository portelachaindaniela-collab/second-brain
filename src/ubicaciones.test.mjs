import { test } from 'node:test'
import assert from 'node:assert/strict'
import { porDispositivo, haceCuanto, estaDesactualizada, urlMapa, urlGoogleMaps, esCelular, cuerpoMacroDroid, DISPOSITIVO_CELULAR } from './ubicaciones.mjs'

test('agrupa por dispositivo con la última primero, y el celular arriba de todo', () => {
  const filas = [
    { dispositivo: 'Auriculares', at: '2026-11-10T12:00:00Z', lat: 1, lon: 1 },
    { dispositivo: DISPOSITIVO_CELULAR, at: '2026-11-10T10:00:00Z', lat: 2, lon: 2 },
    { dispositivo: DISPOSITIVO_CELULAR, at: '2026-11-10T11:00:00Z', lat: 3, lon: 3 },
  ]
  const g = porDispositivo(filas)
  assert.deepEqual(g.map(x => x.dispositivo), [DISPOSITIVO_CELULAR, 'Auriculares'])
  assert.equal(g[0].ultima.lat, 3)
  assert.equal(g[0].anteriores.length, 1)
})

test('cuánto hace, en palabras', () => {
  const ahora = Date.parse('2026-11-10T12:00:00Z')
  assert.equal(haceCuanto('2026-11-10T11:59:50Z', ahora), 'recién')
  assert.equal(haceCuanto('2026-11-10T11:48:00Z', ahora), 'hace 12 min')
  assert.equal(haceCuanto('2026-11-10T09:00:00Z', ahora), 'hace 3 h')
  assert.equal(haceCuanto('2026-11-09T12:00:00Z', ahora), 'hace 1 día')
  assert.equal(estaDesactualizada('2026-11-10T10:30:00Z', ahora), true)
  assert.equal(estaDesactualizada('2026-11-10T11:30:00Z', ahora), false)
})

test('mapa de OpenStreetMap centrado con marcador, y link a Google Maps', () => {
  const u = urlMapa(-34.6037, -58.3816, 20)
  assert.match(u, /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=/)
  assert.match(u, /marker=-34\.603700%2C-58\.381600$/)
  assert.equal(urlGoogleMaps(-34.6037, -58.3816), 'https://www.google.com/maps/search/?api=1&query=-34.603700%2C-58.381600')
})

test('solo el celular manda su ubicación desde la app, nunca la compu', () => {
  assert.equal(esCelular('Mozilla/5.0 (Linux; Android 13; SM-A325M) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'), true)
  assert.equal(esCelular('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36'), false)
  assert.equal(esCelular('Mozilla/5.0 (Windows NT 10.0) Electron/44 Chrome/140'), false)
})

test('el cuerpo de MacroDroid es JSON válido una vez completadas las variables', () => {
  const cuerpo = cuerpoMacroDroid('Auriculares', 'desconexion')
    .replace('{last_loc_lat}', '-34.6').replace('{last_loc_long}', '-58.4').replace('{last_loc_accuracy}', '12').replace('{battery}', '80')
  assert.deepEqual(JSON.parse(cuerpo), { dispositivo: 'Auriculares', motivo: 'desconexion', lat: '-34.6', lon: '-58.4', precision: '12', bateria: '80' })
})
