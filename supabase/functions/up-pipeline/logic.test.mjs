import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hoyAR, leerFecha, planificar, leerInvestigacion, formatoDe, armarPieza, chequearLargos,
  leerRevision, describirProblemas, parsearJson, promptRedactor, LIMITES, piezaParaTrabajar, esperaPedida,
} from './logic.mjs'

const dia = { tema_semana: 'Quién soy', tema_dia: 'Colegiales', tema_instagram: null, redes: ['linkedin', 'x'], formato_instagram: 'ninguno', fotos_propias: false }
const ficha = [{ id: 'a', grupo: 'Colegiales', dato: 'Equipo de 7 personas' }, { id: 'b', grupo: 'AFA', dato: 'Acreditaciones de hasta 200 personas' }]

test('hoyAR usa el día de Buenos Aires aunque en UTC ya sea mañana', () => {
  assert.equal(hoyAR(new Date('2026-10-05T01:30:00Z')), '2026-10-04')
})

test('leerFecha acepta AAAA-MM-DD, vacío como null y rechaza otro formato', () => {
  assert.equal(leerFecha({ fecha: '2026-10-06' }), '2026-10-06')
  assert.equal(leerFecha({}), null)
  assert.throws(() => leerFecha({ fecha: '06/10/2026' }))
})

test('planificar: LinkedIn y X siempre; Instagram solo si tiene formato', () => {
  assert.deepEqual(planificar(dia), ['linkedin', 'x'])
  assert.deepEqual(planificar({ ...dia, redes: ['linkedin', 'x', 'instagram'], formato_instagram: 'carrusel' }), ['linkedin', 'x', 'instagram'])
  assert.deepEqual(planificar({ ...dia, redes: ['linkedin', 'x', 'instagram'], formato_instagram: 'ninguno' }), ['linkedin', 'x'])
})

test('leerInvestigacion descarta ids que no están en la ficha', () => {
  assert.deepEqual(leerInvestigacion({ suficiente: true, datos: ['a', 'zzz'], pregunta: null }, ficha), { suficiente: true, datos: ['a'], pregunta: null })
})

test('leerInvestigacion: si no es suficiente siempre deja una pregunta', () => {
  assert.equal(leerInvestigacion({ suficiente: false, datos: [], pregunta: '¿Qué medías?' }, ficha).pregunta, '¿Qué medías?')
  const sinPregunta = leerInvestigacion({ suficiente: false, datos: [] }, ficha)
  assert.equal(sinPregunta.suficiente, false)
  assert.ok(sinPregunta.pregunta)
})

test('formatoDe distingue carrusel, fotos propias y reel', () => {
  assert.equal(formatoDe('instagram', { ...dia, formato_instagram: 'carrusel' }), 'carrusel')
  assert.equal(formatoDe('instagram', { ...dia, formato_instagram: 'carrusel', fotos_propias: true }), 'fotos')
  assert.equal(formatoDe('instagram', { ...dia, formato_instagram: 'reel' }), 'reel')
  assert.equal(formatoDe('x', dia), 'x')
})

test('armarPieza numera el hilo de X y deja un post solo sin numerar', () => {
  assert.equal(armarPieza('x', dia, { posts: ['uno', 'dos'] }).texto, '1/ uno\n\n2/ dos')
  assert.equal(armarPieza('x', dia, { posts: ['solo'] }).texto, 'solo')
  assert.throws(() => armarPieza('linkedin', dia, { texto: '  ' }))
})

test('armarPieza arma el carrusel con placas y caption', () => {
  const p = armarPieza('instagram', { ...dia, formato_instagram: 'carrusel' }, { placas: [{ titulo: 'T1', texto: 'x' }, { titulo: 'T2', texto: 'y' }], caption: 'cap' })
  assert.equal(p.contenido.placas.length, 2)
  assert.match(p.texto, /^Placa 1\. T1\nx/)
  assert.match(p.texto, /Caption:\ncap$/)
})

