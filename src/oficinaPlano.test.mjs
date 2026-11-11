import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PISO, ANCHO_FONDO, ZONAS, PASILLO, FONDO_OFICINAS, oficinasTrabajadores, GRUPOS_TRABAJADORES, mesaPdg, CUADROS_PDG, mesaUp, lugares, DESCANSOS, PUFS, rutinas,
  camino, largo, puntoEn, momentoRutina, VELOCIDAD, TIEMPOS, variante, agujas, CICLO_REFERENCIA, ACCESORIOS, luzDelDia,
} from './oficinaPlano.mjs'

const enPiso = p => p.x > 0 && p.x < PISO.ancho && p.y > 0 && p.y < PISO.fondo
const dentro = (p, z) => p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1

const REALES = ['tareas_estancadas', 'opera', 'canillita', 'agenda_valentina', 'scraper_empleo', 'maria', 'google_sync', 'monitor_sitios', 'buscador_eventos']
const oficinasFondo = () => oficinasTrabajadores(REALES)

test('trabajadores: los que hacen cosas parecidas comparten oficina', () => {
  const l = Object.fromEntries(REALES.map((c, i) => [c, oficinasFondo()[i]]))
  assert.equal(l.monitor_sitios.oficina.id, l.tareas_estancadas.oficina.id)
  assert.equal(l.google_sync.oficina.id, l.agenda_valentina.oficina.id)
  assert.equal(l.canillita.oficina.id, l.opera.oficina.id)
  assert.equal(l.canillita.oficina.id, l.buscador_eventos.oficina.id)
  assert.equal(l.canillita.oficina.nombre, 'Prensa y eventos')
  assert.notEqual(l.scraper_empleo.oficina.id, l.canillita.oficina.id)
  assert.equal(new Set(REALES.map(c => l[c].oficina.id)).size, 5)
})

test('oficinas del fondo: llenan el ancho sin pisarse y los escritorios no chocan', () => {
  const todos = oficinasFondo()
  const ofs = [...new Map(todos.map(l => [l.oficina.id, l.oficina])).values()].sort((a, b) => a.x0 - b.x0)
  assert.ok(Math.abs(ofs[0].x0) < 1e-9 && Math.abs(ofs.at(-1).x1 - ANCHO_FONDO) < 1e-9)
  for (let i = 1; i < ofs.length; i++) assert.ok(Math.abs(ofs[i].x0 - ofs[i - 1].x1) < 1e-9)
  for (const o of ofs) {
    if (o.jefa) continue
    const suyos = todos.filter(l => l.oficina.id === o.id).sort((a, b) => a.escritorio.x - b.escritorio.x)
    for (const l of suyos) assert.ok(l.escritorio.x - 0.82 > o.x0 && l.escritorio.x + 0.82 < o.puerta.x - 0.5, o.id)
    for (let i = 1; i < suyos.length; i++) assert.ok(suyos[i].escritorio.x - suyos[i - 1].escritorio.x > 1.64 + 0.5, 'queda pasillo entre escritorios')
    assert.equal(o.puerta.y, FONDO_OFICINAS)
  }
})

test('un trabajador que no está en ningún grupo tiene su oficina', () => {
  const l = oficinasTrabajadores(['nuevo_trabajador', 'canillita'])
  assert.notEqual(l[0].oficina.id, l[1].oficina.id)
  assert.equal(l[0].oficina.nombre, null)
  assert.ok(GRUPOS_TRABAJADORES.length >= 4)
})

test('la jefa tiene la mejor oficina: la del rincón, sola y la más grande', () => {
  const ofs = oficinasFondo()
  const jefa = ofs[REALES.indexOf('maria')]
  assert.ok(jefa.jefa)
  assert.ok(Math.abs(jefa.x1 - ANCHO_FONDO) < 1e-9, 'es la del rincón')
  assert.equal(ofs.filter(l => l.oficina.id === jefa.oficina.id).length, 1)
  const anchos = ofs.map(l => l.x1 - l.x0)
  assert.equal(Math.max(...anchos), jefa.x1 - jefa.x0)
  assert.ok(jefa.puerta.x - 0.5 >= jefa.x0 && jefa.puerta.x + 0.5 < jefa.escritorio.x - 1.15, 'la puerta no choca con el escritorio')
})

