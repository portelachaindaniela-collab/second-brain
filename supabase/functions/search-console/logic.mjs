// Búsquedas en Google: qué se le pide a Search Console y cómo se guarda. Lo que no llama a Google ni a la base
// vive acá para probarlo con node --test.

export const SCOPE_SEARCH_CONSOLE = 'https://www.googleapis.com/auth/webmasters.readonly'
export const tienePermiso = scopes => Array.isArray(scopes) && scopes.includes(SCOPE_SEARCH_CONSOLE)

// La primera copia trae 90 días; después se vuelven a pedir los últimos 10 porque Google completa los datos con
// 2 o 3 días de atraso.
export const DIAS_PRIMERA = 90
export const DIAS_REPASO = 10

// Se pide junto con el de planillas (pantalla Postulaciones): al autorizar uno solo, Google puede soltar el otro.
export const PERMISOS_EXTRA = ['https://www.googleapis.com/auth/spreadsheets', SCOPE_SEARCH_CONSOLE]

export function urlPermiso({ clientId, redirectUri, state }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', PERMISOS_EXTRA.join(' '))
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', state)
  return u.toString()
}

const iso = d => d.toISOString().slice(0, 10)

export function rangoACopiar(sincronizadoAt, hoy = new Date()) {
  const desde = new Date(hoy)
  desde.setUTCDate(desde.getUTCDate() - (sincronizadoAt ? DIAS_REPASO : DIAS_PRIMERA))
  return { desde: iso(desde), hasta: iso(hoy) }
}

// "https://primeraafem.netlify.app/" → "primeraafem"; "sc-domain:ejemplo.com" → "ejemplo.com".
export function nombrePorDefecto(siteUrl) {
  const s = String(siteUrl || '')
  if (s.startsWith('sc-domain:')) return s.slice(10)
  try { return new URL(s).hostname.replace(/^www\./, '').replace(/\.(netlify|vercel|github)\.(app|io)$/, '') } catch { return s }
}

// Solo los sitios verificados devuelven datos.
export const sitiosUsables = (lista = []) => lista.filter(s => s.permissionLevel && s.permissionLevel !== 'siteUnverifiedUser').map(s => s.siteUrl)

export const consulta = (desde, hasta, dimensiones) => ({ startDate: desde, endDate: hasta, dimensions: dimensiones, rowLimit: 25000, dataState: 'all' })

export function filasDias(respuesta, ownerId, siteUrl) {
  return (respuesta?.rows || []).map(r => ({
    owner_id: ownerId, site_url: siteUrl, fecha: r.keys[0],
    clics: Math.round(r.clicks || 0), impresiones: Math.round(r.impressions || 0), posicion: r.position ?? null,
  }))
}

export function filasDetalle(respuesta, ownerId, siteUrl, tipo) {
  return (respuesta?.rows || []).filter(r => r.keys?.[1]).map(r => ({
    owner_id: ownerId, site_url: siteUrl, fecha: r.keys[0], tipo, clave: r.keys[1].slice(0, 500),
    clics: Math.round(r.clicks || 0), impresiones: Math.round(r.impressions || 0), posicion: r.position ?? null,
  }))
}

export function motivoErrorGoogle(status, cuerpo) {
  const msj = String(cuerpo?.error?.message || '')
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msj + JSON.stringify(cuerpo?.error?.details || ''))) {
    return 'La API de Search Console no está activada en tu proyecto de Google Cloud. Activala en https://console.cloud.google.com/apis/library/searchconsole.googleapis.com y volvé a sincronizar.'
  }
  if (status === 401 || status === 403) return 'Google no dio permiso para leer Search Console: tocá Conectar Search Console otra vez.'
  return `Google respondió HTTP ${status}${msj ? `: ${msj}` : ''}.`
}
