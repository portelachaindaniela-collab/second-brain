// Mis cosas: dónde quedó cada dispositivo. Las filas vienen de public.ubicaciones (MacroDroid o la app de SB en el celular).
export const DISPOSITIVO_CELULAR = 'Celular'
export const URL_FUNCION = 'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/ubicacion'
export const BUSCADORES_OFICIALES = [
  { nombre: 'SmartThings Find', detalle: 'Samsung: hacer sonar, bloquear y encontrarlo aunque no tenga internet', url: 'https://smartthingsfind.samsung.com/' },
  { nombre: 'Google Encontrar', detalle: 'Google: hacer sonar y ver la última ubicación que tiene Google', url: 'https://www.google.com/android/find' },
]

// Una entrada por dispositivo: la última ubicación y las anteriores (más nuevas primero).
export function porDispositivo(filas) {
  const grupos = new Map()
  for (const f of [...filas].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    if (!grupos.has(f.dispositivo)) grupos.set(f.dispositivo, [])
    grupos.get(f.dispositivo).push(f)
  }
  return [...grupos.entries()]
    .map(([dispositivo, lista]) => ({ dispositivo, ultima: lista[0], anteriores: lista.slice(1) }))
    .sort((a, b) => (a.dispositivo === DISPOSITIVO_CELULAR ? -1 : b.dispositivo === DISPOSITIVO_CELULAR ? 1 : Date.parse(b.ultima.at) - Date.parse(a.ultima.at)))
}

export function haceCuanto(iso, ahora = Date.now()) {
  const min = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60_000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

// Si el celular dejó de mandar, la ubicación puede estar vieja: más de una hora sin noticias es para avisar.
export function estaDesactualizada(iso, ahora = Date.now()) {
  return ahora - Date.parse(iso) > 60 * 60_000
}

export const TEXTO_MOTIVO = {
  periodico: 'ubicación de rutina',
  manual: 'mandada desde la app',
  desconexion: 'se desconectaron acá: probablemente quedaron en este lugar',
  reconexion: 'volvió a tener internet acá',
}

// Mapa sin dependencias: el visor embebido de OpenStreetMap, con un margen según la precisión.
export function urlMapa(lat, lon, precisionM = null) {
  const radio = Math.min(Math.max((precisionM ?? 150) * 3, 300), 5000)
  const dLat = radio / 111_320
  const dLon = radio / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  const f = n => n.toFixed(6)
  return `https://www.openstreetmap.org/export/embed.html?bbox=${f(lon - dLon)}%2C${f(lat - dLat)}%2C${f(lon + dLon)}%2C${f(lat + dLat)}&layer=mapnik&marker=${f(lat)}%2C${f(lon)}`
}

export function urlGoogleMaps(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)}%2C${lon.toFixed(6)}`
}

// La app de SB solo manda la ubicación desde un celular: desde la compu sería la ubicación de la compu.
export function esCelular(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /Android|iPhone|iPad|Mobile/i.test(userAgent) && !/Electron/i.test(userAgent)
}

// Cuerpo que manda MacroDroid. Los {…} son variables de MacroDroid que completa el celular al enviar.
export function cuerpoMacroDroid(dispositivo, motivo) {
  return `{"dispositivo":"${dispositivo}","motivo":"${motivo}","lat":"{last_loc_lat}","lon":"{last_loc_long}","precision":"{last_loc_accuracy}","bateria":"{battery}"}`
}
