function validarProjectId(project_id) {
  if (project_id == null) return null
  return typeof project_id === 'string' && /^[0-9a-f-]{36}$/i.test(project_id) ? project_id : null
}

export function validarEvento(body, { requiereId = true } = {}) {
  if (!body) throw new Error('Evento inválido.')
  if (requiereId && (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id))) throw new Error('Evento inválido.')
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 500) throw new Error('Ingresá un título de hasta 500 caracteres.')
  if (typeof body.all_day !== 'boolean') throw new Error('Tipo de evento inválido.')
  for (const field of ['description', 'location']) if (body[field] != null && (typeof body[field] !== 'string' || body[field].length > 10000)) throw new Error('Texto demasiado largo.')
  if (typeof body.starts_at !== 'string' || typeof body.ends_at !== 'string') throw new Error('Fechas inválidas.')
  const ini = new Date(body.starts_at), fin = new Date(body.ends_at)
  if (!Number.isFinite(ini.getTime()) || !Number.isFinite(fin.getTime()) || fin <= ini) throw new Error('El final debe ser posterior al inicio.')
  if (body.all_day && (!/^\d{4}-\d{2}-\d{2}$/.test(body.starts_at) || !/^\d{4}-\d{2}-\d{2}$/.test(body.ends_at) || ini.toISOString().slice(0,10) !== body.starts_at || fin.toISOString().slice(0,10) !== body.ends_at)) throw new Error('Las fechas del evento no son válidas.')
  const timeZone = body.time_zone || 'America/Argentina/Buenos_Aires'
  try { new Intl.DateTimeFormat('es', { timeZone }) } catch { throw new Error('Zona horaria inválida.') }
  return {
    id: requiereId ? body.id : undefined,
    title: body.title.trim(),
    description: body.description?.trim() || null,
    location: body.location?.trim() || null,
    all_day: body.all_day,
    starts_at: body.all_day ? body.starts_at : ini.toISOString(),
    ends_at: body.all_day ? body.ends_at : fin.toISOString(),
    time_zone: timeZone,
    project_id: validarProjectId(body.project_id),
  }
}

export function cambiosGoogle(evento) {
  return { summary:evento.title, description:evento.description || '', location:evento.location || '', start:evento.all_day ? { date:evento.starts_at, dateTime:null, timeZone:null } : { date:null, dateTime:evento.starts_at, timeZone:evento.time_zone }, end:evento.all_day ? { date:evento.ends_at, dateTime:null, timeZone:null } : { date:null, dateTime:evento.ends_at, timeZone:evento.time_zone } }
}
