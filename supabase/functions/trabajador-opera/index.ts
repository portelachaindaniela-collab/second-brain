import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { TRABAJADOR, OIDC_EMISOR, OIDC_AUDIENCIA, HORAS_SIN_AVISO, claimsValidos, armarCorrida } from './logic.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trabajador-secreto',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const jwks = createRemoteJWKSet(new URL(`${OIDC_EMISOR}/.well-known/jwks`));

// Dos formas de llamarlo (verify_jwt false):
// - GitHub Actions (workflow opera.yml), con su token OIDC en Authorization:
//     {"accion": "consultar"} -> dice si Ópera está activo (si lo pausaste acá, el workflow no corre);
//     {"accion": "reportar", "reporte": {...}} -> anota la corrida en trabajos_corridas.
// - pg_cron, a la hora de `frecuencia`: si Ópera no avisó en las últimas 26 h, anota una corrida con error.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');

  if (token.split('.').length === 3) {
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(token, jwks, { issuer: OIDC_EMISOR, audience: OIDC_AUDIENCIA }));
    } catch {
      claims = null;
    }
    if (!claimsValidos(claims)) return json({ error: 'Token de GitHub no válido para Ópera.' }, 401);

    const cuerpo = await req.json().catch(() => ({}));
    if (cuerpo.accion === 'consultar') {
      const { data } = await admin.from('trabajadores').select('activo').eq('clave', TRABAJADOR).single();
      return json({ activo: data?.activo ?? true });
    }
    if (cuerpo.accion !== 'reportar') return json({ error: 'Acción desconocida.' }, 400);

    let corrida;
    try {
      corrida = armarCorrida(cuerpo.reporte);
    } catch (e) {
      corrida = { estado: 'error', cantidad_resultados: null, payload: null, error: e instanceof Error ? e.message : String(e) };
    }
    const fin = Date.now();
    const inicio = Date.parse(cuerpo.reporte?.inicio ?? '') || fin;
    const { data: fila, error } = await admin.from('trabajos_corridas').insert({
      trabajador: TRABAJADOR, ...corrida,
      iniciado_at: new Date(inicio).toISOString(), finalizado_at: new Date(fin).toISOString(), duracion_ms: fin - inicio,
    }).select('id').single();
    if (error) return json({ error: error.message }, 500);
    return json({ id: fila.id, estado: corrida.estado });
  }

  // Llamada de pg_cron: solo valida que Ópera haya avisado.
  const secreto = req.headers.get('x-trabajador-secreto') ?? '';
  const { data: valido } = await admin.rpc('trabajador_secreto_valido', { p_secreto: secreto });
  if (!valido) return json({ error: 'No autorizado.' }, 401);

  const desde = new Date(Date.now() - HORAS_SIN_AVISO * 3600_000).toISOString();
  const { data: recientes } = await admin.from('trabajos_corridas').select('id')
    .eq('trabajador', TRABAJADOR).gte('iniciado_at', desde).limit(1);
  if (recientes?.length) return json({ ok: 'Ópera avisó en las últimas horas.' });

  const ahora = new Date().toISOString();
  await admin.from('trabajos_corridas').insert({
    trabajador: TRABAJADOR, estado: 'error', iniciado_at: ahora, finalizado_at: ahora, duracion_ms: 0,
    error: `Ópera no avisó en ${HORAS_SIN_AVISO} h: revisá el workflow opera.yml en GitHub Actions (repo arma-mi-dia).`,
  });
  return json({ error: 'Ópera no avisó.' }, 502);
});
