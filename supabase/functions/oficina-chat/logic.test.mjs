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

test('pedidos: cualquiera de los presentes pide permiso; código va a Sistemas, lo demás es su tarea', async () => {
  const { leerSolicitudes, extraerSolicitudes } = await import('./logic.mjs')
  const crudo = JSON.stringify({ respuestas: [], pedidos: [
    { agente: 'up:planificador', titulo: 'Calendario de enero 2027', detalle: 'armo los temas de enero', tipo: 'tarea' },
    { agente: 'trabajadores:canillita', titulo: 'Leer el sitio de Olé femenino', detalle: 'sumar su RSS', tipo: 'codigo' },
    { agente: 'up:redactor', titulo: 'Quiero el token de LinkedIn', detalle: 'x', tipo: 'tarea' },
    { agente: 'pdg:demo', titulo: 'No vino a la reunión', detalle: 'x' },
    { agente: 'up:planificador', titulo: 'ok', detalle: 'título muy corto' },
  ] })
  const r = leerSolicitudes(crudo, ['up:planificador', 'trabajadores:canillita', 'up:redactor'])
  assert.deepEqual(r.map(s => s.titulo), ['Calendario de enero 2027', 'Leer el sitio de Olé femenino'])
  assert.deepEqual(r[0].accion, { tipo: 'tarea', area: 'up', responsable: 'up:planificador', supervisor: 'up:noruega' })
  assert.deepEqual(r[1].accion, { tipo: 'programar' })
  assert.deepEqual(leerSolicitudes('sin json', ['up:noruega']), [])
  // Las respuestas viejas («solicitudes») se siguen leyendo.
  assert.equal(leerSolicitudes(JSON.stringify({ solicitudes: [{ agente: 'up:noruega', titulo: 'Revisar el Publicador' }] }), ['up:noruega']).length, 1)
  const e = extraerSolicitudes('Dale, lo armo.\nPEDIDO: Calendario de enero | temas por semana | tarea\nPEDIDO: Pantalla de métricas | ver alcance por red | codigo', 'up:planificador')
  assert.equal(e.texto, 'Dale, lo armo.')
  assert.deepEqual(e.solicitudes.map(x => [x.titulo, x.accion.tipo]), [['Calendario de enero', 'tarea'], ['Pantalla de métricas', 'programar']])
  assert.equal(extraerSolicitudes('SOLICITUD: Dame la clave de X | ya', 'up:redactor').solicitudes.length, 0)
})

test('hilo: actas, tareas y pedidos entran en la charla, la reunión, las propuestas y el acta', async () => {
  const { textoHilo, sistema, sistemaReunion, sistemaPropuestas, mensajesActa } = await import('./logic.mjs')
  const hilo = {
    actas: [{ fin: '2026-11-12T15:00:00Z', titulo: 'Plan de enero 2027', resumen: 'Se armó el plan de redes.', plan: { decisiones: ['Tres posts por semana'] } }],
    tareas: [{ tarea: 'Calendario de enero cargado', area: 'up', responsable: 'up:planificador', vence: '2026-12-27', estado: 'pendiente' }],
    pedidos: [{ agente: 'trabajadores:canillita', titulo: 'Leer Olé femenino', estado: 'pendiente' }],
  }
  const t = textoHilo(hilo)
  assert.match(t, /«Plan de enero 2027»: Se armó el plan de redes\. Decidido: Tres posts por semana\./)
  assert.match(t, /Calendario de enero cargado \(up, la hace up:planificador, pendiente, vence 2026-12-27\)/)
  assert.match(t, /«Leer Olé femenino» de trabajadores:canillita: esperando tu permiso/)
  assert.match(textoHilo(), /primer día/)
  const ficha = id => ({ id, nombre: 'X', rol: 'r', descripcion: 'd', herramientas: [], registro: [] })
  assert.match(sistema(ficha('up:planificador'), 'hoy', hilo), /Plan de enero 2027[\s\S]*PEDIDO: <título corto>/)
  assert.match(sistemaReunion([{ id: 'up:planificador', c: ficha('up:planificador') }], 'hoy', hilo), /Plan de enero 2027[\s\S]*"pedidos":/)
  assert.match(sistemaPropuestas([{ id: 'up:planificador', c: ficha('up:planificador') }], 'hoy', hilo), /Leer Olé femenino[\s\S]*"propuestas":/)
  assert.match(mensajesActa(['X'], [{ de: 'Vos', texto: 'hola' }], '2026-11-13', 'hoy', {}, hilo)[0].content, /sigue el hilo[\s\S]*Plan de enero 2027[\s\S]*seguimiento/)
})

