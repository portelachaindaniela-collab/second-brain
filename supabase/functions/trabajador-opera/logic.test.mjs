import test from 'node:test';
import assert from 'node:assert/strict';
import { armarCorrida, claimsValidos, corridaDeSitio, REPO, WORKFLOW } from './logic.mjs';

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
