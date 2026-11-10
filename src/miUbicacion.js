import { supabase } from './supabase.js'
import { DISPOSITIVO_CELULAR, esCelular } from './ubicaciones.mjs'

// La app de SB en el celular manda su ubicación al abrirse (si está activado) y con el botón de Mis cosas.
// Solo mientras la app está abierta: el navegador no deja leer la ubicación en segundo plano (eso lo hace MacroDroid).
const CLAVE_AUTO = 'sb-ubicacion-al-abrir'

export const puedeMandarDesdeAca = () => esCelular() && typeof navigator !== 'undefined' && 'geolocation' in navigator

export function mandarAlAbrir() {
  try { return localStorage.getItem(CLAVE_AUTO) === '1' } catch { return false }
}

export function cambiarMandarAlAbrir(activo) {
  try { activo ? localStorage.setItem(CLAVE_AUTO, '1') : localStorage.removeItem(CLAVE_AUTO) } catch { /* sin almacenamiento: queda apagado */ }
}

function posicion() {
  return new Promise((resolver, rechazar) => navigator.geolocation.getCurrentPosition(resolver, e => rechazar(new Error(
    e.code === 1 ? 'El celular no le da permiso de ubicación a la app. Activalo en el navegador.' :
    e.code === 3 ? 'El celular tardó demasiado en ubicarse. Probá de nuevo.' : 'El celular no pudo ubicarse.'
  )), { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 }))
}

async function bateria() {
  try { const b = await navigator.getBattery?.(); return b ? Math.round(b.level * 100) : null } catch { return null }
}

export async function mandarMiUbicacion(ownerId, motivo = 'manual') {
  if (!puedeMandarDesdeAca()) throw new Error('La ubicación se manda desde la app de SB en el celular.')
  const [p, nivel] = await Promise.all([posicion(), bateria()])
  const fila = {
    owner_id: ownerId, dispositivo: DISPOSITIVO_CELULAR, motivo,
    lat: p.coords.latitude, lon: p.coords.longitude,
    precision_m: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null, bateria: nivel,
  }
  const { error } = await supabase.from('ubicaciones').insert(fila)
  if (error) throw new Error('No se pudo guardar la ubicación: ' + error.message)
  return fila
}
