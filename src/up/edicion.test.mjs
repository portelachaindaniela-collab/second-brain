import { test } from 'node:test'
import assert from 'node:assert/strict'
import { postsDeX, aHilo, captionDe, medir, recorte, marcaCalendario, resumenMetricas, versusMedia, leerCifra } from './edicion.mjs'

test('separa el hilo de X y lo vuelve a armar', () => {
  assert.deepEqual(postsDeX('1/ uno\n\n2/ dos\ncon salto\n\n3/ tres'), ['uno', 'dos\ncon salto', 'tres'])
  assert.deepEqual(postsDeX('un solo post\n\ncon párrafos'), ['un solo post\n\ncon párrafos'])
  assert.deepEqual(postsDeX('  '), [])
  assert.equal(aHilo(['uno', 'dos']), '1/ uno\n\n2/ dos')
  assert.equal(aHilo(['solo']), 'solo')
})

test('el caption del carrusel es lo que va después de «Caption:»', () => {
  assert.equal(captionDe('Placa 1. Título\nPlaca 2. Otra\nCaption:\nEl texto de abajo'), 'El texto de abajo')
  assert.equal(captionDe('Sin placas'), 'Sin placas')
})

test('mide cada red contra su límite', () => {
  assert.deepEqual(medir('linkedin', 'hola'), { red: 'linkedin', limite: 3000, usados: 4, excede: false })
  const x = medir('x', `1/ ${'a'.repeat(281)}\n\n2/ corto`)
  assert.equal(x.excede, true)
  assert.deepEqual(x.posts.map(p => p.largo), [281, 5])
  assert.equal(medir('x', '').usados, 0)
  assert.equal(medir('instagram', 'Placa 1. x\nCaption:\nabc').usados, 3)
})

test('recorta sin partir palabras', () => {
  assert.deepEqual(recorte('corto', 10), { visible: 'corto', cortado: false })
  assert.deepEqual(recorte('Entre abril y diciembre de 2023', 20), { visible: 'Entre abril y', cortado: true })
})

test('color en el calendario: red si salió, gris si está aprobada', () => {
  assert.equal(marcaCalendario({ red: 'x', estado: 'publicado' }), 'x')
  assert.equal(marcaCalendario({ red: 'x', estado: 'aprobado' }), 'aprobado')
  assert.equal(marcaCalendario({ red: 'x', estado: 'pendiente' }), null)
})

test('resume las métricas con la última medición', () => {
  const r = resumenMetricas([
    { dia: '2026-10-03', impresiones: 2000, reacciones: 80, comentarios: 10, compartidos: 5 },
    { dia: '2026-10-01', impresiones: 900, reacciones: 30, comentarios: null, compartidos: null },
  ])
  assert.equal(r.ultima.dia, '2026-10-03')
  assert.equal(r.interaccion, 95 / 2000)
  assert.deepEqual(r.serie.map(s => s.valor), [900, 2000])
  assert.equal(resumenMetricas([]), null)
  assert.equal(resumenMetricas([{ dia: '2026-10-01', impresiones: null, reacciones: 3 }]).interaccion, null)
})

test('compara con la media solo si hay con qué', () => {
  assert.equal(versusMedia(150, [100, 100]), 0.5)
  assert.equal(versusMedia(150, [100]), null)
  assert.equal(versusMedia(null, [1, 2]), null)
})

test('lee cifras escritas a mano', () => {
  assert.equal(leerCifra('2.140'), 2140)
  assert.equal(leerCifra(''), null)
  assert.ok(Number.isNaN(leerCifra('12a')))
})
