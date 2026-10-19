// Filas para la tabla calendarios a partir de calendarList de Google: el nombre que ve Daniela
// (summaryOverride si lo renombró, si no summary) y el color de fondo. El principal va como 'primary',
// igual que en calendar_events.
export function filasCalendarios(items, ownerId, ahora = new Date().toISOString()) {
  return (items ?? [])
    .filter(c => c?.id && !c.deleted)
    .map(c => ({
      owner_id: ownerId,
      calendar_id: c.primary ? 'primary' : c.id,
      nombre: c.summaryOverride || c.summary || c.id,
      color: /^#[0-9a-f]{6}$/i.test(c.backgroundColor ?? '') ? c.backgroundColor.toLowerCase() : null,
      updated_at: ahora,
    }))
}
