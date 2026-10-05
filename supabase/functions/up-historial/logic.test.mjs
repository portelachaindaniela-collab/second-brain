import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCOPE_HOJAS, tienePermisoHojas, urlPermiso, ultimaMetrica, filaHistorial, rangoFila, queCopiar, filaDeRango, motivoErrorGoogle, ENCABEZADOS } from './logic.mjs'

test('permiso: pide solo drive.file y suma lo que ya estaba', () => {
  const u = new URL(urlPermiso({ clientId: 'c', redirectUri: 'https://x/functions/v1/google-callback', state: 's' }))
  assert.equal(u.searchParams.get('scope'), SCOPE_HOJAS)
  assert.equal(u.searchParams.get('include_granted_scopes'), 'true')
  assert.equal(u.searchParams.get('access_type'), 'offline')
  assert.equal(tienePermisoHojas(['a', SCOPE_HOJAS]), true)
  assert.equal(tienePermisoHojas(null), false)
})

test('arma la fila con la última medición', () => {
  const m = ultimaMetrica([{ dia: '2026-10-02', impresiones: 100 }, { dia: '2026-10-04', impresiones: 2140, reacciones: 86, comentarios: 12, compartidos: 7, fuente: 'manual' }])
  const f = filaHistorial({ fecha: '2026-10-01', red: 'linkedin', texto: '=no es fórmula', url_publicada: 'https://l' }, 'Recap', m)
  assert.equal(f.length, ENCABEZADOS.length)
  assert.deepEqual(f, ['2026-10-01', 'LinkedIn', 'Recap', '=no es fórmula', 'https://l', 2140, 86, 12, 7, '4,9%', '2026-10-04', 'carga manual'])
  assert.deepEqual(filaHistorial({ fecha: '2026-10-01', red: 'x' }, null, null).slice(5), ['', '', '', '', '', '', ''])
})

test('rango de una fila', () => {
  assert.equal(rangoFila(7), 'Historial!A7:L7')
  assert.equal(filaDeRango("Historial!A7:L7"), 7)
  assert.equal(filaDeRango(''), null)
})

test('qué copiar: publicadas sin fila y filas con métricas nuevas', () => {
  const piezas = [
    { id: 'a', fecha: '2026-10-02', red: 'x', estado: 'publicado' },
    { id: 'b', fecha: '2026-10-01', red: 'linkedin', estado: 'publicado' },
    { id: 'c', fecha: '2026-10-01', red: 'x', estado: 'publicado', historial_fila: 2, historial_at: '2026-10-03T00:00:00Z' },
    { id: 'd', fecha: '2026-10-01', red: 'instagram', estado: 'publicado', historial_fila: 3, historial_at: '2026-10-03T00:00:00Z' },
    { id: 'e', fecha: '2026-10-01', red: 'linkedin', estado: 'aprobado' },
  ]
  const met = new Map([['c', [{ updated_at: '2026-10-04T00:00:00Z' }]], ['d', [{ updated_at: '2026-10-02T00:00:00Z' }]]])
  const r = queCopiar(piezas, met)
  assert.deepEqual(r.nuevas.map(p => p.id), ['b', 'a'])
  assert.deepEqual(r.viejas.map(p => p.id), ['c'])
})

test('explica los errores de Google', () => {
  assert.match(motivoErrorGoogle(403, { error: { message: 'Google Sheets API has not been used in project 1 before or it is disabled.' } }), /no está activada/)
  assert.match(motivoErrorGoogle(401, {}), /Conectar Google Sheets/)
  assert.match(motivoErrorGoogle(404, {}), /vuelvo a crear/)
})
