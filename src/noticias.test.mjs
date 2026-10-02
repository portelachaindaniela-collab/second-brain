import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrar, porTema, destacadas, dominioRaiz, newslettersDelMail, haceCuanto, cifrasNoticias, temaPrincipal } from './noticias.mjs'

const AHORA = Date.parse('2026-10-01T22:00:00Z')
const hace = h => new Date(AHORA - h * 3_600_000).toISOString()
let id = 0
const nota = (o = {}) => ({ id: ++id, titulo: 'Título', medio: 'Medio', pais: 'AR', idioma: 'es', canal: 'web', temas: ['ia'], publicada_at: hace(1), leida: false, guardada: false, imagen: null, ...o })

test('filtrar: país, canal, sin leer, guardadas y texto sin acentos', () => {
  const ns = [nota({ pais: 'AR', titulo: 'La Selección' }), nota({ pais: 'ES', canal: 'x' }), nota({ leida: true, guardada: true })]
  assert.equal(filtrar(ns, { pais: 'ES' }).length, 1)
  assert.equal(filtrar(ns, { x: false }).length, 2)
  assert.equal(filtrar([...ns, nota({ canal: 'bluesky', de_referente: true })], { bluesky: false }).length, 3)
  assert.equal(filtrar([...ns, nota({ de_referente: true })], { fuente: 'referente' }).length, 1)
  assert.equal(filtrar([...ns, nota({ de_referente: true })], { fuente: 'medio' }).length, 3)
  assert.equal(filtrar(ns, { soloSinLeer: true }).length, 2)
  assert.equal(filtrar(ns, { guardadas: true }).length, 1)
  assert.equal(filtrar(ns, { texto: 'seleccion' }).length, 1)
})

test('porTema: ordena por fecha y no repite política de IA dentro de IA', () => {
  const a = nota({ temas: ['ia'], publicada_at: hace(5) })
  const b = nota({ temas: ['ia', 'politica_ia'] })
  const c = nota({ temas: ['ia'], publicada_at: hace(2) })
  const t = porTema([a, b, c])
  assert.deepEqual(t.ia.notas.map(n => n.id), [c.id, a.id])
  assert.deepEqual(t.politica_ia.notas.map(n => n.id), [b.id])
  assert.deepEqual(t.datos, { notas: [], referentes: [] })
  const r = nota({ temas: ['tecnologia'], de_referente: true })
  assert.deepEqual(porTema([r]).tecnologia, { notas: [], referentes: [r] })
})

test('destacadas: agrupa titulares parecidos de medios distintos y completa con lo último con foto', () => {
  const ns = [
    nota({ medio: 'A', titulo: 'Brasil aprueba ley regulación inteligencia artificial Senado', imagen: 'a.jpg' }),
    nota({ medio: 'B', titulo: 'El Senado de Brasil aprueba la ley de regulación de inteligencia artificial' }),
    nota({ medio: 'C', titulo: 'Senado Brasil aprueba regulación inteligencia artificial tras debate' }),
    nota({ medio: 'D', titulo: 'Récord de público en la Liga F', temas: ['futbol_femenino'], imagen: 'd.jpg' }),
    nota({ medio: 'E', titulo: 'Vieja', publicada_at: hace(30), imagen: 'e.jpg', temas: ['datos'] }),
  ]
  const d = destacadas(ns, AHORA)
  assert.equal(d[0].noticia.medio, 'A')
  assert.equal(d[0].otros, 2)
  assert.equal(d[1].noticia.medio, 'D')
  assert.equal(d.length, 2)
})

test('temaPrincipal: el más específico', () => {
  assert.equal(temaPrincipal({ temas: ['ia', 'politica_ia'] }), 'politica_ia')
  assert.equal(temaPrincipal({ temas: ['tecnologia', 'ia'] }), 'ia')
})

test('dominioRaiz y newsletters del mail', () => {
  assert.equal(dominioRaiz('https://www.lanacion.com.ar/x'), 'lanacion.com.ar')
  assert.equal(dominioRaiz('newsletter@news.lanacion.com.ar'), 'lanacion.com.ar')
  assert.equal(dominioRaiz('https://feeds.bbci.co.uk/a'), 'bbci.co.uk')
  assert.equal(dominioRaiz('hola@mail.technologyreview.com'), 'technologyreview.com')
  const medios = [{ medio: 'La Nación', sitio: 'https://www.lanacion.com.ar' }, { medio: 'MIT', sitio: 'https://www.technologyreview.com' }]
  const mails = [{ id: 1, from_addr: 'newsletter@news.lanacion.com.ar' }, { id: 2, from_addr: 'amiga@gmail.com' }]
  assert.deepEqual(newslettersDelMail(mails, medios).map(x => x.medio.medio), ['La Nación'])
})

test('haceCuanto y cifras', () => {
  assert.equal(haceCuanto(hace(0.2), AHORA), 'hace 12 min')
  assert.equal(haceCuanto(hace(3), AHORA), 'hace 3 h')
  assert.equal(haceCuanto(hace(30), AHORA), 'ayer')
  const c = cifrasNoticias([nota({ pais: 'AR' }), nota({ pais: 'ES', leida: true, guardada: true }), nota({ publicada_at: hace(40) })], AHORA)
  assert.deepEqual(c, { ultimas24: 2, paises: 2, sinLeer: 2, guardadas: 1 })
})
