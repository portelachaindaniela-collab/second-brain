// Cálculos de la pantalla Noticias: agrupar por tema, elegir destacadas, filtrar y cruzar newsletters con el mail.
// Las noticias las carga Canillita (trabajador-noticias); acá no se toca la red.
export const TRABAJADOR_NOTICIAS = 'canillita'

// Orden de los bloques en pantalla. Las notas de política de IA no se repiten en el bloque de IA.
export const TEMAS = [
  { clave: 'ia', nombre: 'IA', sin: ['politica_ia'] },
  { clave: 'politica_ia', nombre: 'Política internacional de IA' },
  { clave: 'futbol_femenino', nombre: 'Fútbol femenino' },
  { clave: 'datos', nombre: 'Datos' },
  { clave: 'ciberseguridad', nombre: 'Ciberseguridad' },
  { clave: 'marketing', nombre: 'Marketing' },
  { clave: 'comunicacion', nombre: 'Comunicación' },
  { clave: 'tecnologia', nombre: 'Tecnología', sin: ['ia', 'politica_ia', 'ciberseguridad', 'datos'] },
]
export const nombreTema = clave => TEMAS.find(t => t.clave === clave)?.nombre ?? clave

export const PAISES = {
  AR: 'Argentina', UY: 'Uruguay', CL: 'Chile', PY: 'Paraguay', BO: 'Bolivia', BR: 'Brasil', MX: 'México', CR: 'Costa Rica',
  GT: 'Guatemala', DO: 'Rep. Dominicana', PR: 'Puerto Rico', PA: 'Panamá', CO: 'Colombia', PE: 'Perú', EC: 'Ecuador',
  VE: 'Venezuela', ES: 'España', US: 'Estados Unidos', CA: 'Canadá', GB: 'Reino Unido', IE: 'Irlanda', FR: 'Francia',
  BE: 'Bélgica', CH: 'Suiza', DE: 'Alemania', AT: 'Austria', NL: 'Países Bajos', IT: 'Italia', PT: 'Portugal', SE: 'Suecia',
  NO: 'Noruega', DK: 'Dinamarca', FI: 'Finlandia', PL: 'Polonia', UA: 'Ucrania', RU: 'Rusia', EU: 'Unión Europea',
  QA: 'Qatar', IL: 'Israel', AE: 'Emiratos Árabes', SA: 'Arabia Saudita', TR: 'Turquía', EG: 'Egipto', MA: 'Marruecos',
  ZA: 'Sudáfrica', NG: 'Nigeria', KE: 'Kenia', IN: 'India', PK: 'Pakistán', BD: 'Bangladés', CN: 'China', JP: 'Japón',
  KR: 'Corea del Sur', TW: 'Taiwán', SG: 'Singapur', PH: 'Filipinas', VN: 'Vietnam', TH: 'Tailandia', ID: 'Indonesia',
  MY: 'Malasia', AU: 'Australia', NZ: 'Nueva Zelanda', SK: 'Eslovaquia',
}
export const nombrePais = codigo => PAISES[codigo] ?? codigo

export const IDIOMAS = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', de: 'alemán', it: 'italiano', nl: 'neerlandés', sv: 'sueco', no: 'noruego', da: 'danés', fi: 'finés', pl: 'polaco' }

