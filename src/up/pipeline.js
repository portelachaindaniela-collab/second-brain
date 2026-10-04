import { supabase } from '../supabase.js'

// Corre los agentes de UP para una fecha. Devuelve el aviso para mostrar ('' si salió todo bien).
// regenerar: reescribe lo que todavía no se aprobó; si no, completa solo lo que falta.
export async function correrPipeline(fecha, regenerar = false) {
  const { data, error } = await supabase.functions.invoke('up-pipeline', { body: { fecha, regenerar } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || respuesta?.error) return respuesta?.error || 'No se pudieron generar los borradores.'
  if (respuesta?.cortado) return respuesta.mensaje
  return ''
}

export const ESTADOS = { pendiente: 'Pendiente', falta_info: 'Falta info', revision: 'En revisión', aprobado: 'Aprobado', publicado: 'Publicado', error: 'Error' }
export const NOMBRE_RED = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' }
