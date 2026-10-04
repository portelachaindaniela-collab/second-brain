import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diaAR, ultimosDias, resultadosRevisor, duracionS, resumen } from './estadisticas.mjs'

const ahora = Date.parse('2026-10-06T15:00:00Z')
const paso = (agente, accion, red, at) => ({ agente, accion, red, at, detalle: null })

const corrida = {
  id: 'c1', estado: 'ok', iniciado_at: '2026-10-06T09:02:00Z', finalizado_at: '2026-10-06T09:02:49Z',
  pasos: [
    paso('planificador', 'planificó', null, '2026-10-06T09:02:01Z'),
    paso('investigador', 'eligió 6 datos', null, '2026-10-06T09:02:09Z'),
    paso('redactor', 'escribió', 'linkedin', '2026-10-06T09:02:15Z'),
    paso('revisor', 'aprobó', 'linkedin', '2026-10-06T09:02:22Z'),
    paso('redactor', 'escribió', 'x', '2026-10-06T09:02:31Z'),
    paso('revisor', 'marcó', 'x', '2026-10-06T09:02:38Z'),
    paso('redactor', 'corrigió (vuelta 1)', 'x', '2026-10-06T09:02:44Z'),
    paso('revisor', 'aprobó', 'x', '2026-10-06T09:02:49Z'),
  ],
}
const publicacion = { id: 'c2', estado: 'ok', iniciado_at: '2026-10-05T12:00:00Z', finalizado_at: '2026-10-05T12:00:02Z', pasos: [paso('publicador', 'publicó', 'linkedin', '2026-10-05T12:00:01Z')] }
const vieja = { id: 'c0', estado: 'ok', iniciado_at: '2026-09-15T09:02:00Z', finalizado_at: '2026-09-15T09:02:30Z', pasos: [paso('redactor', 'escribió', 'linkedin', '2026-09-15T09:02:10Z'), paso('revisor', 'pasó a revisión', 'linkedin', '2026-09-15T09:02:20Z')] }

test('días en hora de Buenos Aires', () => {
  assert.equal(diaAR('2026-10-07T02:30:00Z'), '2026-10-06')
  assert.deepEqual(ultimosDias(3, ahora), ['2026-10-04', '2026-10-05', '2026-10-06'])
})

test('resultado del revisor por borrador', () => {
  assert.deepEqual(resultadosRevisor(corrida).map(r => [r.red, r.resultado]), [['linkedin', 'directo'], ['x', 'corregido']])
  assert.deepEqual(resultadosRevisor(vieja).map(r => r.resultado), ['revision'])
  assert.equal(duracionS(corrida), 49)
  assert.equal(duracionS({ ...corrida, finalizado_at: null }), null)
})

test('resumen de 14 días', () => {
  const r = resumen([corrida, publicacion, vieja], ahora)
  assert.equal(r.borradores, 2)
  assert.equal(r.revisados, 2)
  assert.equal(r.aprobadosPct, 100)
  assert.equal(r.primerIntentoPct, 50)
  assert.deepEqual(r.porDia['2026-10-06'], { directo: 1, corregido: 1, revision: 0 })
  assert.equal(r.duracionMedia, 49)
  assert.deepEqual(r.duraciones, [{ id: 'c1', s: 49, corrigio: true }])
  assert.equal(r.publicados, 1)
  assert.equal(r.totalAgente.revisor, 3)
  assert.equal(r.actividad.publicador.at(-2), 1)
})

test('lo de antes de la ventana cuenta para la comparación, no para el resumen', () => {
  const r = resumen([vieja], Date.parse('2026-10-02T15:00:00Z'))
  assert.equal(r.borradores, 0)
  assert.equal(r.borradoresAntes, 1)
  assert.equal(r.aprobadosPct, null)
})
