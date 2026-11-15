import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agenteTrabajador, agentesUp, agentesPdg, agentesAdmin, teToca, contarEstados, hoyAR, partirId } from './oficina.mjs'

const ahora = Date.parse('2026-11-11T15:00:00Z')
const hace = min => new Date(ahora - min * 60_000).toISOString()
const trabajador = { clave: 'canillita', nombre: 'Canillita', tipo: 'scraper', activo: true, color: 'arena', frecuencia: '0 * * * *', minutos_trabado: 10, descripcion: 'Lee medios.' }

test('trabajador: con una corrida en curso está trabajando', () => {
  const a = agenteTrabajador(trabajador, [{ estado: 'corriendo', iniciado_at: hace(2) }], ahora)
  assert.equal(a.estado, 'trabajando')
  assert.equal(a.id, 'trabajadores:canillita')
  assert.equal(a.ahora, 'corriendo ahora')
  assert.ok(a.herramientas.includes('Lee: Fuentes de noticias'))
  assert.ok(a.herramientas.includes('Escribe en: Mi nicho'))
})

test('trabajador: trabado o con la última corrida fallida tiene un problema', () => {
  assert.equal(agenteTrabajador(trabajador, [{ estado: 'corriendo', iniciado_at: hace(30) }], ahora).estado, 'error')
  const a = agenteTrabajador(trabajador, [{ estado: 'error', error: 'HTTP 500', iniciado_at: hace(20), finalizado_at: hace(19) }], ahora)
  assert.equal(a.estado, 'error')
  assert.match(a.tareas[0].texto, /Falló: HTTP 500/)
})

test('trabajador: pausado, sin corridas y libre', () => {
  assert.equal(agenteTrabajador({ ...trabajador, activo: false }, [], ahora).estado, 'pausado')
  assert.equal(agenteTrabajador(trabajador, [], ahora).estado, 'nuevo')
  const a = agenteTrabajador(trabajador, [{ estado: 'ok', iniciado_at: hace(10), finalizado_at: hace(9), cantidad_resultados: 4, duracion_ms: 2500 }], ahora)
  assert.equal(a.estado, 'libre')
  assert.equal(a.tareas[0].texto, '4 resultados · 2.5 s')
})

test('UP: el agente del último paso de una corrida en curso está trabajando; los demás, libres', () => {
  const corridas = [{ estado: 'corriendo', iniciado_at: hace(3), pasos: [
    { agente: 'planificador', accion: 'armó el día', at: hace(3) },
    { agente: 'investigador', accion: 'eligió 3 datos', at: hace(2) },
    { agente: 'redactor', accion: 'escribiendo LinkedIn', at: hace(1) },
  ] }]
  const up = Object.fromEntries(agentesUp(corridas, null, ahora).map(a => [a.clave, a]))
  assert.equal(up.redactor.estado, 'trabajando')
  assert.equal(up.redactor.ahora, 'escribiendo LinkedIn')
  assert.equal(up.planificador.estado, 'libre')
  assert.equal(up.publicador.estado, 'nuevo')
  assert.equal(up.noruega.estado, 'nuevo')
})

test('UP: una falla que marca Noruega va al agente; Noruega sigue libre (hizo su trabajo)', () => {
  const chequeo = { at: hace(5), estado: 'falla', chequeos: [
    { id: 'borradores', nombre: 'Borradores de hoy', estado: 'ok', detalle: 'Están todos.' },
    { id: 'disenador', nombre: 'Diseñador', estado: 'falla', detalle: '1 carrusel espera sus placas.' },
  ] }
  const up = Object.fromEntries(agentesUp([], chequeo, ahora).map(a => [a.clave, a]))
  assert.equal(up.disenador.estado, 'error')
  assert.match(up.disenador.ahora, /Noruega avisa: 1 carrusel/)
  assert.equal(up.noruega.estado, 'libre')
  assert.match(up.noruega.ahora, /Diseñador/)
  assert.equal(up.noruega.tareas.length, 2)
})

test('PDG: el último trabajo de cada agente, con su cuenta', () => {
  const agentes = [{ clave: 'marketing', nombre: 'Marketing', rol: 'Prepara contenido. Y más.', orden: 2 }, { clave: 'prospector', nombre: 'Prospector', rol: 'Busca.', orden: 1 }]
  const trabajos = [{ agente: 'prospector', estado: 'borrador', created_at: hace(60), cuenta: { nombre: 'Club A' } }]
  const [p, d] = agentesPdg(agentes, trabajos, ahora)
  assert.equal(p.clave, 'prospector')
  assert.match(p.ahora, /para Club A \(borrador sin revisar\)/)
  assert.ok(p.herramientas.includes('Lee la web de la cuenta'))
  assert.equal(d.estado, 'nuevo')
  assert.equal(d.rol, 'Prepara contenido')
  assert.ok(!d.herramientas.includes('Lee la web de la cuenta'))
})