test('PDG comparte un tablón: enfrentados de a pares, uno en la cabecera, dentro de su zona', () => {
  const { mesa, asientos } = mesaPdg(5)
  assert.equal(asientos.length, 5)
  assert.equal(asientos[0].sentado.y, asientos[1].sentado.y, 'el primer par queda enfrentado')
  assert.ok(asientos.at(-1).cabecera)
  for (const a of asientos) {
    assert.ok(dentro(a.sentado, ZONAS.pdg), JSON.stringify(a.sentado))
    // La PC queda sobre la mesa: a 1.05 del asiento, hacia donde mira.
    const pc = { x: a.sentado.x + Math.sin(a.mira) * 1.05, y: a.sentado.y + Math.cos(a.mira) * 1.05 }
    assert.ok(pc.x >= mesa.x0 && pc.x <= mesa.x1 && pc.y >= mesa.y0 && pc.y <= mesa.y1, `PC fuera de la mesa: ${JSON.stringify(pc)}`)
  }
  assert.equal(CUADROS_PDG.length, 5)
})

test('UP comparte un tablón: enfrentados de a pares y uno en la cabecera, dentro de su zona', () => {
  const { mesa, asientos } = mesaUp(7)
  assert.equal(asientos.length, 7)
  assert.equal(asientos.filter(a => a.mira === 0).length, 3)
  assert.equal(asientos.filter(a => a.mira === Math.PI).length, 3)
  assert.ok(asientos.at(-1).cabecera)
  assert.equal(asientos[0].sentado.x, asientos[1].sentado.x, 'el primer par queda enfrentado')
  assert.ok(mesa.x1 + 1.5 < ZONAS.up.x1)
  for (const a of asientos) assert.ok(dentro(a.sentado, ZONAS.up))
  assert.equal(lugares('up', ['a', 'b', 'c', 'd', 'e', 'f', 'g']).length, 7)
})

test('los descansos están en sus zonas y los de ping pong juegan juntos', () => {
  for (const d of DESCANSOS) assert.ok(dentro(d, ZONAS[d.zona]), d.id)
  const [p1, p2] = DESCANSOS.filter(d => d.objeto === 'paleta')
  assert.equal(p1.tanda, p2.tanda)
  for (const p of PUFS) assert.ok(dentro(p, ZONAS.ocio))
})

test('rutinas: libres salen de descanso, pausados duermen, el resto se queda en su lugar', () => {
  const r = rutinas([{ id: 'a', estado: 'libre' }, { id: 'b', estado: 'trabajando' }, { id: 'c', estado: 'pausado' }, { id: 'd', estado: 'error' }])
  assert.equal(r.a.tipo, 'rutina')
  assert.equal(r.a.descanso.id, DESCANSOS[0].id)
  assert.equal(r.b.tipo, 'escritorio')
  assert.equal(r.d.tipo, 'escritorio')
  assert.deepEqual(r.c.puf, PUFS[0])
  const muchos = rutinas(Array.from({ length: DESCANSOS.length + 1 }, (_, i) => ({ id: `x${i}`, estado: 'libre' })))
  assert.equal(muchos[`x${DESCANSOS.length}`].retraso - muchos.x0.retraso, CICLO_REFERENCIA / 2)
})

test('caminos: de cada lugar a cada descanso, siempre por el piso y pasando por el pasillo del medio', () => {
  const todos = [...lugares('trabajadores', REALES), ...lugares('pdg', ['a', 'b', 'c', 'd', 'e']), ...lugares('up', ['a', 'b', 'c', 'd', 'e', 'f', 'g'])]
  for (const l of todos) for (const d of DESCANSOS) {
    const c = camino(l, d)
    assert.deepEqual(c[0], l.sentado)
    assert.deepEqual(c.at(-1), { x: d.x, y: d.y })
    assert.ok(c.some(p => p.y === PASILLO))
    for (const p of c) assert.ok(enPiso(p), JSON.stringify(p))
    // Solo tramos rectos (horizontales o verticales): así se caminan por los pasillos.
    for (let i = 1; i < c.length; i++) assert.ok(c[i].x === c[i - 1].x || c[i].y === c[i - 1].y, `${d.id} ${JSON.stringify([c[i - 1], c[i]])}`)
  }
})

test('las oficinas se salen por la puerta', () => {
  const o = oficinasFondo()[3]
  assert.ok(camino(o, DESCANSOS[0]).some(p => p.x === o.puerta.x && p.y === o.puerta.y))
})

