import test from 'node:test'
import assert from 'node:assert/strict'
import { leerParametros, estadoPages, contarLogs, revisarGroq, revisarCole, revisarChat, usoDino, evaluar, resultadoAgenda, avisarYa, PARAMETROS_DEFECTO } from './logic.mjs'

// 2026-10-27 15:00 en Buenos Aires.
const ahora = Date.parse('2026-10-27T18:00:00Z')
const H = 3600_000

const sano = () => ({
  sitio: { status: 200, manifest: 200, sw: 200 },
  pages: { estado: 'built', cuando: '2026-10-27T14:18:40Z' },
  funcion: { ok: true, status: 401 },
  ics: { ok: true, status: 200 },
  groq: { ok: true, modelo: true, vision: true },
  logs: { errores_5xx: 0, groq_429: 0, groq_otros: 0, cambios_vision: 0 },
  agenda: { actualizado: new Date(ahora - 2 * H).toISOString() },
  cole: { tareas_pendientes: 2, atrasadas: [], proximos_examenes: [], notas_nuevas: [], ids_con_nota: [] },
  chat: { mensajes_24h: 4, mama_sin_leer: 0, mama_sin_leer_viejos: 0, horas_sin_leer: 0 },
  dino: [{ dia: '2026-10-26', cantidad: 10 }, { dia: '2026-10-27', cantidad: 12 }],
})

test('leerParametros completa con los de siempre y descarta valores raros', () => {
  const p = leerParametros({ dias_sin_abrir: 5, url: 'http://inseguro.com', familia: '', otra: 1, dino_aviso: -3 })
  assert.equal(p.dias_sin_abrir, 5)
  assert.equal(p.url, PARAMETROS_DEFECTO.url)
  assert.equal(p.familia, 'Valentina')
  assert.equal(p.dino_aviso, 200)
  assert.equal('otra' in p, false)
})

test('estadoPages traduce la corrida de Actions a built / errored / building', () => {
  const run = (status, conclusion) => ({ workflow_runs: [{ name: 'Otro' }, { name: 'pages build and deployment', status, conclusion, updated_at: 'x' }] })
  assert.equal(estadoPages(run('completed', 'success')).estado, 'built')
  assert.equal(estadoPages(run('completed', 'failure')).estado, 'errored')
  assert.equal(estadoPages(run('in_progress', null)).estado, 'building')
  assert.equal(estadoPages({ workflow_runs: [] }), null)
})

test('contarLogs cuenta 429, otros errores de Groq y cambios de visión sin guardar mensajes', () => {
  const c = contarLogs({ errores5xx: 2, mensajes: [
    { event_message: 'agenda-dulce IA 429 {"error":"rate"}' },
    'agenda-dulce IA 429 {}',
    'agenda-dulce IA 500 {}',
    'agenda-dulce: meta-llama/llama-4-scout no anda, paso a qwen/qwen3.8-27b',
    'agenda-dulce modelos groq: a, b',
  ] })
  assert.deepEqual(c, { errores_5xx: 2, groq_429: 2, groq_otros: 1, cambios_vision: 1 })
})

