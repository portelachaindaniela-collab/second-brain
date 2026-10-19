import test from 'node:test'
import assert from 'node:assert/strict'
import { rangos, ultimoDia, resumen, comparar, serie, cambios, formatoNumero, rutaDePagina } from './busquedasGoogle.mjs'

test('rangos: el período y el anterior del mismo largo', () => {
  assert.deepEqual(rangos('2026-10-16', 7), { actual: { desde: '2026-10-10', hasta: '2026-10-16' }, anterior: { desde: '2026-10-03', hasta: '2026-10-09' } })
})

const filas = [
  { site_url: 'a', fecha: '2026-10-15', clics: 2, impresiones: 100, posicion: 10 },
  { site_url: 'b', fecha: '2026-10-15', clics: 1, impresiones: 300, posicion: 20 },
  { site_url: 'a', fecha: '2026-10-16', clics: 3, impresiones: 100, posicion: 6 },
  { site_url: 'a', fecha: '2026-10-01', clics: 9, impresiones: 9, posicion: 1 },
]

test('ultimoDia y resumen con posición promediada por impresiones', () => {
  assert.equal(ultimoDia(filas), '2026-10-16')
  const r = resumen(filas, { desde: '2026-10-15', hasta: '2026-10-16' })
  assert.equal(r.clics, 6)
  assert.equal(r.impresiones, 500)
  assert.equal(r.ctr, 6 / 500)
  assert.equal(r.posicion, (10 * 100 + 20 * 300 + 6 * 100) / 500)
  assert.deepEqual(resumen([], { desde: 'a', hasta: 'z' }), { clics: 0, impresiones: 0, ctr: 0, posicion: null })
})

test('comparar: en posición bajar es mejorar', () => {
  const c = comparar({ clics: 12, impresiones: 50, ctr: 0.24, posicion: 8 }, { clics: 10, impresiones: 100, ctr: 0.1, posicion: 10 })
  assert.equal(c.clics, 0.2)
  assert.equal(c.impresiones, -0.5)
  assert.equal(c.posicion, 2)
  assert.equal(comparar({ clics: 3, impresiones: 0, ctr: 0, posicion: null }, { clics: 0, impresiones: 0, ctr: 0, posicion: null }).clics, 1)
})

test('serie rellena días sin datos con cero', () => {
  const s = serie(filas, { desde: '2026-10-14', hasta: '2026-10-16' })
  assert.deepEqual(s.map(p => [p.fecha, p.clics, p.impresiones]), [['2026-10-14', 0, 0], ['2026-10-15', 3, 400], ['2026-10-16', 3, 100]])
})

test('cambios: subidas, búsquedas nuevas y páginas que caen', () => {
  const avisos = cambios({
    busquedas: [{ clave: 'futbol femenino', clics: 9, impresiones: 200, posicion: 7 }, { clave: 'nueva', clics: 0, impresiones: 40, posicion: 30 }, { clave: 'quieta', clics: 1, impresiones: 50, posicion: 12 }],
    busquedasAntes: [{ clave: 'futbol femenino', clics: 2, impresiones: 150, posicion: 18 }, { clave: 'quieta', clics: 1, impresiones: 50, posicion: 13 }],
    paginas: [{ clave: '/a', clics: 3 }],
    paginasAntes: [{ clave: '/a', clics: 10 }, { clave: '/chica', clics: 2 }],
  })
  assert.deepEqual(avisos.map(a => a.tipo).sort(), ['nueva', 'pagina', 'posicion'])
  const sube = avisos.find(a => a.tipo === 'posicion')
  assert.ok(sube.sube)
  assert.equal(sube.clics, 7)
  assert.ok(Math.abs(avisos.find(a => a.tipo === 'pagina').caida - 0.7) < 1e-9)
})

test('formatoNumero y rutaDePagina', () => {
  assert.equal(formatoNumero(1240), '1.240')
  assert.equal(formatoNumero(38500), '38,5 mil')
  assert.equal(rutaDePagina('https://primeraafem.netlify.app/'), '/ (inicio)')
  assert.equal(rutaDePagina('https://primeraafem.netlify.app/fixture?x=1'), '/fixture?x=1')
})
