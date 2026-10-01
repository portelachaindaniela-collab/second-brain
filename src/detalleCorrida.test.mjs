import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detalleCorrida, itemConFecha } from './detalleCorrida.mjs'

const buscador = {
  cargados: ['2026-10-01 · AI IN LATAM', '2026-10-05 · Programación y Robótica IA'], en_ventana: 46, ya_estaban: 19, encontrados: 52,
  descartados: { 'cancelado o postergado': 1, 'no nombra ninguna palabra clave': 26 },
  por_termino: { 'eventbrite: tecnología': 20, 'eventbrite: ciencia de datos': 20 }, sin_abrir_por_tope: 0,
}

test('buscador: una frase y el recorrido en orden lógico', () => {
  const d = detalleCorrida('buscador_eventos', { payload: buscador })
  assert.equal(d.resumen, 'Encontró 52 eventos; 46 caen en los próximos días, 19 ya estaban y 27 se descartaron. Cargó 2 eventos nuevos.')
  assert.deepEqual(d.secciones[0].filas.map(f => f.etiqueta), [
    'encontrados', 'en la ventana de días', 'ya estaban en Eventos', 'descartados', 'cancelado o postergado', 'no nombra ninguna palabra clave', 'cargados',
  ])
  assert.deepEqual(d.secciones[1].items[0], { dia: 'jue 01/10', texto: 'AI IN LATAM' })
  assert.deepEqual(d.secciones[2].filas[0], { etiqueta: 'tecnología', detalle: 'eventbrite', valor: '20' })
})

test('buscador sin nada nuevo lo dice así', () => {
  const d = detalleCorrida('buscador_eventos', { payload: { ...buscador, cargados: [] } })
  assert.match(d.resumen, /No cargó ninguno nuevo\.$/)
  assert.equal(d.secciones.find(s => s.titulo === 'eventos cargados'), undefined)
})

test('google, maría y scraper tienen su frase', () => {
  assert.equal(detalleCorrida('google_sync', { payload: { conectado: true, cuenta: 'yo@gmail.com', eventos: 10, mails: 20, eliminados: 0 } }).resumen,
    'Trajo 10 eventos de los próximos 7 días y 20 mails sin leer.')
  assert.equal(detalleCorrida('google_sync', { payload: { conectado: false, reconectar: true } }).resumen, 'Google pide volver a conectar la cuenta.')
  const m = detalleCorrida('maria', { payload: { agentes: [
    { agente: 'monitor_sitios', estado: 'ok', resumen: '6 ok' }, { agente: 'tareas_estancadas', estado: 'aviso', resumen: '2 tareas' },
  ] } })
  assert.equal(m.resumen, 'Revisó 2 cosas; tareas estancadas pide mirar.')
  assert.equal(m.secciones[0].filas[1].etiqueta, 'tareas estancadas')
  const s = detalleCorrida('scraper_empleo', { payload: { inicio: '2026-09-30T16:44:23.711078', fin: '2026-09-30T16:46:16.5', publicados: 27, nuevos_totales: 34, portales: { bumeran: { estado: 'ok', errores: [], encontrados: 5 } } } })
  assert.equal(s.resumen, 'El scraper publicó 27 ofertas nuevas (34 nuevas antes de filtrar), en su corrida de 13:44 a 13:46.')
})

test('genérico: sin guiones bajos y listas vacías legibles', () => {
  const d = detalleCorrida('otro', { payload: { total_filas: 3, cosas_raras: [], extra: { hora_pico: 'x' } } })
  assert.deepEqual(d.secciones.map(s => s.titulo), ['datos', 'cosas raras', 'extra'])
  assert.equal(d.secciones[0].filas[0].etiqueta, 'total filas')
  assert.equal(d.secciones[1].items[0].texto, 'ninguno')
})

test('sin payload no hay detalle; texto sin fecha queda como está', () => {
  assert.deepEqual(detalleCorrida('maria', { payload: null }), { resumen: null, secciones: [] })
  assert.deepEqual(itemConFecha('suelto'), { dia: null, texto: 'suelto' })
})
