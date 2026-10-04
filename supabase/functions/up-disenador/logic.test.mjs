import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placasDeTexto, necesitaDiseno, rutaDeAsset, oidcValido } from './logic.mjs'
import { armarPieza } from '../up-pipeline/logic.mjs'

const dia = { formato_instagram: 'carrusel', fotos_propias: false }

test('lee las placas y el caption que escribe el redactor', () => {
  const { texto } = armarPieza('instagram', dia, {
    placas: [{ titulo: '+170%', texto: 'de alcance en Instagram.' }, { titulo: 'Los números', texto: '4.300 seguidores nuevos' }],
    caption: 'Un caso de San Luis FC.',
  })
  assert.deepEqual(placasDeTexto(texto), {
    placas: [{ titulo: '+170%', texto: 'de alcance en Instagram.' }, { titulo: 'Los números', texto: '4.300 seguidores nuevos' }],
    caption: 'Un caso de San Luis FC.',
  })
})

test('respeta lo que la dueña editó a mano, con párrafos dentro de una placa', () => {
  const texto = 'Placa 1. Título nuevo\nPrimera línea\n\nSegunda línea\nPlaca 2. Solo título\n\nCaption:\nHola'
  assert.deepEqual(placasDeTexto(texto), {
    placas: [{ titulo: 'Título nuevo', texto: 'Primera línea\n\nSegunda línea' }, { titulo: 'Solo título', texto: '' }],
    caption: 'Hola',
  })
})

test('sin el formato de placas no devuelve ninguna', () => {
  assert.deepEqual(placasDeTexto('Un texto cualquiera'), { placas: [], caption: '' })
  assert.deepEqual(placasDeTexto(null), { placas: [], caption: '' })
})

test('solo diseña carruseles con texto nuevo y sin publicar', () => {
  const base = { red: 'instagram', contenido: { formato: 'carrusel' }, texto: 'Placa 1. A', estado: 'pendiente', assets_texto: null }
  assert.equal(necesitaDiseno(base), true)
  assert.equal(necesitaDiseno({ ...base, assets_texto: 'Placa 1. A' }), false)
  assert.equal(necesitaDiseno({ ...base, estado: 'publicado' }), false)
  assert.equal(necesitaDiseno({ ...base, contenido: { formato: 'fotos' } }), false)
  assert.equal(necesitaDiseno({ ...base, texto: null }), false)
})

test('saca la ruta del bucket de la URL pública', () => {
  assert.equal(rutaDeAsset('https://x.supabase.co/storage/v1/object/public/up-assets/u/p/1-1.png'), 'u/p/1-1.png')
  assert.equal(rutaDeAsset('https://otra.cosa/a.png'), null)
})

test('solo acepta el token del workflow del diseñador en master de este repo', () => {
  const ok = { repository: 'portelachaindaniela-collab/second-brain', workflow_ref: 'portelachaindaniela-collab/second-brain/.github/workflows/up-disenador.yml@refs/heads/master' }
  assert.equal(oidcValido(ok), true)
  assert.equal(oidcValido({ ...ok, workflow_ref: ok.workflow_ref.replace('master', 'otra-rama') }), false)
  assert.equal(oidcValido({ ...ok, workflow_ref: ok.workflow_ref.replace('up-disenador', 'deploy-pages') }), false)
  assert.equal(oidcValido({ ...ok, repository: 'otra/second-brain' }), false)
  assert.equal(oidcValido(null), false)
})
