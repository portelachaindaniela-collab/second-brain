import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerRecordado, guardarRecordado } from './recordar.mjs'

function almacenFalso() {
  const datos = new Map()
  return { getItem: k => datos.has(k) ? datos.get(k) : null, setItem: (k, v) => datos.set(k, String(v)), removeItem: k => datos.delete(k) }
}

test('devuelve lo guardado y el valor por defecto si no hay nada', () => {
  const a = almacenFalso()
  assert.equal(leerRecordado('pantalla', 'hoy', a), 'hoy')
  guardarRecordado('pantalla', 'oficina', a)
  assert.equal(leerRecordado('pantalla', 'hoy', a), 'oficina')
})

test('guardar null lo borra', () => {
  const a = almacenFalso()
  guardarRecordado('app', 'bs67', a)
  guardarRecordado('app', null, a)
  assert.equal(leerRecordado('app', null, a), null)
})

test('no falla sin almacenamiento ni con datos rotos', () => {
  assert.equal(leerRecordado('x', 1, null), 1)
  guardarRecordado('x', 2, null)
  const roto = { getItem: () => '{no json', setItem: () => { throw new Error('lleno') }, removeItem() {} }
  assert.equal(leerRecordado('x', 3, roto), 3)
  guardarRecordado('x', 4, roto)
})
