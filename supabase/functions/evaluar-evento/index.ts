import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { MODELO_DEFAULT, MAX_TOKENS_SALIDA_DEFAULT, construirPedido, armarVeredicto } from './logic.mjs';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Recibe { evento_id }, lee el evento y las reglas con la sesión de la usuaria (RLS) y guarda el veredicto en el evento.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Iniciá sesión.' }, 401);

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!geminiKey || !supabaseUrl || !anonKey) return json({ error: 'Falta configurar GEMINI_API_KEY en Supabase.' }, 503);

  let eventoId: string;
  try {
    const body = await req.json();
    eventoId = String(body?.evento_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(eventoId)) throw new Error();
  } catch { return json({ error: 'Falta el evento a evaluar.' }, 400); }

  const db = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const [eventoRes, reglasRes] = await Promise.all([
    db.from('eventos').select('*').eq('id', eventoId).maybeSingle(),
    db.from('reglas_personales').select('contenido').maybeSingle(),
  ]);
  if (eventoRes.error || reglasRes.error) return json({ error: 'No se pudo leer el evento o las reglas.' }, 500);
  if (!eventoRes.data) return json({ error: 'No encontré ese evento.' }, 404);
  const reglas = reglasRes.data?.contenido?.trim();
  if (!reglas) return json({ error: 'No hay reglas personales cargadas. Cargalas en Eventos → [reglas].' }, 409);
  const evento = eventoRes.data;

  const modelo = Deno.env.get('EVENTOS_MODEL') || MODELO_DEFAULT;
  let veredicto;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...construirPedido({ reglas, evento }),
        generationConfig: { maxOutputTokens: MAX_TOKENS_SALIDA_DEFAULT, temperature: 0.3, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `El proveedor de IA rechazó la consulta (HTTP ${r.status}).`);
    const texto = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('');
    veredicto = armarVeredicto(texto, evento);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'Error desconocido';
    console.error('evaluar-evento:', detalle);
    return json({ error: `No se pudo evaluar el evento (${detalle}).` }, 502);
  }

  const cambios: Record<string, unknown> = { veredicto: { ...veredicto, modelo }, evaluado_at: new Date().toISOString() };
  if (evento.estado === 'anotado') cambios.estado = 'evaluado';
  const { data: guardado, error } = await db.from('eventos').update(cambios).eq('id', eventoId).select().single();
  if (error) return json({ error: 'Se evaluó pero no se pudo guardar el veredicto.' }, 500);
  return json({ evento: guardado });
});
