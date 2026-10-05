// Historial de UP en Google Sheets: cada pieza publicada es una fila con su texto, link y últimas métricas.
// Todo lo que no llama a Google ni a la base vive acá para probarlo con node --test.

// drive.file: UP solo ve y edita las hojas que crea ella, no el resto del Drive.
export const SCOPE_HOJAS = 'https://www.googleapis.com/auth/drive.file'
export const PESTANA = 'Historial'
export const TITULO = 'UP · Historial de publicaciones'
export const ENCABEZADOS = ['Fecha', 'Red', 'Tema', 'Texto', 'Link', 'Impresiones', 'Reacciones', 'Comentarios', 'Compartidos', 'Interacción', 'Métricas al', 'Fuente']
const NOMBRE_RED = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' }
const COLUMNA_FINAL = String.fromCharCode(64 + ENCABEZADOS.length)

export const tienePermisoHojas = scopes => Array.isArray(scopes) && scopes.includes(SCOPE_HOJAS)

// Pide solo el permiso nuevo; include_granted_scopes suma los que ya tenía la conexión de Google (agenda y mail), así
// el token que guarda google-callback sigue sirviendo para todo.
export function urlPermiso({ clientId, redirectUri, state }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', SCOPE_HOJAS)
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', state)
  return u.toString()
}

export function ultimaMetrica(filas = []) {
  return [...filas].sort((a, b) => a.dia.localeCompare(b.dia)).at(-1) || null
}

const num = v => (Number.isFinite(v) ? v : '')

export function filaHistorial(pieza, tema, m) {
  const total = m ? ['reacciones', 'comentarios', 'compartidos'].map(k => m[k]).filter(Number.isFinite) : []
  const interaccion = m && Number.isFinite(m.impresiones) && m.impresiones > 0 && total.length
    ? `${(total.reduce((a, b) => a + b, 0) * 100 / m.impresiones).toFixed(1).replace('.', ',')}%` : ''
  return [
    pieza.fecha, NOMBRE_RED[pieza.red] || pieza.red, tema || '', pieza.texto || '', pieza.url_publicada || '',
    num(m?.impresiones), num(m?.reacciones), num(m?.comentarios), num(m?.compartidos), interaccion,
    m?.dia || '', m ? (m.fuente === 'manual' ? 'carga manual' : m.fuente) : '',
  ]
}

export const rangoFila = fila => `${PESTANA}!A${fila}:${COLUMNA_FINAL}${fila}`

// Qué hay que copiar: piezas publicadas que todavía no tienen fila y piezas con una métrica cargada después de la
// última copia.
export function queCopiar(piezas, metricasPorPieza) {
  const nuevas = [], viejas = []
  for (const p of piezas) {
    if (p.estado !== 'publicado') continue
    if (!p.historial_fila) { nuevas.push(p); continue }
    const copia = Date.parse(p.historial_at || 0)
    const ultimaMedicion = Math.max(0, ...(metricasPorPieza.get(p.id) || []).map(m => Date.parse(m.updated_at)))
    if (ultimaMedicion > copia) viejas.push(p)
  }
  nuevas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.red.localeCompare(b.red))
  return { nuevas, viejas }
}

// "Historial!A7:L7" → 7 (lo devuelve Sheets al agregar una fila).
export function filaDeRango(rango) {
  const m = String(rango || '').match(/!A(\d+)/)
  return m ? Number(m[1]) : null
}

// Errores de Google que se pueden explicar en una línea.
export function motivoErrorGoogle(status, cuerpo) {
  const msj = String(cuerpo?.error?.message || '')
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msj + JSON.stringify(cuerpo?.error?.details || ''))) {
    return 'La API de Google Sheets no está activada en tu proyecto de Google Cloud: activala y volvé a tocar Copiar ahora.'
  }
  if (status === 401 || status === 403) return 'Google no dio permiso para escribir la hoja: tocá Conectar Google Sheets otra vez.'
  if (status === 404) return 'No encontré la hoja del historial (¿la borraste?). La vuelvo a crear en la próxima copia.'
  return `Google respondió HTTP ${status}${msj ? `: ${msj}` : ''}.`
}