test('te toca: junta alertas, Noruega, UP y PDG, con los errores primero', () => {
  const lista = teToca({
    hoy: '2026-11-11',
    alertas: [{ nivel: 'aviso', texto: 'Canillita: 2 horas sin correr' }],
    chequeo: { chequeos: [{ id: 'disenador', nombre: 'Diseñador', estado: 'falla', detalle: 'placas atrasadas' }, { id: 'corridas', nombre: 'Corridas', estado: 'ok', detalle: '' }] },
    piezas: [
      { fecha: '2026-11-12', estado: 'falta_info' }, { fecha: '2026-11-12', estado: 'falta_info' }, { fecha: '2026-11-13', estado: 'falta_info' },
      { fecha: '2026-11-01', estado: 'falta_info' },
      { fecha: '2026-11-11', estado: 'pendiente', tiene_texto: true }, { fecha: '2026-11-11', estado: 'pendiente', tiene_texto: false },
    ],
    trabajos: [{ agente: 'demo', estado: 'borrador' }, { agente: 'demo', estado: 'aprobado' }],
    cuentas: [{ nombre: 'Liga B', proxima_fecha: '2026-11-10', etapa: 'demo' }, { nombre: 'Club C', proxima_fecha: '2026-11-10', etapa: 'ganada' }],
  })
  assert.equal(lista[0].nivel, 'error')
  assert.equal(lista[0].agente, 'up:disenador')
  const textos = lista.map(i => i.texto)
  assert.ok(textos.includes('El Investigador te dejó preguntas para 2 días'))
  assert.ok(textos.includes('1 borrador espera tu aprobación'))
  assert.ok(textos.includes('PDG: 1 borrador para revisar'))
  assert.ok(textos.some(t => t.startsWith('PDG: 1 cuenta tiene') && t.includes('Liga B') && !t.includes('Club C')))
  assert.equal(lista.length, 6)
})

test('contar estados', () => {
  assert.deepEqual(contarEstados([{ estado: 'libre' }, { estado: 'error' }, { estado: 'libre' }]), { total: 3, trabajando: 0, libre: 2, error: 1, pausado: 0, nuevo: 0 })
})

test('hoy en Buenos Aires y los ids de agente', () => {
  assert.equal(hoyAR(Date.parse('2026-11-12T02:00:00Z')), '2026-11-11')
  assert.deepEqual(partirId('up:noruega'), { equipo: 'up', clave: 'noruega' })
  assert.equal(partirId('otro:x'), null)
  assert.equal(partirId('up:../x'), null)
})

test('reunión: informe de cada agente con sus datos y lo que necesita', async () => {
  const { informeDe, resumenReunion, turnosReunion } = await import('./oficina.mjs')
  const ahora = Date.parse('2026-11-11T15:00:00Z')
  const opera = { id: 'trabajadores:opera', nombre: 'Ópera', estado: 'error', ahora: 'la última corrida falló hace 29 min', tareas: [{ at: ahora - 30 * 60000, texto: 'Falló: GitHub Actions respondió 404' }] }
  const pend = [{ texto: 'Ópera: la última corrida falló', agente: 'trabajadores:opera' }, { texto: 'PDG: 1 borrador para revisar' }]
  const t = informeDe(opera, pend, ahora)
  assert.match(t, /^Hola, soy Ópera\. Tengo un problema: la última corrida falló hace 29 min\./)
  assert.match(t, /Lo último: falló: GitHub Actions respondió 404 \(hace 30 min\)\./)
  assert.match(t, /Necesito de vos: ópera: la última corrida falló\.$/)
  const google = { id: 'trabajadores:google_sync', nombre: 'Google (calendario y mail)', estado: 'libre', ahora: 'corrió hace 3 min · vuelve en 12 min', tareas: [] }
  assert.equal(informeDe(google, pend, ahora), 'Hola, soy Google. Estoy al día: corrió hace 3 min · vuelve en 12 min. No necesito nada de vos por ahora.')
  const maria = { id: 'trabajadores:maria', nombre: 'María', estado: 'trabajando' }
  assert.deepEqual(turnosReunion([maria, opera, google]).map(a => a.id), ['trabajadores:opera', 'trabajadores:google_sync', 'trabajadores:maria'])
  const r = resumenReunion([maria, opera, google], pend)
  assert.match(r, /vinieron 3\. 1 está trabajando ahora\. 1 tiene un problema: Ópera\. Te tocan 2 cosas/)
})

