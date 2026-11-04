import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarEstado, leerFechaFila, claveMes, etiquetaMes, canalDe, prepararFilas, estadisticas, linkFila, grupoPuesto, porGrupoPuesto, enviadasPorPeriodo, OTROS_PUESTOS, SIN_FECHA } from './busquedaLaboral.mjs'

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

test('grupoPuesto agrupa por palabra clave y lo demás va a Otros', () => {
  assert.equal(grupoPuesto('Community Manager Junior'), 'Community Manager / Redes')
  assert.equal(grupoPuesto('Asistente de Redes Sociales'), 'Community Manager / Redes')
  assert.equal(grupoPuesto('Analista de Contenidos y Comunicacion Digital'), 'Contenidos y redacción')
  assert.equal(grupoPuesto('Coordinadora de Comunicaciones'), 'Comunicación')
  assert.equal(grupoPuesto('Especialista de Paid Media Sr'), 'Marketing y medios')
  assert.equal(grupoPuesto('Analista de datos'), 'Datos y calidad')
  assert.equal(grupoPuesto('Jr Recruiter'), 'RRHH')
  assert.equal(grupoPuesto('Coordinador de eventos'), 'Eventos y producción')
  assert.equal(grupoPuesto('Recepcionista Part Time'), 'Administración y atención')
  assert.equal(grupoPuesto('Tornero'), OTROS_PUESTOS)
  assert.equal(grupoPuesto(''), OTROS_PUESTOS)
})

test('porGrupoPuesto cuenta solo enviadas, con Otros al final', () => {
  const g = porGrupoPuesto(prepararFilas([
    { fila: 2, puesto: 'Tornero', estado: 'RECHAZADA 27/06' },
    { fila: 3, puesto: 'Tornero', estado: 'RECHAZADA 28/06' },
    { fila: 4, puesto: 'Community Manager', estado: 'POSTULADA 15/10' },
    { fila: 5, puesto: 'Community Manager', estado: 'RECHAZADA 16/10' },
    { fila: 6, puesto: 'Community Manager', estado: 'Descartado' },
  ]))
  assert.deepEqual(g, [
    { grupo: 'Community Manager / Redes', enviadas: 2, rechazadas: 1, sinDecision: 1 },
    { grupo: OTROS_PUESTOS, enviadas: 2, rechazadas: 2, sinDecision: 0 },
  ])
})

test('enviadasPorPeriodo por día, semana y mes', () => {
  const hoy = new Date(2026, 10, 4) // miércoles 4/11/2026
  const filas = prepararFilas([
    { fila: 2, fecha: '04/11/2026', estado: 'POSTULADA 04/11' },
    { fila: 3, fecha: '02/11/2026', estado: 'RECHAZADA 03/11' },
    { fila: 4, fecha: '01/11/2026', estado: 'POSTULADA' },
    { fila: 5, fecha: 'marzo 2026', estado: 'POSTULADA' },
    { fila: 6, fecha: '', estado: 'RECHAZADA 01/06' },
    { fila: 7, fecha: '01/06/2026', estado: 'Sin enviar' },
    { fila: 8, fecha: '01/06/2026', estado: 'RECHAZADA 01/06' },
  ])
  const dia = enviadasPorPeriodo(filas, 'dia', hoy)
  assert.equal(dia.columnas.length, 30)
  assert.deepEqual(dia.columnas.at(-1), { clave: '2026-11-04', etiqueta: ['04', 'nov'], rechazadas: 0, sinDecision: 1 })
  assert.equal(dia.columnas.at(-3).rechazadas, 1)
  assert.deepEqual([dia.sinFecha, dia.fueraDeRango], [2, 1])

  const semana = enviadasPorPeriodo(filas, 'semana', hoy)
  assert.equal(semana.columnas.length, 16)
  assert.deepEqual(semana.columnas.at(-1), { clave: '2026-11-02', etiqueta: ['02', 'nov'], rechazadas: 1, sinDecision: 1 })
  assert.equal(semana.columnas.at(-2).sinDecision, 1) // domingo 1/11 cae en la semana del lunes 26/10

  const mes = enviadasPorPeriodo(filas, 'mes', hoy)
  assert.deepEqual(mes.columnas.map(c => c.clave), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
  assert.deepEqual(mes.columnas[0], { clave: '2026-03', etiqueta: ['mar', '2026'], rechazadas: 0, sinDecision: 1 })
  assert.equal(mes.columnas[3].rechazadas, 1)
  assert.deepEqual(mes.columnas.at(-1), { clave: '2026-11', etiqueta: ['nov', '2026'], rechazadas: 1, sinDecision: 2 })
  assert.deepEqual([mes.sinFecha, mes.fueraDeRango], [1, 0])
})
