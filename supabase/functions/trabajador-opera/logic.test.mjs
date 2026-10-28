import test from 'node:test';
import assert from 'node:assert/strict';
import { armarCorrida, armarAuditoria, claimsValidos, conAuditoria, corridaDeSitio, esAuditoriaOrigen, HORAS_SIN_AUDITORIA, REPO, REPO_ORIGEN, WORKFLOW, WORKFLOW_ORIGEN } from './logic.mjs';

const fuente = (clave, estado, funciones, extra = {}) => ({ clave, nombre: clave, estado, funciones, segundos: 1, ...extra });

test('claimsValidos acepta solo el workflow de Ópera en master del repo de ODBA', () => {
  const ok = { repository: REPO, workflow_ref: WORKFLOW, ref: 'refs/heads/master' };
  assert.equal(claimsValidos(ok), true);
  assert.equal(claimsValidos({ ...ok, repository: 'otra/cosa' }), false);
  assert.equal(claimsValidos({ ...ok, workflow_ref: `${REPO}/.github/workflows/otro.yml@refs/heads/master` }), false);
  assert.equal(claimsValidos({ ...ok, ref: 'refs/heads/prueba' }), false);
  assert.equal(claimsValidos(null), false);
});

test('armarCorrida cuenta funciones y marca ok aunque una fuente falle', () => {
  const r = armarCorrida({ cambio: true, publicado: true, total: 84, fuentes: [
    fuente('complejo_teatral', 'ok', 22, { sin_entender: ['Jazz: Marzo a noviembre'] }),
    fuente('movistar_arena', 'error', 0, { error: 'TimeoutError' }),
  ] });
  assert.equal(r.estado, 'ok');
  assert.equal(r.cantidad_resultados, 84);
  assert.match(r.error, /movistar_arena: TimeoutError/);
  assert.equal(r.payload.cambio, true);
  assert.deepEqual(r.payload.fuentes[0].sin_entender, ['Jazz: Marzo a noviembre']);
});

test('armarCorrida es error si no se pudo leer ninguna fuente', () => {
  const r = armarCorrida({ fuentes: [fuente('a', 'error', 0), fuente('b', 'error', 0)] });
  assert.equal(r.estado, 'error');
  assert.equal(r.cantidad_resultados, 0);
});

test('armarCorrida rechaza un reporte sin fuentes', () => {
  assert.throws(() => armarCorrida({}), /no trae fuentes/);
  assert.throws(() => armarCorrida(null), /no trae fuentes/);
});

test('corridaDeSitio: caído es error, lento queda ok con el aviso a la vista', () => {
  const ok = corridaDeSitio({ nivel: 'ok', chequeos: [{ nivel: 'ok', detalle: 'HTTP 200 en 300 ms.', latencia_ms: 300 }] });
  assert.equal(ok.estado, 'ok');
  assert.equal(ok.error, null);
  assert.deepEqual(ok.payload, { tipo: 'sitio', url: 'https://odba.netlify.app', nivel: 'ok', detalle: 'HTTP 200 en 300 ms.', latencia_ms: 300 });
  const lento = corridaDeSitio({ nivel: 'aviso', chequeos: [{ nivel: 'aviso', detalle: 'HTTP 200 en 5000 ms.', latencia_ms: 5000 }] });
  assert.equal(lento.estado, 'ok');
  assert.equal(lento.error, 'HTTP 200 en 5000 ms.');
  const caido = corridaDeSitio({ nivel: 'error', chequeos: [{ nivel: 'error', detalle: 'No se pudo consultar el sitio dentro de 12 segundos.' }] });
  assert.equal(caido.estado, 'error');
  assert.equal(caido.payload.latencia_ms, null);
});

test('esAuditoriaOrigen acepta solo el workflow de auditoría de creando_sentido en master', () => {
  const ok = { repository: REPO_ORIGEN, workflow_ref: WORKFLOW_ORIGEN, ref: 'refs/heads/master' };
  assert.equal(esAuditoriaOrigen(ok), true);
  assert.equal(claimsValidos(ok), false);
  assert.equal(esAuditoriaOrigen({ ...ok, ref: 'refs/heads/otra' }), false);
  assert.equal(esAuditoriaOrigen({ repository: REPO, workflow_ref: WORKFLOW, ref: 'refs/heads/master' }), false);
});

const h = (regla, ok, extra = {}) => ({ regla, pagina: 'historia', viewport: 'mobile', ok, detalle: 'd', ...extra });

test('armarAuditoria: sin hallazgos ok, con uno error y lo nombra', () => {
  const limpia = armarAuditoria({ hallazgos: [h('A1', true), h('C3', null)], run_url: 'https://r' });
  assert.deepEqual([limpia.estado, limpia.error, limpia.payload.tipo, limpia.payload.ok, limpia.payload.no_aplica], ['ok', null, 'auditoria', 1, 1]);
  const sucia = armarAuditoria({ hallazgos: [h('A1', true), h('F28', false, { pagina: 'fisicoquimica', viewport: 'desktop' })] });
  assert.equal(sucia.estado, 'error');
  assert.equal(sucia.error, 'ORIGEN: 1 hallazgo (F28 en fisicoquimica (desktop))');
  assert.throws(() => armarAuditoria({}), /no generó reporte/);
});

test('conAuditoria arrastra el fallo de ORIGEN al chequeo de ODBA', () => {
  const ahora = Date.parse('2026-10-28T15:00:00Z');
  const sitioOk = { estado: 'ok', error: null, payload: { tipo: 'sitio' } };
  assert.equal(conAuditoria(sitioOk, null, ahora), sitioOk);
  const limpia = { estado: 'ok', iniciado_at: '2026-10-28T12:00:00Z', error: null, payload: { run_url: 'https://r' } };
  const r1 = conAuditoria(sitioOk, limpia, ahora);
  assert.deepEqual([r1.estado, r1.payload.tipo, r1.payload.auditoria.estado], ['ok', 'sitio', 'ok']);
  const sucia = { ...limpia, estado: 'error', error: 'ORIGEN: 2 hallazgos' };
  const r2 = conAuditoria({ ...sitioOk, error: 'HTTP 200 en 5000 ms.' }, sucia, ahora);
  assert.deepEqual([r2.estado, r2.error], ['error', 'HTTP 200 en 5000 ms. · ORIGEN: 2 hallazgos']);
  const vieja = { ...limpia, iniciado_at: new Date(ahora - (HORAS_SIN_AUDITORIA + 1) * 3600_000).toISOString() };
  assert.match(conAuditoria(sitioOk, vieja, ahora).error, /no avisó en 100 h/);
});