test('armarOficina: las alertas de un trabajador quedan asociadas a él', async () => {
  const { armarOficina } = await import('./oficina.mjs')
  const ahora = Date.parse('2026-11-11T15:00:00Z')
  const t = { clave: 'opera', nombre: 'Ópera', tipo: 'scraper', activo: true, color: 'bordo', frecuencia: '0 * * * *', minutos_trabado: 10, created_at: '2026-01-01T00:00:00Z' }
  const d = { trabajadores: [t], corridasPor: { opera: [{ estado: 'error', error: 'HTTP 404', iniciado_at: new Date(ahora - 600000).toISOString(), finalizado_at: new Date(ahora - 590000).toISOString() }] },
    salud: null, upCorridas: [], chequeo: null, piezas: [], pdgAgentes: [], pdgTrabajos: [], pdgCuentas: [], hoy: '2026-11-11' }
  const { pendientes } = armarOficina(d, ahora)
  const suya = pendientes.find(p => p.texto.startsWith('Ópera:'))
  assert.equal(suya?.agente, 'trabajadores:opera')
})

test('Administración: cada tarea programada con su estado según sus corridas', () => {
  const ahora = Date.parse('2026-11-11T15:00:00Z')
  const fila = (jobname, inicio, estado, extra = {}) => ({ jobname, schedule: '0 9 * * *', activo: true, inicio, fin: inicio, estado, mensaje: null, ...extra })
  const corridas = [
    fila('search-console', '2026-11-11T09:00:00Z', 'succeeded'),
    fila('resumen-diario-push', '2026-11-11T10:00:00Z', 'failed', { mensaje: 'timeout' }),
    fila('agenda-dulce-1410', '2026-11-10T17:10:00Z', 'succeeded'),
    fila('agenda-dulce-1900', '2026-11-11T14:59:00Z', 'running'),
    fila('up-historial', null, null),
    fila('limpiar-historial', '2026-11-01T03:00:00Z', 'succeeded', { activo: false }),
  ]
  const por = Object.fromEntries(agentesAdmin(corridas, ahora).map(a => [a.clave, a]))
  assert.equal(por.search_console.estado, 'libre')
  assert.equal(por.search_console.id, 'admin:search_console')
  assert.equal(por.resumen_diario.estado, 'error')
  assert.match(por.resumen_diario.ahora, /timeout/)
  assert.equal(por.agenda_dulce.estado, 'trabajando', 'la más reciente de sus dos tareas')
  assert.equal(por.historial_up.estado, 'nuevo')
  assert.equal(por.limpieza.estado, 'pausado')
  assert.ok(Object.values(por).every(a => a.sinCharla && a.equipo === 'admin'))
  assert.equal(agentesAdmin([], ahora).length, 5)
})

test('Sistemas: Mesa de entrada, Guardián de claves y Operador con datos reales', async () => {
  const { agentesSistemas, riesgoDe, recomendacion } = await import('./oficina.mjs')
  const ahora = Date.parse('2026-11-11T15:00:00Z')
  const solicitudes = [
    { id: 1, agente: 'up:noruega', titulo: 'Tokens de API de UP', detalle: '', estado: 'pendiente', creada: '2026-11-11T14:00:00Z' },
    { id: 2, agente: 'trabajadores:maria', titulo: 'Revisar el cron del Publicador', detalle: 'falló dos veces', estado: 'pendiente', creada: '2026-11-11T13:00:00Z' },
    { id: 3, agente: 'trabajadores:maria', titulo: 'Algo viejo', detalle: '', estado: 'hecha', creada: '2026-11-10T13:00:00Z' },
  ]
  assert.equal(riesgoDe(solicitudes[0]), 'alto')
  assert.equal(riesgoDe(solicitudes[1]), 'normal')
  assert.match(recomendacion(solicitudes[0]), /rechazar/)
  const conexiones = [
    { origen: 'UP · linkedin', nombre: 'D', expira_at: '2026-11-15T00:00:00Z', renovable: false },
    { origen: 'google', nombre: 'd@x', expira_at: '2026-11-11T14:00:00Z', renovable: true },
  ]
  const operador = [
    { jobname: 'up-publicador', activo: true, ultima: '2026-11-11T14:45:00Z', estado: 'failed', corridas_24h: 96, fallas_24h: 3 },
    { jobname: 'google-sync', activo: true, ultima: '2026-11-11T14:45:00Z', estado: 'succeeded', corridas_24h: 96, fallas_24h: 0 },
  ]
  const [mesa, guardian, op] = agentesSistemas({ solicitudes, conexiones, operador }, ahora)
  assert.equal(mesa.estado, 'trabajando')
  assert.match(mesa.ahora, /2 pedidos esperan.*1 riesgoso/)
  assert.equal(guardian.estado, 'libre')
  assert.match(guardian.ahora, /UP · linkedin \(en 3 días\)/)
  assert.equal(guardian.porVencer.length, 1, 'Google se renueva sola: no cuenta')
  assert.equal(op.estado, 'error')
  assert.match(op.ahora, /up-publicador/)
  assert.ok([mesa, guardian, op].every(a => a.equipo === 'sistemas' && a.sinCharla))
  const vencida = agentesSistemas({ conexiones: [{ origen: 'UP · x', expira_at: '2026-11-01T00:00:00Z', renovable: false }] }, ahora)[1]
  assert.equal(vencida.estado, 'error')
})

