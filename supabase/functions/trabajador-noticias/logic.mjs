// Canillita: lee las webs (RSS/Atom), X (vía FxTwitter) y Bluesky (API pública), todo sin credenciales, de los
// medios y referentes de noticias_medios; se queda con lo que toca algún tema y lo guarda en noticias. Acá está
// todo lo que no hace red ni base: leer feeds y posts, clasificar por tema y elegir qué fuentes toca leer.
export const TRABAJADOR = 'canillita'

// Cada tema: palabras (sin acentos, en minúscula, se buscan como palabra entera) y siglas (respetan mayúsculas).
// `requiere` + `contexto`: el tema solo entra si ya entró el tema requerido y aparece alguna palabra de contexto.
export const TEMAS_DEFECTO = {
  ia: {
    nombre: 'IA',
    palabras: [
      'inteligencia artificial', 'artificial intelligence', 'intelligence artificielle', 'kunstliche intelligenz',
      'intelligenza artificiale', 'inteligencia artificial generativa', 'kunstmatige intelligentie', 'tekoaly',
      'generative ai', 'genai', 'chatgpt', 'openai', 'anthropic', 'deepmind', 'deepseek', 'mistral ai', 'llm', 'llms',
      'large language model', 'modelo de lenguaje', 'modelos de lenguaje', 'machine learning', 'aprendizaje automatico',
      'deep learning', 'chatbot', 'chatbots', 'agentes de ia', 'ai agents', 'ai agent', 'microsoft copilot', 'github copilot', 'grok', 'claude ai',
      'ia generativa', 'ia generative', 'kunstig intelligens', 'artificiell intelligens',
    ],
    siglas: ['AI', 'IA', 'KI'],
  },
  politica_ia: {
    nombre: 'Política internacional de IA',
    requiere: 'ia',
    palabras: ['ai act', 'ley de ia', 'ley de inteligencia artificial', 'gobernanza de la ia', 'ai governance', 'ai safety', 'ai regulation', 'regulacion de la ia', 'ki-verordnung'],
    contexto: [
      'regulacion', 'regulation', 'regulate', 'regulierung', 'reglementation', 'regolamento', 'ley', 'law', 'loi', 'gesetz',
      'gobierno', 'government', 'gouvernement', 'regierung', 'governo', 'congreso', 'congress', 'senado', 'senate', 'parlamento',
      'parliament', 'parlement', 'bundestag', 'comision europea', 'european commission', 'union europea', 'european union', 'bruselas',
      'brussels', 'onu', 'united nations', 'naciones unidas', 'g7', 'g20', 'ocde', 'oecd', 'cumbre', 'summit', 'tratado', 'treaty',
      'politica', 'policy', 'politique', 'soberania', 'sovereignty', 'sanciones', 'sanctions', 'export controls', 'controles de exportacion',
      'casa blanca', 'white house', 'ministro', 'ministra', 'minister', 'presidente', 'president', 'geopolitica', 'geopolitics',
      'diplomacia', 'diplomacy', 'pekin', 'beijing', 'washington', 'kremlin', 'unesco', 'decreto', 'executive order', 'orden ejecutiva',
    ],
  },
  tecnologia: {
    nombre: 'Tecnología',
    palabras: [
      'tecnologia', 'technology', 'technologie', 'tecnologia digital', 'big tech', 'silicon valley', 'startup', 'startups',
      'semiconductor', 'semiconductores', 'semiconductors', 'chip', 'chips', 'nvidia', 'tsmc', 'apple', 'microsoft', 'alphabet',
      'google', 'samsung', 'huawei', 'smartphone', 'smartphones', 'software', 'computacion cuantica', 'quantum computing', 'robotica',
      'robotics', 'robot', 'robots', '5g', 'satelite', 'satelites', 'starlink', 'fibra optica', 'cloud computing', 'tecnologica', 'tecnologicas',
      'digitalizacion', 'digitalisierung', 'fintech', 'criptomonedas', 'blockchain', 'electronica', 'videojuegos',
    ],
  },
  ciberseguridad: {
    nombre: 'Ciberseguridad',
    palabras: [
      'ciberseguridad', 'cybersecurity', 'cyber security', 'cybersecurite', 'cybersicherheit', 'cibersicurezza', 'ciberataque',
      'ciberataques', 'cyberattack', 'cyberattacks', 'cyberattaque', 'hackeo', 'hackers', 'hacker', 'hackeado', 'ransomware',
      'malware', 'phishing', 'filtracion de datos', 'data breach', 'brecha de datos', 'vulnerabilidad', 'vulnerability',
      'zero-day', 'zero day', 'ciberdelito', 'cibercrimen', 'cybercrime', 'botnet', 'ddos', 'spyware', 'pegasus', 'infostealer',
      'cve', 'parche de seguridad', 'security patch', 'ciberespionaje', 'cyber espionage',
    ],
  },
  futbol_femenino: {
    nombre: 'Fútbol femenino',
    palabras: [
      'futbol femenino', "women's football", 'womens football', "women's soccer", 'womens soccer', 'nwsl', 'wsl', 'liga f',
      'uwcl', 'champions femenina', "women's champions league", 'futebol feminino', 'brasileirao feminino', 'football feminin',
      'feminine de football', 'frauenfussball', 'frauen-bundesliga', 'calcio femminile', 'serie a femminile', 'copa america femenina',
      'mundial femenino', "women's world cup", 'lionesses', 'matildas', 'seleccion femenina', 'primera division femenina',
      'liga mx femenil', 'femenil', 'barca femeni', 'femeni', 'arkema premiere ligue', 'premiere ligue', 'eurocopa femenina',
      "women's euro", 'futbolistas', 'futbolista', 'jugadoras',
    ],
    // "futbolista(s)" y "jugadoras" solas son ambiguas: solo cuentan si además aparece fútbol/football/soccer.
    ambiguas: { futbolistas: ['femenin', 'mujer', 'women'], futbolista: ['femenin', 'mujer', 'women'], jugadoras: ['futbol', 'football', 'soccer', 'liga', 'seleccion'] },
  },
  marketing: {
    nombre: 'Marketing',
    palabras: [
      'marketing', 'mercadotecnia', 'marketing digital', 'digital marketing', 'publicidad', 'advertising', 'publicite', 'werbung',
      'pubblicita', 'publicidade', 'branding', 'campana publicitaria', 'ad campaign', 'anunciantes', 'advertisers', 'agencia de publicidad',
      'agencias de publicidad', 'ad agency', 'seo', 'growth marketing', 'email marketing', 'influencer marketing', 'creator economy',
      'economia de creadores', 'ecommerce', 'e-commerce', 'comercio electronico', 'retail media', 'adtech', 'martech', 'cmo',
      'experiencia de cliente', 'customer experience', 'cannes lions', 'comportamiento del consumidor', 'consumer behavior',
      'fidelizacion', 'posicionamiento de marca', 'brand awareness',
    ],
  },
  comunicacion: {
    nombre: 'Comunicación',
    palabras: [
      'comunicacion', 'relaciones publicas', 'public relations', 'comunicacion corporativa', 'corporate communications',
      'comunicacion politica', 'political communication', 'periodismo', 'journalism', 'periodistas', 'journalists', 'journalisme',
      'journalismus', 'giornalismo', 'jornalismo', 'medios de comunicacion', 'newsroom', 'newsrooms', 'redacciones', 'libertad de prensa',
      'press freedom', 'desinformacion', 'disinformation', 'misinformation', 'fake news', 'fact-checking', 'fact checking',
      'verificacion de datos', 'audiencias', 'podcast', 'podcasts', 'redes sociales', 'social media', 'creadores de contenido',
      'content creators', 'reputacion', 'reputation', 'crisis de reputacion', 'portavoz', 'spokesperson', 'vocero', 'press release',
      'comunicado de prensa', 'storytelling',
    ],
  },
  datos: {
    nombre: 'Datos',
    palabras: [
      'ciencia de datos', 'data science', 'data scientist', 'big data', 'datos abiertos', 'open data', 'analitica de datos',
      'data analytics', 'analisis de datos', 'visualizacion de datos', 'data visualization', 'dataviz', 'periodismo de datos',
      'data journalism', 'proteccion de datos', 'data protection', 'datos personales', 'privacidad de datos', 'data privacy', 'gdpr',
      'rgpd', 'centro de datos', 'centros de datos', 'data center', 'data centers', 'data centre', 'data centres', 'datacenter',
      'datacenters', 'rechenzentrum', 'rechenzentren', 'datenschutz', 'base de datos', 'bases de datos', 'database', 'databases',
      'dados abertos', 'ciencia de dados', 'ciencia dos dados', 'donnees personnelles', 'data engineering', 'databricks', 'snowflake',
      'estadisticas oficiales', 'censo', 'census', 'dataset', 'datasets', 'conjunto de datos', 'conjuntos de datos',
    ],
  },
}

