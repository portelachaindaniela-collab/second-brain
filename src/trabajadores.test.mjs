import test from 'node:test'
import assert from 'node:assert/strict'
import {
  describirFrecuencia, frecuenciaValida, duracionLegible, haceCuanto, aplicarCorrida, parsearParametros, PRESETS_FRECUENCIA,
  horaAR, fechaAR, franjaHoras, franjasPorDia, resumenFranja, trabada, contadores24h, sparkline, barraBloques,
  parsearCron, minutosProgramados, programaDe,
} from './trabajadores.mjs'

test('describirFrecuencia traduce los patrones comunes y pasa la hora UTC a Buenos Aires', () => {
  assert.equal(describirFrecuencia('* * * * *'), 'Cada minuto')
  assert.equal(describirFrecuencia('*/15 * * * *'), 'Cada 15 minutos')
  assert.equal(describirFrecuencia('7 * * * *'), 'Cada hora (a los 7 min)')
  assert.equal(describirFrecuencia('7 */6 * * *'), 'Cada 6 horas')
  assert.equal(describirFrecuencia('0 11 * * *'), 'Todos los días a las 08:00')
  assert.equal(describirFrecuencia('30 1 * * *'), 'Todos los días a las 22:30')
  assert.equal(describirFrecuencia('0 9 * * 1-5'), 'Personalizada (0 9 * * 1-5)')
})

test('los presets son frecuencias válidas', () => {
  for (const p of PRESETS_FRECUENCIA) assert.ok(frecuenciaValida(p.valor), p.valor)
  assert.equal(frecuenciaValida('cada hora'), false)
  assert.equal(frecuenciaValida('* * * *'), false)
})

test('duracionLegible', () => {
  assert.equal(duracionLegible(230), '230 ms')
  assert.equal(duracionLegible(4500), '4.5 s')
  assert.equal(duracionLegible(125_000), '2 min 5 s')
  assert.equal(duracionLegible(3_780_000), '1 h 3 min')
  assert.equal(duracionLegible(null), '')
})

test('haceCuanto', () => {
  const ahora = Date.parse('2026-09-29T12:00:00Z')
  assert.equal(haceCuanto('2026-09-29T11:59:40Z', ahora), 'recién')
  assert.equal(haceCuanto('2026-09-29T11:35:00Z', ahora), 'hace 25 min')
  assert.equal(haceCuanto('2026-09-29T09:00:00Z', ahora), 'hace 3 h')
  assert.equal(haceCuanto('2026-09-28T11:00:00Z', ahora), 'hace 1 día')
  assert.equal(haceCuanto(null, ahora), '')
})

test('aplicarCorrida reemplaza por id, ordena y recorta', () => {
  const historial = [{ id: 2, iniciado_at: '2026-09-29T11:00:00Z', estado: 'ok' }, { id: 1, iniciado_at: '2026-09-29T10:00:00Z', estado: 'ok' }]
  const conNueva = aplicarCorrida(historial, { id: 3, iniciado_at: '2026-09-29T12:00:00Z', estado: 'corriendo' }, 2)
  assert.deepEqual(conNueva.map(c => c.id), [3, 2])
  const cerrada = aplicarCorrida(conNueva, { id: 3, iniciado_at: '2026-09-29T12:00:00Z', estado: 'ok' }, 2)
  assert.deepEqual(cerrada.map(c => [c.id, c.estado]), [[3, 'ok'], [2, 'ok']])
})

test('parsearParametros acepta solo objetos JSON', () => {
  assert.deepEqual(parsearParametros('{"url":"x"}'), { url: 'x' })
  assert.throws(() => parsearParametros('{url}'), /JSON válido/)
  assert.throws(() => parsearParametros('[1]'), /objeto/)
  assert.throws(() => parsearParametros('null'), /objeto/)
})

const corrida = (id, iso, estado = 'ok', extra = {}) => ({ id, trabajador: 'x', iniciado_at: iso, estado, ...extra })

test('horaAR y fechaAR pasan a hora de Argentina', () => {
  const t = Date.parse('2026-09-30T02:07:09Z')
  assert.equal(horaAR(t), '23:07')
  assert.equal(horaAR(t, true), '23:07:09')
  assert.equal(fechaAR(t), '2026-09-29')
})

