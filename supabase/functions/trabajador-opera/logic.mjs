export const TRABAJADOR = 'opera';

// Ópera corre en GitHub Actions (repo arma-mi-dia, workflow opera.yml) y avisa acá con un token OIDC de GitHub:
// no hay secreto compartido, se verifica que el token lo haya firmado GitHub para ese repo y ese workflow.
export const OIDC_EMISOR = 'https://token.actions.githubusercontent.com';
export const OIDC_AUDIENCIA = 'second-brain-opera';
export const REPO = 'portelachaindaniela-collab/arma-mi-dia';
export const WORKFLOW = `${REPO}/.github/workflows/opera.yml@refs/heads/master`;

// Si pg_cron llama y Ópera no avisó en este tiempo, se anota una corrida con error.
export const HORAS_SIN_AVISO = 26;

export function claimsValidos(claims) {
  return !!claims && claims.repository === REPO && claims.workflow_ref === WORKFLOW && claims.ref === 'refs/heads/master';
}

// Ópera también recibe la auditoría de ORIGEN (repo creando_sentido, workflow auditoria-periodica.yml), que antes
// mandaba el reporte por mail. Avisa con el mismo token OIDC y la misma audiencia; queda como corrida con
// payload.tipo 'auditoria'.
export const REPO_ORIGEN = 'portelachaindaniela-collab/creando_sentido';
export const WORKFLOW_ORIGEN = `${REPO_ORIGEN}/.github/workflows/auditoria-periodica.yml@refs/heads/master`;
// La auditoría corre "cada 3 días" con */3 en el día del mes (entre 1 y 4 días) y GitHub la atrasa unas horas.
export const HORAS_SIN_AUDITORIA = 100;

export function esAuditoriaOrigen(claims) {
  return !!claims && claims.repository === REPO_ORIGEN && claims.workflow_ref === WORKFLOW_ORIGEN && claims.ref === 'refs/heads/master';
}

// El reporte lo arma scripts/opera.py. El trabajador no juzga la cartelera: copia lo que importa para el panel.
export function armarCorrida(reporte) {
  if (!reporte || typeof reporte !== 'object' || !Array.isArray(reporte.fuentes)) {
    throw new Error('El reporte de Ópera no trae fuentes.');
  }
  const fuentes = reporte.fuentes.map((f) => ({
    clave: String(f.clave ?? ''),
    nombre: String(f.nombre ?? f.clave ?? ''),
    estado: ['ok', 'vacia', 'error'].includes(f.estado) ? f.estado : 'error',
    funciones: Number.isFinite(f.funciones) ? f.funciones : 0,
    segundos: Number.isFinite(f.segundos) ? f.segundos : null,
    sin_entender: Array.isArray(f.sin_entender) ? f.sin_entender.slice(0, 20).map(String) : [],
    error: f.error ? String(f.error).slice(0, 300) : null,
  }));
  const conError = fuentes.filter((f) => f.estado === 'error');
  const total = Number.isFinite(reporte.total) ? reporte.total : fuentes.reduce((s, f) => s + f.funciones, 0);
  return {
    // Solo es error si no se pudo leer ninguna fuente; una caída sola queda como aviso en el detalle.
    estado: conError.length === fuentes.length ? 'error' : 'ok',
    cantidad_resultados: total,
    error: conError.length ? conError.map((f) => `${f.nombre}: ${f.error ?? 'sin datos'}`).join(' · ') : null,
    payload: {
      cambio: !!reporte.cambio,
      publicado: !!reporte.publicado,
      total,
      fuentes,
      inicio: typeof reporte.inicio === 'string' ? reporte.inicio : null,
      run_url: typeof reporte.run_url === 'string' ? reporte.run_url : null,
    },
  };
}

// Además de la cartelera, Ópera revisa cada hora que ODBA ande (antes lo hacía el monitor de sitios para María).
export const SITIO = { nombre: 'ODBA - Arma mi dia', url: 'https://odba.netlify.app' };

