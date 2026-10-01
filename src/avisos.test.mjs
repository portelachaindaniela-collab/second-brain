import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosDeMaria, tareasEstancadasIds, haceCuantoConsolidado, haceDias } from './avisos.mjs'

const ahora = Date.parse('2026-10-01T00:30:00Z')
const r = (agente, estado, detalle, iniciado_at = '2026-10-01T00:14:40Z', resumen = '') => ({ agente, estado, detalle, iniciado_at, resumen })
const sitiosOk = { sitios: [
  { nombre: 'ODBA', url: 'https://odba.netlify.app', nivel: 'ok', chequeos: [{ tipo: 'sitio online', nivel: 'ok', detalle: 'HTTP 200' }] },
  { nombre: 'Portfolio Daniela', url: 'https://danielaportelachain.vercel.app', nivel: 'error', chequeos: [{ tipo: 'sitio online', nivel: 'error', detalle: 'La página contiene «page not found».' }] },
  { nombre: 'Radar Laboral', url: 'https://x.github.io/scraper/', nivel: 'aviso', chequeos: [{ tipo: 'sitio online', nivel: 'ok', detalle: 'HTTP 200' }, { tipo: 'corrida del scraper', nivel: 'error', detalle: 'Última corrida hace 30 h (límite: 26 h).' }] },
] }
const estancadas = [
  { id: 't1', title: 'Cargar proyectos en LinkedIn', touched_at: '2026-09-15T02:41:56Z' },
  { id: 't2', title: 'Pantalla de proyectos en png', touched_at: '2026-09-13T18:12:19Z' },
]

test('sitios caídos y tareas quietas en texto claro, con detalle; lo que está bien en una línea', () => {
  const res = avisosDeMaria([
    r('monitor_sitios', 'error', sitiosOk), r('tareas_estancadas', 'aviso', estancadas), r('sync_estado', 'ok', { vinculado: true, horas: 0.1 }),
    r('bs67_chat', 'error', null, '2026-10-01T00:20:00Z'),
  ], { proyectoDeTarea: { t1: 'p1' }, proyectos: [{ id: 'p1', name: 'Portfolio' }], ahora })
  assert.deepEqual(res.avisos.map(a => [a.nivel, a.texto]), [
    ['error', 'Portfolio Daniela no responde'],
    ['error', 'El scraper de empleo está atrasado'],
    ['aviso', '2 tareas sin tocar hace más de 3 días'],
  ])
  assert.deepEqual(res.avisos[0].detalles, ['La página contiene «page not found».', 'danielaportelachain.vercel.app'])
  assert.equal(res.avisos[2].detalles[0], 'Cargar proyectos en LinkedIn — Portfolio · sin tocar desde el 14/09 (hace 15 días)')
  assert.equal(res.avisos[2].detalles[1], 'Pantalla de proyectos en png — sin proyecto · sin tocar desde el 13/09 (hace 17 días)')
  assert.deepEqual(res.enOrden, ['1 de 3 sitios bien', 'Google sincronizado'])
  assert.equal(res.consolidado_at, '2026-10-01T00:14:40.000Z', 'los reportes de BS67 no cuentan')
})

test('todo en orden: sin avisos y una sola línea', () => {
  const res = avisosDeMaria([r('monitor_sitios', 'ok', { sitios: [sitiosOk.sitios[0]] }), r('tareas_estancadas', 'ok', []), r('sync_estado', 'ok', {})], { ahora })
  assert.deepEqual(res.avisos, [])
  assert.deepEqual(res.enOrden, ['1 sitio online', 'ninguna tarea quieta', 'Google sincronizado'])
})

test('usa el último reporte de cada chequeo', () => {
  const res = avisosDeMaria([r('sync_estado', 'error', { vinculado: true, horas: 30.2 }, '2026-09-30T10:00:00Z'), r('sync_estado', 'ok', {}, '2026-10-01T00:00:00Z')], { ahora })
  assert.deepEqual(res.avisos, [])
  const viejo = avisosDeMaria([r('sync_estado', 'error', { vinculado: true, horas: 30.2 })], { ahora })
  assert.equal(viejo.avisos[0].texto, 'Google no se sincroniza hace 30 h')
})

test('si María no pudo revisar, lo dice', () => {
  const res = avisosDeMaria([r('monitor_sitios', 'error', null, undefined, 'Secreto de trabajador inválido.')], { ahora })
  assert.deepEqual(res.avisos[0], { nivel: 'error', texto: 'María no pudo revisar los sitios', detalles: ['Secreto de trabajador inválido.'] })
})

test('ayudas', () => {
  assert.deepEqual(tareasEstancadasIds([r('tareas_estancadas', 'aviso', estancadas)]), ['t1', 't2'])
  assert.equal(haceCuantoConsolidado('2026-10-01T00:14:40Z', ahora), 'consolidado hace 15 min · 21:14')
  assert.equal(haceDias('2026-09-30T23:00:00Z', ahora), 'hoy')
})
