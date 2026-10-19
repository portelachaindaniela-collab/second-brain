import test from 'node:test'
import assert from 'node:assert/strict'
import { grupoDe, semaforoDe, leerFecha, diasEsperando, faltaEnviar, agrupar, coincide, nombreCv, ACCIONES } from './postulaciones.mjs'

const hoy = new Date(2026, 9, 19)

test('grupoDe entiende el texto libre de la planilla', () => {
  assert.equal(grupoDe('POSTULADA - sin respuesta'), 'esperando')
  assert.equal(grupoDe('POSTULADA 15/10 (formulario) - sin respuesta'), 'esperando')
  assert.equal(grupoDe('Respondido 19/08 - esperando'), 'respondieron')
  assert.equal(grupoDe('POSTULADA 19/10 (portal) - acuse automatico recibido'), 'respondieron')
  assert.equal(grupoDe('Descartado'), 'cerradas')
  assert.equal(grupoDe('convocatoria cerrada'), 'cerradas')
  assert.equal(grupoDe('Cerrado - no aparece en Indeed (19/10)'), 'cerradas')
  assert.equal(grupoDe('Carta lista - sin enviar'), 'hacer')
  assert.equal(grupoDe('Sin evaluar'), 'hacer')
  assert.equal(grupoDe(''), 'hacer')
})

test('semaforoDe y nombreCv', () => {
  assert.equal(semaforoDe('VERDE'), 'verde')
  assert.equal(semaforoDe(''), '')
  assert.equal(nombreCv('CV anterior (Mkt y Datos)'), 'Mkt y Datos')
  assert.equal(nombreCv('Marketing'), 'Marketing')
  assert.equal(nombreCv('Operativo (si va)'), 'Operativo')
})

test('leerFecha con y sin año; sin año nunca en el futuro', () => {
  assert.deepEqual(leerFecha('18/08/2026', hoy), new Date(2026, 7, 18))
  assert.deepEqual(leerFecha('POSTULADA 15/10 - sin respuesta', hoy), new Date(2026, 9, 15))
  assert.deepEqual(leerFecha('Respondido 20/12', hoy), new Date(2025, 11, 20))
  assert.equal(leerFecha('marzo 2026', hoy), null)
})

test('diasEsperando usa la fecha del estado y si no la de la fila', () => {
  assert.equal(diasEsperando({ estado: 'POSTULADA 15/10 - sin respuesta', fecha: '14/10/2026' }, hoy), 4)
  assert.equal(diasEsperando({ estado: 'POSTULADA - sin respuesta', fecha: '17/08/2026' }, hoy), 63)
  assert.equal(diasEsperando({ estado: 'POSTULADA', fecha: 'marzo 2026' }, hoy), null)
})

test('faltaEnviar: verdes sin mandar, primero lo que ya está listo', () => {
  const ps = [
    { fila: 2, estado: 'Sin enviar', semaforo: 'VERDE', porque: '' },
    { fila: 3, estado: 'Carta lista - sin enviar', semaforo: 'VERDE', porque: '' },
    { fila: 4, estado: 'Sin evaluar', semaforo: 'AMARILLO', porque: '' },
    { fila: 5, estado: 'POSTULADA', semaforo: 'VERDE', porque: '' },
  ]
  assert.deepEqual(faltaEnviar(ps).map(p => p.fila), [3, 2])
})

test('agrupar ordena esperando por días y para hacer por semáforo', () => {
  const g = agrupar([
    { fila: 2, estado: 'POSTULADA 15/10', fecha: '', semaforo: 'VERDE' },
    { fila: 3, estado: 'POSTULADA - sin respuesta', fecha: '17/08/2026', semaforo: 'VERDE' },
    { fila: 4, estado: 'Sin evaluar', semaforo: 'AMARILLO' },
    { fila: 5, estado: 'Sin enviar', semaforo: 'VERDE' },
  ], hoy)
  assert.deepEqual(g.esperando.map(p => p.fila), [3, 2])
  assert.deepEqual(g.hacer.map(p => p.fila), [5, 4])
})

test('coincide busca en puesto, empresa y más, sin tildes', () => {
  assert.ok(coincide({ puesto: 'Analista de Comunicación', empresa: 'Claro' }, 'comunicacion'))
  assert.ok(!coincide({ puesto: 'Analista', empresa: 'Claro' }, 'movistar'))
})

test('ACCIONES escriben en el vocabulario de la planilla', () => {
  assert.equal(ACCIONES[0].texto(hoy), 'POSTULADA 19/10 - sin respuesta')
  assert.equal(grupoDe(ACCIONES[0].texto(hoy)), 'esperando')
  assert.equal(grupoDe(ACCIONES[1].texto(hoy)), 'respondieron')
  assert.equal(grupoDe(ACCIONES[2].texto(hoy)), 'cerradas')
})