test('Te toca: las tareas de las reuniones que vencen pronto, con su supervisor', async () => {
  const { armarOficina } = await import('./oficina.mjs')
  const base = { trabajadores: [{ clave: 'maria', nombre: 'María', activo: true, frecuencia: '0 * * * *', tipo: 'orquestador' }], corridasPor: { maria: [] }, salud: null, upCorridas: [], chequeo: null, piezas: [], pdgAgentes: [], pdgTrabajos: [], pdgCuentas: [], hoy: '2026-12-25' }
  const tareas = [
    { id: 1, tarea: 'Calendario de enero cargado', area: 'up', responsable: 'up:noruega', vence: '2026-12-27', estado: 'pendiente' },
    { id: 2, tarea: 'Revisar textos', area: 'trabajadores', responsable: 'trabajadores:maria', vence: '2026-12-20', estado: 'en_curso' },
    { id: 3, tarea: 'Lejana', area: 'up', responsable: 'up:noruega', vence: '2027-02-01', estado: 'pendiente' },
    { id: 4, tarea: 'Ya hecha', area: 'up', responsable: 'up:noruega', vence: '2026-12-20', estado: 'hecha' },
  ]
  const { pendientes } = armarOficina({ ...base, tareas }, Date.parse('2026-12-25T15:00:00Z'))
  const deTareas = pendientes.filter(p => p.donde === 'Oficina › Archivo')
  assert.equal(deTareas.length, 2)
  assert.ok(deTareas.some(p => p.nivel === 'error' && /Venció: Revisar textos \(a cargo de María\)/.test(p.texto)))
  assert.ok(deTareas.some(p => p.nivel === 'aviso' && /Vence el 2026-12-27: Calendario de enero cargado \(a cargo de Noruega\)/.test(p.texto)))
})

test('cuando el equipo termina todas las tareas de un plan, el supervisor pide una reunión para mostrarlo', async () => {
  const { armarOficina } = await import('./oficina.mjs')
  const base = { trabajadores: [{ clave: 'maria', nombre: 'María', activo: true, frecuencia: '0 * * * *', tipo: 'orquestador' }], corridasPor: { maria: [] }, salud: null, upCorridas: [], chequeo: null, piezas: [], pdgAgentes: [], pdgTrabajos: [], pdgCuentas: [], hoy: '2026-12-25', actas: [{ id: 7, titulo: 'Plan de enero 2027' }] }
  const t = (id, estado, extra = {}) => ({ id, acta_id: 7, tarea: `T${id}`, area: 'up', responsable: id === 1 ? 'up:redactor' : 'up:disenador', supervisor: 'up:noruega', vence: '2027-01-10', estado, presentada: false, ...extra })
  const pide = tareas => armarOficina({ ...base, tareas }, Date.parse('2026-12-25T15:00:00Z')).pendientes.filter(p => p.reunion)
  assert.equal(pide([t(1, 'hecha'), t(2, 'en_curso')]).length, 0, 'todavía falta una')
  const [p] = pide([t(1, 'hecha'), t(2, 'hecha')])
  assert.match(p.texto, /Noruega pide una reunión para mostrarte «Plan de enero 2027»: su equipo terminó 2 tareas/)
  assert.deepEqual(p.reunion.asistentes, ['up:noruega', 'up:redactor', 'up:disenador'])
  assert.deepEqual(p.reunion.tareas, [1, 2])
  assert.equal(pide([t(1, 'hecha', { presentada: true }), t(2, 'hecha', { presentada: true })]).length, 0, 'ya se mostró')
})

test('agentesPdg: Femina toma su estado de sus vueltas y lista lo que encontró', () => {
  const ahora = Date.parse('2026-11-12T15:00:00Z')
  const agentes = [{ clave: 'prospector', nombre: 'Prospector', orden: 1 }, { clave: 'femina', nombre: 'Femina', rol: 'Exploradora comercial. Trabaja sola.', orden: 6 }]
  const femina = {
    corridas: [{ estado: 'ok', iniciada_at: '2026-11-12T11:23:00Z', resumen: { webs: { miradas: 3 }, prospectos: 4, nuevos: 5 } }],
    hallazgos: [{ tipo: 'prospecto', titulo: 'Boca Juniors', created_at: '2026-11-12T11:24:00Z' }, { tipo: 'noticia', titulo: 'River suma sponsor', created_at: '2026-11-12T11:24:00Z' }],
  }
  const [, f] = agentesPdg(agentes, [], ahora, femina)
  assert.equal(f.id, 'pdg:femina')
  assert.equal(f.estado, 'libre')
  assert.match(f.ahora, /miró 3 webs, 4 prospectos, 5 novedades/)
  assert.equal(f.prospectos, 1)
  assert.match(f.tareas[1].texto, /^noticia: River/)
  assert.equal(agentesPdg(agentes, [], ahora, { corridas: [{ estado: 'error', iniciada_at: '2026-11-12T11:23:00Z', error: 'sin IA' }] })[1].estado, 'error')
  assert.equal(agentesPdg(agentes, [], ahora)[1].estado, 'nuevo')
})

