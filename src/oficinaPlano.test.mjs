import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PISO, ZONAS, PASILLO, VX, X0, EJECUTIVO, OFICINAS, DIVISOR, alturaPiso, oficinasTrabajadores, oficinaMaria, GRUPOS_TRABAJADORES,
  mesaUp, mesaPdg, mesaAdmin, mesaSistemas, CUADROS_PDG, lugares, DESCANSOS, PUFS, rutinas, camino, alPasillo, largo, puntoEn, momentoRutina,
  VELOCIDAD, TIEMPOS, variante, agujas, CICLO_REFERENCIA, ACCESORIOS, luzDelDia, asientosReunion, caminoReunion, haciaPasillo,
  MESA_REUNION, PUERTA_REUNION, MAX_ASISTENTES, DIRECCION, DANIELA, VISITA, asientosEspera, caminoEspera, caminoTurno,
  caminoVueltaTurno, ESTILOS, estiloDe,
} from './oficinaPlano.mjs'

const REALES = ['tareas_estancadas', 'opera', 'canillita', 'agenda_valentina', 'scraper_empleo', 'maria', 'google_sync', 'monitor_sitios', 'buscador_eventos']
const ADMIN = ['search_console', 'resumen_diario', 'agenda_dulce', 'historial_up', 'limpieza']
const todos = () => [...lugares('trabajadores', REALES), ...lugares('up', ['a', 'b', 'c', 'd', 'e', 'f', 'g']), ...lugares('pdg', ['a', 'b', 'c', 'd', 'e']), ...lugares('admin', ADMIN)]
const enPiso = p => p.x > 0 && p.x < PISO.ancho && p.y > 0 && p.y < PISO.fondo
const dentro = (p, z) => p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1
const recto = (c, hasta = c.length - 1) => { for (let i = 1; i <= hasta; i++) assert.ok(c[i].x === c[i - 1].x || c[i].y === c[i - 1].y, JSON.stringify([c[i - 1], c[i]])) }

test('jerarquía: de la entrada al fondo, Administración, mampara, tablones, oficinas y la fila ejecutiva', () => {
  const admin = mesaAdmin(5).mesa, up = mesaUp(7).mesa, pdg = mesaPdg(5).mesa
  const of = oficinasTrabajadores(REALES).filter(l => !l.jefa)
  assert.ok(admin.y0 > DIVISOR.y && up.y1 < DIVISOR.y && pdg.y1 < DIVISOR.y, 'la mampara separa Administración de los tablones')
  assert.ok(up.y0 > PASILLO && pdg.y0 > PASILLO, 'los tablones están adelante del pasillo principal')
  for (const l of of) assert.ok(l.y1 < PASILLO && l.y0 > EJECUTIVO.y1, 'las oficinas están entre la fila ejecutiva y el pasillo')
  const maria = oficinaMaria()
  assert.ok(maria.y1 <= EJECUTIVO.y1 && DIRECCION.y1 <= EJECUTIVO.y1, 'María y Daniela, al fondo')
  assert.equal(alturaPiso(DANIELA.sentado.x, DANIELA.sentado.y), EJECUTIVO.tarima, 'sobre la tarima')
  assert.equal(alturaPiso(20, 17), 0)
})

test('las oficinas de María y Daniela son las más grandes; la de Daniela, la mayor de todas', () => {
  const area = o => (o.x1 - o.x0) * (o.y1 - o.y0)
  const comunes = oficinasTrabajadores(REALES).filter(l => !l.jefa).map(l => area(l.oficina))
  const maria = area(oficinaMaria().oficina)
  const daniela = area(DIRECCION)
  assert.ok(maria > Math.max(...comunes))
  assert.ok(daniela > maria)
})