export function haceCuanto(iso, ahora = Date.now()) {
  const min = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60_000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// filtros: { pais, idioma, web, x, bluesky, fuente: '' | 'medio' | 'referente', soloSinLeer, guardadas, texto }
export function filtrar(noticias, f = {}) {
  const texto = sinAcentos(f.texto).trim()
  return noticias.filter(n => (!f.pais || n.pais === f.pais)
    && (!f.idioma || n.idioma === f.idioma)
    && f[n.canal] !== false
    && (!f.fuente || (f.fuente === 'referente') === !!n.de_referente)
    && (!f.soloSinLeer || !n.leida)
    && (!f.guardadas || n.guardada)
    && (!texto || sinAcentos(`${n.titulo} ${n.resumen ?? ''} ${n.medio}`).includes(texto)))
}

const recientes = (a, b) => Date.parse(b.publicada_at) - Date.parse(a.publicada_at)

// Las notas de medios se reparten por tema sin repetir (ver TEMAS.sin). Lo de los referentes ya viene con un solo
// tema, el suyo, y va aparte: { clave: { notas, referentes } }.
export function porTema(noticias) {
  return Object.fromEntries(TEMAS.map(t => [t.clave, {
    notas: noticias.filter(n => !n.de_referente && n.temas?.includes(t.clave) && !(t.sin ?? []).some(s => n.temas.includes(s))).sort(recientes),
    referentes: noticias.filter(n => n.de_referente && n.temas?.includes(t.clave)).sort(recientes),
  }]))
}

const VACIAS = new Set(('para como sobre desde entre hasta pero porque cuando donde este esta estos estas tiene tienen '
  + 'with from that this have about after over into their what will would says said para pelo pela sobre dans avec pour sont '
  + 'nach über eine einen eines nicht sind').split(' '))

export function palabrasClave(titulo) {
  return new Set(sinAcentos(titulo).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(p => p.length >= 4 && !VACIAS.has(p)))
}

function parecidas(a, b) {
  let comunes = 0
  for (const p of a) if (b.has(p)) comunes++
  return comunes >= 3 && comunes / Math.min(a.size, b.size) >= 0.5
}

// Destacadas: las historias que más medios distintos publicaron en las últimas 24 h (por titulares parecidos, así
// que solo agrupa dentro de un mismo idioma). Si no alcanzan, completa con lo último con foto de otros temas.
export function destacadas(noticias, ahora = Date.now(), cuantas = 3) {
  const dia = noticias.filter(n => !n.de_referente && ahora - Date.parse(n.publicada_at) < 86_400_000).sort(recientes)
  const grupos = []
  for (const n of dia) {
    const claves = palabrasClave(n.titulo)
    const g = grupos.find(x => x.idioma === n.idioma && parecidas(x.claves, claves))
    if (g) { g.notas.push(n); g.medios.add(n.medio) } else grupos.push({ idioma: n.idioma, claves, notas: [n], medios: new Set([n.medio]) })
  }
  const elegidas = grupos.filter(g => g.medios.size >= 2).sort((a, b) => b.medios.size - a.medios.size)
    .slice(0, cuantas).map(g => ({ noticia: g.notas.find(n => n.imagen) ?? g.notas[0], otros: g.medios.size - 1 }))
  const usadas = new Set(elegidas.map(e => e.noticia.id))
  const temasUsados = new Set(elegidas.map(e => temaPrincipal(e.noticia)))
  for (const n of dia) {
    if (elegidas.length >= cuantas) break
    if (!n.imagen || usadas.has(n.id) || temasUsados.has(temaPrincipal(n))) continue
    elegidas.push({ noticia: n, otros: 0 })
    usadas.add(n.id)
    temasUsados.add(temaPrincipal(n))
  }
  return elegidas
}

// El tema con el que se rotula una nota: el más específico de los suyos.
export function temaPrincipal(n) {
  const orden = ['politica_ia', 'futbol_femenino', 'ciberseguridad', 'datos', 'marketing', 'comunicacion', 'ia', 'tecnologia']
  return orden.find(t => n.temas?.includes(t)) ?? n.temas?.[0] ?? null
}

// "news.lanacion.com.ar" → "lanacion.com.ar"; "www.bbc.co.uk" → "bbc.co.uk".
export function dominioRaiz(urlODominio) {
  let host = String(urlODominio ?? '').toLowerCase().trim()
  try { if (host.includes('/')) host = new URL(host).hostname } catch { return null }
  host = host.replace(/^.*@/, '').replace(/^www\./, '')
  const partes = host.split('.').filter(Boolean)
  if (partes.length < 2) return null
  const segundo = partes[partes.length - 2]
  const cuantas = partes[partes.length - 1].length === 2 && ['com', 'co', 'org', 'net', 'gob', 'gov', 'ac', 'edu'].includes(segundo) ? 3 : 2
  return partes.slice(-cuantas).join('.')
}

// Mails que mandaron los medios de la lista (por dominio del remitente). Devuelve [{ mail, medio }].
export function newslettersDelMail(mails, medios) {
  const porDominio = new Map()
  for (const m of medios) {
    const d = dominioRaiz(m.sitio)
    if (d && !porDominio.has(d)) porDominio.set(d, m)
  }
  return mails.map(mail => ({ mail, medio: porDominio.get(dominioRaiz(mail.from_addr)) })).filter(x => x.medio)
}

export function cifrasNoticias(noticias, ahora = Date.now()) {
  const dia = noticias.filter(n => ahora - Date.parse(n.publicada_at) < 86_400_000)
  return {
    ultimas24: dia.length,
    paises: new Set(dia.map(n => n.pais)).size,
    sinLeer: noticias.filter(n => !n.leida).length,
    guardadas: noticias.filter(n => n.guardada).length,
  }
}