test('propuestas del día: una vez por día; recomendación según el tipo de pedido', async () => {
  const { tocanPropuestas, recomendacion } = await import('./oficina.mjs')
  const ahora = Date.parse('2026-11-13T15:00:00Z') // 12:00 en Buenos Aires
  assert.equal(tocanPropuestas([], ahora), true)
  assert.equal(tocanPropuestas([{ origen: 'propuesta', creada: '2026-11-13T04:00:00Z' }], ahora), false)
  assert.equal(tocanPropuestas([{ origen: 'propuesta', creada: '2026-11-13T02:00:00Z' }], ahora), true, 'la de anoche (antes de las 0 de Buenos Aires) no cuenta')
  assert.equal(tocanPropuestas([{ origen: 'reunion', creada: '2026-11-13T14:00:00Z' }], ahora), true)
  assert.match(recomendacion({ titulo: 'Pantalla de métricas', accion: { tipo: 'programar' } }), /Claude lo programa/)
  assert.match(recomendacion({ titulo: 'Calendario', accion: { tipo: 'tarea' } }), /tarea en el Archivo/)
  assert.match(recomendacion({ titulo: 'Necesito el token de X', accion: { tipo: 'programar' } }), /Riesgo alto/)
})

test('calendario de la oficina: reuniones, agendadas, por aprobar y vencimientos, en la grilla del mes', async () => {
  const { eventosOficina, mesOficina, mesVecino, reunionesAgendadas } = await import('./oficina.mjs')
  const solicitudes = [
    { id: 1, estado: 'aprobada', titulo: 'Ver el plan', accion: { tipo: 'reunion', fecha: '2026-11-20', asistentes: ['up:noruega'], tema: 'Plan de enero' } },
    { id: 2, estado: 'pendiente', titulo: 'Campaña', accion: { tipo: 'reunion', fecha: '2026-11-21', asistentes: ['pdg:marketing'], tema: 'Campaña PDG' } },
    { id: 3, estado: 'hecha', titulo: 'Vieja', accion: { tipo: 'reunion', fecha: '2026-11-02', asistentes: ['up:noruega'] } },
    { id: 4, estado: 'aprobada', titulo: 'Código', accion: { tipo: 'programar' } },
  ]
  const ev = eventosOficina({
    actas: [{ id: 9, fin: '2026-11-12T23:30:00Z', titulo: 'Plan de redes' }],
    tareas: [{ id: 5, tarea: 'Calendario de enero', vence: '2026-11-20', estado: 'pendiente' }, { id: 6, tarea: 'Lista', vence: '2026-11-10', estado: 'hecha' }],
    solicitudes,
  })
  assert.deepEqual(ev.map(e => [e.fecha, e.tipo]), [['2026-11-10', 'hecha'], ['2026-11-12', 'reunion'], ['2026-11-20', 'agendada'], ['2026-11-20', 'vence'], ['2026-11-21', 'propuesta']])
  assert.deepEqual(reunionesAgendadas(solicitudes).map(x => x.id), [1])
  const m = mesOficina('2026-11', ev, '2026-11-13')
  assert.equal(m.nombre, 'Noviembre de 2026')
  assert.equal(m.semanas[0].findIndex(c => c), 6, 'el 1 de noviembre de 2026 es domingo')
  const d20 = m.semanas.flat().find(c => c?.dia === 20)
  assert.equal(d20.eventos.length, 2)
  assert.equal(m.semanas.flat().find(c => c?.dia === 13).hoy, true)
  assert.ok(m.semanas.every(s => s.length === 7))
  assert.equal(mesVecino('2026-12', 1), '2027-01')
  assert.equal(mesVecino('2026-01', -1), '2025-12')
})