test('trabajadores: los que hacen cosas parecidas comparten oficina, sin pisarse, y María va a la suya', () => {
  const l = Object.fromEntries(REALES.map((c, i) => [c, oficinasTrabajadores(REALES)[i]]))
  assert.equal(l.monitor_sitios.oficina.id, l.tareas_estancadas.oficina.id)
  assert.equal(l.google_sync.oficina.id, l.agenda_valentina.oficina.id)
  assert.equal(l.canillita.oficina.id, l.opera.oficina.id)
  assert.equal(l.canillita.oficina.id, l.buscador_eventos.oficina.id)
  assert.equal(l.maria.oficina.id, 'maria')
  assert.ok(l.maria.jefa)
  const ofs = [...new Map(REALES.filter(c => c !== 'maria').map(c => [l[c].oficina.id, l[c].oficina])).values()].sort((a, b) => a.x0 - b.x0)
  assert.equal(ofs.length, 4)
  assert.ok(Math.abs(ofs[0].x0 - OFICINAS.x0) < 1e-9 && Math.abs(ofs.at(-1).x1 - OFICINAS.x1) < 1e-9)
  for (let i = 1; i < ofs.length; i++) assert.ok(Math.abs(ofs[i].x0 - ofs[i - 1].x1) < 1e-9)
  for (const o of ofs) {
    const suyos = REALES.filter(c => l[c].oficina.id === o.id).map(c => l[c]).sort((a, b) => a.escritorio.x - b.escritorio.x)
    for (const s of suyos) assert.ok(s.escritorio.x - 0.82 > o.x0 && s.escritorio.x + 0.82 < o.puerta.x - 0.5, o.id)
    // Sin pisarse: o están en columnas distintas, o enfrentados (misma columna, uno mirando al otro).
    for (let i = 0; i < suyos.length; i++) for (let j = i + 1; j < suyos.length; j++) {
      const a = suyos[i], b = suyos[j]
      const enfrentados = Math.abs(a.escritorio.x - b.escritorio.x) < 1e-9 && Math.abs(a.escritorio.y - b.escritorio.y) > 0.83 && Math.abs(Math.abs(a.mira - b.mira) - Math.PI) < 1e-9
      assert.ok(Math.abs(a.escritorio.x - b.escritorio.x) > 2.1 || enfrentados, o.id)
    }
    // En las compartidas hay al menos un par enfrentado; las sillas quedan dentro de la oficina.
    if (suyos.length > 1) assert.ok(suyos.some(x => x.mira === Math.PI) && suyos.some(x => x.mira === 0), o.id)
    for (const x of suyos) assert.ok(x.sentado.y - 0.3 > o.y0 && x.sentado.y + 0.3 < o.y1 - 0.4, o.id)
  }
  const nuevo = oficinasTrabajadores(['otro', 'canillita'])
  assert.notEqual(nuevo[0].oficina.id, nuevo[1].oficina.id)
  assert.ok(GRUPOS_TRABAJADORES.length >= 4)
})

test('tablones: UP, PDG y Administración con las PC enfrentadas y la cabecera, dentro de su zona', () => {
  for (const [mesaDe, n, zona] of [[mesaUp, 7, ZONAS.up], [mesaPdg, 5, ZONAS.pdg], [mesaAdmin, 5, ZONAS.admin], [mesaSistemas, 3, ZONAS.sistemas]]) {
    const { mesa, asientos } = mesaDe(n)
    assert.equal(asientos.length, n)
    assert.equal(asientos[0].sentado.x, asientos[1].sentado.x, 'el primer par queda enfrentado')
    assert.ok(asientos.at(-1).cabecera)
    for (const a of asientos) {
      assert.ok(dentro(a.sentado, zona), JSON.stringify(a.sentado))
      const pc = { x: a.sentado.x + Math.sin(a.mira) * 1.05, y: a.sentado.y + Math.cos(a.mira) * 1.05 }
      assert.ok(pc.x >= mesa.x0 && pc.x <= mesa.x1 && pc.y >= mesa.y0 && pc.y <= mesa.y1, 'la PC queda sobre la mesa')
    }
  }
  assert.ok(mesaUp(7).mesa.x1 + 1.5 < mesaPdg(5).mesa.x0, 'los tablones no se tocan')
  assert.ok(mesaUp(7).mesa.x1 + 1.5 < mesaSistemas(3).mesa.x0 && mesaSistemas(3).asientos.at(-1).sentado.x + 0.3 < DIVISOR.hueco[0], 'Sistemas entre UP y el paso de la mampara')
  assert.equal(CUADROS_PDG.length, 5)
})

test('descansos: en su sala común, y los de ping pong juegan juntos', () => {
  for (const d of DESCANSOS) assert.ok(dentro(d, ZONAS[d.zona]), d.id)
  const [p1, p2] = DESCANSOS.filter(d => d.objeto === 'paleta')
  assert.equal(p1.tanda, p2.tanda)
  for (const p of PUFS) assert.ok(dentro(p, ZONAS.ocio))
  for (const d of DESCANSOS) assert.ok(d.x < VX, 'las salas comunes están a la izquierda del pasillo vertical')
})

