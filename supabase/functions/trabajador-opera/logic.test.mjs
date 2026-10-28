import test from 'node:test';
import assert from 'node:assert/strict';
import { armarCorrida, claimsValidos, REPO, WORKFLOW } from './logic.mjs';

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
