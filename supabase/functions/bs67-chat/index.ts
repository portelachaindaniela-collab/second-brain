import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  MODELO_DEFAULT, MAX_TOKENS_SALIDA_DEFAULT,
  PRECIO_ENTRADA_POR_1K_MICROS_DEFAULT, PRECIO_SALIDA_POR_1K_MICROS_DEFAULT,
  LIMITE_MENSUAL_MICROS_DEFAULT,
  mesActual, mensajeLimiteAlcanzado, mensajeFaltaConfiguracion,
  estimarReservaMicros, calcularCostoRealMicros,
  construirContexto, construirMensajes,
} from './logic.mjs';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function validarBody(body: any) {
  if (!body || typeof body.mensaje !== 'string' || !body.mensaje.trim()) throw new Error('Escribí un mensaje para BS67.');
  if (body.mensaje.length > 4000) throw new Error('El mensaje es demasiado largo.');
  const historial = Array.isArray(body.historial)
    ? body.historial.slice(-12).filter((h: any) => h && typeof h.texto === 'string' && (h.rol === 'user' || h.rol === 'bot'))
    : [];
  const pantalla = typeof body.pantalla === 'string' ? body.pantalla.slice(0, 60) : null;
  const proyectoId = typeof body.proyecto_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.proyecto_id) ? body.proyecto_id : null;
  return { mensaje: body.mensaje.trim(), historial, pantalla, proyectoId };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /i, '');
  if (!jwt) return json({ error: 'Iniciá sesión.' }, 401);

  // Si falta cualquier configuración necesaria, se informa el error sin llamar al proveedor de IA.
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!openaiKey || !supabaseUrl || !serviceKey) {
    return json({ error: mensajeFaltaConfiguracion() }, 503);
  }

  let entrada;
  try { entrada = validarBody(await req.json()); } catch (error) { return json({ error: error instanceof Error ? error.message : 'Datos inválidos.' }, 400); }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !auth.user) return json({ error: 'Sesión inválida.' }, 401);
  const ownerId = auth.user.id;

  const modelo = Deno.env.get('BS67_MODEL') || MODELO_DEFAULT;
  const maxTokensSalida = Number(Deno.env.get('BS67_MAX_OUTPUT_TOKENS')) || MAX_TOKENS_SALIDA_DEFAULT;
  const precioEntrada = Number(Deno.env.get('BS67_PRECIO_ENTRADA_POR_1K_MICROS')) || PRECIO_ENTRADA_POR_1K_MICROS_DEFAULT;
  const precioSalida = Number(Deno.env.get('BS67_PRECIO_SALIDA_POR_1K_MICROS')) || PRECIO_SALIDA_POR_1K_MICROS_DEFAULT;
  const limiteMensual = Number(Deno.env.get('BS67_LIMITE_MENSUAL_MICROS')) || LIMITE_MENSUAL_MICROS_DEFAULT;

  const [proyectosRes, tareasRes, eventosRes, mailsRes, docsRes] = await Promise.all([
    admin.from('projects').select('id,name,status').eq('owner_id', ownerId).order('created_at').limit(30),
    admin.from('tasks').select('id,title,project_id,due_at').eq('owner_id', ownerId).eq('done', false).order('touched_at', { ascending: true }).limit(15),
    admin.from('calendar_events').select('id,title,starts_at,project_id').eq('owner_id', ownerId).gte('starts_at', new Date(Date.now() - 3600_000).toISOString()).order('starts_at').limit(15),
    admin.from('emails').select('id,from_name,from_addr,subject').eq('owner_id', ownerId).eq('is_unread', true).order('received_at', { ascending: false }).limit(8),
    admin.from('docs').select('id,title,project_id').eq('owner_id', ownerId).order('updated_at', { ascending: false }).limit(8),
  ]);

  const proyectoActual = entrada.proyectoId ? (proyectosRes.data || []).find((p: any) => p.id === entrada.proyectoId) || null : null;
  const contexto = construirContexto({
    pantalla: entrada.pantalla,
    proyectoActual,
    proyectos: proyectosRes.data || [],
    tareas: tareasRes.data || [],
    eventos: eventosRes.data || [],
    mails: mailsRes.data || [],
    docs: docsRes.data || [],
  });

  const yearMonth = mesActual();
  const reservaMicros = estimarReservaMicros({ mensaje: entrada.mensaje, contexto, historial: entrada.historial, maxTokensSalida, precioEntrada, precioSalida });

  const { data: reservado, error: reservaError } = await admin.rpc('bs67_reservar_presupuesto', {
    p_owner: ownerId, p_year_month: yearMonth, p_amount_micros: reservaMicros, p_limit_micros: limiteMensual,
  });
  if (reservaError) return json({ error: 'No se pudo verificar el presupuesto de BS67. Probá de nuevo en un momento.' }, 500);
  if (!reservado) return json({ error: mensajeLimiteAlcanzado() }, 402);

  const mensajes = construirMensajes({ contexto, historial: entrada.historial, mensaje: entrada.mensaje });

  let respuestaTexto = '';
  let usage: any = null;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, messages: mensajes, max_tokens: maxTokensSalida, temperature: 0.4 }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('bs67-chat: OpenAI respondió', r.status, JSON.stringify(data));
      throw new Error(data?.error?.message || `El proveedor de IA rechazó la consulta (HTTP ${r.status}).`);
    }
    respuestaTexto = data?.choices?.[0]?.message?.content?.trim() || 'No obtuve una respuesta. Probá reformular la consulta.';
    usage = data?.usage || null;
  } catch (e) {
    console.error('bs67-chat: fallo la llamada a OpenAI', e instanceof Error ? e.message : String(e));
    await admin.rpc('bs67_liberar_reserva', { p_owner: ownerId, p_year_month: yearMonth, p_amount_micros: reservaMicros });
    const detalle = e instanceof Error ? e.message : 'Error desconocido';
    return json({ error: `No se pudo consultar a BS67 en este momento (${detalle}).` }, 502);
  }

  const costoRealMicros = calcularCostoRealMicros(usage, { precioEntrada, precioSalida }) ?? reservaMicros;
  await admin.rpc('bs67_confirmar_gasto', {
    p_owner: ownerId, p_year_month: yearMonth, p_reservado_micros: reservaMicros, p_real_micros: costoRealMicros,
    p_model: modelo, p_input_tokens: usage?.prompt_tokens ?? null, p_output_tokens: usage?.completion_tokens ?? null,
  });

  await admin.from('bot_messages').insert([
    { owner_id: ownerId, project_id: entrada.proyectoId, channel: 'web', role: 'user', content: entrada.mensaje },
    { owner_id: ownerId, project_id: entrada.proyectoId, channel: 'web', role: 'assistant', content: respuestaTexto },
  ]);

  return json({ respuesta: respuestaTexto });
});