// `sitio` es lo que devuelve monitor() de maria-agent/checks.mjs para ODBA. Un aviso (lento, redirige) no es error.
export function corridaDeSitio(sitio) {
  const chequeo = sitio?.chequeos?.[0] ?? { nivel: 'error', detalle: 'No hubo chequeo del sitio.' };
  return {
    estado: sitio?.nivel === 'error' ? 'error' : 'ok',
    cantidad_resultados: null,
    error: sitio?.nivel === 'ok' ? null : chequeo.detalle,
    payload: { tipo: 'sitio', url: SITIO.url, nivel: sitio?.nivel ?? 'error', detalle: chequeo.detalle, latencia_ms: chequeo.latencia_ms ?? null },
  };
}

const corto = (v, max) => (v == null ? null : String(v).slice(0, max));

// El reporte lo arma el workflow de ORIGEN con hallazgos.json de scripts/audit-origen.js. Cada regla que no se cumplió
// es un hallazgo; con uno solo la corrida queda en error para que María lo avise.
export function armarAuditoria(reporte) {
  if (!reporte || typeof reporte !== 'object' || !Array.isArray(reporte.hallazgos)) {
    throw new Error('La auditoría de ORIGEN no generó reporte: revisá los logs del run.');
  }
  const lista = reporte.hallazgos.filter((h) => h && typeof h === 'object');
  const fallidos = lista.filter((h) => h.ok === false).map((h) => ({
    regla: corto(h.regla, 80) ?? '', pagina: corto(h.pagina, 120), viewport: corto(h.viewport, 20), detalle: corto(h.detalle, 300),
  }));
  const linea = (h) => `${h.regla}${h.pagina ? ` en ${h.pagina}` : ''}${h.viewport ? ` (${h.viewport})` : ''}`;
  return {
    estado: fallidos.length ? 'error' : 'ok',
    cantidad_resultados: fallidos.length,
    error: fallidos.length
      ? `ORIGEN: ${fallidos.length} ${fallidos.length === 1 ? 'hallazgo' : 'hallazgos'} (${fallidos.slice(0, 5).map(linea).join(' · ')}${fallidos.length > 5 ? ' · …' : ''})`
      : null,
    payload: {
      tipo: 'auditoria',
      total: lista.length,
      ok: lista.filter((h) => h.ok === true).length,
      no_aplica: lista.filter((h) => h.ok === null).length,
      hallazgos: fallidos.slice(0, 40),
      inicio: typeof reporte.inicio === 'string' ? reporte.inicio : null,
      run_url: typeof reporte.run_url === 'string' ? reporte.run_url : null,
    },
  };
}

// María mira solo la última corrida de Ópera, y el chequeo de ODBA de cada hora taparía un fallo de ORIGEN. Por eso
// cada corrida de la cartelera o del sitio arrastra el estado de la última auditoría: sigue en error hasta que una
// salga limpia, o si la auditoría dejó de avisar.
export function conAuditoria(corrida, ultima, ahora = Date.now()) {
  if (!ultima) return corrida;
  const inicio = Date.parse(ultima.iniciado_at ?? '');
  const vieja = !Number.isFinite(inicio) || ahora - inicio > HORAS_SIN_AUDITORIA * 3600_000;
  const problema = vieja
    ? `La auditoría de ORIGEN no avisó en ${HORAS_SIN_AUDITORIA} h: revisá auditoria-periodica.yml (repo creando_sentido).`
    : ultima.estado === 'error' ? ultima.error : null;
  const payload = { ...(corrida.payload ?? {}), auditoria: { estado: vieja ? 'error' : ultima.estado, iniciado_at: ultima.iniciado_at ?? null, run_url: ultima.payload?.run_url ?? null } };
  if (!problema) return { ...corrida, payload };
  return { ...corrida, estado: 'error', error: [corrida.error, problema].filter(Boolean).join(' · '), payload };
}