test('revisarGroq pide el modelo del Dino y alguno de visión', () => {
  assert.deepEqual(revisarGroq(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'], 'openai/gpt-oss-120b'), { ok: true, modelo: true, vision: true })
  assert.deepEqual(revisarGroq(['llama-3.3-70b'], 'openai/gpt-oss-120b'), { ok: true, modelo: false, vision: false })
  assert.equal(revisarGroq(null, 'x').ok, false)
})

test('revisarCole: atrasadas, exámenes de los próximos días y notas nuevas respecto de la corrida anterior', () => {
  const agenda = { datos: {
    tareas: [
      { id: 't1', titulo: 'Mapa de Europa', materia: 'Geografía', fecha: '2026-10-25', hecha: false },
      { id: 't2', titulo: 'Lámina', materia: 'Arte', fecha: '2026-10-20', hecha: true },
      { id: 't3', titulo: 'Cuestionario', materia: 'Historia', fecha: '2026-10-29', hecha: false },
      { id: 't4', titulo: 'Sin fecha', hecha: false },
    ],
    examenes: [
      { id: 'e1', materia: 'Mate', tema: 'Fracciones', fecha: '2026-10-29', nota: null },
      { id: 'e2', materia: 'Lengua', tema: 'Sustantivos', fecha: '2026-11-05', nota: null },
      { id: 'e3', materia: 'Inglés', tema: 'Verbs', fecha: '2026-10-20', nota: 8 },
      { id: 'e4', materia: 'Bio', tema: 'Célula', fecha: '2026-10-22', nota: 9 },
    ],
  } }
  const c = revisarCole(agenda, { ahora, idsConNotaAntes: ['e3'] })
  assert.deepEqual(c.atrasadas, [{ titulo: 'Geografía: Mapa de Europa', fecha: '2026-10-25' }])
  assert.deepEqual(c.proximos_examenes, [{ titulo: 'Mate: Fracciones', fecha: '2026-10-29' }])
  assert.deepEqual(c.notas_nuevas, [{ materia: 'Bio', nota: 9 }])
  assert.deepEqual(c.ids_con_nota, ['e3', 'e4'])
  assert.equal(c.tareas_pendientes, 3)
  assert.deepEqual(revisarCole(agenda, { ahora }).notas_nuevas, [], 'la primera corrida es el punto de partida')
  assert.deepEqual(revisarCole(null, { ahora }).atrasadas, [])
})

test('revisarChat solo cuenta, y marca lo de mamá sin leer hace más de 6 h', () => {
  const m = (de, leido, horas) => ({ de, leido, creado: new Date(ahora - horas * H).toISOString() })
  const c = revisarChat([m('mama', false, 8), m('mama', false, 1), m('chica', true, 2), m('mama', true, 30)], { ahora })
  assert.deepEqual(c, { mensajes_24h: 3, de_mama_24h: 2, de_valentina_24h: 1, mama_sin_leer: 2, mama_sin_leer_viejos: 1, horas_sin_leer: 8 })
  assert.equal(Object.values(c).every(v => typeof v === 'number'), true, 'nunca devuelve texto')
})

test('usoDino arma los últimos días con ceros, terminando hoy (hora argentina)', () => {
  const u = usoDino([{ dia: '2026-10-27', cantidad: 5 }, { dia: '2026-10-25', cantidad: 3 }], { ahora, dias: 3 })
  assert.deepEqual(u, [{ dia: '2026-10-25', cantidad: 3 }, { dia: '2026-10-26', cantidad: 0 }, { dia: '2026-10-27', cantidad: 5 }])
})

test('evaluar: todo sano es verde', () => {
  const e = evaluar(sano(), PARAMETROS_DEFECTO, ahora)
  assert.equal(e.semaforo, 'verde')
  assert.match(e.resumen, /^🟢 Agenda de Valentina: todo bien — 12 mensajes al Dino hoy\.$/)
  assert.deepEqual(e.avisos, [])
})

test('evaluar: lo que hay que mirar es amarillo', () => {
  const c = sano()
  c.agenda.actualizado = new Date(ahora - 4.5 * 24 * H).toISOString()
  c.cole.atrasadas = [{ titulo: 'Geo: Mapa', fecha: '2026-10-25' }]
  c.cole.proximos_examenes = [{ titulo: 'Mate: Fracciones', fecha: '2026-10-29' }]
  c.chat.mama_sin_leer_viejos = 1; c.chat.horas_sin_leer = 7
  c.dino[1].cantidad = 210
  c.logs.groq_429 = 3
  const e = evaluar(c, PARAMETROS_DEFECTO, ahora)
  assert.equal(e.semaforo, 'amarillo')
  assert.match(e.resumen, /^🟡 Agenda de Valentina: algo para mirar/)
  assert.match(e.resumen, /Valentina no abre la agenda hace 4 días/)
  assert.match(e.resumen, /1 tarea atrasada/)
  assert.match(e.resumen, /un mensaje de mamá lleva 7 h sin leer/)
  assert.match(e.resumen, /el Dino pasó los 200 mensajes \(210 el 27\/10\)/)
  assert.match(e.resumen, /Groq dijo "ocupado" 3 veces/)
  assert.match(e.resumen, /1 examen en 3 días/)
})

test('evaluar: no abrirla hace justo 3 días todavía no avisa', () => {
  const c = sano()
  c.agenda.actualizado = new Date(ahora - 3 * 24 * H + H).toISOString()
  assert.equal(evaluar(c, PARAMETROS_DEFECTO, ahora).semaforo, 'verde')
})

test('evaluar: sitio caído, build roto, 5xx, ics roto o Groq sin modelo es rojo', () => {
  const casos = [
    c => { c.sitio.status = 503 },
    c => { c.sitio.sw = 404 },
    c => { c.pages.estado = 'errored' },
    c => { c.funcion = { ok: false, status: 500 } },
    c => { c.ics = { ok: false, status: 200 } },
    c => { c.logs.errores_5xx = 1 },
    c => { c.groq = { ok: true, modelo: false, vision: true } },
    c => { c.groq = null },
  ]
  for (const romper of casos) {
    const c = sano(); romper(c)
    const e = evaluar(c, PARAMETROS_DEFECTO, ahora)
    assert.equal(e.semaforo, 'rojo', JSON.stringify(c))
    assert.match(e.resumen, /^🔴 Agenda de Valentina: rota/)
  }
})

test('evaluar: sin acceso a los logs no cambia el semáforo', () => {
  const c = sano(); c.logs = null
  assert.equal(evaluar(c, PARAMETROS_DEFECTO, ahora).semaforo, 'verde')
})

test('resultadoAgenda: la app rota no es una corrida fallida y no guarda texto del chat', () => {
  const c = sano(); c.sitio.status = 500
  const r = resultadoAgenda(c, PARAMETROS_DEFECTO, ahora)
  assert.equal(r.estado, 'ok')
  assert.equal(r.cantidad, 1)
  assert.equal(r.payload.semaforo, 'rojo')
  assert.equal(r.payload.backend.logs.errores_5xx, 0)
  assert.equal(Object.values(r.payload.chat).every(v => typeof v === 'number'), true)
  assert.equal(resultadoAgenda({ ...sano(), logs: null }, PARAMETROS_DEFECTO, ahora).payload.backend.logs, 'sin acceso')
})

test('avisarYa: push solo al pasar a rojo', () => {
  assert.equal(avisarYa('rojo', 'verde'), true)
  assert.equal(avisarYa('rojo', undefined), true)
  assert.equal(avisarYa('rojo', 'rojo'), false)
  assert.equal(avisarYa('amarillo', 'verde'), false)
})
