// Búsquedas en Google: cuentas sobre la copia de Search Console (search_console_dias / search_console_top).
// Las fechas son 'YYYY-MM-DD' como las guarda Google.

const MS_DIA = 86400000
const aFecha = s => new Date(`${s}T12:00:00Z`)
export const sumarDias = (s, n) => new Date(aFecha(s).getTime() + n * MS_DIA).toISOString().slice(0, 10)

// El período termina en el último día con datos (Google llega con atraso), no hoy.
export function rangos(hasta, dias) {
  const desde = sumarDias(hasta, -(dias - 1))
  const antesHasta = sumarDias(desde, -1)
  return { actual: { desde, hasta }, anterior: { desde: sumarDias(antesHasta, -(dias - 1)), hasta: antesHasta } }
}

export const ultimoDia = filas => filas.reduce((m, f) => (f.fecha > m ? f.fecha : m), '')

// Clics e impresiones sumados; la posición, promediada por impresiones (como la calcula Search Console).
export function resumen(filas, { desde, hasta }) {
  let clics = 0, impresiones = 0, pesoPos = 0
  for (const f of filas) {
    if (f.fecha < desde || f.fecha > hasta) continue
    clics += f.clics; impresiones += f.impresiones
    if (f.posicion != null) pesoPos += f.posicion * f.impresiones
  }
  return { clics, impresiones, ctr: impresiones ? clics / impresiones : 0, posicion: impresiones ? pesoPos / impresiones : null }
}

// Variación de cada cifra. En la posición, bajar es mejorar.
export function comparar(a, b) {
  const pct = (x, y) => (y ? (x - y) / y : x ? 1 : 0)
  return {
    clics: pct(a.clics, b.clics),
    impresiones: pct(a.impresiones, b.impresiones),
    ctr: a.ctr - b.ctr,
    posicion: a.posicion != null && b.posicion != null ? b.posicion - a.posicion : null,
  }
}

// Un punto por día (todos los sitios elegidos sumados), con ceros en los días sin datos.
export function serie(filas, { desde, hasta }) {
  const por = new Map()
  for (const f of filas) {
    if (f.fecha < desde || f.fecha > hasta) continue
    const p = por.get(f.fecha) || { clics: 0, impresiones: 0 }
    p.clics += f.clics; p.impresiones += f.impresiones
    por.set(f.fecha, p)
  }
  const res = []
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) res.push({ fecha: d, ...(por.get(d) || { clics: 0, impresiones: 0 }) })
  return res
}

// Lo que cambió entre una semana y la anterior, para no tener que comparar a mano. Hasta `limite` avisos:
// búsquedas que subieron o bajaron 3+ posiciones, búsquedas nuevas con impresiones y páginas que perdieron clics.
export function cambios({ busquedas, busquedasAntes, paginas, paginasAntes }, limite = 5) {
  const antes = new Map((busquedasAntes || []).map(b => [b.clave, b]))
  const avisos = []
  for (const b of busquedas || []) {
    const a = antes.get(b.clave)
    if (!a) { if (b.impresiones >= 20) avisos.push({ tipo: 'nueva', sube: true, clave: b.clave, impresiones: b.impresiones, peso: b.impresiones }); continue }
    if (b.posicion == null || a.posicion == null || b.impresiones < 10) continue
    const salto = a.posicion - b.posicion
    if (Math.abs(salto) >= 3) avisos.push({ tipo: 'posicion', sube: salto > 0, clave: b.clave, de: a.posicion, a: b.posicion, clics: b.clics - a.clics, peso: Math.abs(salto) * Math.log10(10 + b.impresiones) })
  }
  const ahora = new Map((paginas || []).map(p => [p.clave, p]))
  for (const a of paginasAntes || []) {
    const p = ahora.get(a.clave)
    const clics = p?.clics ?? 0
    if (a.clics >= 5 && clics <= a.clics * 0.7) avisos.push({ tipo: 'pagina', sube: false, clave: a.clave, caida: 1 - clics / a.clics, peso: a.clics })
  }
  return avisos.sort((x, y) => y.peso - x.peso).slice(0, limite)
}

const numero = new Intl.NumberFormat('es-AR')
export function formatoNumero(n) {
  if (n >= 10000) return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n / 1000)} mil`
  return numero.format(Math.round(n))
}

// "https://primeraafem.netlify.app/inicio" → "/inicio" (la página dentro del sitio).
export function rutaDePagina(url) {
  try { const u = new URL(url); return (u.pathname === '/' ? '/ (inicio)' : u.pathname) + u.search } catch { return url }
}
