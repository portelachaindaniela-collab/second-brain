import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  leerParametros, PARAMETROS_DEFECTO, urlBusquedaEventbrite, candidatosDeBusqueda, filaDeDetalle,
  claveEvento, diaAR, entradaDe, dentroDeVentana, coincidePalabra,
} from './logic.mjs'

const ld = obj => `<script type="application/ld+json" data-next-head="">${JSON.stringify(obj)}</script>`

const busqueda = `<html>${ld({ '@type': 'Organization' })}${ld({
  '@type': 'ItemList', itemListElement: [
    { item: { '@type': 'BusinessEvent', name: 'AI IN  LATAM ', startDate: '2026-10-01', url: 'https://www.eventbrite.com.ar/e/ai-in-latam-tickets-1?aff=x' } },
    { item: { '@type': 'Event', name: 'Sin fecha', url: 'https://x/e/2' } },
    { item: { '@type': 'Organization', name: 'No es evento', startDate: '2026-10-01', url: 'https://x/e/3' } },
  ],
})}</html>`

const detalle = (extra = {}) => `<html>${ld({
  '@type': 'EducationEvent', name: 'Programación y Robótica IA', startDate: '2026-10-05T17:00:00-03:00', endDate: '2026-10-05T19:00:00-03:00',
  eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  location: { name: 'Av. Dr. Ricardo Balbín 3226', address: { streetAddress: '3226 Avenida Doctor Ricardo Balbín, San Miguel' } },
  url: 'https://www.eventbrite.com.ar/e/programacion-y-robotica-ia-tickets-2000199359127?aff=ebdssbdestsearch',
  offers: [{ '@type': 'AggregateOffer', lowPrice: '0.0', highPrice: '0.0' }], ...extra,
})}</html>`

test('parámetros: completa lo que falta y respeta lo configurado', () => {
  assert.deepEqual(leerParametros(null), { ...PARAMETROS_DEFECTO })
  const p = leerParametros({ dias_adelante: 7, terminos: ['ia', ' '], fuentes: [{ tipo: 'eventbrite', activa: false }, { tipo: 'luma' }] })
  assert.equal(p.dias_adelante, 7)
  assert.deepEqual(p.terminos, ['ia'])
  assert.deepEqual(p.fuentes, [{ tipo: 'luma' }])
  assert.equal(leerParametros({ dias_adelante: 999 }).dias_adelante, 30)
})

test('url de búsqueda de Eventbrite con término en slug', () => {
  assert.equal(urlBusquedaEventbrite('argentina--buenos-aires', 'Inteligencia Artificial'), 'https://www.eventbrite.com.ar/d/argentina--buenos-aires/inteligencia-artificial/')
  assert.match(urlBusquedaEventbrite('argentina--buenos-aires', 'datos', 2), /\/datos\/\?page=2$/)
})

test('candidatos: solo eventos con nombre, fecha y link, sin parámetros de tracking', () => {
  assert.deepEqual(candidatosDeBusqueda(busqueda), [{ nombre: 'AI IN LATAM', fecha: '2026-10-01', url: 'https://www.eventbrite.com.ar/e/ai-in-latam-tickets-1' }])
  assert.deepEqual(candidatosDeBusqueda('<html>nada</html>'), [])
})

test('detalle → fila con hora, lugar y entrada libre', () => {
  const { fila } = filaDeDetalle(detalle())
  assert.equal(fila.inicio_at, '2026-10-05T20:00:00.000Z')
  assert.equal(fila.fin_at, '2026-10-05T22:00:00.000Z')
  assert.equal(fila.direccion, '3226 Avenida Doctor Ricardo Balbín, San Miguel')
  assert.equal(fila.url, 'https://www.eventbrite.com.ar/e/programacion-y-robotica-ia-tickets-2000199359127')
  assert.equal(fila.tiene_entrada, false)
})

