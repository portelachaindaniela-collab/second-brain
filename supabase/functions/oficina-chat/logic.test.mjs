import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validar, contexto, sistema, armarMensajes, MAX_MENSAJES } from './logic.mjs'

test('validar: agente conocido y último mensaje de la dueña', () => {
  const v = validar({ agente: 'up:redactor', mensajes: [{ role: 'user', content: ' ¿qué hiciste hoy? ' }] })
  assert.equal(v.ok, true)
  assert.equal(v.equipo, 'up')
  assert.equal(v.clave, 'redactor')
  assert.equal(v.mensajes[0].content, '¿qué hiciste hoy?')
  assert.equal(validar({ agente: 'up:inventado', mensajes: [{ role: 'user', content: 'hola' }] }).ok, false)
  assert.equal(validar({ agente: 'otro:x', mensajes: [{ role: 'user', content: 'hola' }] }).ok, false)
  assert.equal(validar({ agente: 'pdg:demo', mensajes: [{ role: 'assistant', content: 'hola' }] }).ok, false)
  assert.equal(validar({ agente: 'pdg:demo', mensajes: [] }).ok, false)
})

test('validar: un rol raro pasa como user y se queda con los últimos mensajes', () => {
  const mensajes = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'system', content: `m${i}` }))
  mensajes.push({ role: 'user', content: 'último' })
  const v = validar({ agente: 'trabajadores:canillita', mensajes })
  assert.equal(v.mensajes.length, MAX_MENSAJES)
  assert.ok(v.mensajes.every(m => m.role === 'user' || m.role === 'assistant'))
})

test('contexto de un trabajador: sus corridas', () => {
  const c = contexto('trabajadores', 'canillita', {
    trabajador: { nombre: 'Canillita', tipo: 'scraper', descripcion: 'Lee medios.', frecuencia: '0 * * * *', activo: true },
    corridas: [{ iniciado_at: '2026-11-11T12:00:00Z', estado: 'error', error: 'HTTP 500' }],
  })
  assert.equal(c.nombre, 'Canillita')
  assert.match(c.registro[0], /error · error: HTTP 500/)
  assert.equal(contexto('trabajadores', 'x', {}), null)
})

test('contexto de UP y de Noruega', () => {
  const r = contexto('up', 'investigador', { pasos: [{ at: '2026-11-11T09:02:00Z', accion: 'preguntó', detalle: '¿Qué querés contar?' }], pendientes: [{ fecha: '2026-11-12', texto: '¿Cuál fue el resultado?' }] })
  assert.equal(r.nombre, 'Investigador')
  assert.match(r.registro[0], /preguntó — ¿Qué querés contar\?/)
  assert.match(r.registro[1], /pendiente para Daniela \(2026-11-12\)/)
  const n = contexto('up', 'noruega', { chequeos: [{ at: '2026-11-11T01:35:00Z', estado: 'falla', chequeos: [{ nombre: 'Diseñador', estado: 'falla', detalle: 'placas atrasadas' }] }] })
  assert.equal(n.registro.length, 2)
  assert.match(n.registro[1], /Diseñador: falla — placas atrasadas/)
})

test('contexto de PDG y prompt', () => {
  const c = contexto('pdg', 'prospector', { agente: { nombre: 'Prospector', rol: 'Busca cuentas.', instrucciones: 'Investigá.' }, trabajos: [{ created_at: '2026-11-10T12:00:00Z', estado: 'borrador', texto: 'Hola club', pdg_cuentas: { nombre: 'Club A' } }] })
  assert.match(c.registro[0], /cuenta Club A · borrador/)
  const s = sistema(c, 'martes 11 de noviembre')
  assert.match(s, /Sos Prospector/)
  assert.match(s, /no inventes/)
  assert.match(s, /Lee la web de la cuenta/)
  const m = armarMensajes(c, [{ role: 'user', content: 'hola' }], 'hoy')
  assert.equal(m[0].role, 'system')
  assert.equal(m.length, 2)
  const vacio = sistema(contexto('up', 'publicador', {}), 'hoy')
  assert.match(vacio, /todavía no hay nada registrado/)
})

test('reunión: valida asistentes y mensajes', async () => {
  const { validarReunion } = await import('./logic.mjs')
  const ok = validarReunion({ reunion: true, asistentes: ['up:redactor', 'trabajadores:maria'], mensajes: [{ role: 'user', content: 'Hola a todos' }] })
  assert.equal(ok.ok, true)
  assert.equal(ok.asistentes.length, 2)
  assert.equal(validarReunion({ asistentes: ['up:inventado'], mensajes: [{ role: 'user', content: 'x' }] }).ok, false)
  assert.equal(validarReunion({ asistentes: [], mensajes: [{ role: 'user', content: 'x' }] }).ok, false)
  assert.equal(validarReunion({ asistentes: Array.from({ length: 30 }, (_, i) => `pdg:a${'b'.repeat(i)}`), mensajes: [{ role: 'user', content: 'x' }] }).ok, false)
  assert.equal(validarReunion({ asistentes: ['up:redactor'], mensajes: [{ role: 'assistant', content: 'x' }] }).ok, false)
})