test('parsearCron y minutosProgramados entienden los formatos de pg_cron (UTC)', () => {
  const h = iso => Date.parse(iso)
  assert.deepEqual(minutosProgramados(parsearCron('7 * * * *'), h('2026-09-29T18:00:00Z')), [7])
  assert.deepEqual(minutosProgramados(parsearCron('*/15 * * * *'), h('2026-09-29T18:00:00Z')), [0, 15, 30, 45])
  const cadaSeis = parsearCron('7 */6 * * *')
  assert.deepEqual([0, 5, 6, 12, 18, 23].map(x => minutosProgramados(cadaSeis, h(`2026-09-29T${String(x).padStart(2, '0')}:00:00Z`)).length), [1, 0, 1, 1, 1, 0])
  assert.deepEqual(minutosProgramados(parsearCron('0 8,20 * * *'), h('2026-09-29T20:00:00Z')), [0])
  assert.deepEqual(minutosProgramados(parsearCron('0 8-18/2 * * *'), h('2026-09-29T09:00:00Z')), [])
  assert.deepEqual(minutosProgramados(parsearCron('0 8-18/2 * * *'), h('2026-09-29T10:00:00Z')), [0])
  // 29/9/2026 es martes (2); 4/10/2026 es domingo (0 o 7).
  assert.equal(minutosProgramados(parsearCron('0 9 * * 1-5'), h('2026-09-29T09:00:00Z')).length, 1)
  assert.equal(minutosProgramados(parsearCron('0 9 * * 1-5'), h('2026-10-04T09:00:00Z')).length, 0)
  assert.equal(minutosProgramados(parsearCron('0 9 * * 7'), h('2026-10-04T09:00:00Z')).length, 1)
  // Con día del mes y día de la semana restringidos, alcanza con que coincida uno (como cron).
  assert.equal(minutosProgramados(parsearCron('0 9 1 * 2'), h('2026-09-29T09:00:00Z')).length, 1)
  assert.equal(parsearCron('99 * * * *'), null)
  assert.equal(parsearCron('cada hora'), null)
})

test('franjaHoras: gris solo donde le tocaba correr y no corrió; el resto queda libre', () => {
  const ahora = Date.parse('2026-09-29T18:30:00Z')
  const programa = { cron: parsearCron('7 */6 * * *'), desde: -Infinity }
  const bloques = franjaHoras([
    corrida(1, '2026-09-29T18:07:00Z'),
    corrida(2, '2026-09-29T12:07:00Z', 'ok'), corrida(3, '2026-09-29T12:40:00Z', 'error'),
    corrida(4, '2026-09-28T19:05:00Z', 'corriendo'),
  ], ahora, programa)
  assert.equal(bloques.length, 24)
  assert.equal(bloques[23].estado, 'ok')
  assert.equal(bloques[17].estado, 'error')
  assert.equal(bloques[17].corrida.id, 3)
  assert.equal(bloques[0].estado, 'corriendo')
  // Le tocaba a las 00:07 y 06:07 UTC y no corrió; el resto de las horas no le tocaba.
  assert.deepEqual(bloques.filter(b => b.estado === 'hueco').map(b => new Date(b.inicio).getUTCHours()), [0, 6])
  assert.deepEqual(resumenFranja(bloques), { ok: 1, error: 1, corriendo: 1, huecos: 2 })
})

test('franjaHoras no marca hueco lo que todavía no venció, ni antes de que exista el trabajador, ni sin cron', () => {
  const programa = { cron: parsearCron('7 * * * *'), desde: Date.parse('2026-09-29T15:30:00Z') }
  const bloques = franjaHoras([], Date.parse('2026-09-29T18:08:00Z'), programa)
  // 16:07 y 17:07 vencieron; 18:07 todavía está dentro del margen de 2 minutos; 15:07 es anterior al alta.
  assert.deepEqual(bloques.filter(b => b.estado === 'hueco').map(b => new Date(b.inicio).getUTCHours()), [16, 17])
  assert.deepEqual(resumenFranja(franjaHoras([], Date.parse('2026-09-29T18:30:00Z'))), { ok: 0, error: 0, corriendo: 0, huecos: 0 })
})

