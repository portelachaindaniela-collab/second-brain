import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chequearBorradores, chequearCorridas, chequearDisenador, chequearPublicador, chequearConexiones,
  chequearPreguntas, chequearCrons, estadoGeneral,
} from './logic.mjs'

const T = s => Date.parse(s)
const dia = { fecha: '2026-10-06', redes: ['linkedin', 'x', 'instagram'], formato_instagram: 'carrusel', salteado: false }

test('borradores: antes de las 8 espera, después marca lo que falta', () => {
  const piezas = [{ red: 'linkedin', texto: 'a', estado: 'pendiente' }, { red: 'x', texto: null, estado: 'falta_info' }]
  assert.equal(chequearBorradores({ dia, piezas, ahora: T('2026-10-06T10:00:00Z') }).estado, 'ok')
  const tarde = chequearBorradores({ dia, piezas, ahora: T('2026-10-06T12:00:00Z') })
  assert.equal(tarde.estado, 'falla')
  assert.match(tarde.detalle, /Instagram/)
  assert.equal(chequearBorradores({ dia: { ...dia, salteado: true }, piezas: [], ahora: T('2026-10-06T12:00:00Z') }).estado, 'ok')
  assert.equal(chequearBorradores({ dia: null, piezas: [], ahora: T('2026-10-06T12:00:00Z') }).estado, 'ok')
})

test('corridas: colgadas, con error y cortes seguidos', () => {
  const ahora = T('2026-10-06T12:00:00Z')
  assert.equal(chequearCorridas({ corridas: [{ estado: 'corriendo', iniciado_at: '2026-10-06T11:30:00Z' }], ahora }).estado, 'falla')
  assert.equal(chequearCorridas({ corridas: [{ estado: 'error', error: 'boom', iniciado_at: '2026-10-06T09:00:00Z' }], ahora }).estado, 'falla')
  assert.equal(chequearCorridas({ corridas: [{ estado: 'error', error: 'This model is currently experiencing high demand.', iniciado_at: '2026-10-06T09:00:00Z' }], ahora }).estado, 'aviso')
  const cortes = Array.from({ length: 3 }, () => ({ estado: 'cortado', iniciado_at: '2026-10-06T09:00:00Z' }))
  assert.equal(chequearCorridas({ corridas: cortes, ahora }).estado, 'aviso')
  assert.equal(chequearCorridas({ corridas: [{ estado: 'error', iniciado_at: '2026-10-04T09:00:00Z' }], ahora }).estado, 'ok')
  const resuelta = [{ fecha: '2026-10-06', estado: 'error', error: '503', iniciado_at: '2026-10-06T09:02:00Z' }, { fecha: '2026-10-06', estado: 'ok', iniciado_at: '2026-10-06T09:12:00Z' }]
  assert.equal(chequearCorridas({ corridas: resuelta, ahora }).estado, 'ok')
})

test('diseñador: atrasado después de 45 minutos', () => {
  const ahora = T('2026-10-06T12:00:00Z')
  const c = { texto: 'Placa 1. A', assets_texto: null, estado: 'pendiente', updated_at: '2026-10-06T11:00:00Z' }
  assert.equal(chequearDisenador({ carruseles: [c], ahora }).estado, 'falla')
  assert.equal(chequearDisenador({ carruseles: [{ ...c, updated_at: '2026-10-06T11:40:00Z' }], ahora }).estado, 'ok')
  assert.equal(chequearDisenador({ carruseles: [{ ...c, assets_texto: 'Placa 1. A' }], ahora }).estado, 'ok')
})

test('publicador: error, trabado y al día', () => {
  const base = { horarios: [{ red: 'linkedin', hora: '09:00:00' }], conexiones: [{ red: 'linkedin' }], redesAutomaticas: ['linkedin'] }
  const aprobado = { red: 'linkedin', estado: 'aprobado', error_publicacion: null }
  assert.equal(chequearPublicador({ ...base, piezasHoy: [aprobado], ahora: T('2026-10-06T12:20:00Z') }).estado, 'ok')
  assert.equal(chequearPublicador({ ...base, piezasHoy: [aprobado], ahora: T('2026-10-06T12:40:00Z') }).estado, 'falla')
  assert.equal(chequearPublicador({ ...base, piezasHoy: [{ ...aprobado, error_publicacion: 'LinkedIn respondió 500.' }], ahora: T('2026-10-06T12:00:00Z') }).estado, 'falla')
  assert.equal(chequearPublicador({ ...base, conexiones: [], piezasHoy: [aprobado], ahora: T('2026-10-06T15:00:00Z') }).estado, 'ok')
})

test('conexiones y preguntas', () => {
  const ahora = T('2026-10-06T12:00:00Z')
  assert.equal(chequearConexiones({ conexiones: [{ red: 'linkedin', expira_at: '2026-10-05T00:00:00Z' }], ahora }).estado, 'falla')
  assert.equal(chequearConexiones({ conexiones: [{ red: 'linkedin', expira_at: '2026-10-09T00:00:00Z' }], ahora }).estado, 'aviso')
  assert.equal(chequearConexiones({ conexiones: [{ red: 'linkedin', expira_at: '2026-12-01T00:00:00Z' }], ahora }).estado, 'ok')
  assert.equal(chequearPreguntas({ faltaInfo: [{ fecha: '2026-10-07' }], ahora }).estado, 'aviso')
  assert.equal(chequearPreguntas({ faltaInfo: [{ fecha: '2026-10-20' }], ahora }).estado, 'ok')
})

test('crons y estado general', () => {
  const ahora = T('2026-10-06T12:00:00Z')
  const ok = [{ jobname: 'up-pipeline', ultimo_inicio: '2026-10-06T10:52:00Z', ultimo_estado: 'succeeded' }, { jobname: 'up-publicador', ultimo_inicio: '2026-10-06T11:45:00Z', ultimo_estado: 'succeeded' }]
  assert.equal(chequearCrons({ crons: ok, ahora }).estado, 'ok')
  assert.equal(chequearCrons({ crons: [ok[0]], ahora }).estado, 'falla')
  assert.equal(chequearCrons({ crons: [ok[0], { ...ok[1], ultimo_inicio: '2026-10-06T10:00:00Z' }], ahora }).estado, 'falla')
  assert.equal(estadoGeneral([{ estado: 'ok' }, { estado: 'aviso' }]), 'aviso')
  assert.equal(estadoGeneral([{ estado: 'falla' }, { estado: 'aviso' }]), 'falla')
})