test('detalle: descarta cancelados y online salvo que se pidan', () => {
  assert.equal(filaDeDetalle(detalle({ eventStatus: 'https://schema.org/EventCancelled' })).descartado, 'cancelado o postergado')
  const online = detalle({ eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode' })
  assert.equal(filaDeDetalle(online).descartado, 'online')
  assert.ok(filaDeDetalle(online, { incluir_online: true }).fila)
})

test('precio de la entrada', () => {
  assert.deepEqual(entradaDe([{ lowPrice: '149999.0', highPrice: '435600.0' }]), { tiene_entrada: true, precio: '$149.999 – $435.600' })
  assert.deepEqual(entradaDe([{ lowPrice: '100000', highPrice: '100000' }]), { tiene_entrada: true, precio: '$100.000' })
  assert.deepEqual(entradaDe([{ lowPrice: '0', highPrice: '5000' }]), { tiene_entrada: true, precio: '$5.000 (hay gratis)' })
  assert.deepEqual(entradaDe(undefined), { tiene_entrada: true, precio: null })
})

test('mismo evento = mismo nombre normalizado y mismo día en Argentina', () => {
  assert.equal(claveEvento('AI in LATAM!', '2026-10-01'), claveEvento('ai  in latam', '2026-10-01'))
  assert.equal(claveEvento('Programación IA', '2026-10-05'), claveEvento('programacion ia', '2026-10-05'))
  assert.notEqual(claveEvento('AI in LATAM', '2026-10-01'), claveEvento('AI in LATAM', '2026-10-02'))
  assert.equal(diaAR('2026-10-02T01:00:00Z'), '2026-10-01')
})

test('ventana de días hacia adelante', () => {
  const ahora = Date.parse('2026-09-30T15:00:00Z')
  assert.equal(dentroDeVentana('2026-09-30', ahora, 30), true)
  assert.equal(dentroDeVentana('2026-10-30', ahora, 30), true)
  assert.equal(dentroDeVentana('2026-10-31', ahora, 30), false)
  assert.equal(dentroDeVentana('2026-09-29', ahora, 30), false)
})

test('palabras clave: palabra entera, sin tildes ni mayúsculas', () => {
  const p = ['ia', 'tecnología', 'marketing']
  assert.equal(coincidePalabra('Prompt hacking: técnicas en IA', p), true)
  assert.equal(coincidePalabra('KCD, para los amantes de la tecnologia open source', p), true)
  assert.equal(coincidePalabra('Vino & Mitología', p), false)
  assert.equal(coincidePalabra('Degustación de 12 vinos', p), false)
  assert.equal(coincidePalabra('lo que sea', []), true)
})

test('detalle: descarta lo que no nombra ninguna palabra clave, mirando también la descripción', () => {
  const vino = detalle({ name: 'Vino & Mitología', description: 'Leyendas y copas' })
  assert.equal(filaDeDetalle(vino, { palabras_clave: ['ia'] }).descartado, 'no nombra ninguna palabra clave')
  const kcd = detalle({ name: 'KCD Argentina 2026', description: 'para los amantes de la tecnología' })
  assert.ok(filaDeDetalle(kcd, { palabras_clave: ['tecnología'] }).fila)
})

test('Luma y Meetup: URLs de la ciudad y de la búsqueda', async () => {
  const { urlCiudadLuma, urlBusquedaMeetup, FUENTES_SIN_TERMINO } = await import('./logic.mjs')
  assert.equal(urlCiudadLuma('buenos-aires'), 'https://luma.com/buenos-aires')
  assert.equal(urlBusquedaMeetup('ar--Buenos Aires', 'inteligencia artificial'),
    'https://www.meetup.com/find/?location=ar--Buenos%20Aires&source=EVENTS&keywords=inteligencia%20artificial')
  assert.ok(FUENTES_SIN_TERMINO.has('luma'))
  assert.ok(!FUENTES_SIN_TERMINO.has('meetup'))
})

test('candidatos de Meetup: eventos sueltos, sin ItemList', () => {
  const html = ld({ '@type': 'Organization', name: 'Meetup' }) + ld([
    { '@type': 'Event', name: ' Build Your First AI Agent', startDate: '2026-11-12T22:00:00.000Z', url: 'https://www.meetup.com/grupo/events/317120108/?x=1' },
    { '@type': 'Event', name: 'Sin link', startDate: '2026-11-13T22:00:00.000Z' },
  ])
  assert.deepEqual(candidatosDeBusqueda(html), [
    { nombre: 'Build Your First AI Agent', fecha: '2026-11-12', url: 'https://www.meetup.com/grupo/events/317120108/' },
  ])
})

test('candidatos de Luma: ItemList de la página de la ciudad', () => {
  const html = ld({ '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item: { '@type': 'Event', name: 'Ecommerce Night #19', startDate: '2026-11-11T19:00:00.000-03:00', url: 'https://luma.com/yl5d8ne4' } }] })
  assert.deepEqual(candidatosDeBusqueda(html), [{ nombre: 'Ecommerce Night #19', fecha: '2026-11-11', url: 'https://luma.com/yl5d8ne4' }])
})

test('entrada: dólares de Luma con su moneda; Meetup sin precio es gratis', () => {
  assert.deepEqual(entradaDe([{ price: 20, priceCurrency: 'usd' }]), { tiene_entrada: true, precio: 'USD 20' })
  assert.deepEqual(entradaDe([{ price: 0, priceCurrency: 'usd' }]), { tiene_entrada: false, precio: null })
  assert.deepEqual(entradaDe(null, { sinOfertasEsGratis: true }), { tiene_entrada: false, precio: null })
  assert.deepEqual(entradaDe(null), { tiene_entrada: true, precio: null })
})

test('detalle de Luma: lugar y dirección del Place', () => {
  const html = ld({ '@type': 'Event', name: 'Ecommerce Night #19', url: 'https://luma.com/yl5d8ne4', startDate: '2026-11-11T19:00:00.000-03:00', endDate: '2026-11-11T23:00:00.000-03:00',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', description: 'Networking de ecommerce',
    location: { '@type': 'Place', name: 'Workplace by IRSA', address: { '@type': 'PostalAddress', streetAddress: 'Workplace by IRSA' } },
    offers: [{ '@type': 'Offer', price: 0, priceCurrency: 'usd' }] })
  const { fila } = filaDeDetalle(html, { palabras_clave: ['ecommerce'] })
  assert.equal(fila.nombre, 'Ecommerce Night #19')
  assert.equal(fila.inicio_at, '2026-11-11T22:00:00.000Z')
  assert.equal(fila.lugar, 'Workplace by IRSA')
  assert.equal(fila.tiene_entrada, false)
})

test('el tope por corrida se reparte entre fuentes, en ronda', async () => {
  const { repartirPorFuente } = await import('./logic.mjs')
  const c = (fuente, n) => Array.from({ length: n }, (_, i) => ({ fuente, url: `${fuente}${i}` }))
  const lista = [...c('eventbrite', 5), ...c('luma', 2), ...c('meetup', 1)]
  assert.deepEqual(repartirPorFuente(lista, 5).map(x => x.url), ['eventbrite0', 'luma0', 'meetup0', 'eventbrite1', 'luma1'])
  assert.equal(repartirPorFuente(lista, 100).length, 8)
})