test('programaDe: un trabajador pausado no tiene huecos', () => {
  assert.equal(programaDe({ activo: false, frecuencia: '7 * * * *' }).cron, null)
  assert.ok(programaDe({ activo: true, frecuencia: '7 * * * *', created_at: '2026-09-29T17:30:00Z' }).cron)
  assert.equal(programaDe({ activo: true, frecuencia: '7 * * * *', created_at: '2026-09-29T17:30:00Z' }).desde, Date.parse('2026-09-29T17:30:00Z'))
})

test('franjasPorDia agrupa por día de Argentina, sin saltear días, del más nuevo al más viejo', () => {
  const ahora = Date.parse('2026-10-01T15:00:00Z')
  const dias = franjasPorDia([corrida(1, '2026-09-30T02:07:00Z'), corrida(2, '2026-09-29T03:07:00Z', 'error')], ahora)
  assert.deepEqual(dias.map(d => d.dia), ['2026-10-01', '2026-09-30', '2026-09-29'])
  assert.equal(dias[2].bloques[23].corrida.id, 1)
  assert.equal(dias[2].bloques[0].estado, 'error')
  assert.ok(dias[1].bloques.every(b => b.estado === 'libre'))
  const conAlta = franjasPorDia([], ahora, { cron: parsearCron('0 11 * * *'), desde: Date.parse('2026-09-30T10:00:00Z') }, Date.parse('2026-09-30T10:00:00Z'))
  assert.deepEqual(conAlta.map(d => [d.dia, resumenFranja(d.bloques).huecos]), [['2026-10-01', 1], ['2026-09-30', 1]])
  assert.deepEqual(franjasPorDia([], ahora), [])
})

test('trabada: corriendo hace más de 10 minutos', () => {
  const ahora = Date.parse('2026-09-29T18:30:00Z')
  assert.equal(trabada(corrida(1, '2026-09-29T18:25:00Z', 'corriendo'), ahora), false)
  assert.equal(trabada(corrida(1, '2026-09-29T18:10:00Z', 'corriendo'), ahora), true)
  assert.equal(trabada(corrida(1, '2026-09-29T18:10:00Z', 'ok'), ahora), false)
})

test('trabada: cada trabajador puede traer su propio umbral', () => {
  const ahora = Date.parse('2026-09-29T18:30:00Z')
  assert.equal(trabada(corrida(1, '2026-09-29T18:10:00Z', 'corriendo'), ahora, 30), false)
  assert.equal(trabada(corrida(1, '2026-09-29T18:25:00Z', 'corriendo'), ahora, 3), true)
})

test('contadores24h ignora corridas viejas y huecos de trabajadores pausados, y usa el cron de cada uno', () => {
  const ahora = Date.parse('2026-09-29T18:30:00Z')
  const trabajadores = [{ clave: 'a', activo: true }, { clave: 'b', activo: false }]
  const corridasPor = {
    a: [corrida(1, '2026-09-29T18:07:00Z'), corrida(2, '2026-09-29T17:07:00Z', 'error'), corrida(3, '2026-09-29T18:00:00Z', 'corriendo'), corrida(4, '2026-09-27T10:00:00Z', 'error')],
    b: [corrida(5, '2026-09-29T10:00:00Z')],
  }
  // `a` corre cada hora a los :07 y tiene corridas en 2 de las 24 horas (17 y 18 UTC): le faltan 22. `b` está pausado.
  const conCron = trabajadores.map(t => ({ ...t, frecuencia: '7 * * * *' }))
  assert.deepEqual(contadores24h(conCron, corridasPor, ahora), { trabajadores: 2, ok: 2, error: 1, huecos: 22, trabados: 1 })
})

test('sparkline y barraBloques', () => {
  assert.equal(sparkline([0, 7, 14]), '▁▅█')
  assert.equal(sparkline([5, 5]), '▄▄')
  assert.equal(sparkline([1, null, 3]), '▁·█')
  assert.equal(sparkline([]), '')
  assert.equal(barraBloques(50, 100, 10), '█████░░░░░')
  assert.equal(barraBloques(1, 1000, 10), '█░░░░░░░░░')
  assert.equal(barraBloques(null, 100, 4), '░░░░')
})
