import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tipoAdjunto, validarAdjuntos, rutaAdjunto, pesoLegible, resumenAdjuntos, MAX_IMAGENES } from './adjuntos.mjs'

const MB = 1024 * 1024
const archivo = (name, size = MB) => ({ name, size })

test('reconoce documentos e imágenes', () => {
  assert.equal(tipoAdjunto('Propuesta.PDF').tipo, 'documento')
  assert.equal(tipoAdjunto('deck.pptx').mime, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
  assert.equal(tipoAdjunto('foto.jpeg').tipo, 'imagen')
  assert.equal(tipoAdjunto('video.mp4'), null)
  assert.equal(tipoAdjunto('sin-extension'), null)
})

test('sigue la regla de LinkedIn: un documento o hasta 20 imágenes', () => {
  assert.equal(validarAdjuntos([], [archivo('a.pdf')]), '')
  assert.match(validarAdjuntos([], [archivo('a.pdf'), archivo('b.pdf')]), /un solo documento/)
  assert.match(validarAdjuntos([{ tipo: 'documento' }], [archivo('foto.png')]), /no deja mezclar/)
  assert.equal(validarAdjuntos([], Array.from({ length: MAX_IMAGENES }, (_, i) => archivo(`f${i}.jpg`))), '')
  assert.match(validarAdjuntos([{ tipo: 'imagen' }], Array.from({ length: MAX_IMAGENES }, (_, i) => archivo(`f${i}.jpg`))), /hasta 20/)
  assert.match(validarAdjuntos([], [archivo('video.mp4')]), /no se puede adjuntar/)
  assert.match(validarAdjuntos([], [archivo('enorme.pdf', 120 * MB)]), /100 MB/)
  assert.match(validarAdjuntos([], [archivo('pesada.png', 12 * MB)]), /10 MB por imagen/)
})

test('arma rutas limpias por dueña, publicación y red', () => {
  assert.equal(rutaAdjunto('u1', 'c1', 'linkedin', 'Propuesta Olé (final).pdf', 5), 'u1/c1/linkedin/5-Propuesta-Ole-final-.pdf')
})

test('describe los adjuntos en pocas palabras', () => {
  assert.equal(pesoLegible(300 * 1024), '300 KB')
  assert.equal(pesoLegible(2.5 * MB), '2,5 MB')
  assert.equal(resumenAdjuntos([]), '')
  assert.equal(resumenAdjuntos([{ nombre: 'a.pdf', tipo: 'documento' }]), 'a.pdf')
  assert.equal(resumenAdjuntos([{ tipo: 'imagen' }, { tipo: 'imagen' }]), '2 imágenes')
})