test('reunión: el prompt lleva la ficha de cada uno y pide JSON', async () => {
  const { sistemaReunion } = await import('./logic.mjs')
  const c = contexto('up', 'redactor', { pasos: [{ at: '2026-11-11T09:02:00Z', accion: 'escribió LinkedIn' }] })
  const s = sistemaReunion([{ id: 'up:redactor', c }], 'hoy')
  assert.match(s, /### Redactor \(id: up:redactor\)/)
  assert.match(s, /escribió LinkedIn/)
  assert.match(s, /"respuestas"/)
})

test('reunión: lee las respuestas aunque vengan con texto alrededor y descarta ids ajenos', async () => {
  const { leerRespuestas } = await import('./logic.mjs')
  const r = leerRespuestas('Claro:\n{"respuestas":[{"agente":"up:redactor","texto":" Ya escribí LinkedIn. "},{"agente":"pdg:otro","texto":"hola"},{"agente":"up:revisor","texto":""}]}', ['up:redactor', 'up:revisor'])
  assert.deepEqual(r, [{ agente: 'up:redactor', texto: 'Ya escribí LinkedIn.' }])
  assert.deepEqual(leerRespuestas('no es json', ['up:redactor']), [])
})

test('Sistemas: solo María y Noruega derivan pedidos, y solo si están en la reunión', async () => {
  const { leerSolicitudes, extraerSolicitud, reglaSistemas } = await import('./logic.mjs')
  const crudo = JSON.stringify({ respuestas: [], solicitudes: [
    { agente: 'up:noruega', titulo: 'Revisar la tarea del Publicador', detalle: 'falló 3 veces' },
    { agente: 'up:redactor', titulo: 'Quiero tokens', detalle: 'x' },
    { agente: 'trabajadores:maria', titulo: 'Algo', detalle: 'no vino' },
    { agente: 'up:noruega', titulo: 'ok', detalle: 'título muy corto' },
  ] })
  const r = leerSolicitudes(crudo, ['up:noruega', 'up:redactor'])
  assert.deepEqual(r.map(s => s.titulo), ['Revisar la tarea del Publicador'])
  assert.deepEqual(leerSolicitudes('sin json', ['up:noruega']), [])
  const e = extraerSolicitud('Te cuento lo que pasó.\nSOLICITUD: Revisar el cron | se trabó dos veces', 'trabajadores:maria')
  assert.equal(e.texto, 'Te cuento lo que pasó.')
  assert.deepEqual(e.solicitud, { agente: 'trabajadores:maria', titulo: 'Revisar el cron', detalle: 'se trabó dos veces' })
  assert.equal(extraerSolicitud('SOLICITUD: Dame acceso | ya', 'up:redactor').solicitud, null)
  assert.match(reglaSistemas('up:redactor'), /No pidan accesos/)
  assert.match(reglaSistemas('up:noruega'), /SOLICITUD:/)
})

test('género: las mujeres hablan en femenino (en la charla y en la reunión)', async () => {
  const { sistema, sistemaReunion } = await import('./logic.mjs')
  const ficha = id => ({ id, nombre: 'X', rol: 'r', descripcion: 'd', herramientas: [], registro: [] })
  assert.match(sistema(ficha('up:noruega'), 'hoy'), /Sos mujer/)
  assert.match(sistema(ficha('up:redactor'), 'hoy'), /en masculino/)
  const r = sistemaReunion([{ id: 'trabajadores:maria', c: ficha('trabajadores:maria') }, { id: 'up:redactor', c: ficha('up:redactor') }], 'hoy')
  assert.match(r, /trabajadores:maria\) — r — mujer/)
  assert.match(r, /up:redactor\) — r — varón/)
})

test('reunión y charla: conversan en contexto y no prometen entregas', async () => {
  const { sistema, sistemaReunion } = await import('./logic.mjs')
  const ficha = id => ({ id, nombre: 'X', rol: 'r', descripcion: 'd', herramientas: [], registro: [] })
  const r = sistemaReunion([{ id: 'pdg:marketing', c: ficha('pdg:marketing') }], 'hoy')
  assert.match(r, /Es una conversación/)
  assert.match(r, /ni prometer entregas a futuro/)
  assert.match(sistema(ficha('pdg:marketing'), 'hoy'), /No recites tu estado/)
})

