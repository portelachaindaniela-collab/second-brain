import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validarEvento, cambiosGoogle } from './event.mjs';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Cache-Control':'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const CAMPOS = 'id,title,description,starts_at,ends_at,location,project_id,all_day,google_event_id,calendar_id';

async function tokenVigente(admin: any, cuenta: any) {
  if (cuenta.access_token && new Date(cuenta.expires_at).getTime() > Date.now() + 60000) return cuenta.access_token;
  if (!cuenta.refresh_token) throw new Error('RECONNECT');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, refresh_token: cuenta.refresh_token, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(15000) });
  const data = await r.json(); if (!r.ok || !data.access_token) throw new Error('RECONNECT');
  const { error } = await admin.from('oauth_accounts').update({ access_token: data.access_token, expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString() }).eq('id', cuenta.id);
  if (error) throw new Error('No se pudo actualizar la conexión.');
  return data.access_token;
}

async function obtenerCuentaGoogle(admin: any, ownerId: string) {
  const { data: cuenta, error } = await admin.from('oauth_accounts').select('*').eq('owner_id', ownerId).eq('provider', 'google').maybeSingle();
  if (error) throw new Error('No se pudo consultar la conexión de Google.');
  return cuenta;
}

async function crearEvento(admin: any, ownerId: string, body: any) {
  let cambios;
  try { cambios = validarEvento(body, { requiereId: false }); } catch (error) { return json({ error: error instanceof Error ? error.message : 'Datos inválidos.' }, 400); }

  let registro: any = { owner_id: ownerId, project_id: cambios.project_id, title: cambios.title, description: cambios.description, location: cambios.location, all_day: cambios.all_day, starts_at: cambios.all_day ? cambios.starts_at + 'T00:00:00Z' : cambios.starts_at, ends_at: cambios.all_day ? cambios.ends_at + 'T00:00:00Z' : cambios.ends_at };
  let googleEventId: string | null = null;
  let calendarId = 'primary';
  let enGoogle = false;

  let cuenta;
  try { cuenta = await obtenerCuentaGoogle(admin, ownerId); } catch { return json({ error: 'No se pudo consultar la conexión de Google.' }, 500); }

  if (cuenta) {
    let token: string;
    try { token = await tokenVigente(admin, cuenta); } catch { return json({ error: 'Volvé a conectar Google para crear el evento ahí también.', reconectar: true }, 403); }
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none';
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cambiosGoogle(cambios)), signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    if (r.status === 403) {
      const reasons = (data.error?.errors || []).map((e: any) => e.reason);
      const scope = reasons.includes('insufficientPermissions') || /scope|insufficient authentication/i.test(data.error?.message || '');
      return json({ error: scope ? 'Google está conectado en modo lectura. Autorizá la edición y volvé a crear el evento.' : 'Google no permite crear eventos con tu cuenta.', reconectar: scope }, 403);
    }
    if (!r.ok) return json({ error: 'Google no pudo crear el evento. Probá de nuevo en un momento.' }, 502);
    googleEventId = data.id; enGoogle = true;
    registro = { ...registro, title: data.summary || cambios.title, description: data.description || null, location: data.location || null, all_day: !!data.start?.date, starts_at: data.start?.dateTime || (data.start?.date + 'T00:00:00Z'), ends_at: data.end?.dateTime || (data.end?.date + 'T00:00:00Z'), synced_at: new Date().toISOString() };
  }

  const { data: creado, error: createError } = await admin.from('calendar_events').insert({ ...registro, google_event_id: googleEventId, calendar_id: calendarId }).select(CAMPOS).single();
  if (createError) return json({ error: 'No se pudo guardar el evento.', guardado_en_google: enGoogle }, 500);
  return json({ evento: creado, sincronizado_google: enGoogle });
}