test('punto en el camino y momento de la rutina', () => {
  const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]
  assert.equal(largo(pts), 7)
  assert.deepEqual(puntoEn(pts, 5), { x: 3, y: 2, dx: 0, dy: 1 })
  assert.deepEqual(puntoEn(pts, 99), { x: 3, y: 4, dx: 0, dy: 1 })
  const ida = 7 / VELOCIDAD
  assert.equal(momentoRutina(1, 7).fase, 'sentado')
  assert.equal(momentoRutina(TIEMPOS.sentado + ida / 2, 7).fase, 'yendo')
  assert.equal(momentoRutina(TIEMPOS.sentado + ida + 1, 7).fase, 'descanso')
  const vuelta = momentoRutina(TIEMPOS.sentado + ida + TIEMPOS.descanso + ida / 2, 7)
  assert.equal(vuelta.fase, 'volviendo')
  assert.ok(Math.abs(vuelta.d - 3.5) < 1e-9)
})

test('variante fija por agente y reloj de Buenos Aires', () => {
  assert.deepEqual(variante('up:redactor'), variante('up:redactor'))
  const v = variante('trabajadores:maria')
  assert.ok(v.pelo < 4 && v.colorPelo < 5 && v.piel < 3)
  assert.deepEqual(agujas(Date.parse('2026-11-11T18:30:00Z')), { hora: 105, minuto: 180 })
})

test('pasan la mayor parte del tiempo en su lugar y las salidas están repartidas', () => {
  const l = largo(camino(oficinasFondo()[0], DESCANSOS[0]))
  const { ciclo } = momentoRutina(0, l)
  assert.ok(TIEMPOS.sentado / ciclo > 0.6, `en su lugar ${Math.round((TIEMPOS.sentado / ciclo) * 100)} %`)
  const tandas = [...new Set(DESCANSOS.map(d => d.tanda))].sort((a, b) => a - b)
  assert.ok(tandas.at(-1) - tandas[0] > CICLO_REFERENCIA / 2, 'las salidas cubren buena parte del ciclo')
})

test('accesorios: cada agente real tiene el suyo y María, la corona', () => {
  assert.equal(ACCESORIOS['trabajadores:maria'], 'corona')
  for (const id of ['trabajadores:opera', 'trabajadores:canillita', 'up:noruega', 'pdg:prospector']) assert.ok(ACCESORIOS[id], id)
})

test('luz del día según la hora de Buenos Aires', () => {
  const mediodia = luzDelDia(Date.parse('2026-11-11T16:00:00Z')) // 13 h en Buenos Aires
  assert.equal(mediodia.fase, 'dia')
  assert.ok(mediodia.luz > 0.99 && mediodia.sol.y > 30)
  const noche = luzDelDia(Date.parse('2026-11-12T05:00:00Z')) // 2 h
  assert.equal(noche.fase, 'noche')
  assert.ok(noche.noche > 0.99)
  assert.equal(luzDelDia(Date.parse('2026-11-11T22:10:00Z')).fase, 'atardecer') // 19:10 h
  assert.equal(luzDelDia(Date.parse('2026-11-11T09:40:00Z')).fase, 'amanecer') // 6:40 h
  const maniana = luzDelDia(Date.parse('2026-11-11T12:00:00Z')).sol.x
  const tarde = luzDelDia(Date.parse('2026-11-11T20:00:00Z')).sol.x
  assert.ok(maniana > tarde, 'el sol se mueve de un lado al otro')
})

test('reunión: mesa redonda con 16 sillas en herradura y lugares parados, dentro de la sala y sin pisarse', async () => {
  const { asientosReunion, MAX_ASISTENTES, MESA_REUNION } = await import('./oficinaPlano.mjs')
  const lista = asientosReunion()
  assert.equal(lista.length, MAX_ASISTENTES)
  assert.equal(lista.filter(a => a.pose === 'sentado').length, 16)
  for (const a of lista) assert.ok(dentro({ x: a.x, y: a.y }, ZONAS.reuniones), JSON.stringify(a))
  for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
    assert.ok(Math.hypot(lista[i].x - lista[j].x, lista[i].y - lista[j].y) > 0.6, 'quedan lugares encimados')
  }
  // Nadie del lado de la pantalla (este): así la cámara ve a todos de frente.
  for (const a of lista) assert.ok(a.x < MESA_REUNION.x + 1.7, JSON.stringify(a))
  // Las sillas miran a la mesa.
  for (const a of lista.filter(x => x.pose === 'sentado')) {
    const haciaMesa = Math.atan2(MESA_REUNION.x - a.x, MESA_REUNION.y - a.y)
    assert.ok(Math.abs(a.mira - haciaMesa) < 1e-9)
  }
})