export const PARAMETROS_DEFECTO = {
  medios_por_corrida: 50,
  dias_maximos: 3,
  dias_conservar: 15,
  max_por_medio: 25,
  temas: TEMAS_DEFECTO,
}

export function leerParametros(p) {
  const x = p && typeof p === 'object' ? p : {}
  const entero = (v, def, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : def)
  const temas = x.temas && typeof x.temas === 'object' && Object.keys(x.temas).length ? x.temas : TEMAS_DEFECTO
  return {
    medios_por_corrida: entero(x.medios_por_corrida, PARAMETROS_DEFECTO.medios_por_corrida, 1, 200),
    dias_maximos: entero(x.dias_maximos, PARAMETROS_DEFECTO.dias_maximos, 1, 14),
    dias_conservar: entero(x.dias_conservar, PARAMETROS_DEFECTO.dias_conservar, 2, 120),
    max_por_medio: entero(x.max_por_medio, PARAMETROS_DEFECTO.max_por_medio, 1, 100),
    temas,
  }
}

export function normalizar(texto) {
  return ` ${String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`´]/g, "'").replace(/[^a-z0-9']+/g, ' ')} `
}

const tiene = (norm, palabra) => norm.includes(` ${normalizar(palabra).trim()} `)

// Devuelve las claves de los temas que toca el texto. temasFijos: los que el medio cubre siempre (una sección
// de fútbol femenino, un medio de ciberseguridad), que se suman aunque no aparezca ninguna palabra.
export function clasificar(texto, temas = TEMAS_DEFECTO, temasFijos = []) {
  const norm = normalizar(texto)
  const original = String(texto ?? '')
  const salida = new Set(temasFijos.filter(t => temas[t]))
  const directo = clave => {
    const t = temas[clave]
    if ((t.siglas ?? []).some(s => new RegExp(`(^|[^A-Za-z0-9])${s}([^A-Za-z0-9]|$)`).test(original))) return true
    return (t.palabras ?? []).some(p => {
      if (!tiene(norm, p)) return false
      const condicion = t.ambiguas?.[p]
      return !condicion || condicion.some(c => norm.includes(c))
    })
  }
  for (const clave of Object.keys(temas)) if (!temas[clave].requiere && directo(clave)) salida.add(clave)
  for (const [clave, t] of Object.entries(temas)) {
    if (!t.requiere) continue
    if (directo(clave) || (salida.has(t.requiere) && (t.contexto ?? []).some(p => tiene(norm, p)))) {
      salida.add(clave)
      salida.add(t.requiere)
    }
  }
  return [...salida]
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' }

export function decodificar(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e.toLowerCase()] ?? m)
}

