import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificar, leerFeed, leerPostsX, leerPostsBluesky, filasDeItems, mediosATocar, leerParametros, ogImage, textoPlano, PARAMETROS_DEFECTO, codificacionDe,
} from './logic.mjs'

test('clasificar: temas por palabra entera, en varios idiomas', () => {
  assert.deepEqual(clasificar('La inteligencia artificial llega a las escuelas'), ['ia'])
  assert.deepEqual(clasificar('Künstliche Intelligenz in der Medizin'), ['ia'])
  assert.deepEqual(clasificar('Un ataque de ransomware paraliza hospitales').sort(), ['ciberseguridad'])
  assert.deepEqual(clasificar('Récord de público en la Liga F'), ['futbol_femenino'])
  assert.deepEqual(clasificar('Brasileirão Feminino: final no Pacaembu'), ['futbol_femenino'])
  assert.deepEqual(clasificar('Chile abre los datos abiertos de salud'), ['datos'])
  assert.deepEqual(clasificar('Sube el precio del dólar'), [])
})

test('clasificar: las siglas respetan mayúsculas y no se confunden con palabras', () => {
  assert.deepEqual(clasificar('Nuevo modelo de IA en Brasil'), ['ia'])
  assert.deepEqual(clasificar('EU unveils AI rules'), ['ia'])
  assert.deepEqual(clasificar('Ela disse que ia sair cedo'), [])
  assert.deepEqual(clasificar('Aí está o resultado'), [])
})

test('clasificar: política de IA necesita IA y contexto político, y suma IA', () => {
  assert.deepEqual(clasificar('El Senado debate la regulación de la IA').sort(), ['ia', 'politica_ia'])
  assert.deepEqual(clasificar('La regulación del transporte en el Senado'), [])
  assert.deepEqual(clasificar('Brussels delays parts of the AI Act').sort(), ['ia', 'politica_ia'])
})

test('clasificar: palabras ambiguas solo con su contexto', () => {
  assert.deepEqual(clasificar('Las jugadoras de hockey ganaron el oro'), [])
  assert.deepEqual(clasificar('Las jugadoras de la selección de fútbol vuelven a entrenar'), ['futbol_femenino'])
})

test('clasificar: los temas fijos del medio se suman siempre', () => {
  assert.deepEqual(clasificar('Arsenal vence a Chelsea 2-1', undefined, ['futbol_femenino']), ['futbol_femenino'])
  assert.deepEqual(clasificar('x', undefined, ['no_existe']), [])
})

