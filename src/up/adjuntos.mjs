// Adjuntos de una publicación: documentos (PDF, PowerPoint, Word) o imágenes que salen con el post. Siguen la regla de
// LinkedIn: un documento o hasta 20 imágenes, nunca las dos cosas juntas. Sin React ni base, para probarlo con node --test.

export const MAX_IMAGENES = 20
export const MAX_DOCUMENTO_BYTES = 100 * 1024 * 1024
export const MAX_IMAGEN_BYTES = 10 * 1024 * 1024
export const ACEPTA = '.pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.gif'

const DOCUMENTOS = { pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
const IMAGENES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' }

const extension = nombre => String(nombre).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''

// { tipo: 'documento' | 'imagen', mime } o null si LinkedIn no lo acepta.
export function tipoAdjunto(nombre) {
  const ext = extension(nombre)
  if (DOCUMENTOS[ext]) return { tipo: 'documento', mime: DOCUMENTOS[ext] }
  if (IMAGENES[ext]) return { tipo: 'imagen', mime: IMAGENES[ext] }
  return null
}

export function pesoLegible(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

// ¿Se pueden sumar estos archivos ({ name, size }) a los que ya tiene la publicación? Devuelve el error o ''.
export function validarAdjuntos(existentes, archivos) {
  const nuevos = archivos.map(a => ({ nombre: a.name, bytes: a.size, ...tipoAdjunto(a.name) }))
  const raro = nuevos.find(a => !a.tipo)
  if (raro) return `«${raro.nombre}» no se puede adjuntar: solo PDF, PowerPoint, Word o imágenes (JPG, PNG, GIF).`
  const grande = nuevos.find(a => a.bytes > (a.tipo === 'documento' ? MAX_DOCUMENTO_BYTES : MAX_IMAGEN_BYTES))
  if (grande) return `«${grande.nombre}» pesa ${pesoLegible(grande.bytes)}: el máximo es ${grande.tipo === 'documento' ? '100 MB para un documento' : '10 MB por imagen'}.`
  const todos = [...existentes, ...nuevos]
  const documentos = todos.filter(a => a.tipo === 'documento').length
  const imagenes = todos.filter(a => a.tipo === 'imagen').length
  if (documentos && imagenes) return 'LinkedIn no deja mezclar: cada post lleva un documento o imágenes, no las dos cosas.'
  if (documentos > 1) return 'Cada post lleva un solo documento. Sacá el que está para poner otro.'
  if (imagenes > MAX_IMAGENES) return `Cada post lleva hasta ${MAX_IMAGENES} imágenes.`
  return ''
}

// Ruta en el bucket: <dueña>/<publicación>/<red>/<marca>-<nombre limpio>.
export function rutaAdjunto(ownerId, calendarioId, red, nombre, marca = Date.now()) {
  const limpio = String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80)
  return `${ownerId}/${calendarioId}/${red}/${marca}-${limpio}`
}

export function resumenAdjuntos(adjuntos = []) {
  if (!adjuntos.length) return ''
  if (adjuntos.length === 1) return adjuntos[0].nombre
  const imagenes = adjuntos.filter(a => a.tipo === 'imagen').length
  return imagenes === adjuntos.length ? `${imagenes} imágenes` : `${adjuntos.length} archivos`
}
