import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://itultpcdafpxpgtblgfb.supabase.co'
const SUPABASE_KEY = 'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export const ESTADOS = [
  { id: 'ideas', label: 'Ideas' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'esperando', label: 'Esperando' },
  { id: 'listo', label: 'Listo' },
]

export const TIPOS = {
  planilla: { label: 'Planilla', ext: ['xlsx', 'xls', 'csv'] },
  documento: { label: 'Documento', ext: ['docx', 'doc'] },
  presentacion: { label: 'Presentación', ext: ['pptx', 'ppt'] },
  pdf: { label: 'PDF', ext: ['pdf'] },
  imagen: { label: 'Imagen', ext: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  video: { label: 'Video', ext: ['mp4', 'mov', 'webm'] },
}

export function tipoDe(nombre) {
  const ext = (nombre.split('.').pop() || '').toLowerCase()
  for (const [tipo, info] of Object.entries(TIPOS)) {
    if (info.ext.includes(ext)) return tipo
  }
  return 'otro'
}

export function fechaCorta(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

export function fechaHora(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// En Electron, window.open() lo intercepta electron.cjs y lo manda al navegador del sistema — funciona
// aunque se llame después de un await. En un navegador de verdad (celular incluido) un window.open()
// que no ocurre en el mismo tick del click casi siempre lo bloquea el navegador, sin avisar nada: por
// eso ahí navegamos la misma pestaña en vez de abrir una nueva.
export function abrirEnlaceGoogle(url) {
  const esElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
  if (esElectron) window.open(url, '_blank')
  else window.location.href = url
}

export function hora(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