test('chequearLargos marca posts de X largos, links en X y carruseles fuera de rango', () => {
  const largo = armarPieza('x', dia, { posts: ['a'.repeat(LIMITES.x_post + 1), 'mirá https://x.com'] })
  const motivos = chequearLargos('x', largo).map(p => p.motivo).join(' ')
  assert.match(motivos, /post 1/)
  assert.match(motivos, /links/)
  const carrusel = armarPieza('instagram', { ...dia, formato_instagram: 'carrusel' }, { placas: [{ titulo: 'solo', texto: '' }], caption: 'c' })
  assert.equal(chequearLargos('instagram', carrusel).length, 1)
  assert.deepEqual(chequearLargos('linkedin', armarPieza('linkedin', dia, { texto: 'ok' })), [])
})

test('leerRevision no da ok si hay problemas aunque el modelo diga ok', () => {
  assert.equal(leerRevision({ ok: true, problemas: [{ fragmento: '9 personas', motivo: 'no está en la ficha' }] }).ok, false)
  assert.equal(leerRevision({ ok: true, problemas: [] }).ok, true)
})

test('describirProblemas cita el fragmento cuando lo hay', () => {
  assert.equal(describirProblemas([{ fragmento: '9 personas', motivo: 'no está' }, { fragmento: null, motivo: 'largo' }]), '«9 personas»: no está\nlargo')
})

test('parsearJson limpia los bloques de código y falla con texto que no es JSON', () => {
  assert.deepEqual(parsearJson('```json\n{"ok":true}\n```'), { ok: true })
  assert.throws(() => parsearJson('hola'))
})

test('promptRedactor incluye la corrección y la versión anterior', () => {
  const p = promptRedactor({ red: 'linkedin', dia, datos: ficha, respuesta: null, correccion: { motivos: '«9»: no está', anterior: 'texto viejo' } })
  assert.match(p.usuario, /«9»: no está/)
  assert.match(p.usuario, /texto viejo/)
  assert.match(p.sistema, /DATOS o de RESPUESTA DE DANIELA/)
})

test('piezaParaTrabajar completa solo lo que falta salvo que se pida regenerar', () => {
  assert.equal(piezaParaTrabajar({ estado: 'pendiente', texto: null }), true)
  assert.equal(piezaParaTrabajar({ estado: 'pendiente', texto: 'listo' }), false)
  assert.equal(piezaParaTrabajar({ estado: 'pendiente', texto: 'listo' }, true), true)
  assert.equal(piezaParaTrabajar({ estado: 'error', texto: null }), true)
  assert.equal(piezaParaTrabajar({ estado: 'falta_info', respuesta: null }), false)
  assert.equal(piezaParaTrabajar({ estado: 'falta_info', respuesta: 'medíamos alcance' }), true)
  assert.equal(piezaParaTrabajar({ estado: 'aprobado', texto: 'x' }, true), false)
  assert.equal(piezaParaTrabajar({ estado: 'revision', texto: 'x' }, true), false)
})

test('esperaPedida lee el retryDelay o el texto del error de cuota', () => {
  assert.equal(esperaPedida({ error: { details: [{ retryDelay: '47s' }] } }), 47)
  assert.equal(esperaPedida({ error: { message: 'Quota exceeded. Please retry in 12.5s.' } }), 12.5)
  assert.equal(esperaPedida({ error: { message: 'otra cosa' } }), null)
})

test('los problemas llevan tipo: formato (código), dato o cámara (revisor)', () => {
  const largo = armarPieza('linkedin', dia, { texto: 'a'.repeat(LIMITES.linkedin + 1) })
  assert.equal(chequearLargos('linkedin', largo)[0].tipo, 'formato')
  const r = leerRevision({ ok: false, problemas: [{ tipo: 'camara', fragmento: 'en el video', motivo: 'sugiere cámara' }, { fragmento: '9', motivo: 'no está' }] })
  assert.deepEqual(r.problemas.map(p => p.tipo), ['camara', 'dato'])
})
