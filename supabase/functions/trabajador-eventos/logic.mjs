// Buscador de eventos: solo lee datos schema.org (JSON-LD) de las páginas públicas, nunca el estado interno
// de la página, que cambia sin aviso. Todo lo que busca (fuentes, términos, ventana) sale de
// trabajadores.parametros; acá solo están los valores por defecto si falta alguno.
export const TRABAJADOR = 'buscador_eventos'
export const ZONA = 'America/Argentina/Buenos_Aires'

export const PARAMETROS_DEFECTO = {
  dias_adelante: 30,
  terminos: ['tecnología', 'inteligencia artificial', 'marketing digital', 'ciencia de datos'],
  fuentes: [{ tipo: 'eventbrite', activa: true, ubicaciones: ['argentina--buenos-aires'], paginas: 1 }],
  // El evento tiene que nombrar alguna en el título o la descripción: la búsqueda de Eventbrite es laxa y
  // rellena con lo que haya cerca (catas de vino, presentaciones de libros). Lista vacía = no filtra.
  palabras_clave: [
    'tecnología', 'tecnologías', 'tech', 'ia', 'ai', 'inteligencia artificial', 'machine learning', 'agentes',
    'datos', 'data', 'analytics', 'software', 'programación', 'developers', 'cloud', 'open source',
    'ciberseguridad', 'hacking', 'ekoparty', 'marketing', 'transformación digital', 'ecommerce', 'ux', 'startup', 'startups',
    'innovación', 'robótica', 'iot', 'lorawan',
  ],
  incluir_online: false,
  max_detalles_por_corrida: 60,
}

export function leerParametros(p) {
  const x = p && typeof p === 'object' ? p : {}
  const entero = (v, def, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : def)
  const terminos = Array.isArray(x.terminos) ? x.terminos.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()) : []
  const fuentes = Array.isArray(x.fuentes) ? x.fuentes.filter(f => f && typeof f.tipo === 'string') : []
  const palabras = Array.isArray(x.palabras_clave) ? x.palabras_clave.filter(t => typeof t === 'string' && slug(t)) : null
  return {
    dias_adelante: entero(x.dias_adelante, PARAMETROS_DEFECTO.dias_adelante, 1, 180),
    terminos: terminos.length ? terminos : PARAMETROS_DEFECTO.terminos,
    fuentes: (fuentes.length ? fuentes : PARAMETROS_DEFECTO.fuentes).filter(f => f.activa !== false),
    palabras_clave: palabras ?? PARAMETROS_DEFECTO.palabras_clave,
    incluir_online: x.incluir_online === true,
    max_detalles_por_corrida: entero(x.max_detalles_por_corrida, PARAMETROS_DEFECTO.max_detalles_por_corrida, 1, 100),
  }
}

export function slug(texto) {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function urlBusquedaEventbrite(ubicacion, termino, pagina = 1) {
  return `https://www.eventbrite.com.ar/d/${encodeURIComponent(ubicacion)}/${slug(termino)}/${pagina > 1 ? `?page=${pagina}` : ''}`
}

export function jsonLd(html) {
  const bloques = []
  for (const m of String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { bloques.push(...[JSON.parse(m[1])].flat()) } catch { /* un bloque roto no invalida los demás */ }
  }
  return bloques
}

const esEvento = x => typeof x?.['@type'] === 'string' && /Event$/.test(x['@type'])

export function limpiarUrl(u) {
  try { const x = new URL(u); return `${x.origin}${x.pathname}` } catch { return null }
}

// Lista de una búsqueda: nombre, fecha (sin hora) y link. Alcanza para descartar duplicados antes de abrir cada evento.
export function candidatosDeBusqueda(html) {
  const lista = jsonLd(html).find(x => x['@type'] === 'ItemList')
  return (lista?.itemListElement ?? []).map(i => i?.item).filter(esEvento).map(e => ({
    nombre: limpiarNombre(e.name), fecha: String(e.startDate ?? '').slice(0, 10), url: limpiarUrl(e.url),
  })).filter(c => c.nombre && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) && c.url)
}

export function limpiarNombre(n) {
  return typeof n === 'string' ? n.replace(/\s+/g, ' ').trim() : ''
}

export function claveNombre(n) {
  return slug(limpiarNombre(n))
}

export function diaAR(iso) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

// Mismo nombre (sin mayúsculas, tildes ni signos) y mismo día en Argentina = mismo evento.
export function claveEvento(nombre, dia) {
  return `${claveNombre(nombre)}|${dia}`
}

function formatoPesos(n) {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

export function entradaDe(offers) {
  const lista = [offers].flat().filter(Boolean)
  const precios = lista.flatMap(o => [o.lowPrice, o.highPrice, o.price]).map(Number).filter(Number.isFinite)
  if (!precios.length) return { tiene_entrada: true, precio: null }
  const min = Math.min(...precios), max = Math.max(...precios)
  if (max === 0) return { tiene_entrada: false, precio: null }
  return { tiene_entrada: true, precio: min === max || min === 0 ? formatoPesos(max) + (min === 0 ? ' (hay gratis)' : '') : `${formatoPesos(min)} – ${formatoPesos(max)}` }
}

// Palabra entera, sin mayúsculas ni tildes: "ia" no coincide dentro de "Mitología".
export function coincidePalabra(texto, palabras) {
  if (!palabras?.length) return true
  const t = `-${slug(texto)}-`
  return palabras.some(p => t.includes(`-${slug(p)}-`))
}

// Detalle de un evento → fila de la tabla eventos, o { descartado } si no sirve.
export function filaDeDetalle(html, { incluir_online = false, palabras_clave = [] } = {}) {
  const e = jsonLd(html).find(esEvento)
  if (!e) return { descartado: 'sin datos de evento' }
  const estado = String(e.eventStatus ?? '')
  if (/Cancelled|Postponed/i.test(estado)) return { descartado: 'cancelado o postergado' }
  if (!incluir_online && /OnlineEventAttendanceMode/.test(String(e.eventAttendanceMode ?? ''))) return { descartado: 'online' }
  if (!coincidePalabra(`${e.name ?? ''} ${e.description ?? ''}`, palabras_clave)) return { descartado: 'no nombra ninguna palabra clave' }
  const inicio = Date.parse(e.startDate)
  if (!Number.isFinite(inicio)) return { descartado: 'sin fecha' }
  const fin = Date.parse(e.endDate)
  const direccion = e.location?.address
  return {
    fila: {
      nombre: limpiarNombre(e.name),
      inicio_at: new Date(inicio).toISOString(),
      fin_at: Number.isFinite(fin) && fin >= inicio ? new Date(fin).toISOString() : null,
      lugar: limpiarNombre(e.location?.name) || null,
      direccion: (typeof direccion === 'string' ? direccion : limpiarNombre(direccion?.streetAddress)) || null,
      url: limpiarUrl(e.url),
      ...entradaDe(e.offers),
    },
  }
}

export function dentroDeVentana(dia, ahora, diasAdelante) {
  const hoy = diaAR(ahora)
  const limite = diaAR(ahora + diasAdelante * 86_400_000)
  return dia >= hoy && dia <= limite
}