test('reunión: desde cualquier lugar se llega por el pasillo y la puerta del rincón', async () => {
  const { asientosReunion, alPasillo, caminoReunion, PUERTA_REUNION } = await import('./oficinaPlano.mjs')
  const todos = [...lugares('trabajadores', REALES), ...lugares('pdg', ['a', 'b', 'c', 'd', 'e']), ...lugares('up', ['a', 'b', 'c', 'd', 'e', 'f', 'g'])]
  for (const l of todos) for (const a of asientosReunion()) {
    const c = caminoReunion(alPasillo(l), a)
    assert.deepEqual(c[0], l.sentado)
    assert.deepEqual(c.at(-1), { x: a.x, y: a.y })
    const puerta = c.findIndex(p => p.x === PUERTA_REUNION.x && p.y === 12.4)
    assert.ok(puerta > 0, 'entra por la puerta')
    // Hasta la puerta, por pasillos (tramos rectos); adentro rodea la mesa.
    for (let i = 1; i <= puerta; i++) assert.ok(c[i].x === c[i - 1].x || c[i].y === c[i - 1].y)
    for (const p of c) assert.ok(enPiso(p))
  }
})

test('reunión: el que estaba caminando vuelve al pasillo por su mismo camino', async () => {
  const { haciaPasillo } = await import('./oficinaPlano.mjs')
  const c = camino(oficinasFondo()[2], DESCANSOS[1])
  const l = largo(c)
  const alSalir = haciaPasillo(c, 1)
  assert.equal(alSalir.at(-1).y, PASILLO, 'recién salido: sigue hasta el pasillo')
  const casiLlegando = haciaPasillo(c, l - 0.5)
  assert.equal(casiLlegando.at(-1).y, PASILLO, 'casi en el descanso: vuelve al pasillo')
  assert.ok(largo(casiLlegando) < l / 2)
})

test('turnos: van a la espera, pasan a la oficina de Daniela y vuelven a su lugar, por tramos rectos', async () => {
  const { asientosEspera, caminoEspera, caminoTurno, caminoVueltaTurno, alPasillo, VISITA, DIRECCION } = await import('./oficinaPlano.mjs')
  const todos = [...lugares('trabajadores', REALES), ...lugares('pdg', ['a', 'b', 'c', 'd', 'e']), ...lugares('up', ['a', 'b', 'c', 'd', 'e', 'f', 'g'])]
  const recto = c => { for (let i = 1; i < c.length; i++) assert.ok(c[i].x === c[i - 1].x || c[i].y === c[i - 1].y, JSON.stringify([c[i - 1], c[i]])) }
  for (const l of todos) for (const a of asientosEspera()) {
    const ida = caminoEspera(alPasillo(l), a)
    recto(ida)
    assert.deepEqual(ida.at(-1), { x: a.x, y: a.y })
    for (const p of ida) assert.ok(enPiso(p))
  }
  for (const a of asientosEspera()) {
    const c = caminoTurno(a)
    recto(c)
    assert.deepEqual(c.at(-1), { x: VISITA.x, y: VISITA.y })
    assert.ok(c.some(p => p.x === DIRECCION.puerta.x), 'entra por la puerta')
  }
  const vuelta = caminoVueltaTurno(todos[0])
  recto(vuelta)
  assert.deepEqual(vuelta.at(-1), todos[0].sentado)
})

test('estilos: cada oficina real tiene alfombra, pared y cuadros que existen', async () => {
  const { ESTILOS, estiloDe } = await import('./oficinaPlano.mjs')
  const tipos = ['grafico', 'mapa', 'tablero', 'calendario', 'sobre', 'notas', 'diario', 'mascaras', 'entrada', 'maletin', 'busqueda', 'brujula', 'presentacion', 'escudo', 'documento', 'megafono']
  const ids = [...new Set(lugares('trabajadores', REALES).map(l => l.oficina.id))]
  for (const id of ids) {
    assert.ok(ESTILOS[id], `falta el estilo de ${id}`)
    const e = estiloDe(id)
    assert.ok(['rayas', 'cuadros', 'puntos', 'rombos', 'borde'].includes(e.alfombra.patron))
    for (const c of e.cuadros) assert.ok(tipos.includes(c), c)
  }
  assert.ok(estiloDe('otra').cuadros.length, 'una oficina nueva tiene un estilo por defecto')
})
