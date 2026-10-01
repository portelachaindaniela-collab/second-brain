import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPedido, describirEvento, calcularLevantarse, armarVeredicto, horaAR } from './logic.mjs'

const evento = {
  nombre: 'Feria X', inicio_at: '2026-10-10T12:00:00Z', fin_at: '2026-10-10T21:00:00Z',
  lugar: 'La Rural', direccion: 'Av. Sarmiento 2704', url: null, tiene_entrada: true, precio: '$8000', agenda: null,
}

test('el pedido lleva las reglas tal cual y el evento como datos', () => {
  const { systemInstruction, contents } = construirPedido({ reglas: 'REGLA-UNICA-123', evento })
  assert.match(systemInstruction.parts[0].text, /REGLA-UNICA-123/)
  assert.match(contents[0].parts[0].text, /Feria X/)
  assert.match(contents[0].parts[0].text, /no hay agenda cargada/)
})

// Horarios concretos o formatos de evento en el texto fijo serían criterio escondido en el código.
const CRITERIO = /\b\d{1,2}:\d{2}\b|a las \d|levantarte a las|auditorio|networking|stands/i

test('el formato no trae criterio propio: horarios, distancias y formatos salen de las reglas', () => {
  const { systemInstruction } = construirPedido({ reglas: '', evento })
  assert.doesNotMatch(systemInstruction.parts[0].text, CRITERIO)
  assert.match('si te obliga a levantarte a las 7, no', CRITERIO, 'el chequeo tiene que poder fallar')
})

test('describe el evento en hora argentina', () => {
  const texto = describirEvento(evento)
  assert.match(texto, /09:00/)
  assert.match(texto, /sí, \$8000/)
  assert.equal(horaAR(evento.inicio_at), '09:00')
})

test('hora de levantarse = llegada − viaje − preparación', () => {
  assert.deepEqual(calcularLevantarse('09:00', 60, 45), { llegada: '09:00', viaje_min: 60, preparacion_min: 45, levantarse: '07:15', dia_anterior: false })
  assert.equal(calcularLevantarse('00:30', 60, 0).dia_anterior, true)
  assert.equal(calcularLevantarse('xx', 60, 45), null)
})

test('arma el veredicto recalculando la cuenta en código', () => {
  const respuesta = '```json\n' + JSON.stringify({
    veredicto: 'recortado', motivo: 'A las 9 te obliga a levantarte a las 6:30.', razonamiento: 'Dos frases.',
    viaje_min: 80, viaje_detalle: 'Mitre + 152', preparacion_min: 50, preparacion_supuesta: true,
    plan: { franja: 'la tarde', llegar: '14:00', salir_de_casa: '12:40', volver: '18:00' },
    agenda: { vale: [{ item: 'Charla técnica', por_que: 'densa' }], saltear: ['Networking'] },
  }) + '\n```'
  const v = armarVeredicto(respuesta, evento)
  assert.equal(v.veredicto, 'recortado')
  assert.equal(v.calculo_evento_entero.levantarse, '06:50')
  assert.equal(v.calculo_plan.levantarse, '11:50')
  assert.deepEqual(v.agenda.saltear, [{ item: 'Networking', por_que: null }])
  assert.equal(v.preparacion_supuesta, true)
})

test('si el plan es el evento entero no repite el cálculo', () => {
  const v = armarVeredicto(JSON.stringify({ veredicto: 'viable', motivo: 'ok', viaje_min: 30, preparacion_min: 30, plan: { llegar: '09:00' }, agenda: null }), evento)
  assert.equal(v.calculo_plan, null)
  assert.equal(v.agenda, null)
})

test('rechaza respuestas sin veredicto', () => {
  assert.throws(() => armarVeredicto('{"motivo":"x"}', evento), /incompleta/)
  assert.throws(() => armarVeredicto('nada', evento), /JSON/)
})