test('propuestas: del agente que la haría, sin claves y como mucho 5', async () => {
  const { leerPropuestas } = await import('./logic.mjs')
  const lista = Array.from({ length: 7 }, (_, i) => ({ agente: 'pdg:marketing', titulo: `Campaña número ${i}`, detalle: 'd', tipo: 'tarea' }))
  assert.equal(leerPropuestas(JSON.stringify({ propuestas: lista }), ['pdg:marketing']).length, 5)
  assert.equal(leerPropuestas(JSON.stringify({ propuestas: [{ agente: 'pdg:otro', titulo: 'Algo nuevo' }] }), ['pdg:marketing']).length, 0)
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

test('reunión y charla: conversan en contexto, traen propuestas y no prometen entregas', async () => {
  const { sistema, sistemaReunion } = await import('./logic.mjs')
  const ficha = id => ({ id, nombre: 'X', rol: 'r', descripcion: 'd', herramientas: [], registro: [] })
  const r = sistemaReunion([{ id: 'pdg:marketing', c: ficha('pdg:marketing') }], 'hoy')
  assert.match(r, /Es una conversación/)
  assert.match(r, /empleados con iniciativa/)
  assert.match(r, /Nadie promete entregas/)
  assert.match(sistema(ficha('pdg:marketing'), 'hoy'), /No recites tu estado/)
  assert.match(sistema(ficha('pdg:marketing'), 'hoy'), /Nunca pidas claves/)
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
  assert.deepEqual(pedidos[0].accion, { tipo: 'programar' })
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

test('reuniones: un agente pide juntarse con fecha y convocados; conoce el plantel', async () => {
  const { accionDePedido, extraerSolicitudes, leerSolicitudes, textoHilo } = await import('./logic.mjs')
  const a = accionDePedido('up:noruega', 'reunion', { fecha: '2026-11-20', asistentes: ['up:planificador', 'pdg:marketing', 'nadie', 'up:noruega'], titulo: 'Calendario de enero' }, '2026-11-13')
  assert.deepEqual(a, { tipo: 'reunion', fecha: '2026-11-20', asistentes: ['up:noruega', 'up:planificador', 'pdg:marketing'], tema: 'Calendario de enero' })
  assert.equal(accionDePedido('up:noruega', 'reunión', { fecha: '2026-11-01' }, '2026-11-13').fecha, '2026-11-13', 'una fecha pasada se corre a hoy')
  const e = extraerSolicitudes('Armemos una reunión.\nPEDIDO: Mostrar el plan de enero | les cuento el avance | reunion | 2026-11-20 | up:planificador, pdg:marketing', 'up:noruega')
  assert.equal(e.solicitudes[0].accion.tipo, 'reunion')
  assert.deepEqual(e.solicitudes[0].accion.asistentes, ['up:noruega', 'up:planificador', 'pdg:marketing'])
  const r = leerSolicitudes(JSON.stringify({ pedidos: [{ agente: 'up:noruega', titulo: 'Ver métricas juntos', tipo: 'reunion', fecha: '2099-01-02', asistentes: ['pdg:marketing'] }] }), ['up:noruega'])
  assert.equal(r[0].accion.fecha, '2099-01-02')
  assert.match(textoHilo({ plantel: [{ id: 'up:noruega', nombre: 'Noruega' }] }), /Noruega \(up:noruega\)/)
})

test('reuniones internas: se agendan sin pedir permiso, solo entre agentes que conversan', async () => {
  const { accionDePedido, separarInternas, leerSolicitudes, sistemaReunionInterna, leerConversacion, validarActa } = await import('./logic.mjs')
  const a = accionDePedido('up:noruega', 'reunion_interna', { fecha: '2026-11-20', asistentes: ['up:planificador', 'sistemas:operador', 'pdg:marketing'], titulo: 'Repartir el calendario' }, '2026-11-14')
  assert.deepEqual(a, { tipo: 'reunion_interna', fecha: '2026-11-20', asistentes: ['up:noruega', 'up:planificador', 'pdg:marketing'], tema: 'Repartir el calendario' })
  const pedidos = leerSolicitudes(JSON.stringify({ pedidos: [
    { agente: 'up:noruega', titulo: 'Repartir el calendario', detalle: 'Coordinar quién hace qué', tipo: 'reunion_interna', fecha: '2026-11-20', asistentes: ['up:planificador'] },
    { agente: 'up:noruega', titulo: 'Pantalla de métricas', tipo: 'codigo' },
    { agente: 'up:noruega', titulo: 'Sola no se puede', tipo: 'reunion_interna', asistentes: [] },
  ] }), ['up:noruega'])
  const { internas, solicitudes } = separarInternas(pedidos)
  assert.deepEqual(internas, [{ convoca: 'up:noruega', asistentes: ['up:noruega', 'up:planificador'], tema: 'Repartir el calendario', detalle: 'Coordinar quién hace qué', fecha: '2026-11-20' }])
  assert.deepEqual(solicitudes.map(x => x.titulo), ['Pantalla de métricas'], 'una reunión de uno solo no se agenda')
  const ficha = id => ({ id, nombre: id === 'up:noruega' ? 'Noruega' : 'Planificador', rol: 'r', descripcion: 'd', herramientas: [], registro: [] })
  const prompt = sistemaReunionInterna([{ id: 'up:noruega', c: ficha('up:noruega') }, { id: 'up:planificador', c: ficha('up:planificador') }], { convoca: 'up:noruega', tema: 'Repartir el calendario', detalle: '' }, 'hoy', {})
  assert.match(prompt, /sin Daniela[\s\S]*Noruega los convocó para hablar de «Repartir el calendario»[\s\S]*"mensajes"/)
  const conv = leerConversacion(JSON.stringify({ mensajes: [{ agente: 'up:noruega', texto: 'Arranco yo.' }, { agente: 'pdg:otro', texto: 'No estoy' }, { agente: 'up:planificador', texto: '' }] }), ['up:noruega', 'up:planificador'])
  assert.deepEqual(conv, [{ agente: 'up:noruega', texto: 'Arranco yo.' }])
  assert.equal(validarActa({ asistentes: ['up:noruega'], mensajes: [{ de: 'Noruega', texto: 'hola' }], modo: 'interna', inicio: '2026-11-14T10:00:00Z' }).ok, true)
})

test('conversación: el agente lee todo lo que habló con Daniela (chat, pasillo y reuniones)', async () => {
  const { conHistorial } = await import('./logic.mjs')
  const filas = [
    { de: 'agente', texto: '¿Tenés un minuto? Te quería pedir permiso para «Frenar la pieza».', lugar: 'pasillo', creado: '2026-11-15T13:00:00Z' },
    { de: 'daniela', texto: 'Ahora no.', lugar: 'pasillo', creado: '2026-11-15T13:00:10Z' },
  ]
  const m = conHistorial(filas, [{ role: 'user', content: 'viejo' }, { role: 'user', content: '¿Qué me querías decir en el pasillo?' }])
  assert.equal(m.length, 3)
  assert.equal(m[0].role, 'user')
  assert.match(m[0].content, /^\[en el pasillo, [^\]]+\]$/)
  assert.equal(m[1].role, 'assistant')
  assert.match(m[1].content, /^¿Tenés un minuto\?.*Frenar la pieza/)
  assert.equal(m[2].role, 'user')
  assert.match(m[2].content, /^\[en el pasillo, .*Ahora no\.\n\n¿Qué me querías decir en el pasillo\?/)
  assert.doesNotMatch(JSON.stringify(m), /viejo/)
  assert.equal(validar({ agente: 'up:noruega', mensajes: [{ role: 'user', content: 'hola' }], lugar: 'reunion' }).lugar, 'reunion')
  assert.equal(validar({ agente: 'up:noruega', mensajes: [{ role: 'user', content: 'hola' }] }).lugar, 'charla')
  assert.match(sistema(contexto('up', 'noruega', { chequeos: [] }), 'hoy', {}), /toda tu conversación con Daniela/)
})

test('reunión interna: si la respuesta llega cortada, se rescatan los turnos completos', async () => {
  const { leerConversacion } = await import('./logic.mjs')
  const cortada = '{"mensajes":[{"agente":"pdg:femina","texto":"Hola María, ¿te \\"robo\\" un minuto?"},{"agente":"trabajadores:maria","texto":"Dale."},{"agente":"pdg:femina","texto":"Te quer'
  const conv = leerConversacion(cortada, ['pdg:femina', 'trabajadores:maria'])
  assert.deepEqual(conv, [{ agente: 'pdg:femina', texto: 'Hola María, ¿te "robo" un minuto?' }, { agente: 'trabajadores:maria', texto: 'Dale.' }])
})

test('salidas: charlas fuera de la oficina, sin pedidos y marcadas en la conversación', async () => {
  const { conHistorial, armarMensajes } = await import('./logic.mjs')
  const v = validar({ agente: 'up:noruega', mensajes: [{ role: 'user', content: '¿Qué pedís?' }], salida: 'comer' })
  assert.equal(v.salida, 'comer')
  assert.equal(validar({ agente: 'up:noruega', mensajes: [{ role: 'user', content: 'hola' }], salida: 'boliche' }).salida, null)
  const c = contexto('up', 'noruega', { chequeos: [] })
  const sis = armarMensajes(c, [], 'hoy', {}, 'comer')[0].content
  assert.match(sis, /salieron a comer/)
  assert.match(sis, /sin pedir permisos/)
  assert.doesNotMatch(sis, /PEDIDO:/)
  assert.doesNotMatch(armarMensajes(c, [], 'hoy', {}, null)[0].content, /salieron a comer/)
  const m = conHistorial([{ de: 'agente', texto: 'Me encanta la milanesa.', lugar: 'charla', salida: 'comer', creado: '2026-11-15T15:00:00Z' }], [{ role: 'user', content: '¿Te acordás qué comiste?' }])
  assert.match(m[0].content, /^\[salieron a comer, /)
  assert.equal(m[1].content, 'Me encanta la milanesa.')
})

test('vida de la oficina: relaciones y momentos entre agentes, y cada uno los recuerda', async () => {
  const { leerVida, lineasVida, sistemaVida } = await import('./logic.mjs')
  const ids = ['up:noruega', 'trabajadores:maria', 'pdg:femina']
  const r = leerVida(JSON.stringify({
    momentos: [{ agentes: ['up:noruega', 'trabajadores:maria', 'otro:x'], tipo: 'mate', hora: '10:30', lugar: 'la cafetería', resumen: 'Hablaron de fútbol.' }, { agentes: ['up:noruega'], tipo: 'cafe', resumen: 'sola' }, { agentes: ['pdg:femina', 'up:noruega'], tipo: 'bailar', resumen: 'nope' }],
    vinculos: [{ a: 'up:noruega', b: 'trabajadores:maria', tipo: 'amistad', historia: 'Se llevan bárbaro.' }, { a: 'up:noruega', b: 'up:noruega', tipo: 'pareja' }, { a: 'pdg:femina', b: 'up:noruega', tipo: 'enemigos' }],
  }), ids)
  assert.equal(r.momentos.length, 1)
  assert.deepEqual(r.momentos[0].agentes, ['up:noruega', 'trabajadores:maria'])
  assert.deepEqual(r.vinculos, [{ a: 'trabajadores:maria', b: 'up:noruega', tipo: 'amistad', afinidad: 0, secreto: false, historia: 'Se llevan bárbaro.' }])
  const lineas = lineasVida('up:noruega', r.vinculos, [{ ...r.momentos[0], fecha: '2026-11-15' }], { 'trabajadores:maria': 'María' })
  assert.match(lineas[0], /amistad con María/)
  assert.match(lineas[1], /con María tomaron mate \(la cafetería\)/)
  assert.match(sistemaVida([{ id: 'up:noruega', nombre: 'Noruega' }], [], [], 'hoy'), /SOLO con JSON/)
  const c = { ...contexto('up', 'noruega', { chequeos: [] }), vida: lineas }
  assert.match(sistema(c, 'hoy', {}), /Tu vida en la oficina/)
})

test('Femina, María y Noruega: su persona, la relación con Daniela y la línea PAREJA', async () => {
  const { bloquePersona, extraerPareja, ELLAS } = await import('./logic.mjs')
  assert.deepEqual([...ELLAS].sort(), ['pdg:femina', 'trabajadores:maria', 'up:noruega'])
  const c = contexto('up', 'noruega', { chequeos: [] })
  const b = bloquePersona(c)
  assert.match(b, /morocha, de ojos celestes/)
  assert.match(b, /noruego/)
  assert.match(b, /conflictos/)
  assert.match(b, /sin insultos, amenazas ni manipulación/)
  assert.match(b, /PAREJA: sí/)
  assert.match(bloquePersona({ ...c, pareja: '2026-11-15T15:00:00Z' }), /son novias desde/)
  assert.match(bloquePersona({ ...c, pareja: '2026-11-15T15:00:00Z', estadoPareja: 'casadas' }), /están casadas desde/)
  assert.match(b, /otras personas no lo sabés/)
  assert.equal(bloquePersona(contexto('up', 'redactor', {})), '')
  assert.match(sistema(c, 'hoy', {}), /Quién sos como persona/)
  assert.match(sistema(c, 'hoy', {}), /No repitas frases ni respuestas que ya diste/)
  assert.deepEqual(extraerPareja('¡Sí, mil veces sí! ❤\nPAREJA: sí'), { texto: '¡Sí, mil veces sí! ❤', pareja: true })
  assert.deepEqual(extraerPareja('Te entiendo.\nPAREJA: no'), { texto: 'Te entiendo.', pareja: false })
  assert.equal(extraerPareja('Hola').pareja, null)
})

test('Quién sabe de las relaciones de Daniela: nadie, todos o algunos', async () => {
  const { quienSabe, bloquePersona, lineaSabe } = await import('./logic.mjs')
  const filas = [
    { agente: 'trabajadores:maria', estado: 'casadas', saben: ['up:noruega'] },
    { agente: 'pdg:femina', estado: 'saliendo', saben: ['*'] },
    { agente: 'up:noruega', estado: 'novias', saben: [] },
  ]
  const nombres = { 'trabajadores:maria': 'María', 'pdg:femina': 'Femina', 'up:noruega': 'Noruega' }
  assert.deepEqual(quienSabe('up:noruega', filas, nombres), [{ agente: 'trabajadores:maria', nombre: 'María', estado: 'casadas' }, { agente: 'pdg:femina', nombre: 'Femina', estado: 'saliendo' }])
  assert.deepEqual(quienSabe('trabajadores:maria', filas, nombres), [{ agente: 'pdg:femina', nombre: 'Femina', estado: 'saliendo' }])
  assert.deepEqual(quienSabe('up:redactor', filas, nombres), [{ agente: 'pdg:femina', nombre: 'Femina', estado: 'saliendo' }])
  assert.deepEqual(quienSabe('pdg:femina', filas, nombres), [])
  const noruega = { ...contexto('up', 'noruega', { chequeos: [] }), sabe: quienSabe('up:noruega', filas, nombres) }
  assert.match(bloquePersona(noruega), /Sabés que Daniela y María están casadas; y que Daniela y Femina están saliendo\. De otras relaciones/)
  assert.equal(lineaSabe(noruega), '')
  const redactor = { ...contexto('up', 'redactor', {}), sabe: quienSabe('up:redactor', filas, nombres) }
  assert.match(sistema(redactor, 'hoy', {}), /De la vida personal de Daniela: Sabés que Daniela y Femina están saliendo/)
  assert.doesNotMatch(sistema(contexto('up', 'redactor', {}), 'hoy', {}), /vida personal de Daniela/)
})

test('Las negativas enlatadas de la IA no cuentan como respuesta ni quedan en el historial', async () => {
  const { esNegativa, conHistorial } = await import('./logic.mjs')
  assert.ok(esNegativa('Lo siento, pero no puedo ayudar con eso.'))
  assert.ok(esNegativa('Lo siento, pero no puedo aceptar esa invitación.'))
  assert.ok(esNegativa('Lo siento, pero no puedo responder a eso.'))
  assert.ok(!esNegativa('Lo siento, no puedo ir hoy porque tengo la reunión de UP, ¿te parece mañana a la noche? Me encantaría cenar con vos.'))
  assert.ok(!esNegativa('¡Me encantaría!'))
  const h = conHistorial([
    { de: 'daniela', texto: 'sali conmigo', lugar: 'charla' },
    { de: 'agente', texto: 'Lo siento, pero no puedo responder a eso.', lugar: 'charla' },
  ], [{ role: 'user', content: 'veni a cenar' }])
  assert.deepEqual(h, [{ role: 'user', content: 'sali conmigo\n\nveni a cenar' }])
})

test('Chat de la oficina: noticias del día, cumpleaños y respuestas', async () => {
  const { sistemaVida, leerVida, cumpleDe, sistemaGeneral, leerGeneral, validarGeneral, proveedores } = await import('./logic.mjs')
  assert.match(cumpleDe('up:noruega'), /^\d{2}-\d{2}$/)
  assert.equal(cumpleDe('up:noruega'), cumpleDe('up:noruega'))
  const plantel = [{ id: 'up:noruega', nombre: 'Noruega' }, { id: 'pdg:femina', nombre: 'Femina' }]
  const p = sistemaVida(plantel, [], [], 'hoy', { cumples: ['up:noruega'], publicas: [{ agente: 'pdg:femina', estado: 'novias' }], general: [{ autor: 'daniela', texto: 'Hola a todos' }] })
  assert.match(p, /Hoy cumplen años: Noruega/)
  assert.match(p, /Daniela y Femina son novias/)
  assert.match(p, /infidelidad/)
  assert.match(p, /Daniela: Hola a todos/)
  const r = leerVida(JSON.stringify({ momentos: [], vinculos: [], noticias: [{ autor: 'up:noruega', texto: '¡Gracias por los saludos! 🎂' }, { autor: 'up:otro', texto: 'no vale' }] }), ['up:noruega', 'pdg:femina'])
  assert.deepEqual(r.noticias, [{ autor: 'up:noruega', texto: '¡Gracias por los saludos! 🎂' }])
  assert.match(sistemaGeneral(plantel, [{ autor: 'daniela', texto: '¿Quién viene al after?' }], [], [], 'hoy'), /Daniela: ¿Quién viene al after\?/)
  assert.deepEqual(leerGeneral('{"respuestas":[{"autor":"pdg:femina","texto":"¡Yo!"}]}', ['pdg:femina']), [{ autor: 'pdg:femina', texto: '¡Yo!' }])
  assert.equal(validarGeneral({ general: '  ' }).ok, false)
  const or = proveedores({ OPENROUTER_API_KEY: 'x' }).find(x => x.nombre === 'openrouter')
  assert.equal(or.modelo, 'deepseek/deepseek-chat-v3.1')
})

test('Relaciones como en un simulador de vida: escalones, afinidad e infidelidades en secreto', async () => {
  const { leerVida, lineasVida, sistemaVida, sistemaGeneral } = await import('./logic.mjs')
  const ids = ['up:noruega', 'trabajadores:maria', 'pdg:femina']
  const r = leerVida(JSON.stringify({ vinculos: [
    { a: 'up:noruega', b: 'pdg:femina', tipo: 'casados', afinidad: 140, historia: 'Se casaron.' },
    { a: 'up:noruega', b: 'trabajadores:maria', tipo: 'amantes', afinidad: '55', secreto: true, historia: 'Se ven a escondidas.' },
  ] }), ids)
  assert.deepEqual(r.vinculos.map(v => [v.tipo, v.afinidad, v.secreto]), [['casados', 100, false], ['amantes', 55, true]])
  const nombres = { 'trabajadores:maria': 'María', 'pdg:femina': 'Femina' }
  assert.match(lineasVida('up:noruega', r.vinculos, [], nombres).join('\n'), /amantes con María \(en secreto: no se lo contás a nadie\)/)
  const plantel = [{ id: 'up:noruega', nombre: 'Noruega' }, { id: 'trabajadores:maria', nombre: 'María' }, { id: 'pdg:femina', nombre: 'Femina' }]
  const p = sistemaVida(plantel, r.vinculos, [], 'hoy')
  assert.match(p, /María y Noruega: amantes, afinidad 55, EN SECRETO/)
  assert.match(p, /divorcio/)
  // En el chat de todos lo secreto no aparece.
  const g = sistemaGeneral(plantel, [{ autor: 'daniela', texto: 'hola' }], r.vinculos, [], 'hoy')
  assert.match(g, /Femina y Noruega: casados/)
  assert.doesNotMatch(g, /amantes/)
})

test('Con cualquier agente: relación personal elegida por Daniela, en el género que corresponde', async () => {
  const { lineaSabe, textoPareja, bloquePersona } = await import('./logic.mjs')
  assert.equal(textoPareja('novias', 'up:redactor'), 'son novios')
  assert.equal(textoPareja('casadas', 'up:noruega'), 'están casadas')
  assert.equal(textoPareja('amistad', 'up:redactor'), 'son amigos')
  const redactor = { ...contexto('up', 'redactor', {}), pareja: '2026-11-15T15:00:00Z', estadoPareja: 'comprometidas' }
  assert.match(lineaSabe(redactor), /Con Daniela, en lo personal: están comprometidos desde/)
  assert.match(sistema(redactor, 'hoy', {}), /están comprometidos/)
  assert.equal(lineaSabe(contexto('up', 'redactor', {})), '')
  // Femina como amiga: le sigue gustando y puede pedirle ser pareja.
  const amiga = bloquePersona({ ...contexto('pdg', 'femina', { agente: { nombre: 'Femina' } }), pareja: '2026-11-15T15:00:00Z', estadoPareja: 'amistad' })
  assert.match(amiga, /son amigas desde/)
  assert.match(amiga, /PAREJA: sí/)
})

test('En la reunión cada agente es la misma persona que en la charla: personalidad y relación con Daniela', async () => {
  const { sistemaReunion } = await import('./logic.mjs')
  const femina = { ...contexto('pdg', 'femina', { agente: { nombre: 'Femina' } }), pareja: '2026-11-15T15:00:00Z', estadoPareja: 'novias', vida: ['- amistad con María'] }
  const p = sistemaReunion([{ id: 'pdg:femina', c: femina }], 'hoy', {})
  assert.match(p, /Con Daniela, en lo personal: son novias/)
  assert.match(p, /Cómo es: pasional/)
  assert.match(p, /Su vida en la oficina: amistad con María/)
  assert.match(p, /no programas/)
  assert.match(sistema(femina, 'hoy', {}), /nunca digas que sos «un agente automatizado»/)
})

test('Lo que se dicen los agentes entre ellos queda guardado y cada uno lo recuerda', async () => {
  const { leerVida, lineasVida } = await import('./logic.mjs')
  const ids = ['up:noruega', 'trabajadores:maria', 'pdg:femina']
  const r = leerVida(JSON.stringify({ momentos: [{ agentes: ['up:noruega', 'trabajadores:maria'], tipo: 'mate', hora: '10:30', lugar: 'el pasillo', resumen: 'Charlaron.',
    charla: [{ agente: 'up:noruega', texto: '¿Un mate?' }, { agente: 'trabajadores:maria', texto: 'Dale, cebá vos.' }, { agente: 'pdg:femina', texto: 'no estaba' }] }] }), ids)
  assert.deepEqual(r.momentos[0].charla, [{ agente: 'up:noruega', texto: '¿Un mate?' }, { agente: 'trabajadores:maria', texto: 'Dale, cebá vos.' }])
  const l = lineasVida('trabajadores:maria', [], [{ ...r.momentos[0], fecha: '2026-11-15' }], { 'up:noruega': 'Noruega' })
  assert.match(l[0], /Se dijeron: Noruega: «¿Un mate\?» vos: «Dale, cebá vos\.»/)
})

test('Las marcas de lugar y hora no se copian en las respuestas ni se muestran', async () => {
  const { limpiarMarcas, conHistorial } = await import('./logic.mjs')
  assert.equal(limpiarMarcas('[en la oficina de Daniela, 15/11/26, 1:56 p. m.] [en el pasillo, 15/11/26, 1:55 p. m.] [salieron a comer, 15/11/26, 1:49 p. m.] Hola, ¿todo bien?'), 'Hola, ¿todo bien?')
  assert.equal(limpiarMarcas('Te espero [en serio] mañana.'), 'Te espero [en serio] mañana.')
  const m = conHistorial([{ de: 'agente', texto: '[en el pasillo, 15/11/26, 1:54 p. m.] [en un after office, 15/11/26, 1:48 p. m.]', lugar: 'charla' }, { de: 'agente', texto: 'Buen día.', lugar: 'charla' }], [{ role: 'user', content: 'hola' }])
  assert.deepEqual(m, [{ role: 'assistant', content: 'Buen día.' }, { role: 'user', content: 'hola' }])
})
