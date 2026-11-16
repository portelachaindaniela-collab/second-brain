// Agente de Postulaciones en la app: qué aviso mostrar arriba del chat, qué se manda y se guarda de la charla, y los
// controles de los archivos (CVs y capturas). Sin React ni base, para probarlo con node --test.

export { TIPOS_CV, TIPOS_DOC } from '../supabase/functions/postulaciones-agente/logic.mjs'

export const SIN_CLAVE = 'Falta configurar la API de Claude'
export const MAX_MB_DOC = 15
export const MAX_CAPTURAS = 10
export const LADO_MAX_CAPTURA = 1568

// Qué le falta al agente, en orden: la clave de Claude (no se llama al modelo), Google y los permisos nuevos.
export function avisoPanel(estado) {
  if (!estado) return null
  if (!estado.claude) return { clave: 'sin_clave', texto: SIN_CLAVE }
  if (!estado.google) return { clave: 'sin_google', texto: 'Conectá Google desde el menú (Conectar Google) para que el agente use tu planilla y tu Gmail.' }
  if (!estado.permisos?.leer_mail) return { clave: 'sin_google', texto: 'Volvé a conectar Google desde el menú (Conectar Google): falta el permiso para leer tu mail.' }
  if (estado.permisos?.falta_extra) return { clave: 'permisos', texto: 'El agente necesita permiso para usar tu planilla y crear borradores en Gmail (nunca manda mails). Se autoriza una vez.' }
  return null
}

// Lo que va a la función como historial: lo dicho por las dos, en texto. Las capturas viejas no se reenvían.
export function historialParaEnviar(mensajes) {
  return (mensajes || [])
    .filter(m => (m.rol === 'user' || m.rol === 'bot') && !m.error)
    .map(m => ({ rol: m.rol, texto: [m.texto, m.capturas ? `(Mandé ${m.capturas === 1 ? 'una captura' : `${m.capturas} capturas`})` : '', m.acciones?.length ? `(Hice: ${m.acciones.join('; ')})` : ''].filter(Boolean).join('\n') }))
    .filter(m => m.texto)
    .slice(-30)
}

export const MAX_GUARDADOS = 200
export const paraGuardar = mensajes => (mensajes || []).filter(m => !m.error).slice(-MAX_GUARDADOS).map(({ rol, texto, capturas, acciones, herramientas }) => ({ rol, texto, ...(capturas && { capturas }), ...(acciones?.length && { acciones }), ...(herramientas?.length && { herramientas }) }))

export const NOMBRE_HERRAMIENTA = {
  leer_planilla: 'la planilla', agregar_fila: 'cargó en la planilla', actualizar_estado: 'cambió un estado', crear_borrador: 'Gmail (borrador)',
  buscar_enviados: 'Enviados', buscar_rechazos: 'Recibidos', abrir_link: 'el link', leer_cv: 'tus CVs',
}

// Documentos: PDF o .docx, hasta 15 MB.
export function errorDocumento(nombre, tamano) {
  if (!/\.(pdf|docx)$/i.test(String(nombre || ''))) return 'Solo se aceptan archivos PDF o .docx.'
  if (tamano > MAX_MB_DOC * 1024 * 1024) return `El archivo pesa más de ${MAX_MB_DOC} MB.`
  return null
}

// La ruta en Storage: la carpeta de la dueña y un nombre sin caracteres raros (el nombre real queda en la tabla).
export function rutaDocumento(ownerId, nombre, id) {
  const base = String(nombre || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80)
  return `${ownerId}/${id}-${base}`
}

// El tamaño de una captura al achicarla (lado mayor hasta 1568 px: más no le sirve al modelo y pesa).
export function medidaCaptura(ancho, alto, max = LADO_MAX_CAPTURA) {
  const f = Math.min(1, max / Math.max(ancho, alto))
  return { ancho: Math.round(ancho * f), alto: Math.round(alto * f) }
}

export function fechaSubida(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

// Los documentos por tipo: un lugar por cada CV (vacío si falta) y la lista de Otros.
export function documentosPorTipo(docs, tipos) {
  const lista = docs || []
  return { cvs: tipos.map(tipo => ({ tipo, doc: lista.find(d => d.tipo === tipo) || null })), otros: lista.filter(d => d.tipo === 'Otros') }
}
