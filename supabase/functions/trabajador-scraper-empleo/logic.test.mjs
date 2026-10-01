import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerResultado, horasDesde } from './logic.mjs';

test('extraerResultado copia los campos del scraper y cuenta publicados', () => {
  const r = extraerResultado({ inicio: '2026-09-29T10:00:00', fin: '2026-09-29T10:05:00', publicados: 4, nuevos_totales: 9, portales: { bumeran: { estado: 'ok' } }, otro: 'x' });
  assert.equal(r.cantidad, 4);
  assert.deepEqual(r.payload, { inicio: '2026-09-29T10:00:00', fin: '2026-09-29T10:05:00', publicados: 4, nuevos_totales: 9, portales: { bumeran: { estado: 'ok' } } });
});

test('extraerResultado usa nuevos_totales si no hay publicados, y 0 si no hay ninguno', () => {
  assert.equal(extraerResultado({ fin: '2026-09-29T10:05:00', nuevos_totales: 3 }).cantidad, 3);
  assert.equal(extraerResultado({ fin: '2026-09-29T10:05:00' }).cantidad, 0);
});

test('extraerResultado falla si el reporte no sirve', () => {
  assert.throws(() => extraerResultado(null), /no es un objeto/);
  assert.throws(() => extraerResultado([]), /no es un objeto/);
  assert.throws(() => extraerResultado({ publicados: 2 }), /fecha de corrida/);
});

test('horasDesde interpreta fechas sin zona como UTC', () => {
  const ahora = Date.parse('2026-09-29T12:00:00Z');
  assert.equal(horasDesde('2026-09-29T10:00:00', ahora), 2);
  assert.equal(horasDesde('2026-09-29T09:00:00-03:00', ahora), 0);
  assert.equal(horasDesde(null, ahora), Infinity);
  assert.equal(horasDesde('basura', ahora), Infinity);
});