test('Te toca: la reunión agendada aparece el día que toca, para convocarla con su tema', async () => {
  const { armarOficina } = await import('./oficina.mjs')
  const base = { trabajadores: [], corridasPor: {}, upCorridas: [], chequeo: null, piezas: [], pdgAgentes: [], pdgTrabajos: [], pdgCuentas: [], admin: [], conexiones: [], operador: [], tareas: [], actas: [], hoy: '2026-11-20' }
  const solicitudes = [{ id: 1, agente: 'up:noruega', estado: 'aprobada', titulo: 'Ver el plan', detalle: 'Les muestro el avance', accion: { tipo: 'reunion', fecha: '2026-11-20', asistentes: ['up:noruega', 'up:planificador', 'pdg:fantasma'], tema: 'Plan de enero' } },
    { id: 2, agente: 'up:noruega', estado: 'aprobada', titulo: 'Más adelante', accion: { tipo: 'reunion', fecha: '2026-11-25', asistentes: ['up:noruega'], tema: 'Otra' } }]
  const { pendientes } = armarOficina({ ...base, solicitudes }, Date.parse('2026-11-20T15:00:00Z'))
  const r = pendientes.filter(p => p.reunion)
  assert.equal(r.length, 1)
  assert.match(r[0].texto, /^Hoy: reunión «Plan de enero», la pidió Noruega\./)
  assert.deepEqual(r[0].reunion, { asistentes: ['up:noruega', 'up:planificador'], solicitud: 1, tema: 'Plan de enero', detalle: 'Les muestro el avance', pidio: 'up:noruega' })
})

test('pedidos como hojas de Excel: una por agente, las que esperan respuesta primero', async () => {
  const { hojasDePedidos } = await import('./oficina.mjs')
  const p = (id, agente, estado, creada) => ({ id, agente, estado, creada, titulo: `p${id}` })
  const hojas = hojasDePedidos([
    p(1, 'up:noruega', 'hecha', '2026-11-13T10:00:00Z'), p(2, 'up:noruega', 'pendiente', '2026-11-10T10:00:00Z'),
    p(3, 'up:noruega', 'aprobada', '2026-11-12T10:00:00Z'), p(4, 'up:noruega', 'pendiente', '2026-11-11T10:00:00Z'),
    p(5, 'trabajadores:maria', 'pendiente', '2026-11-13T09:00:00Z'),
    p(6, 'trabajadores:canillita', 'rechazada', '2026-11-13T11:00:00Z'),
    p(7, 'pdg:femina', 'hecha', '2026-11-01T11:00:00Z'),
  ])
  assert.deepEqual(hojas.map(h => [h.agente, h.pendientes]), [['up:noruega', 2], ['trabajadores:maria', 1], ['trabajadores:canillita', 0], ['pdg:femina', 0]])
  assert.deepEqual(hojas[0].pedidos.map(x => x.id), [4, 2, 3, 1], 'pendientes (lo más nuevo arriba), en marcha, cerrados')
  assert.deepEqual(hojasDePedidos([]), [])
})

test('encuentros a pie: el agente cercano dice lo que tiene para Daniela, una cosa por vez', async () => {
  const { encuentroCon, primerEncuentro } = await import('./oficina.mjs')
  const solicitudes = [
    { id: 1, agente: 'up:noruega', estado: 'pendiente', titulo: 'Revisar las placas', creada: '2026-11-13T10:00:00Z', accion: { tipo: 'reunion', fecha: '2026-11-20', asistentes: ['up:noruega'], tema: 'Revisar las placas' } },
    { id: 2, agente: 'up:noruega', estado: 'pendiente', titulo: 'Pantalla de métricas', creada: '2026-11-13T12:00:00Z', origen: 'propuesta', accion: { tipo: 'programar' } },
    { id: 3, agente: 'trabajadores:canillita', estado: 'aprobada', titulo: 'Ya aprobado', creada: '2026-11-13T12:00:00Z' },
  ]
  const pendientes = [{ agente: 'up:investigador', texto: 'El Investigador te dejó preguntas para 1 día' }]
  const e = encuentroCon('up:noruega', { solicitudes, pendientes })
  assert.equal(e.pedido.id, 2, 'lo más nuevo primero')
  assert.match(e.texto, /^¿Tenés un minuto\? Se me ocurrió algo: «Pantalla de métricas»\. Necesita código.*\(Y tengo 1 cosa más para cuando puedas\.\)$/)
  const r = encuentroCon('up:noruega', { solicitudes, pendientes }, new Set(['p2']))
  assert.match(r.texto, /Quería armar una reunión: «Revisar las placas», para el viernes, 20 de noviembre\./)
  assert.equal(encuentroCon('trabajadores:canillita', { solicitudes, pendientes }), null, 'lo aprobado no se repite')
  assert.match(encuentroCon('up:investigador', { solicitudes, pendientes }).texto, /^Daniela, una cosa: El Investigador te dejó preguntas/)
  assert.equal(encuentroCon('up:investigador', { solicitudes, pendientes }, new Set(['aEl Investigador te dejó preguntas para 1 día'])), null)
  // Entre los cercanos, habla el primero que tenga algo.
  assert.equal(primerEncuentro(['trabajadores:canillita', 'up:investigador', 'up:noruega'], { solicitudes, pendientes }).id, 'up:investigador')
  assert.equal(primerEncuentro([], { solicitudes, pendientes }), null)
})