const rss = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Medio</title>
<item><title><![CDATA[La IA &amp; los datos]]></title><link>https://medio.com/nota-1?utm=x</link>
<description><![CDATA[<p>Resumen con <b>HTML</b> &hellip;</p><img src="https://medio.com/foto-desc.jpg">]]></description>
<pubDate>Wed, 01 Oct 2026 12:00:00 GMT</pubDate><media:content url="https://medio.com/foto.jpg" medium="image"/></item>
<item><title>Sin imagen</title><link>/relativa</link><enclosure url="https://medio.com/a.mp3" type="audio/mpeg"/></item>
<item><title></title><link>https://medio.com/vacia</link></item>
</channel></rss>`

test('leerFeed: RSS con CDATA, entidades, imagen de media:content y links relativos', () => {
  const items = leerFeed(rss, 'https://medio.com')
  assert.equal(items.length, 2)
  assert.deepEqual(items[0], {
    titulo: 'La IA & los datos', url: 'https://medio.com/nota-1?utm=x', resumen: 'Resumen con HTML …',
    imagen: 'https://medio.com/foto.jpg', fecha: '2026-10-01T12:00:00.000Z',
  })
  assert.equal(items[1].url, 'https://medio.com/relativa')
  assert.equal(items[1].imagen, null)
  assert.equal(items[1].fecha, null)
})

test('leerFeed: Atom con link alternate e imagen dentro del contenido', () => {
  const atom = `<feed><entry><title type="html">Nota &amp;amp; Atom</title><link rel="replies" href="https://x.com/c"/>
  <link rel="alternate" href="https://x.com/nota"/><updated>2026-10-01T10:00:00Z</updated>
  <content type="html">&lt;img src="https://x.com/i.png"&gt; texto</content></entry></feed>`
  const [i] = leerFeed(atom, 'https://x.com')
  assert.equal(i.titulo, 'Nota & Atom')
  assert.equal(i.url, 'https://x.com/nota')
  assert.equal(i.imagen, 'https://x.com/i.png')
})

test('leerPostsX: saca links del texto, toma la foto y saltea reposts', () => {
  const json = { results: [
    { type: 'status', url: 'https://x.com/BBCSport/status/1', text: 'Lionesses win https://t.co/abc', created_at: 'Thu Oct 01 20:42:11 +0000 2026', author: { screen_name: 'BBCSport' }, media: { photos: [{ url: 'https://pbs.twimg.com/a.jpg' }] } },
    { type: 'status', url: 'https://x.com/otro/status/2', text: 'repost', created_at: 'Thu Oct 01 20:00:00 +0000 2026', author: { screen_name: 'otro' } },
  ] }
  assert.deepEqual(leerPostsX(json, 'bbcsport'), [{ titulo: 'Lionesses win', url: 'https://x.com/BBCSport/status/1', resumen: null, imagen: 'https://pbs.twimg.com/a.jpg', fecha: '2026-10-01T20:42:11.000Z' }])
  assert.deepEqual(leerPostsX({ code: 404 }, 'x'), [])
})

test('filasDeItems: solo lo reciente, con tema y sin repetir', () => {
  const ahora = Date.parse('2026-10-01T22:00:00Z')
  const medio = { id: 7, medio: 'Medio', pais: 'AR', idioma: 'es', temas: [] }
  const p = { ...leerParametros({}), dias_maximos: 3 }
  const items = [
    { titulo: 'La inteligencia artificial', url: 'https://a/1', fecha: '2026-10-01T10:00:00.000Z' },
    { titulo: 'La inteligencia artificial', url: 'https://a/1', fecha: '2026-10-01T10:00:00.000Z' },
    { titulo: 'Inteligencia artificial vieja', url: 'https://a/2', fecha: '2026-09-20T10:00:00.000Z' },
    { titulo: 'Clima de mañana', url: 'https://a/3', fecha: '2026-10-01T10:00:00.000Z' },
    { titulo: 'Ransomware sin fecha', url: 'https://a/4', fecha: null },
  ]
  const filas = filasDeItems(items, medio, 'web', p, ahora)
  assert.deepEqual(filas.map(f => [f.url, f.temas, f.publicada_at]), [
    ['https://a/1', ['ia'], '2026-10-01T10:00:00.000Z'],
    ['https://a/4', ['ciberseguridad'], '2026-10-01T22:00:00.000Z'],
  ])
  assert.equal(filas[0].medio_id, 7)
  assert.equal(filas[0].canal, 'web')
})

test('mediosATocar: primero los nunca leídos y los más viejos; saltea inactivos y sin fuente', () => {
  const medios = [
    { id: 1, rss: 'r', ultima_lectura_at: '2026-10-01T10:00:00Z' },
    { id: 2, rss: 'r', ultima_lectura_at: null },
    { id: 3, x: 'h', ultima_lectura_at: '2026-10-01T08:00:00Z' },
    { id: 4, rss: 'r', activo: false },
    { id: 5 },
  ]
  assert.deepEqual(mediosATocar(medios, 2).map(m => m.id), [2, 3])
})

test('leerParametros: valores por defecto y topes', () => {
  assert.equal(leerParametros(null).medios_por_corrida, PARAMETROS_DEFECTO.medios_por_corrida)
  assert.equal(leerParametros({ medios_por_corrida: 9999 }).medios_por_corrida, PARAMETROS_DEFECTO.medios_por_corrida)
  assert.deepEqual(Object.keys(leerParametros({}).temas), ['ia', 'politica_ia', 'tecnologia', 'ciberseguridad', 'futbol_femenino', 'marketing', 'comunicacion', 'datos'])
})

test('ogImage y textoPlano', () => {
  assert.equal(ogImage('<meta content="/og.jpg" property="og:image">', 'https://m.com/n'), 'https://m.com/og.jpg')
  assert.equal(ogImage('<html></html>', 'https://m.com'), null)
  assert.equal(textoPlano('uno dos tres cuatro', 10), 'uno dos…')
})

test('codificacionDe: la declaración XML manda sobre el header', () => {
  const xml = new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?><rss>')
  assert.equal(codificacionDe(xml, 'text/xml; charset=utf-8'), 'iso-8859-1')
  assert.equal(codificacionDe(new TextEncoder().encode('<rss>'), 'application/rss+xml; charset=windows-1252'), 'windows-1252')
  assert.equal(codificacionDe(new TextEncoder().encode('<rss>')), 'utf-8')
})

test('leerPostsX: saltea respuestas a otras cuentas pero deja los hilos propios', () => {
  const base = { type: 'status', created_at: 'Thu Oct 01 20:00:00 +0000 2026', author: { screen_name: 'emollick' } }
  const json = { results: [
    { ...base, url: 'https://x.com/emollick/status/1', text: 'Hilo propio', replying_to: { screen_name: 'emollick' } },
    { ...base, url: 'https://x.com/emollick/status/2', text: 'Respuesta a otro', replying_to: { screen_name: 'otro' } },
    { ...base, url: 'https://x.com/emollick/status/3', text: 'Repost', reposted_by: { screen_name: 'emollick' } },
  ] }
  assert.deepEqual(leerPostsX(json, 'emollick').map(p => p.titulo), ['Hilo propio'])
})

test('leerPostsBluesky: arma el link al post, toma la miniatura y saltea reposts', () => {
  const json = { feed: [
    { post: { uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', author: { handle: 'hadley.nz' }, record: { text: 'Nueva versión de dplyr https://x.y', createdAt: '2026-10-01T12:00:00.000Z' }, embed: { images: [{ thumb: 'https://cdn.bsky.app/img/t.jpg' }] } } },
    { reason: { $type: 'app.bsky.feed.defs#reasonRepost' }, post: { uri: 'at://x/app.bsky.feed.post/1', record: { text: 'ajeno', createdAt: '2026-10-01T12:00:00.000Z' } } },
  ] }
  assert.deepEqual(leerPostsBluesky(json, 'hadley.nz'), [{
    titulo: 'Nueva versión de dplyr', url: 'https://bsky.app/profile/hadley.nz/post/3kxyz', resumen: null,
    imagen: 'https://cdn.bsky.app/img/t.jpg', fecha: '2026-10-01T12:00:00.000Z',
  }])
})

test('filasDeItems: marca lo que viene de un referente y usa su tema fijo', () => {
  const ahora = Date.parse('2026-10-01T22:00:00Z')
  const [f] = filasDeItems([{ titulo: 'Great win today!', url: 'https://x.com/a/1', fecha: '2026-10-01T20:00:00.000Z' }],
    { id: 1, medio: 'Aitana', pais: 'ES', tipo: 'referente', temas: ['futbol_femenino'] }, 'x', leerParametros({}), ahora)
  assert.equal(f.de_referente, true)
  assert.deepEqual(f.temas, ['futbol_femenino'])
})

test('clasificar: marketing y comunicación', () => {
  assert.deepEqual(clasificar('La nueva campaña publicitaria de la marca gana en Cannes Lions'), ['marketing'])
  assert.deepEqual(clasificar('Crece la desinformación en redes sociales antes de las elecciones'), ['comunicacion'])
  assert.deepEqual(clasificar('Recortes en las redacciones: el periodismo local en crisis'), ['comunicacion'])
})
