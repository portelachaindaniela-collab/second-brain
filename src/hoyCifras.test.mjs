import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mailsImportantes, resumenDiarioLinea } from './hoyCifras.mjs'

const mails = [
  { subject: 'Entrevista el lunes', from_name: 'RRHH', from_addr: 'rrhh@empresa.com' },
  { subject: 'Nuevas ofertas', from_name: 'Computrabajo', from_addr: 'avisos@computrabajo.com' },
  { subject: 'Entrevista: aviso automático', from_name: 'Computrabajo', from_addr: 'x@computrabajo.com' },
  { subject: 'Hola', from_name: 'Ana', from_addr: 'ana@mail.com' },
]
const reglas = [{ tipo: 'excluir', patron: 'computrabajo' }, { tipo: 'incluir', patron: 'Entrevista' }]

test('importantes: coinciden con incluir y no con excluir, igual que el resumen diario', () => {
  assert.deepEqual(mailsImportantes(mails, reglas).map(m => m.subject), ['Entrevista el lunes'])
  assert.deepEqual(mailsImportantes(mails, []), [])
})

test('línea del resumen diario en el pie', () => {
  assert.equal(resumenDiarioLinea({ soportado: true, suscripcion: { hora_local: '08:00:00' }, reglas }), 'activo a las 08:00 · 2 reglas de mail')
  assert.equal(resumenDiarioLinea({ soportado: true, suscripcion: null, reglas: [reglas[0]] }), 'apagado · 1 regla de mail')
  assert.equal(resumenDiarioLinea({ soportado: false, suscripcion: null, reglas: [] }), 'no disponible en este dispositivo · 0 reglas de mail')
})
