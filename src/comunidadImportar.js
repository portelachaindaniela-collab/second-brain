import { supabase } from './supabase.js'
import { EVENTOS_COMUNIDAD, eventosPendientes } from './comunidadEventos.mjs'

// Importa a Google y a Second Brain los eventos de la página Comunidad que todavía no están. La usa el pie de
// Mail y Calendario y la vista suelta de Agenda.
export async function importarEventosComunidad() {
  const { data: existentes, error: errorExistentes } = await supabase.from('calendar_events').select('title')
  if (errorExistentes) throw new Error('No se pudo revisar el calendario actual.')
  const pendientes = eventosPendientes((existentes || []).map(e => e.title))
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  let creados = 0, fallidos = 0
  for (const evento of pendientes) {
    const { data, error } = await supabase.functions.invoke('google-calendar-edit', { body: { accion: 'crear', title: evento.title, location: evento.location, description: evento.description, all_day: true, starts_at: evento.starts_at, ends_at: evento.ends_at, time_zone: timeZone, project_id: null } })
    let respuesta = data
    if (error?.context) { try { respuesta = await error.context.json() } catch { /* se cuenta como fallido */ } }
    if (error || respuesta?.error) fallidos++; else creados++
  }
  return { creados, yaExistian: EVENTOS_COMUNIDAD.length - pendientes.length, fallidos }
}

export function textoImportacion(r) {
  if (!r) return null
  if (r.error) return r.error
  return `Comunidad: ${r.creados} evento(s) agregado(s), ${r.yaExistian} ya estaban${r.fallidos ? `, ${r.fallidos} fallaron` : ''}.`
}
