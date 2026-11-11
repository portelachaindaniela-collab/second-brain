import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agenteTrabajador, agentesUp, agentesPdg, teToca, contarEstados, hoyAR, partirId } from './oficina.mjs'

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
