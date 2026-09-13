export async function quitarEliminados({ admin, ownerId, token, consultar = fetch }) {
  const guardados = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await admin.from('calendar_events')
      .select('id,calendar_id,google_event_id,synced_at').eq('owner_id', ownerId)
      .not('google_event_id', 'is', null).order('id').range(inicio, inicio + 499);
    if (error) throw new Error(error.message);
    guardados.push(...data);
    if (data.length < 500) break;
  }
  let eliminados = 0;
  let primerError;
  for (let inicio = 0; inicio < guardados.length; inicio += 5) {
    const resultados = await Promise.allSettled(guardados.slice(inicio, inicio + 5).map(async evento => {
      if (!evento.calendar_id || !evento.google_event_id) return;
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(evento.calendar_id)}/events/${encodeURIComponent(evento.google_event_id)}`;
      const respuesta = await consultar(url, { headers: { Authorization: `Bearer ${token}` } });
      const datos = await respuesta.json();
      const eliminado = (respuesta.ok && datos.status === 'cancelled') ||
        (respuesta.status === 410 && datos.error?.errors?.some(error => error.reason === 'deleted'));
      if (!eliminado) {
        if (!respuesta.ok) throw new Error(datos.error?.message ?? 'No se pudo comprobar un evento de Google');
        return;
      }
      let borrar = admin.from('calendar_events').delete().eq('owner_id', ownerId)
        .eq('id', evento.id).eq('calendar_id', evento.calendar_id).eq('google_event_id', evento.google_event_id);
      borrar = evento.synced_at ? borrar.eq('synced_at', evento.synced_at) : borrar.is('synced_at', null);
      const { error, data } = await borrar.select('id');
      if (error) throw new Error(error.message);
      eliminados += data.length;
    }));
    const fallo = resultados.find(resultado => resultado.status === 'rejected');
    if (fallo && !primerError) primerError = fallo.reason;
  }
  if (primerError) throw primerError;
  return eliminados;
}
