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