async function eliminarEvento(admin: any, ownerId: string, body: any) {
  if (typeof body?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return json({ error: 'Evento inválido.' }, 400);
  const { data: evento, error: eventError } = await admin.from('calendar_events').select('*').eq('id', body.id).eq('owner_id', ownerId).maybeSingle();
  if (eventError) return json({ error: 'No se pudo consultar el evento.' }, 500);
  if (!evento) return json({ error: 'No se encontró ese evento.' }, 404);

  if (evento.google_event_id) {
    let cuenta;
    try { cuenta = await obtenerCuentaGoogle(admin, ownerId); } catch { return json({ error: 'No se pudo consultar la conexión de Google.' }, 500); }
    if (cuenta) {
      let token: string;
      try { token = await tokenVigente(admin, cuenta); } catch { return json({ error: 'Volvé a conectar Google para borrar este evento.', reconectar: true }, 403); }
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(evento.calendar_id || 'primary')}/events/${encodeURIComponent(evento.google_event_id)}?sendUpdates=none`;
      const r = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
      if (!r.ok && r.status !== 404 && r.status !== 410) {
        if (r.status === 403) return json({ error: 'Google está conectado en modo lectura. Autorizá la edición para poder borrar.', reconectar: true }, 403);
        return json({ error: 'Google no pudo borrar el evento. Probá de nuevo en un momento.' }, 502);
      }
    }
  }

  const { error: delError } = await admin.from('calendar_events').delete().eq('id', evento.id).eq('owner_id', ownerId);
  if (delError) return json({ error: 'No se pudo borrar el evento.' }, 500);
  return json({ ok: true });
}

async function editarEvento(admin: any, ownerId: string, body: any) {
  let cambios;
  try { cambios = validarEvento(body); } catch (error) { return json({ error: error instanceof Error ? error.message : 'Datos inválidos.' }, 400); }
  const { data: evento, error: eventError } = await admin.from('calendar_events').select('*').eq('id', cambios.id).eq('owner_id', ownerId).maybeSingle();
  if (eventError) return json({ error: 'No se pudo consultar el evento.' }, 500);
  if (!evento) return json({ error: 'No se encontró ese evento.' }, 404);
  let registro: any = { title: cambios.title, description: cambios.description, location: cambios.location, all_day: cambios.all_day, starts_at: cambios.all_day ? cambios.starts_at + 'T00:00:00Z' : cambios.starts_at, ends_at: cambios.all_day ? cambios.ends_at + 'T00:00:00Z' : cambios.ends_at };
  let enGoogle = false;
  if (evento.google_event_id) {
    let cuenta;
    try { cuenta = await obtenerCuentaGoogle(admin, ownerId); } catch { return json({ error: 'No se pudo consultar la conexión de Google.' }, 500); }
    if (!cuenta) return json({ error: 'Conectá Google para editar este evento.', reconectar: true }, 403);
    let token: string;
    try { token = await tokenVigente(admin, cuenta); } catch { return json({ error: 'Volvé a conectar Google para editar eventos.', reconectar: true }, 403); }
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(evento.calendar_id || 'primary')}/events/${encodeURIComponent(evento.google_event_id)}`;
    const actual = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!actual.ok) return json({ error: 'No se pudo leer el evento en Google Calendar. Probá sincronizar nuevamente.' }, actual.status === 404 ? 404 : 502);
    const previo = await actual.json();
    const r = await fetch(url + '?sendUpdates=none', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(previo.etag ? { 'If-Match': previo.etag } : {}) }, body: JSON.stringify(cambiosGoogle(cambios)), signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    if (r.status === 403) { const reasons = (data.error?.errors || []).map((e: any) => e.reason); const scope = reasons.includes('insufficientPermissions') || /scope|insufficient authentication/i.test(data.error?.message || ''); return json({ error: scope ? 'Google está conectado en modo lectura. Autorizá la edición y volvé a guardar.' : 'Google no permite editar este evento con tu cuenta.', reconectar: scope }, 403); }
    if (r.status === 412) return json({ error: 'El evento cambió en Google. Sincronizá y volvé a abrirlo antes de editar.' }, 409);
    if (!r.ok) return json({ error: 'Google no pudo guardar los cambios. Revisá los datos y probá nuevamente.' }, 502);
    enGoogle = true;
    registro = { ...registro, title: data.summary || cambios.title, description: data.description || null, location: data.location || null, all_day: !!data.start?.date, starts_at: data.start?.dateTime || (data.start?.date + 'T00:00:00Z'), ends_at: data.end?.dateTime || (data.end?.date + 'T00:00:00Z'), synced_at: new Date().toISOString() };
  }
  const { data: guardado, error: saveError } = await admin.from('calendar_events').update(registro).eq('id', evento.id).eq('owner_id', ownerId).select(CAMPOS).single();
  if (saveError) return json({ error: enGoogle ? 'El cambio se guardó en Google, pero falta actualizar la copia local. Tocá Sincronizar.' : 'No se pudo guardar el evento.', guardado_en_google: enGoogle }, 500);
  return json({ evento: guardado });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /i, '');
  if (!jwt) return json({ error: 'Iniciá sesión.' }, 401);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: auth, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !auth.user) return json({ error: 'Sesión inválida.' }, 401);
    const body = await req.json();
    const accion = body?.accion === 'crear' || body?.accion === 'eliminar' ? body.accion : 'editar';
    if (accion === 'crear') return await crearEvento(admin, auth.user.id, body);
    if (accion === 'eliminar') return await eliminarEvento(admin, auth.user.id, body);
    return await editarEvento(admin, auth.user.id, body);
  } catch { return json({ error: 'No se pudo completar la operación. Sincronizá antes de reintentar para verificar el estado del evento.' }, 503); }
});
