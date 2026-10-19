import test from 'node:test'
import assert from 'node:assert/strict'
import { idDeHoja, columnas, letraColumna, filasPostulaciones, mismaPostulacion, tienePermiso, SCOPE_PLANILLAS } from './logic.mjs'

const ENC = ['Fecha', 'Puesto', 'Empresa', 'Zona / Modalidad', 'Fuente', 'Link o contacto', 'Semaforo', 'Por que', 'Estado', 'CV a usar']

test('idDeHoja saca el id del link o acepta el id solo', () => {
  assert.equal(idDeHoja('https://docs.google.com/spreadsheets/d/1_GpaluK1qMigrPHoV2IGnuvIzveCpZyAMHpacy-wi6I/edit?gid=1#gid=1'), '1_GpaluK1qMigrPHoV2IGnuvIzveCpZyAMHpacy-wi6I')
  assert.equal(idDeHoja('1_GpaluK1qMigrPHoV2IGnuvIzveCpZyAMHpacy-wi6I'), '1_GpaluK1qMigrPHoV2IGnuvIzveCpZyAMHpacy-wi6I')
  assert.equal(idDeHoja('hola'), null)
})

test('columnas encuentra cada dato por nombre, con o sin tildes y en cualquier orden', () => {
  assert.deepEqual(columnas(ENC), { fecha: 0, puesto: 1, empresa: 2, zona: 3, fuente: 4, link: 5, semaforo: 6, porque: 7, estado: 8, cv: 9 })
  assert.deepEqual(columnas(['Estado', 'Semáforo', 'Por qué', 'Puesto']), { estado: 0, semaforo: 1, porque: 2, puesto: 3 })
})

test('letraColumna pasa de índice a letra', () => {
  assert.equal(letraColumna(0), 'A')
  assert.equal(letraColumna(8), 'I')
  assert.equal(letraColumna(26), 'AA')
})

test('filasPostulaciones numera las filas de la hoja, saltea vacías y limpia errores de fórmula', () => {
  const filas = filasPostulaciones([ENC,
    ['18/08/2026', 'Analista', 'CIAL', 'CABA', 'Indeed', 'https://x', 'VERDE', '#ERROR!', 'convocatoria cerrada'],
    [],
    ['20/08/2026', '', '', '', '', 'https://startups/empleo'],
  ])
  assert.equal(filas.length, 2)
  assert.equal(filas[0].fila, 2)
  assert.equal(filas[0].porque, '')
  assert.equal(filas[0].cv, '')
  assert.equal(filas[1].fila, 4)
  assert.equal(filas[1].link, 'https://startups/empleo')
})

test('mismaPostulacion compara puesto y empresa sin importar tildes ni mayúsculas', () => {
  assert.ok(mismaPostulacion({ puesto: 'Analista de Comunicación', empresa: 'Claro' }, { puesto: 'analista de comunicacion', empresa: 'CLARO' }))
  assert.ok(!mismaPostulacion({ puesto: 'Analista', empresa: 'Claro' }, { puesto: 'Analista', empresa: 'Movistar' }))
})

test('tienePermiso pide el scope de planillas', () => {
  assert.ok(tienePermiso(['a', SCOPE_PLANILLAS]))
  assert.ok(!tienePermiso(['https://www.googleapis.com/auth/drive.file']))
})

import { urlPermiso } from './logic.mjs'
test('urlPermiso pide planillas y Search Console juntos', () => {
  const scope = new URL(urlPermiso({ clientId: 'c', redirectUri: 'https://r', state: 's' })).searchParams.get('scope')
  assert.ok(scope.includes(SCOPE_PLANILLAS))
  assert.ok(scope.includes('webmasters.readonly'))
})