export function textoPlano(html, max = 0) {
  const t = decodificar(decodificar(html)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return max && t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t
}

const etiqueta = (bloque, nombres) => {
  for (const n of nombres) {
    const m = bloque.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i'))
    if (m) return m[1]
  }
  return ''
}
const atributo = (tag, nombre) => tag?.match(new RegExp(`\\b${nombre}=["']([^"']+)["']`, 'i'))?.[1] ?? null

export function urlValida(u, base) {
  try {
    const x = new URL(decodificar(String(u).trim()), base)
    return /^https?:$/.test(x.protocol) ? x.href : null
  } catch { return null }
}

function imagenDe(bloque, base) {
  const candidatos = [
    ...[...bloque.matchAll(/<media:(?:content|thumbnail)\b[^>]*>/gi)].map(m => m[0]).filter(t => !/medium=["'](?:video|audio)/i.test(t) && !/type=["'](?:video|audio)/i.test(t)).map(t => atributo(t, 'url')),
    ...[...bloque.matchAll(/<enclosure\b[^>]*>/gi)].map(m => m[0]).filter(t => /type=["']image/i.test(t) || /\.(jpe?g|png|webp)(\?|$)/i.test(atributo(t, 'url') ?? '')).map(t => atributo(t, 'url')),
    ...[...decodificar(bloque).matchAll(/<img\b[^>]*>/gi)].map(m => atributo(m[0], 'src')),
  ]
  for (const c of candidatos) {
    const u = c && urlValida(c, base)
    if (u && !/(?:pixel|tracking|feedburner|1x1|spacer)\b/i.test(u)) return u
  }
  return null
}

// RSS 2.0, RSS 1.0 (RDF) y Atom. Devuelve { titulo, url, resumen, imagen, fecha (ISO | null) }.
export function leerFeed(xml, base) {
  const texto = String(xml ?? '')
  const bloques = [...texto.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0])
  return bloques.map(b => {
    const linkAtom = [...b.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]).find(t => atributo(t, 'href') && (!/rel=/i.test(t) || /rel=["']alternate/i.test(t)))
    const url = urlValida(atributo(linkAtom, 'href') ?? textoPlano(etiqueta(b, ['link', 'guid'])), base)
    const fechaTexto = textoPlano(etiqueta(b, ['pubDate', 'published', 'updated', 'dc:date']))
    const fecha = Date.parse(fechaTexto)
    return {
      titulo: textoPlano(etiqueta(b, ['title']), 300),
      url,
      resumen: textoPlano(etiqueta(b, ['description', 'summary', 'content:encoded', 'content']), 280) || null,
      imagen: imagenDe(b, base),
      fecha: Number.isFinite(fecha) ? new Date(fecha).toISOString() : null,
    }
  }).filter(i => i.titulo && i.url)
}

// Sitios sin feed. Cada medio dice cómo se lee en noticias_medios.formato ('rss' por defecto) y, si hace falta,
// noticias_medios.filtro: una expresión regular que tiene que cumplir el link de la nota.
const coincide = (url, filtro) => !filtro || new RegExp(filtro, 'i').test(url)

// API pública de WordPress (/wp-json/wp/v2/posts?_embed=wp:featuredmedia): título, link, fecha y foto destacada.
export function leerWordPress(json, filtro) {
  return (Array.isArray(json) ? json : []).map(p => ({
    titulo: textoPlano(p?.title?.rendered, 300),
    url: urlValida(p?.link ?? ''),
    resumen: textoPlano(p?.excerpt?.rendered, 280) || null,
    imagen: urlValida(p?._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? '') ?? null,
    fecha: p?.date_gmt ? fechaISO(`${p.date_gmt}Z`) : fechaISO(p?.date),
  })).filter(i => i.titulo && i.url && coincide(i.url, filtro))
}

// Sitemap de noticias de Google (news:title, news:publication_date, image:loc), el que publican los diarios grandes.
export function leerSitemapNoticias(xml, filtro) {
  return [...String(xml ?? '').matchAll(/<url>([\s\S]*?)<\/url>/gi)].map(([, b]) => ({
    titulo: textoPlano(etiqueta(b, ['news:title']), 300),
    url: urlValida(textoPlano(etiqueta(b, ['loc']))),
    resumen: null,
    imagen: urlValida(textoPlano(etiqueta(b, ['image:loc'])) || '') ?? null,
    fecha: fechaISO(textoPlano(etiqueta(b, ['news:publication_date']))),
  })).filter(i => i.titulo && i.url && coincide(i.url, filtro))
}

// Página con links a notas y sin fecha: el texto del link es provisorio (suele traer la sección pegada); las notas
// nuevas se completan después con el título, la foto y la fecha de su propia página (metaDePagina).
export function leerEnlaces(html, base, filtro) {
  const vistos = new Set()
  const salida = []
  for (const [, href, texto] of String(html ?? '').matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = urlValida(href, base)
    if (!url || vistos.has(url) || !coincide(new URL(url).pathname, filtro)) continue
    vistos.add(url)
    const titulo = textoPlano(texto, 300) || decodeURIComponent(new URL(url).pathname.split('/').pop()).replace(/-/g, ' ')
    salida.push({ titulo, url, resumen: null, imagen: null, fecha: null, completar: true })
  }
  return salida
}

export function metaDePagina(html, base) {
  const meta = nombre => atributo(String(html ?? '').match(new RegExp(`<meta\\b[^>]*(?:property|name)=["']${nombre}["'][^>]*>`, 'i'))?.[0], 'content')
  return {
    titulo: meta('og:title') ? textoPlano(meta('og:title'), 300) : null,
    imagen: ogImage(html, base),
    fecha: fechaISO(meta('article:published_time')),
  }
}

const tituloDePost = texto => {
  const limpio = String(texto ?? '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()
  return limpio.length > 220 ? `${limpio.slice(0, 219).replace(/\s+\S*$/, '')}…` : limpio
}
const fechaISO = s => { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString() : null }

// Posts de FxTwitter (/2/profile/<usuario>/statuses). El texto va como título (recortado) y el link es el del
// post. Se saltean los reposts y las respuestas a otras cuentas (los hilos propios quedan).
export function leerPostsX(json, usuario) {
  const propio = n => String(n ?? '').toLowerCase() === String(usuario).toLowerCase()
  const posts = Array.isArray(json?.results) ? json.results : []
  return posts.filter(p => p?.type === 'status' && p.url && !p.reposted_by
    && (!p.author?.screen_name || propio(p.author.screen_name)) && (!p.replying_to || propio(p.replying_to.screen_name)))
    .map(p => {
      const foto = p.media?.photos?.[0]?.url ?? p.media?.all?.find(m => m.type === 'photo')?.url ?? p.media?.videos?.[0]?.thumbnail_url ?? p.media?.all?.[0]?.thumbnail_url ?? null
      return { titulo: tituloDePost(p.text), url: p.url, resumen: null, imagen: foto && urlValida(foto), fecha: fechaISO(p.created_at) }
    }).filter(p => p.titulo)
}

// Posts de Bluesky (app.bsky.feed.getAuthorFeed con filter=posts_no_replies). Los reposts traen `reason`.
export function leerPostsBluesky(json, handle) {
  const feed = Array.isArray(json?.feed) ? json.feed : []
  return feed.filter(f => !f.reason && f.post?.uri && f.post.record?.text).map(({ post }) => {
    const rkey = post.uri.split('/').pop()
    const foto = post.embed?.images?.[0]?.thumb ?? post.embed?.media?.images?.[0]?.thumb ?? post.embed?.external?.thumb ?? null
    return {
      titulo: tituloDePost(post.record.text),
      url: `https://bsky.app/profile/${post.author?.handle ?? handle}/post/${rkey}`,
      resumen: post.embed?.external?.title ? textoPlano(post.embed.external.title, 200) : null,
      imagen: foto && urlValida(foto),
      fecha: fechaISO(post.record.createdAt),
    }
  }).filter(p => p.titulo)
}

// Arma las filas a guardar: solo lo reciente y con algún tema. Un ítem sin fecha se toma como de ahora: el feed
// lo trae entre lo último que publicó.
export function filasDeItems(items, medio, canal, { temas, dias_maximos, max_por_medio }, ahora = Date.now()) {
  const limite = ahora - dias_maximos * 86_400_000
  const vistos = new Set()
  const filas = []
  for (const i of items) {
    if (vistos.has(i.url)) continue
    vistos.add(i.url)
    const t = i.fecha ? Date.parse(i.fecha) : ahora
    if (t < limite || t > ahora + 3_600_000) continue
    // Lo de un referente va solo a su tema: lo que publica una persona de tecnología sobre IA queda en tecnología.
    const deTema = medio.tipo === 'referente' ? (medio.temas ?? []).filter(t => temas[t]) : clasificar(`${i.titulo} ${i.resumen ?? ''}`, temas, medio.temas ?? [])
    if (!deTema.length) continue
    filas.push({
      url: i.url, titulo: i.titulo, resumen: i.resumen, imagen: i.imagen, medio: medio.medio, medio_id: medio.id,
      pais: medio.pais, idioma: medio.idioma ?? null, canal, temas: deTema, publicada_at: new Date(t).toISOString(),
      de_referente: medio.tipo === 'referente',
      ...(i.completar ? { completar: true } : {}),
    })
    if (filas.length >= max_por_medio) break
  }
  return filas
}

// Los que hace más tiempo que no se leen van primero: con cada corrida se recorre la lista entera de a tandas.
export function mediosATocar(medios, n) {
  return [...medios].filter(m => m.activo !== false && (m.rss || m.x || m.bluesky))
    .sort((a, b) => (Date.parse(a.ultima_lectura_at ?? 0) || 0) - (Date.parse(b.ultima_lectura_at ?? 0) || 0))
    .slice(0, n)
}

// Dónde buscar la foto de una nota que llegó sin imagen: la etiqueta og:image de la página.
export function ogImage(html, base) {
  const tag = String(html ?? '').match(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/i)?.[0]
  const u = atributo(tag, 'content')
  return u ? urlValida(u, base) : null
}

// Algunos feeds vienen en ISO-8859-1 (Folha, por ejemplo): la codificación sale del encabezado HTTP o de la
// declaración XML; sin ninguna de las dos se asume UTF-8.
export function codificacionDe(bytes, contentType = '') {
  const delHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  const inicio = new TextDecoder('latin1').decode(bytes.slice(0, 300))
  const delXml = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(inicio)?.[1]
  const c = (delXml ?? delHeader ?? 'utf-8').toLowerCase()
  try { new TextDecoder(c); return c } catch { return 'utf-8' }
}
