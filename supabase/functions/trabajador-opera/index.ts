import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { monitor } from '../maria-agent/checks.mjs';
import { TRABAJADOR, OIDC_EMISOR, OIDC_AUDIENCIA, HORAS_SIN_AVISO, SITIO, claimsValidos, esAuditoriaOrigen, armarCorrida, armarAuditoria, conAuditoria, corridaDeSitio } from './logic.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trabajador-secreto',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const jwks = createRemoteJWKSet(new URL(`${OIDC_EMISOR}/.well-known/jwks`));

async function ultimaAuditoria(admin: any) {
  const { data } = await admin.from('trabajos_corridas').select('estado,iniciado_at,error,payload')
    .eq('trabajador', TRABAJADOR).eq('payload->>tipo', 'auditoria')
    .order('iniciado_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

// Dos formas de llamarlo (verify_jwt false):
// - GitHub Actions (workflow opera.yml), con su token OIDC en Authorization:
//     {"accion": "consultar"} -> dice si Ópera está activo (si lo pausaste acá, el workflow no corre);
//     {"accion": "reportar", "reporte": {...}} -> anota la corrida en trabajos_corridas.
//   La auditoría de ORIGEN (auditoria-periodica.yml de creando_sentido) usa el mismo "reportar" con sus hallazgos;
//   las corridas de cartelera y sitio arrastran el estado de la última auditoría (ver conAuditoria).
// - pg_cron, a la hora de `frecuencia` (cada hora): revisa que ODBA ande y lo anota como corrida (payload.tipo 'sitio');
//   además, si la cartelera no avisó en las últimas 26 h, anota una corrida con error.
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
    const auditoria = esAuditoriaOrigen(claims);
    if (!auditoria && !claimsValidos(claims)) return json({ error: 'Token de GitHub no válido para Ópera.' }, 401);

    const cuerpo = await req.json().catch(() => ({}));
    if (cuerpo.accion === 'consultar' && !auditoria) {
      const { data } = await admin.from('trabajadores').select('activo').eq('clave', TRABAJADOR).single();
      return json({ activo: data?.activo ?? true });
    }
    if (cuerpo.accion !== 'reportar') return json({ error: 'Acción desconocida.' }, 400);

    let corrida;
    try {
      corrida = auditoria ? armarAuditoria(cuerpo.reporte) : conAuditoria(armarCorrida(cuerpo.reporte), await ultimaAuditoria(admin));
    } catch (e) {
      const payload = auditoria ? { tipo: 'auditoria', run_url: cuerpo.reporte?.run_url ?? null } : null;
      corrida = { estado: 'error', cantidad_resultados: null, payload, error: e instanceof Error ? e.message : String(e) };
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

  // Llamada de pg_cron: revisa el sitio y que la cartelera haya avisado.
  const secreto = req.headers.get('x-trabajador-secreto') ?? '';
  const { data: valido } = await admin.rpc('trabajador_secreto_valido', { p_secreto: secreto });
  if (!valido) return json({ error: 'No autorizado.' }, 401);

  const inicio = Date.now();
  const { sitios: [sitio] } = await monitor(fetch, [SITIO]);
  const deSitio = conAuditoria(corridaDeSitio(sitio), await ultimaAuditoria(admin));
  const fin = Date.now();
  await admin.from('trabajos_corridas').insert({
    trabajador: TRABAJADOR, ...deSitio,
    iniciado_at: new Date(inicio).toISOString(), finalizado_at: new Date(fin).toISOString(), duracion_ms: fin - inicio,
  });

  const desde = new Date(Date.now() - HORAS_SIN_AVISO * 3600_000).toISOString();
  const { data: recientes } = await admin.from('trabajos_corridas').select('id')
    .eq('trabajador', TRABAJADOR).gte('iniciado_at', desde).is('payload->>tipo', null).limit(1);
  if (recientes?.length) return json({ sitio: deSitio.estado, cartelera: 'avisó en las últimas horas' }, deSitio.estado === 'ok' ? 200 : 502);

  const ahora = new Date().toISOString();
  await admin.from('trabajos_corridas').insert({
    trabajador: TRABAJADOR, estado: 'error', iniciado_at: ahora, finalizado_at: ahora, duracion_ms: 0,
    error: `Ópera no avisó en ${HORAS_SIN_AVISO} h: revisá el workflow opera.yml en GitHub Actions (repo arma-mi-dia).`,
  });
  return json({ sitio: deSitio.estado, error: 'Ópera no avisó.' }, 502);
});
