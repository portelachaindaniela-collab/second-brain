import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  proveedores, sistema, HERRAMIENTAS, ACCIONES, validarAccion, describirAccion, normalizarEvento, venceISO, slugProyecto,
  urlPermitida, htmlATexto, historialParaModelo, contiene, ultimoPorAgente, fragmentosDeCharla,
} from './logic.mjs'

const ID = '11111111-2222-3333-4444-555555555555'

test('Groq primero y Gemini de respaldo, con sus modelos de siempre', () => {
  assert.deepEqual(proveedores({ GROQ_API_KEY: 'g', GEMINI_API_KEY_BS67: 'x' }).map(p => `${p.nombre} ${p.modelo}`), ['groq openai/gpt-oss-120b', 'gemini gemini-3.6-flash'])
  assert.deepEqual(proveedores({ GEMINI_API_KEY_BS67: 'x', BS67_MODEL: 'gemini-otro' }).map(p => p.modelo), ['gemini-otro'])
  assert.deepEqual(proveedores({}), [])
})

test('el sistema dice quién es, la fecha y dónde está Daniela', () => {
  const s = sistema({ hoy: 'lunes 12 de octubre de 2026', pantalla: 'flujo', proyecto: 'Olé' })
  assert.match(s, /Sos BS67/)
  assert.match(s, /lunes 12 de octubre/)
  assert.match(s, /«flujo» con el proyecto «Olé»/)
})

test('todas las acciones están entre las herramientas y los nombres no se repiten', () => {
  const nombres = HERRAMIENTAS.map(h => h.function.name)
  for (const a of ACCIONES) assert.ok(nombres.includes(a), a)
  assert.equal(new Set(nombres).size, nombres.length)
})

test('valida tareas', () => {
  assert.deepEqual(validarAccion('crear_tarea', { titulo: ' Llamar a Sofi ', vence: '2026-10-14' }).args, { titulo: 'Llamar a Sofi', proyecto_id: null, vence: '2026-10-14', estado: 'ideas' })
  assert.equal(validarAccion('crear_tarea', { titulo: 'x', vence: '14/10' }).ok, false)
  assert.equal(validarAccion('crear_tarea', { titulo: 'x', proyecto_id: 'Olé' }).ok, false)
  assert.deepEqual(validarAccion('editar_tarea', { id: ID, estado: 'listo' }).args, { id: ID, estado: 'listo' })
  assert.deepEqual(validarAccion('editar_tarea', { id: ID, vence: '' }).args, { id: ID, vence: null })
  assert.equal(validarAccion('editar_tarea', { id: ID }).ok, false)
  assert.equal(validarAccion('editar_tarea', { id: 'la de ayer', estado: 'listo' }).ok, false)
  assert.equal(validarAccion('borrar_tarea', { id: ID }).ok, true)
  assert.equal(validarAccion('borrar_todo', {}).ok, false)
})

test('valida proyectos, docs y cursos', () => {
  assert.deepEqual(validarAccion('crear_proyecto', { nombre: 'Olé Summit' }).args, { nombre: 'Olé Summit', resumen: null })
  assert.equal(validarAccion('editar_proyecto', { id: ID, estado: 'pausado' }).ok, true)
  assert.equal(validarAccion('editar_proyecto', { id: ID, estado: 'otro' }).ok, false)
  assert.equal(validarAccion('crear_doc', { titulo: 'Notas', cuerpo: '' }).ok, false)
  assert.deepEqual(validarAccion('editar_curso', { id: ID, progreso: 'Módulo 3' }).args, { id: ID, progreso: 'Módulo 3' })
  assert.equal(validarAccion('crear_curso', { titulo: 'SQL', url: 'http://localhost/x' }).args.url, null)
})

test('normaliza eventos con hora, sin fin y de todo el día', () => {
  assert.deepEqual(normalizarEvento({ titulo: 'Charla', inicio: '2026-10-22T10:00:00-03:00', fin: '2026-10-22T10:45:00-03:00' }),
    { titulo: 'Charla', lugar: null, descripcion: null, todo_el_dia: false, inicio: '2026-10-22T13:00:00.000Z', fin: '2026-10-22T13:45:00.000Z' })
  assert.equal(normalizarEvento({ titulo: 'Café', inicio: '2026-10-22T17:00:00-03:00' }).fin, '2026-10-22T21:00:00.000Z')
  assert.deepEqual(normalizarEvento({ titulo: 'Feriado', inicio: '2026-10-12' }), { titulo: 'Feriado', lugar: null, descripcion: null, todo_el_dia: true, inicio: '2026-10-12', fin: '2026-10-13' })
  assert.equal(normalizarEvento({ titulo: 'Congreso', inicio: '2026-11-03', fin: '2026-11-05', todo_el_dia: true }).fin, '2026-11-06')
  assert.ok(normalizarEvento({ titulo: 'x', inicio: 'el martes' }).error)
  assert.ok(normalizarEvento({ inicio: '2026-10-12' }).error)
  assert.equal(validarAccion('crear_eventos', { eventos: [] }).ok, false)
  assert.equal(validarAccion('crear_eventos', { eventos: [{ titulo: 'a', inicio: '2026-10-12' }, { titulo: 'b', inicio: 'mal' }] }).ok, false)
})