test('reuniones internas: cuál toca y cómo se ven en el calendario', async () => {
  const { internaQueToca, eventosOficina } = await import('./oficina.mjs')
  const reuniones = [
    { id: 3, estado: 'agendada', fecha: '2026-11-20', tema: 'Más adelante' },
    { id: 2, estado: 'agendada', fecha: '2026-11-13', tema: 'Repartir el calendario' },
    { id: 1, estado: 'hecha', fecha: '2026-11-10', tema: 'Ya hecha' },
  ]
  assert.equal(internaQueToca(reuniones, '2026-11-14').id, 2)
  assert.equal(internaQueToca(reuniones, '2026-11-12'), null)
  const ev = eventosOficina({ reuniones })
  assert.deepEqual(ev.map(e => [e.fecha, e.tipo, e.texto]), [['2026-11-13', 'interna', 'Repartir el calendario (entre ellos)'], ['2026-11-20', 'interna', 'Más adelante (entre ellos)']])
})

test('encuentros: «ahora no» lo frena un rato y después el agente te lo vuelve a decir', async () => {
  const { primerEncuentro, pospuestos, POSPONER_ENCUENTRO_MS } = await import('./oficina.mjs')
  const datos = { solicitudes: [{ id: 7, agente: 'up:noruega', titulo: 'Frenar la pieza', estado: 'pendiente', creada: '2026-11-15T12:00:00Z' }] }
  const t0 = Date.parse('2026-11-15T13:00:00Z')
  const despues = new Map([['p7', t0 + POSPONER_ENCUENTRO_MS]])
  assert.equal(primerEncuentro(['up:noruega'], datos, pospuestos(despues, t0 + 60_000)), null)
  assert.equal(primerEncuentro(['up:noruega'], datos, pospuestos(despues, t0 + POSPONER_ENCUENTRO_MS + 1))?.clave, 'p7')
})

test('visita: si el agente dice que va a tu oficina, camina hasta ahí', async () => {
  const { vieneATuOficina } = await import('./oficina.mjs')
  assert.equal(vieneATuOficina('Dale, voy a tu oficina y te lo muestro.'), true)
  assert.equal(vieneATuOficina('Paso por tu despacho en un rato.'), true)
  assert.equal(vieneATuOficina('¡Ya estoy en la puerta, entro ahora mismo!'), true)
  assert.equal(vieneATuOficina('Voy para tu oficina ahora mismo, llevo los hallazgos.'), true)
  assert.equal(vieneATuOficina('Estoy en la oficina, al lado de la recepción.'), false)
  assert.equal(vieneATuOficina('Me acerco a tu escritorio con los números.'), true)
  assert.equal(vieneATuOficina('Te lo dejo en el Archivo.'), false)
  assert.equal(vieneATuOficina('La reunión es en la sala.'), false)
})

test('golpear la puerta: de a uno, con pausa y sin repetir', async () => {
  const { quienGolpea, ENTRE_GOLPES_MS } = await import('./oficina.mjs')
  const datos = { solicitudes: [{ id: 3, agente: 'up:noruega', titulo: 'Frenar la pieza', estado: 'pendiente', creada: '2026-11-15T12:00:00Z' }] }
  const t = Date.parse('2026-11-15T13:00:00Z')
  assert.equal(quienGolpea(['pdg:femina', 'up:noruega'], datos, new Set(), 0, t)?.id, 'up:noruega')
  assert.equal(quienGolpea(['up:noruega'], datos, new Set(), t - 60_000, t), null)
  assert.equal(quienGolpea(['up:noruega'], datos, new Set(['p3']), t - ENTRE_GOLPES_MS - 1, t), null)
})

test('pasillo: el mismo agente no te para de nuevo enseguida', async () => {
  const { puedenPararte, ENTRE_ENCUENTROS_MS } = await import('./oficina.mjs')
  const t = Date.parse('2026-11-15T13:00:00Z')
  const ultimos = new Map([['up:noruega', t - 60_000]])
  assert.deepEqual(puedenPararte(['up:noruega', 'pdg:femina'], ultimos, t), ['pdg:femina'])
  assert.deepEqual(puedenPararte(['up:noruega'], ultimos, t + ENTRE_ENCUENTROS_MS), ['up:noruega'])
})

test('llamarlo: si le pedís que venga a tu oficina, va', async () => {
  const { lePedisQueVenga } = await import('./oficina.mjs')
  assert.equal(lePedisQueVenga('Vení a mi oficina que lo vemos.'), true)
  assert.equal(lePedisQueVenga('Seguime a mi oficina'), true)
  assert.equal(lePedisQueVenga('Te espero en mi despacho.'), true)
  assert.equal(lePedisQueVenga('Seguime'), true)
  assert.equal(lePedisQueVenga('Vení un toque'), true)
  assert.equal(lePedisQueVenga('¿Cómo viene la cadena?'), false)
  assert.equal(lePedisQueVenga('Mi oficina está muy linda.'), false)
})

