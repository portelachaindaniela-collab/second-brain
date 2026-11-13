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
