import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function horaLocal(zona: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
  const partes = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { hhmm: `${partes.hour}:${partes.minute}`, fecha: `${partes.year}-${partes.month}-${partes.day}` };
}

function dentroDeVentana(horaObjetivo: string, horaActual: string, minutos = 5) {
  const [oh, om] = horaObjetivo.split(':').map(Number);
  const [ah, am] = horaActual.split(':').map(Number);
  if ([oh, om, ah, am].some((n) => Number.isNaN(n))) return false;
  const objetivo = oh * 60 + om, actual = ah * 60 + am;
  return actual >= objetivo && actual < objetivo + minutos;
}

async function construirResumen(admin: any, ownerId: string) {
  const inicioDia = new Date(); inicioDia.setUTCHours(0, 0, 0, 0);
  const finDia = new Date(inicioDia.getTime() + 24 * 3600_000);
  const [eventos, tareas, mails] = await Promise.all([
    admin.from('calendar_events').select('title,starts_at').eq('owner_id', ownerId).gte('starts_at', inicioDia.toISOString()).lt('starts_at', finDia.toISOString()).order('starts_at').limit(8),
    admin.from('tasks').select('title').eq('owner_id', ownerId).eq('done', false).order('touched_at', { ascending: true }).limit(5),
    admin.from('emails').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('is_unread', true),
  ]);
  const evs = eventos.data || [];
  const tas = tareas.data || [];
  const sinLeer = mails.count || 0;
  const partes: string[] = [];
  partes.push(evs.length ? `Tenés ${evs.length} evento${evs.length === 1 ? '' : 's'} hoy: ${evs.map((e: any) => e.title).join(', ')}.` : 'No tenés eventos agendados para hoy.');
  partes.push(tas.length ? `Tareas pendientes: ${tas.map((t: any) => t.title).join(', ')}.` : 'No tenés tareas pendientes.');
  partes.push(sinLeer ? `Tenés ${sinLeer} mail${sinLeer === 1 ? '' : 's'} sin leer.` : 'No tenés mails sin leer.');
  return partes.join(' ');
}

Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!vapidPublic || !vapidPrivate) {
    return new Response(JSON.stringify({ error: 'Faltan las claves VAPID.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  webpush.setVapidDetails('mailto:portelachaindaniela@gmail.com', vapidPublic, vapidPrivate);

  const { data: subs, error } = await admin.from('push_subscriptions').select('*').eq('activo', true);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let enviados = 0;
  for (const sub of subs || []) {
    const { hhmm, fecha } = horaLocal(sub.zona_horaria || 'America/Argentina/Buenos_Aires');
    if (sub.ultimo_enviado_en === fecha) continue;
    if (!dentroDeVentana(sub.hora_local, hhmm)) continue;
    try {
      const texto = await construirResumen(admin, sub.owner_id);
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ titulo: 'Tu resumen del día', texto }),
      );
      await admin.from('push_subscriptions').update({ ultimo_enviado_en: fecha }).eq('id', sub.id);
      enviados++;
    } catch (e: any) {
      const status = e?.statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').update({ activo: false }).eq('id', sub.id);
      console.error('resumen-diario: fallo el envío', sub.id, String(e));
    }
  }
  return new Response(JSON.stringify({ enviados }), { headers: { 'Content-Type': 'application/json' } });
});