test('vida de la oficina: los momentos de hoy que pasan adentro se ven de a uno', async () => {
  const { momentoQueToca } = await import('./oficina.mjs')
  const ms = [
    { id: 1, fecha: '2026-11-15', tipo: 'cena', agentes: ['a:x', 'b:y'] },
    { id: 2, fecha: '2026-11-14', tipo: 'mate', agentes: ['a:x', 'b:y'] },
    { id: 3, fecha: '2026-11-15', tipo: 'mate', agentes: ['a:x', 'b:y'] },
    { id: 4, fecha: '2026-11-15', tipo: 'cafe', agentes: ['a:x', 'c:z'] },
  ]
  assert.equal(momentoQueToca(ms, '2026-11-15')?.id, 3)
  assert.equal(momentoQueToca(ms, '2026-11-15', new Set([3]))?.id, 4)
  assert.equal(momentoQueToca(ms, '2026-11-15', new Set([3]), new Set(['a:x', 'b:y'])), null)
})

test('Femina, María y Noruega entran a tu oficina de a una, con pausa y pocas veces', async () => {
  const { quienEntra, ENTRE_ENTRADAS_MS, MAX_ENTRADAS } = await import('./oficina.mjs')
  const agentes = [{ id: 'up:noruega', estado: 'libre' }, { id: 'pdg:femina', estado: 'pausado' }, { id: 'up:redactor', estado: 'libre' }]
  const t = Date.parse('2026-11-15T15:00:00Z')
  assert.equal(quienEntra(agentes, 0, 0, t, () => 0.9), 'up:noruega')
  assert.equal(quienEntra(agentes, t - 60_000, 1, t), null)
  assert.equal(quienEntra(agentes, t - ENTRE_ENTRADAS_MS - 1, 1, t), 'up:noruega')
  assert.equal(quienEntra(agentes, 0, MAX_ENTRADAS, t), null)
  assert.equal(quienEntra([{ id: 'up:redactor', estado: 'libre' }], 0, 0, t), null)
})

test('visitas: pueden venir varios a la vez', async () => {
  const { sumarVisita, escenaDeVisitas, VISITA_MS } = await import('./oficina.mjs')
  let v = sumarVisita([], 'pdg:femina', false, 1000)
  v = sumarVisita(v, 'up:noruega', true, 2000)
  assert.deepEqual(escenaDeVisitas(v), { id: 1000, agentes: ['pdg:femina', 'up:noruega'], desdePuerta: ['up:noruega'], destino: 'oficina' })
  // Si Femina vuelve a decir que viene, se queda más rato y no cambia el orden ni la escena.
  const v2 = sumarVisita(v, 'pdg:femina', false, 5000)
  assert.equal(v2.find(x => x.agente === 'pdg:femina').hasta, 5000 + VISITA_MS)
  assert.deepEqual(escenaDeVisitas(v2).agentes, ['pdg:femina', 'up:noruega'])
  assert.equal(escenaDeVisitas([]), null)
})

test('tu relación con cada agente: lo que le decís, en su género', async () => {
  const { textoConVos } = await import('./oficina.mjs')
  assert.equal(textoConVos('novias', 'up:noruega'), '¿Querés ser mi novia? Para mí ya lo sos. 💕')
  assert.equal(textoConVos('novias', 'up:redactor'), '¿Querés ser mi novio? Para mí ya lo sos. 💕')
  assert.equal(textoConVos('amistad', 'up:redactor'), 'Me caés re bien: ya somos amigos.')
  assert.equal(textoConVos('', 'up:redactor'), 'Prefiero que volvamos a ser compañeros de trabajo.')
})

test('el que pidió una reunión aprobada te viene a buscar para arrancarla', async () => {
  const { encuentroCon } = await import('./oficina.mjs')
  const reunion = { asistentes: ['up:noruega', 'up:redactor'], solicitud: 9, tema: 'Calendario de enero', pidio: 'up:noruega' }
  const pendientes = [{ agente: 'up:noruega', texto: 'Algo de antes' }, { agente: 'up:noruega', texto: 'Hoy: reunión «Calendario de enero», la pidió Noruega.', reunion }]
  const e = encuentroCon('up:noruega', { solicitudes: [], pendientes })
  assert.equal(e.tipo, 'reunion')
  assert.deepEqual(e.reunion, reunion)
  assert.match(e.texto, /¿Arrancamos la reunión «Calendario de enero»\?/)
  assert.equal(encuentroCon('up:noruega', { solicitudes: [], pendientes }, new Set([e.clave])).texto, 'Daniela, una cosa: Algo de antes')
})
