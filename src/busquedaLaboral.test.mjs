import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarEstado, leerFechaFila, claveMes, etiquetaMes, canalDe, prepararFilas, estadisticas, linkFila, SIN_FECHA } from './busquedaLaboral.mjs'

test('clasificarEstado sigue las reglas de la columna Estado', () => {
  assert.equal(clasificarEstado('RECHAZADA 16/09 (Teamtailor)'), 'rechazada')
  assert.equal(clasificarEstado('RECHAZADA 03/11 - vacante cubierta, guardan el CV'), 'rechazada')
  assert.equal(clasificarEstado('POSTULADA - sin respuesta'), 'postulada')
  assert.equal(clasificarEstado('POSTULADA 19/10 (portal) - acuse automatico recibido'), 'postulada')
  assert.equal(clasificarEstado('Respondido 27/10'), 'postulada')
  assert.equal(clasificarEstado('Descartado'), 'descartada')
  assert.equal(clasificarEstado('Descartado por Daniela 30/10 - canceló la entrevista'), 'descartada')
  for (const e of ['Sin enviar', 'Carta lista - sin enviar', 'Propuesta lista - sin enviar', 'Sin evaluar', 'Sin decidir', 'Pendiente', '', '   ', undefined]) {
    assert.equal(clasificarEstado(e), 'no_enviada', `"${e}"`)
  }
  assert.equal(clasificarEstado('Cerrado - no aparece en Indeed (19/10)'), 'cerrada')
  assert.equal(clasificarEstado('convocatoria cerrada'), 'cerrada')
})

test('clasificarEstado: lo que no encaja queda como otro', () => {
  assert.equal(clasificarEstado('Entrevista el jueves'), 'otro')
  assert.equal(clasificarEstado('Me llamaron'), 'otro')
})

test('leerFechaFila: dd/mm/aaaa, mes y año, y lo ilegible como null', () => {
  assert.deepEqual(leerFechaFila('18/08/2026'), { anio: 2026, mes: 8, dia: 18 })
  assert.deepEqual(leerFechaFila('1/6/26'), { anio: 2026, mes: 6, dia: 1 })
  assert.deepEqual(leerFechaFila('marzo 2026'), { anio: 2026, mes: 3, dia: null })
  assert.deepEqual(leerFechaFila('Setiembre de 2026'), { anio: 2026, mes: 9, dia: null })
  assert.equal(leerFechaFila('31/02/2026'), null)
  assert.equal(leerFechaFila('15/10'), null)
  assert.equal(leerFechaFila('pronto 2026'), null)
  assert.equal(leerFechaFila(''), null)
  assert.equal(claveMes(leerFechaFila('marzo 2026')), '2026-03')
  assert.equal(claveMes(null), SIN_FECHA)
  assert.equal(etiquetaMes('2026-10'), 'oct 2026')
})

test('canalDe agrupa variantes de la misma fuente', () => {
  assert.equal(canalDe('Instagram @desocupada.arg'), 'Instagram')
  assert.equal(canalDe('Instagram DM @asuntosdelsur'), 'Instagram')
  assert.equal(canalDe('LinkedIn (Madelaine Dressl)'), 'LinkedIn')
  assert.equal(canalDe('Mail Claro Empleos'), 'Mail')
  assert.equal(canalDe('ZonaJobs (via Radar Laboral)'), 'ZonaJobs')
  assert.equal(canalDe('HiringRoom'), 'HiringRoom')
  assert.equal(canalDe('Portal municipal'), 'Portal municipal')
  assert.equal(canalDe(''), 'Sin fuente')
})

test('estadisticas: cifras, meses, embudo y CV', () => {
  const filas = prepararFilas([
    { fila: 2, fecha: 'marzo 2026', estado: 'POSTULADA - sin respuesta', fuente: 'Portal municipal', semaforo: 'NEGRO', cv: '' },
    { fila: 3, fecha: '12/05/2026', estado: 'RECHAZADA 12/05', fuente: 'LinkedIn', semaforo: '', cv: '' },
    { fila: 4, fecha: '20/05/2026', estado: 'Respondido 27/05', fuente: 'Instagram @x', semaforo: 'VERDE', cv: 'CV anterior (Mkt y Datos)' },
    { fila: 5, fecha: 'algún día', estado: 'RECHAZADA 01/06', fuente: 'LinkedIn', semaforo: 'VERDE', cv: 'Marketing' },
    { fila: 6, fecha: '01/06/2026', estado: 'Sin evaluar', fuente: 'Indeed', semaforo: 'AMARILLO' },
    { fila: 7, fecha: '01/06/2026', estado: 'Descartado', fuente: 'Indeed', semaforo: 'ROJO' },
    { fila: 8, fecha: '01/06/2026', estado: 'Entrevista', fuente: 'Mail', semaforo: '' },
  ])
  const s = estadisticas(filas)
  assert.deepEqual(s.cifras, { total: 7, enviadas: 4, rechazos: 2, sinDecision: 2, tasaRechazo: 0.5 })
  assert.deepEqual(s.porMes, [
    { mes: '2026-03', rechazadas: 0, sinDecision: 1 },
    { mes: '2026-05', rechazadas: 1, sinDecision: 1 },
  ])
  assert.deepEqual(s.enviadasSinFecha, { mes: SIN_FECHA, rechazadas: 1, sinDecision: 0 })
  assert.deepEqual(s.sinFecha.map(p => p.fila), [5])
  assert.deepEqual(s.porFuente, [{ canal: 'LinkedIn', rechazos: 2, enviadas: 2 }])
  assert.deepEqual(s.embudo.map(e => e.n), [7, 6, 4, 3, 2])
  assert.deepEqual(s.porSemaforo.map(x => x.n), [2, 1, 1, 1, 2])
  assert.deepEqual(s.porCv, [
    { cv: 'Sin CV indicado', enviadas: 2, rechazadas: 1 },
    { cv: 'Marketing', enviadas: 1, rechazadas: 1 },
    { cv: 'Mkt y Datos', enviadas: 1, rechazadas: 0 },
  ])
  assert.deepEqual(s.otros.map(p => p.fila), [8])
})

test('estadisticas sin enviadas no divide por cero', () => {
  assert.equal(estadisticas(prepararFilas([{ fila: 2, estado: 'Sin enviar' }])).cifras.tasaRechazo, null)
})

test('linkFila apunta a la fila de la planilla', () => {
  assert.equal(linkFila('https://docs.google.com/spreadsheets/d/abc/edit', 12), 'https://docs.google.com/spreadsheets/d/abc/edit#range=A12')
  assert.equal(linkFila('https://docs.google.com/spreadsheets/d/abc/edit#gid=0', 3), 'https://docs.google.com/spreadsheets/d/abc/edit#range=A3')
  assert.equal(linkFila(undefined, 3), null)
})
