import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoGoogle, debeSincronizarAlAbrir } from './googleEstado.mjs'

const ok = { estado: 'ok', finalizado_at: '2026-09-30T19:00:10Z', payload: { conectado: true, cuenta: 'yo@gmail.com', eventos: 10, mails: 20 } }

test('conectada: sale de la última corrida con respuesta de Google', () => {
  assert.deepEqual(estadoGoogle([ok]), { conectado: true, cuenta: 'yo@gmail.com', sincronizado_at: '2026-09-30T19:00:10Z' })
})

test('pide reconectar', () => {
  assert.deepEqual(estadoGoogle([{ estado: 'error', payload: { conectado: false, reconectar: true } }, ok]), { conectado: false, reconectar: true })
})

test('una corrida en curso o un error sin respuesta no cambian el estado conocido', () => {
  const corriendo = { estado: 'corriendo', payload: null }
  const corte = { estado: 'error', payload: null, error: 'TypeError: fetch failed' }
  assert.equal(estadoGoogle([corriendo, corte, ok]).conectado, true)
  assert.equal(estadoGoogle([]), null)
  assert.equal(estadoGoogle([corte]), null)
})

test('al abrir: sincroniza si no hay corridas o la última es de hace más de 5 minutos', () => {
  const ahora = Date.parse('2026-09-30T19:10:00Z')
  assert.equal(debeSincronizarAlAbrir(null, ahora), true)
  assert.equal(debeSincronizarAlAbrir({ estado: 'ok', iniciado_at: '2026-09-30T19:07:00Z' }, ahora), false)
  assert.equal(debeSincronizarAlAbrir({ estado: 'ok', iniciado_at: '2026-09-30T19:04:00Z' }, ahora), true)
  assert.equal(debeSincronizarAlAbrir({ estado: 'error', iniciado_at: '2026-09-30T19:04:00Z' }, ahora), true)
})

test('al abrir: no dispara otra si hay una en curso reciente, sí si quedó trabada', () => {
  const ahora = Date.parse('2026-09-30T19:10:00Z')
  assert.equal(debeSincronizarAlAbrir({ estado: 'corriendo', iniciado_at: '2026-09-30T19:08:00Z' }, ahora), false)
  assert.equal(debeSincronizarAlAbrir({ estado: 'corriendo', iniciado_at: '2026-09-30T18:55:00Z' }, ahora), true)
})
