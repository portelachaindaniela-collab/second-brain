import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloquesDelDia, porDia, topRemitentes, tareasPorProyecto, sitiosRevisados, contarTemas, corridasPorHora, inicioDelDia } from './hoyGraficos.mjs'

const local = (h, m = 0, dia = 4) => new Date(2026, 9, dia, h, m).getTime()
const ahora = local(15)

test('bloquesDelDia: horas del día, carriles para los que se pisan, todo el día aparte', () => {
  const ev = [
    { id: 1, starts_at: new Date(local(10)).toISOString(), ends_at: new Date(local(11, 30)).toISOString() },
    { id: 2, starts_at: new Date(local(11)).toISOString(), ends_at: new Date(local(12)).toISOString() },
    { id: 3, starts_at: new Date(local(13)).toISOString(), ends_at: null },
    { id: 4, all_day: true, starts_at: new Date(local(0)).toISOString() },
    { id: 5, starts_at: new Date(local(5)).toISOString(), ends_at: new Date(local(6)).toISOString() },
  ]
  const r = bloquesDelDia(ev, ahora)
  assert.deepEqual(r.todoElDia.map(e => e.id), [4])
  assert.deepEqual(r.bloques.map(b => [b.evento.id, b.desde, b.hasta, b.carril]), [[5, 7, 7, 0], [1, 10, 11.5, 0], [2, 11, 12, 1], [3, 13, 14, 0]])
  assert.equal(r.carriles, 2)
})

test('porDia: cuenta por día desde un inicio de día', () => {
  const desde = inicioDelDia(ahora)
  const items = [{ f: new Date(local(9)).toISOString() }, { f: new Date(local(23)).toISOString() }, { f: new Date(local(10, 0, 5)).toISOString() }, { f: new Date(local(10, 0, 20)).toISOString() }]
  const r = porDia(items, i => i.f, desde, 3)
  assert.deepEqual(r.map(d => [d.dia, d.n]), [[4, 2], [5, 1], [6, 0]])
  assert.equal(r[0].etiqueta, 'dom')
})

test('topRemitentes, tareasPorProyecto, contarTemas', () => {
  assert.deepEqual(topRemitentes([{ from_name: 'LinkedIn' }, { from_name: 'LinkedIn' }, { from_addr: 'a@b.com' }], 2), [['LinkedIn', 2], ['a@b.com', 1]])
  const p = [{ id: 'p1', name: 'Morón', color: '#f00' }]
  assert.deepEqual(tareasPorProyecto([{ project_id: 'p1' }, { project_id: null }, { project_id: 'p1' }], p).map(x => [x.nombre, x.n]), [['Morón', 2], ['Sin proyecto', 1]])
  assert.deepEqual(contarTemas([{ temas: ['ia', 'datos'] }, { temas: ['ia'] }]), [['ia', 2], ['datos', 1]])
})

test('sitiosRevisados: del último reporte de sitios, con la latencia', () => {
  const reportes = [{ agente: 'monitor_sitios', detalle: { sitios: [{ nombre: 'Portfolio', nivel: 'ok', chequeos: [{ tipo: 'sitio online', latencia_ms: 66 }] }, { nombre: 'Caído', nivel: 'error', chequeos: [] }] } }]
  assert.deepEqual(sitiosRevisados(reportes).map(s => [s.nombre, s.nivel, s.latencia]), [['Portfolio', 'ok', 66], ['Caído', 'error', null]])
  assert.deepEqual(sitiosRevisados([]), [])
})

test('corridasPorHora: 24 horas, ok y errores aparte', () => {
  const h = 3_600_000, ahora = local(15, 30)
  const r = corridasPorHora([{ iniciado_at: new Date(ahora - 10 * 60_000).toISOString(), estado: 'ok' }, { iniciado_at: new Date(ahora - 2 * h).toISOString(), estado: 'error' }, { iniciado_at: new Date(ahora - 30 * h).toISOString(), estado: 'ok' }], ahora)
  assert.equal(r.length, 24)
  assert.equal(r[23].ok, 1)
  assert.equal(r[21].error, 1)
})