test('caminos: de cada lugar a cada descanso, por pasillos (tramos rectos) y sin salir del piso', () => {
  for (const l of todos()) for (const d of DESCANSOS) {
    const c = camino(l, d)
    assert.deepEqual(c[0], l.sentado)
    assert.deepEqual(c.at(-1), { x: d.x, y: d.y })
    assert.ok(c.some(p => p.x === VX && p.y === PASILLO), 'pasa por el cruce de los pasillos')
    recto(c)
    for (const p of c) assert.ok(enPiso(p), JSON.stringify(p))
  }
})

test('las oficinas se salen por la puerta; Administración por el paso de la mampara', () => {
  for (const l of oficinasTrabajadores(REALES)) assert.ok(alPasillo(l).some(p => p.x === l.puerta.x && p.y === l.puerta.y), l.oficina.id)
  for (const l of mesaAdmin(5).asientos) {
    const c = alPasillo(l)
    const cruza = c.findIndex((p, i) => i > 0 && Math.min(c[i - 1].y, p.y) < DIVISOR.y && Math.max(c[i - 1].y, p.y) > DIVISOR.y)
    assert.ok(cruza > 0)
    assert.ok(c[cruza].x >= DIVISOR.hueco[0] && c[cruza].x <= DIVISOR.hueco[1], 'cruza la mampara por el paso')
  }
})

test('rutinas: libres salen de descanso, pausados duermen, el resto se queda en su lugar', () => {
  const r = rutinas([{ id: 'a', estado: 'libre' }, { id: 'b', estado: 'trabajando' }, { id: 'c', estado: 'pausado' }, { id: 'd', estado: 'error' }])
  assert.equal(r.a.tipo, 'rutina')
  assert.equal(r.b.tipo, 'escritorio')
  assert.equal(r.d.tipo, 'escritorio')
  assert.deepEqual(r.c.puf, PUFS[0])
  const muchos = rutinas(Array.from({ length: DESCANSOS.length + 1 }, (_, i) => ({ id: `x${i}`, estado: 'libre' })))
  assert.equal(muchos[`x${DESCANSOS.length}`].retraso - muchos.x0.retraso, CICLO_REFERENCIA / 2)
  const l = largo(camino(oficinasTrabajadores(REALES)[0], DESCANSOS[0]))
  assert.ok(TIEMPOS.sentado / momentoRutina(0, l).ciclo > 0.55, 'pasan la mayor parte del tiempo en su lugar')
})

test('punto en el camino y momento de la rutina', () => {
  const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]
  assert.equal(largo(pts), 7)
  assert.deepEqual(puntoEn(pts, 5), { x: 3, y: 2, dx: 0, dy: 1 })
  const ida = 7 / VELOCIDAD
  assert.equal(momentoRutina(1, 7).fase, 'sentado')
  assert.equal(momentoRutina(TIEMPOS.sentado + ida / 2, 7).fase, 'yendo')
  assert.equal(momentoRutina(TIEMPOS.sentado + ida + 1, 7).fase, 'descanso')
  assert.equal(momentoRutina(TIEMPOS.sentado + ida + TIEMPOS.descanso + ida / 2, 7).fase, 'volviendo')
})

test('reunión: mesa redonda con un arco de sillas y una fila de pie entre ellas, sin nadie del lado de la pantalla', () => {
  const lista = asientosReunion()
  assert.equal(lista.length, MAX_ASISTENTES)
  assert.equal(lista.filter(a => a.pose === 'sentado').length, 15)
  for (const a of lista) assert.ok(dentro({ x: a.x, y: a.y }, ZONAS.reuniones), JSON.stringify(a))
  for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) assert.ok(Math.hypot(lista[i].x - lista[j].x, lista[i].y - lista[j].y) > 0.6)
  for (const a of lista) assert.ok(a.x < MESA_REUNION.x + 1.6)
})

test('reunión: desde cualquier lugar se llega por los pasillos y la puerta de la sala', () => {
  for (const l of todos()) for (const a of asientosReunion()) {
    const c = caminoReunion(alPasillo(l), a)
    assert.deepEqual(c[0], l.sentado)
    assert.deepEqual(c.at(-1), { x: a.x, y: a.y })
    const puerta = c.findIndex(p => p.x === PUERTA_REUNION.x && p.y === PUERTA_REUNION.y)
    assert.ok(puerta > 0)
    recto(c, puerta)
    for (const p of c) assert.ok(enPiso(p))
  }
})

test('reunión: el que estaba caminando vuelve al pasillo por su mismo camino', () => {
  const c = camino(oficinasTrabajadores(REALES)[2], DESCANSOS[1])
  assert.equal(haciaPasillo(c, 1).at(-1).y, PASILLO)
  assert.equal(haciaPasillo(c, largo(c) - 0.5).at(-1).y, PASILLO)
})