test('acta: María arma el plan, las tareas quedan con su supervisor y el calendario se valida', async () => {
  const { validarActa, leerActa, pedidosDelActa, mensajesActa } = await import('./logic.mjs')
  assert.equal(validarActa({ asistentes: ['up:noruega'], mensajes: [], modo: 'sala', inicio: '2026-11-11T10:00:00Z' }).ok, false)
  const v = validarActa({ asistentes: ['up:noruega', 'trabajadores:maria'], mensajes: [{ de: 'Vos', texto: 'Quiero un plan de enero 2027' }], modo: 'sala', inicio: '2026-11-11T10:00:00Z' })
  assert.ok(v.ok)
  assert.match(mensajesActa(['Noruega'], v.mensajes, '2026-11-11', 'hoy')[1].content, /Vos: Quiero un plan/)
  const crudo = JSON.stringify({
    titulo: 'Plan de enero 2027', resumen: 'Se armó el plan.', decisiones: ['Tres posts por semana'],
    tareas: [{ tarea: 'Escribir los textos', area: 'up', vence: '2026-12-27' }, { tarea: 'Revisar cuentas', area: 'pdg', vence: '2020-01-01' }, { tarea: 'x', area: 'up' }],
    sistemas: [{ titulo: 'Recordatorio de vencimientos', detalle: 'Avisar 3 días antes' }],
    calendario: [
      { fecha: '2027-01-04', tema: 'Arranque del año', redes: ['linkedin', 'tiktok'], formato_instagram: 'reel' },
      { fecha: '2027-01-04', tema: 'Repetido', redes: ['x'] },
      { fecha: '2027-01-06', tema: 'Carrusel de tendencias', redes: ['instagram', 'linkedin'], formato_instagram: 'carrusel' },
      { fecha: '2025-01-01', tema: 'Pasado', redes: ['x'] },
    ],
  })
  const equipos = { up: [{ id: 'up:redactor', nombre: 'Redactor' }], pdg: [{ id: 'pdg:propuesta', nombre: 'Propuestas' }] }
  const acta = leerActa(`Acá va: ${crudo.replace('"area":"up",', '"area":"up","responsable":"up:redactor",').replace('"area":"pdg",', '"area":"pdg","responsable":"up:redactor",')}`, '2026-11-11', equipos)
  assert.equal(acta.titulo, 'Plan de enero 2027')
  // UP: la hace el Redactor y la supervisa Noruega; PDG: el responsable no es de su equipo, queda en el supervisor.
  assert.deepEqual(acta.tareas.map(t => [t.area, t.responsable, t.supervisor, t.vence]), [['up', 'up:redactor', 'up:noruega', '2026-12-27'], ['pdg', 'trabajadores:maria', 'trabajadores:maria', null]])
  assert.deepEqual(acta.calendario.map(c => [c.fecha, c.redes, c.formato_instagram]), [['2027-01-04', ['linkedin'], 'ninguno'], ['2027-01-06', ['instagram', 'linkedin'], 'carrusel']])
  const pedidos = pedidosDelActa(acta)
  assert.equal(pedidos.length, 2)
  assert.ok(pedidos.every(p => p.agente === 'sistemas:mesa_entrada'))
  assert.equal(pedidos[1].accion.tipo, 'cargar_calendario_up')
  assert.match(pedidos[1].titulo, /2 días \(2027-01-04 a 2027-01-06\)/)
  assert.equal(leerActa('sin json', '2026-11-11'), null)
})

test('los supervisores ven las tareas de su equipo en su contexto', async () => {
  const { contexto } = await import('./logic.mjs')
  const c = contexto('up', 'noruega', { chequeos: [], tareas: [{ tarea: 'Que el calendario de enero esté cargado', area: 'up', responsable: 'up:redactor', vence: '2026-12-27', estado: 'pendiente' }] })
  assert.match(c.registro[0], /tarea de tu equipo \(la hace up:redactor\) \(pendiente, vence 2026-12-27, área up\): Que el calendario/)
})

test('contexto: Femina cuenta sus vueltas y lo que encontró; habla en femenino', async () => {
  const { contexto: ctx, sistema: sis } = await import('./logic.mjs')
  const c = ctx('pdg', 'femina', { agente: { nombre: 'Femina', rol: 'Exploradora comercial.' }, corridas: [{ estado: 'ok', iniciada_at: '2026-11-12T11:23:00Z', resumen: { nuevos: 2 } }], hallazgos: [{ tipo: 'prospecto', titulo: 'Boca Juniors', estado: 'nuevo', created_at: '2026-11-12T11:24:00Z' }] })
  assert.match(c.registro.join('\n'), /vuelta .* ok .*"nuevos":2/)
  assert.match(c.registro.join('\n'), /prospecto \(sin revisar\): Boca Juniors/)
  assert.match(sis(c, 'hoy'), /Sos mujer/)
})
