import test from 'node:test';
import assert from 'node:assert/strict';
import { quitarEliminados } from './eliminados.mjs';

function entorno(eventos, respuesta, errorBorrado = null) {
  const borrados = [];
  const consultas = [];
  const admin = { from(tabla) {
    assert.equal(tabla, 'calendar_events');
    let borrando = false;
    const filtros = {};
    const q = {
      select() { return q; },
      eq(k, v) { filtros[k] = v; return q; },
      is(k, v) { filtros[k] = v; return q; },
      not() { return q; }, order() { return q; },
      range(a, b) { assert.equal(filtros.owner_id, 'usuaria'); return Promise.resolve({ data: eventos.slice(a, b + 1), error: null }); },
      delete() { borrando = true; return q; },
      then(resolve, reject) {
        assert.ok(borrando);
        borrados.push(filtros);
        return Promise.resolve({ data: [{ id: filtros.id }], error: errorBorrado }).then(resolve, reject);
      }
    };
    return q;
  } };
  const consultar = async url => { consultas.push(url); if (respuesta instanceof Error) throw respuesta; return { ok: respuesta.status === 200, status: respuesta.status, json: async () => respuesta.body }; };
  return { args: { admin, ownerId: 'usuaria', token: 'prueba', consultar }, borrados, consultas };
}
const evento = { id: 'local', calendar_id: 'primary', google_event_id: 'recurrente_20250901', synced_at: '2026-09-12T00:00:00Z' };

test('elimina cancelaciones antiguas y protege propietaria, calendario y versión', async () => {
  const e = entorno([evento], { status: 200, body: { status: 'cancelled' } });
  assert.equal(await quitarEliminados(e.args), 1);
  assert.deepEqual(e.borrados, [{ owner_id: 'usuaria', ...evento }]);
});
test('conserva eventos vigentes y omite eventos sin vínculo completo con Google', async () => {
  const e = entorno([evento, { id: 'propio' }], { status: 200, body: { status: 'confirmed' } });
  assert.equal(await quitarEliminados(e.args), 0);
  assert.equal(e.consultas.length, 1);
});
for (const status of [403, 404, 429, 500, 410]) {
  test(`no borra ante error ambiguo ${status}`, async () => {
    const e = entorno([evento], { status, body: { error: { message: 'error', errors: [{ reason: 'fullSyncRequired' }] } } });
    await assert.rejects(quitarEliminados(e.args));
    assert.equal(e.borrados.length, 0);
  });
}
test('reconoce 410 solamente cuando Google confirma deleted', async () => {
  const e = entorno([evento], { status: 410, body: { error: { errors: [{ reason: 'deleted' }] } } });
  assert.equal(await quitarEliminados(e.args), 1);
});
test('no borra ante fallo de red y propaga fallos de base de datos', async () => {
  const e = entorno([evento], new Error('red'));
  await assert.rejects(quitarEliminados(e.args), /red/);
  assert.equal(e.borrados.length, 0);
  const db = entorno([evento], { status: 200, body: { status: 'cancelled' } }, { message: 'base' });
  await assert.rejects(quitarEliminados(db.args), /base/);
});
test('revisa todas las páginas y codifica identificadores de calendarios secundarios', async () => {
  const eventos = Array.from({ length: 501 }, (_, i) => ({ ...evento, id: String(i), calendar_id: 'salud#@google.com' }));
  const e = entorno(eventos, { status: 200, body: { status: 'cancelled' } });
  assert.equal(await quitarEliminados(e.args), 501);
  assert.match(e.consultas[0], /salud%23%40google.com/);
});