test('describe las acciones con nombres, no con ids', () => {
  assert.equal(describirAccion('editar_tarea', { id: ID, estado: 'listo' }, { tarea: 'Llamar a Sofi' }), 'Marcar como lista la tarea «Llamar a Sofi».')
  assert.equal(describirAccion('crear_tarea', { titulo: 'Pagar luz', estado: 'ideas', vence: '2026-10-14', proyecto_id: null }, {}), 'Crear la tarea «Pagar luz», en Ideas, que vence el miércoles, 14 de octubre.')
  const d = describirAccion('crear_eventos', validarAccion('crear_eventos', { eventos: [{ titulo: 'A', inicio: '2026-10-22T10:00:00-03:00' }, { titulo: 'B', inicio: '2026-10-23' }] }).args)
  assert.match(d, /estos 2 eventos/)
  assert.match(d, /• A — .*10:00/)
  assert.doesNotMatch(describirAccion('borrar_tarea', { id: ID }, { tarea: 'X' }), new RegExp(ID))
})

test('vencimiento al final del día en Argentina y slug de proyecto', () => {
  assert.equal(venceISO('2026-10-14'), '2026-10-15T02:59:00.000Z')
  assert.equal(slugProyecto('Olé Summit 2026!', 'ab12cd34'), 'ole-summit-2026-ab12cd34')
})

test('solo lee links públicos y pasa HTML a texto', () => {
  assert.equal(urlPermitida('https://www.lanacion.com.ar/nota'), 'https://www.lanacion.com.ar/nota')
  for (const u of ['http://localhost:3000', 'http://10.0.0.1/x', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'no es url']) assert.equal(urlPermitida(u), null, u)
  assert.equal(htmlATexto('<head><title>x</title></head><script>alert(1)</script><h1>Título</h1><p>Uno &amp; dos</p>'), 'Título\n Uno & dos')
})

test('historial de la app a mensajes del modelo', () => {
  assert.deepEqual(historialParaModelo([{ rol: 'user', texto: 'hola' }, { rol: 'bot', texto: 'buenas' }, { rol: 'error', texto: 'x' }, { rol: 'user', texto: ' ' }]),
    [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'buenas' }])
  assert.equal(historialParaModelo(Array.from({ length: 40 }, (_, i) => ({ rol: 'user', texto: `m${i}` }))).length, 20)
})

test('busca sin tildes y se queda con el último reporte por agente', () => {
  assert.ok(contiene('Reunión con Olé', 'reunion ole'))
  assert.ok(contiene('lo que sea', undefined))
  assert.ok(!contiene('Pagar luz', 'gas'))
  assert.deepEqual(ultimoPorAgente([{ agente: 'a', n: 1 }, { agente: 'b', n: 2 }, { agente: 'a', n: 3 }]).map(r => r.n), [1, 2])
})

test('sabe en qué app está', () => {
  assert.match(sistema({ hoy: 'hoy', app: 'pdg' }), /app PDG comercial\. Respondé/)
  assert.match(sistema({ hoy: 'hoy', pantalla: 'flujo' }), /app BS67 \(Second Brain\), pantalla «flujo»/)
})

test('valida y describe cuentas de PDG', () => {
  assert.deepEqual(validarAccion('crear_cuenta_pdg', { nombre: ' Acme ', etapa: 'otra' }).args.etapa, 'prospecto')
  assert.equal(validarAccion('crear_cuenta_pdg', { nombre: 'Acme', proxima_fecha: 'mañana' }).ok, false)
  assert.deepEqual(validarAccion('editar_cuenta_pdg', { id: ID, etapa: 'demo', proxima_fecha: '2026-10-20' }).args, { id: ID, etapa: 'demo', proxima_fecha: '2026-10-20' })
  assert.equal(validarAccion('editar_cuenta_pdg', { id: ID }).ok, false)
  assert.match(describirAccion('editar_cuenta_pdg', { id: ID, etapa: 'demo' }, { cuenta: 'Acme' }), /cuenta «Acme» de PDG: etapa demo/)
})

test('encuentra lo hablado en charlas viejas', () => {
  const charla = { titulo: 'Plan de octubre', mensajes: [{ rol: 'user', texto: 'Quiero hablar del Olé Summit' }, { rol: 'bot', texto: 'Dale, ¿qué día?' }, { rol: 'error', texto: 'x' }] }
  const r = fragmentosDeCharla(charla, 'ole summit')
  assert.equal(r.encontrada, true)
  assert.deepEqual(r.fragmentos, ['Daniela: Quiero hablar del Olé Summit'])
  assert.equal(fragmentosDeCharla(charla, 'presupuesto').encontrada, false)
})
