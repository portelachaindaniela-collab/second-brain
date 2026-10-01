import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { TRABAJADOR, URL_ULTIMA_CORRIDA, extraerResultado } from './logic.mjs';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Lo dispara pg_cron (verify_jwt false). Para que una llamada externa no llene la tabla,
// si ya hubo una corrida en los últimos 5 minutos no hace nada.
Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: reciente } = await admin.from('trabajos_corridas').select('id')
    .eq('trabajador', TRABAJADOR).gte('iniciado_at', new Date(Date.now() - 5 * 60_000).toISOString()).limit(1);
  if (reciente?.length) return json({ omitido: 'Ya corrió hace menos de 5 minutos.' });

  const inicio = Date.now();
  const { data: fila, error: errorAlta } = await admin.from('trabajos_corridas')
    .insert({ trabajador: TRABAJADOR, estado: 'corriendo', iniciado_at: new Date(inicio).toISOString() })
    .select('id').single();
  if (errorAlta || !fila) return json({ error: errorAlta?.message ?? 'No se pudo registrar la corrida.' }, 500);

  let cierre;
  try {
    const r = await fetch(URL_ULTIMA_CORRIDA, { signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`El scraper respondió HTTP ${r.status}.`);
    const { cantidad, payload } = extraerResultado(await r.json());
    cierre = { estado: 'ok', cantidad_resultados: cantidad, payload, error: null };
  } catch (e) {
    cierre = { estado: 'error', cantidad_resultados: null, payload: null, error: e instanceof Error ? e.message : String(e) };
  }

  const fin = Date.now();
  await admin.from('trabajos_corridas')
    .update({ ...cierre, finalizado_at: new Date(fin).toISOString(), duracion_ms: fin - inicio })
    .eq('id', fila.id);
  return json({ id: fila.id, estado: cierre.estado }, cierre.estado === 'ok' ? 200 : 502);
});
