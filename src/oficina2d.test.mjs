import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vozDe } from './oficina2d/reunion.mjs'

test('la voz de cada agente en las reuniones es fija', () => {
  assert.deepEqual(vozDe('up:noruega'), vozDe('up:noruega'))
  assert.ok(vozDe('up:noruega').tono >= 0.8 && vozDe('up:noruega').tono <= 1.28)
})
