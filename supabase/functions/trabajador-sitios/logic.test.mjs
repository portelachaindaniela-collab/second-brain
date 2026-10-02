import test from 'node:test'
import assert from 'node:assert/strict'
import { leerSitios, resultadoSitios } from './logic.mjs'
import { sites } from '../maria-agent/checks.mjs'

test('leerSitios toma la lista de los parámetros y descarta lo que no es un sitio http(s)', () => {
  const lista = leerSitios({ sitios: [
    { nombre: ' Portfolio ', url: 'https://ejemplo.netlify.app' },
    { nombre: 'Radar', url: 'https://radar.github.io/', extras: true },
    { nombre: 'Sin url' },
    { nombre: 'Archivo', url: 'file:///etc/passwd' },
    null,
  ] })
  assert.deepEqual(lista, [{ nombre: 'Portfolio', url: 'https://ejemplo.netlify.app' }, { nombre: 'Radar', url: 'https://radar.github.io/', extras: true }])
})

test('leerSitios usa la lista de siempre si los parámetros no la traen', () => {
  assert.equal(leerSitios({}).length, sites.length)
  assert.equal(leerSitios(null).length, sites.length)
})

test('resultadoSitios: un sitio caído no es una corrida fallida', () => {
  const r = resultadoSitios({ resumen: { sitios: 6, ok: 5, aviso: 0, error: 1, estado_general: 'error' }, sitios: [] })
  assert.equal(r.estado, 'ok')
  assert.equal(r.cantidad, 6)
})
