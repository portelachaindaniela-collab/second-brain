// Postulaciones: lee la planilla de Google Sheets de Daniela y le cambia el estado a una fila.
// Todo lo que no llama a Google ni a la base vive acá para probarlo con node --test.

// spreadsheets: la planilla ya existe y la creó Daniela, así que drive.file (solo hojas creadas por la app) no alcanza.
export const SCOPE_PLANILLAS = 'https://www.googleapis.com/auth/spreadsheets'

export const tienePermiso = scopes => Array.isArray(scopes) && scopes.includes(SCOPE_PLANILLAS)

// Pide solo el permiso nuevo; include_granted_scopes suma los que ya tenía la conexión de Google.
export function urlPermiso({ clientId, redirectUri, state }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', SCOPE_PLANILLAS)
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', state)
  return u.toString()
}

// Acepta el link completo de la planilla o solo el id.
export function idDeHoja(texto) {
  const t = String(texto || '').trim()
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)
  if (m) return m[1]
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : null
}

const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Cada dato se busca por el nombre de su columna, así la planilla puede cambiar de orden.
const CLAVES = [
  ['fecha', n => n.startsWith('fecha')],
  ['puesto', n => n.startsWith('puesto')],
  ['empresa', n => n.startsWith('empresa')],
  ['zona', n => n.startsWith('zona') || n.startsWith('modalidad')],
  ['fuente', n => n.startsWith('fuente')],
  ['link', n => n.startsWith('link') || n.startsWith('contacto')],
  ['semaforo', n => n.startsWith('semaforo')],
  ['porque', n => n.startsWith('porque') || n.startsWith('motivo')],
  ['estado', n => n.startsWith('estado')],
  ['cv', n => n.startsWith('cv')],
]

export function columnas(encabezados = []) {
  const res = {}
  encabezados.forEach((h, i) => {
    const n = normal(h)
    const clave = CLAVES.find(([c, prueba]) => res[c] === undefined && prueba(n))
    if (clave) res[clave[0]] = i
  })
  return res
}

export function letraColumna(indice) {
  let n = indice + 1, s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

const limpio = v => { const t = String(v ?? '').trim(); return /^#(error|ref|n\/a|value|name)/i.test(t) ? '' : t }

// Filas de la planilla como objetos; `fila` es el número de fila en la hoja (la 1 es el encabezado).
export function filasPostulaciones(valores = []) {
  const [encabezados = [], ...resto] = valores
  const col = columnas(encabezados)
  return resto.map((celdas, i) => {
    const p = { fila: i + 2 }
    for (const [clave] of CLAVES) p[clave] = col[clave] === undefined ? '' : limpio(celdas[col[clave]])
    return p
  }).filter(p => p.puesto || p.empresa || p.link)
}

// Antes de escribir se confirma que la fila sigue siendo la misma postulación (alguien pudo ordenar o borrar filas).
export function mismaPostulacion(fila, esperado) {
  return normal(fila.puesto) === normal(esperado.puesto) && normal(fila.empresa) === normal(esperado.empresa)
}

export function motivoErrorGoogle(status, cuerpo) {
  const msj = String(cuerpo?.error?.message || '')
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msj + JSON.stringify(cuerpo?.error?.details || ''))) {
    return 'La API de Google Sheets no está activada en tu proyecto de Google Cloud.'
  }
  if (status === 401 || status === 403) return 'Google no dio permiso para usar la planilla: tocá Conectar planilla otra vez.'
  if (status === 404) return 'No encontré la planilla. Revisá el link.'
  return `Google respondió HTTP ${status}${msj ? `: ${msj}` : ''}.`
}
