import test from 'node:test'
import assert from 'node:assert/strict'
import { EVENTOS_COMUNIDAD, eventosPendientes } from './comunidadEventos.mjs'

test('trae los cinco eventos publicados en la web de Comunidad', () => {
  assert.equal(EVENTOS_COMUNIDAD.length, 5)
  for (const e of EVENTOS_COMUNIDAD) {
    assert.ok(e.title.trim().length, 'título vacío')
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(e.starts_at))
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(e.ends_at))
    assert.ok(new Date(e.ends_at) > new Date(e.starts_at), `fin debe ser posterior al inicio en "${e.title}"`)
  }
})

test('no repite eventos ya presentes en el calendario, por título', () => {
  const pendientes = eventosPendientes(['Nerdearla 2026', 'Otra cosa'])
  assert.equal(pendientes.length, 4)
  assert.ok(!pendientes.some(e => e.title === 'Nerdearla 2026'))
})

test('sin eventos existentes, trae el catálogo completo', () => {
  assert.equal(eventosPendientes([]).length, 5)
})