test('turnos: van a la espera, pasan a la oficina de Daniela y vuelven a su lugar', () => {
  for (const l of todos()) for (const a of asientosEspera()) {
    const ida = caminoEspera(alPasillo(l), a)
    recto(ida)
    assert.deepEqual(ida.at(-1), { x: a.x, y: a.y })
    for (const p of ida) assert.ok(enPiso(p))
  }
  for (const a of asientosEspera()) {
    assert.ok(dentro(a, ZONAS.espera))
    const c = caminoTurno(a)
    recto(c)
    assert.deepEqual(c.at(-1), { x: VISITA.x, y: VISITA.y })
    assert.ok(c.some(p => p.x === DIRECCION.puerta.x && p.y === DIRECCION.puerta.y))
  }
  for (const l of todos()) {
    const vuelta = caminoVueltaTurno(l)
    recto(vuelta)
    assert.deepEqual(vuelta.at(-1), l.sentado)
  }
})

test('estilos, accesorios, luz del día y reloj', () => {
  for (const id of ['monitoreo', 'agenda', 'prensa', 'empleo', 'maria']) assert.ok(ESTILOS[id], id)
  assert.ok(estiloDe('otra').cuadros.length)
  assert.equal(ACCESORIOS['trabajadores:maria'], 'corona')
  for (const c of ADMIN) assert.ok(ACCESORIOS[`admin:${c}`], c)
  assert.equal(luzDelDia(Date.parse('2026-11-11T16:00:00Z')).fase, 'dia')
  assert.equal(luzDelDia(Date.parse('2026-11-12T05:00:00Z')).fase, 'noche')
  assert.deepEqual(agujas(Date.parse('2026-11-11T18:30:00Z')), { hora: 105, minuto: 180 })
  assert.deepEqual(variante('up:redactor'), variante('up:redactor'))
  assert.ok(X0 > VX)
})

test('reuniones: cada uno va con su bebida (siempre la misma) y María con su mate; Sistemas tiene accesorios', async () => {
  const { bebidaDe, BEBIDAS } = await import('./oficinaPlano.mjs')
  assert.equal(bebidaDe('trabajadores:maria'), 'mate')
  const ids = [...Object.keys(ACCESORIOS)]
  for (const id of ids) { const b = bebidaDe(id); assert.ok(b === null || BEBIDAS.includes(b)); assert.equal(bebidaDe(id), b) }
  const conBebida = ids.filter(id => bebidaDe(id))
  assert.ok(conBebida.length > ids.length / 2, 'la mayoría lleva algo')
  assert.ok(ids.some(id => bebidaDe(id) === 'mate') && ids.some(id => bebidaDe(id) === 'taza'))
  for (const c of ['mesa_entrada', 'guardian', 'operador']) assert.ok(ACCESORIOS[`sistemas:${c}`])
})

test('reunión en la oficina de Daniela: hasta 5 en su mesa, entran por su puerta', async () => {
  const { asientosOficina, caminoOficina, DANIELA_OFICINA, MAX_OFICINA, MESA_CHICA_DANIELA, variante } = await import('./oficinaPlano.mjs')
  const a = asientosOficina()
  assert.equal(a.length, MAX_OFICINA)
  for (const s of [...a, DANIELA_OFICINA]) {
    assert.ok(Math.abs(Math.hypot(s.x - MESA_CHICA_DANIELA.x, s.y - MESA_CHICA_DANIELA.y) - 1) < 1e-3)
    assert.ok(s.x > DIRECCION.x0 && s.x < DIRECCION.x1 && s.y > DIRECCION.y0 && s.y < DIRECCION.y1)
  }
  for (const l of todos()) {
    const c = caminoOficina(alPasillo(l), a[0])
    assert.deepEqual(c.at(-1), { x: a[0].x, y: a[0].y })
    assert.ok(c.some(p => p.x === DIRECCION.puerta.x && p.y === DIRECCION.puerta.y))
  }
  // Las mujeres con pelo largo o rodete; los varones, corto o con rulos.
  for (const id of ['trabajadores:maria', 'up:noruega', 'sistemas:mesa_entrada']) assert.ok([1, 2].includes(variante(id).pelo), id)
  for (const id of ['up:redactor', 'trabajadores:opera', 'pdg:demo']) assert.ok([0, 3].includes(variante(id).pelo), id)
})
