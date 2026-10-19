import test from 'node:test'
import assert from 'node:assert/strict'
import { rangoACopiar, nombrePorDefecto, sitiosUsables, filasDias, filasDetalle, tienePermiso, SCOPE_SEARCH_CONSOLE } from './logic.mjs'

test('rangoACopiar: 90 días la primera vez, 10 después', () => {
  const hoy = new Date('2026-10-19T12:00:00Z')
  assert.deepEqual(rangoACopiar(null, hoy), { desde: '2026-07-21', hasta: '2026-10-19' })
  assert.deepEqual(rangoACopiar('2026-10-18T00:00:00Z', hoy), { desde: '2026-10-09', hasta: '2026-10-19' })
})

test('nombrePorDefecto saca el dominio', () => {
  assert.equal(nombrePorDefecto('https://primeraafem.netlify.app/'), 'primeraafem')
  assert.equal(nombrePorDefecto('https://www.ejemplo.com/'), 'ejemplo.com')
  assert.equal(nombrePorDefecto('sc-domain:ejemplo.com'), 'ejemplo.com')
})

test('sitiosUsables deja afuera los no verificados', () => {
  assert.deepEqual(sitiosUsables([{ siteUrl: 'a', permissionLevel: 'siteOwner' }, { siteUrl: 'b', permissionLevel: 'siteUnverifiedUser' }]), ['a'])
})

test('filasDias y filasDetalle arman las filas de la base', () => {
  const dias = filasDias({ rows: [{ keys: ['2026-10-15'], clicks: 3, impressions: 120, ctr: 0.025, position: 12.4 }] }, 'o', 's')
  assert.deepEqual(dias, [{ owner_id: 'o', site_url: 's', fecha: '2026-10-15', clics: 3, impresiones: 120, posicion: 12.4 }])
  const det = filasDetalle({ rows: [{ keys: ['2026-10-15', 'futbol femenino'], clicks: 1, impressions: 40, position: 8 }, { keys: ['2026-10-15'] }] }, 'o', 's', 'busqueda')
  assert.equal(det.length, 1)
  assert.equal(det[0].clave, 'futbol femenino')
  assert.equal(filasDias(null, 'o', 's').length, 0)
})

test('tienePermiso', () => {
  assert.ok(tienePermiso([SCOPE_SEARCH_CONSOLE]))
  assert.ok(!tienePermiso(['x']))
})
