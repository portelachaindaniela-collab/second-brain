// Lo que manda el celular (MacroDroid) → fila de public.ubicaciones. MacroDroid manda todo como texto y,
// según el idioma del teléfono, con coma decimal: acá se normaliza y se valida antes de guardar.
export const HEADER_TOKEN = 'x-token-ubicacion'
export const MOTIVOS = ['periodico', 'desconexion', 'reconexion', 'manual']
export const MIN_SEGUNDOS_ENTRE_ENVIOS = 20

const numero = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || !v.trim()) return null
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Un error con el texto que ve MacroDroid en su registro: corto y en castellano.
export class ErrorUbicacion extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status }
}

export function leerUbicacion(body) {
  const x = body && typeof body === 'object' ? body : {}
  const dispositivo = typeof x.dispositivo === 'string' ? x.dispositivo.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
  if (!dispositivo) throw new ErrorUbicacion('Falta el nombre del dispositivo.')
  const lat = numero(x.lat), lon = numero(x.lon)
  if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new ErrorUbicacion('Latitud o longitud inválidas.')
  // MacroDroid manda 0,0 cuando todavía no tiene ninguna ubicación: no es un lugar real.
  if (lat === 0 && lon === 0) throw new ErrorUbicacion('El celular todavía no tiene ubicación.')
  const precision = numero(x.precision)
  const bateria = numero(x.bateria)
  return {
    dispositivo,
    motivo: MOTIVOS.includes(x.motivo) ? x.motivo : 'periodico',
    lat, lon,
    precision_m: precision != null && precision >= 0 ? Math.round(precision) : null,
    bateria: bateria != null && bateria >= 0 && bateria <= 100 ? Math.round(bateria) : null,
  }
}

export async function hashToken(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// El envío periódico puede dispararse dos veces seguidas (MacroDroid reintenta): uno cada 20 segundos alcanza.
// Las desconexiones siempre se guardan: son las que dicen dónde quedaron los auriculares.
export function esRepetido(ultima, nueva, ahora = Date.now()) {
  if (!ultima || nueva.motivo === 'desconexion') return false
  return ahora - Date.parse(ultima.at) < MIN_SEGUNDOS_ENTRE_ENVIOS * 1000
}
