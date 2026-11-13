// Plano del edificio de la Oficina (lo dibuja screens/Oficina3D.jsx). Medidas en baldosas: x hacia la derecha,
// y hacia adelante (la pared del fondo es y = 0 y la izquierda x = 0; la entrada está adelante).
//
// La oficina tiene jerarquía. De la entrada hacia el fondo:
// - Administración: una mesa con las tareas de apoyo (Search Console, Resumen diario, Agenda dulce, Historial de UP,
//   Limpieza).
// - Una mampara con plantas divide el ambiente.
// - Los dos tablones: UP y PDG comercial (son un mismo sistema), con las PC enfrentadas.
// - Las oficinas de los trabajadores (compartidas por tema) y, frente a la puerta de Daniela, un living de espera.
// - Al fondo, sobre una tarima, las dos más importantes: la de María y la de Daniela (con su balcón).
// A la izquierda, todo el ocio junto (del fondo hacia adelante: descanso y ping pong, cafetería y cocina-comedor)
// y, separada del ocio y cerca de la entrada, la sala de reuniones.
//
// Qué hace cada uno sale de su estado real (ver oficina.mjs): trabajando o con un problema está en su lugar;
// libre trabaja y cada tanto sale a la cafetería, el comedor, el ocio o el ping pong y vuelve; pausado duerme en un puf.

import { generoDe } from '../supabase/functions/_shared/oficina.mjs'

export const PISO = { ancho: 45, fondo: 26.5, pared: 2.6 }
export const VX = 13.75 // pasillo vertical: separa la columna de salas comunes del resto
export const X0 = 14.5 // donde empieza el área de trabajo
export const EJECUTIVO = { y0: 0, y1: 7, tarima: 0.12 } // la fila de María y Daniela, sobre una tarima
export const CORREDOR_EJECUTIVO = 7.75 // frente a las oficinas de María y Daniela
export const OFICINAS = { x0: X0, x1: 39, y0: 8.5, y1: 13 } // la fila de oficinas de los trabajadores
export const PASILLO = 13.75 // el pasillo principal: entre las oficinas y los tablones
export const DIVISOR = { y: 20.75, x0: X0, x1: 45, hueco: [28.3, 30.3] } // la mampara (con un paso en el medio)
const PASO_DIVISOR = 29.3
const CARRIL_ADMIN = 21.5 // por donde se sale de la mesa de Administración hacia el paso de la mampara
export const ENTRADA = { x: 29.3, y: PISO.fondo }

// Altura del piso en un punto: la fila ejecutiva está sobre la tarima.
// El balcón de Daniela (afuera del piso, x > PISO.ancho) está al nivel del suelo, un escalón abajo de la tarima.
export function alturaPiso(x, y) { return x >= X0 && x <= PISO.ancho && y <= EJECUTIVO.y1 ? EJECUTIVO.tarima : 0 }

export const ZONAS = {
  reuniones: { x0: 0.5, y0: 19.5, x1: 10.5, y1: 26.5, nombre: 'Sala de reuniones' },
  archivo: { x0: 10.9, y0: 19.6, x1: 13.3, y1: 24.6, nombre: 'Archivo' },
  cafeteria: { x0: 0.5, y0: 8, x1: 13, y1: 13, nombre: 'Cafetería' },
  comedor: { x0: 0.5, y0: 13.5, x1: 13, y1: 19, nombre: 'Cocina y comedor' },
  ocio: { x0: 0.5, y0: 0.5, x1: 8, y1: 7, nombre: 'Ocio' },
  ping: { x0: 7.5, y0: 0.5, x1: 13.3, y1: 7, nombre: 'Ping pong' },
  up: { x0: X0, y0: 14.5, x1: 23.5, y1: 20.5, nombre: 'UP · mesa de trabajo' },
  sistemas: { x0: 23.7, y0: 14.5, x1: 29, y1: 20.5, nombre: 'Sistemas' },
  pdg: { x0: 29.6, y0: 14.5, x1: 45, y1: 20.5, nombre: 'PDG comercial' },
  admin: { x0: X0, y0: 21, x1: 45, y1: PISO.fondo, nombre: 'Administración' },
  espera: { x0: 39.3, y0: 8.5, x1: 45, y1: 13, nombre: 'Living' },
  servidores: { x0: 37.2, y0: 21.4, x1: 44.8, y1: 26.3, nombre: 'Sala de servidores' },
}

// ---------- Oficinas ----------
// Oficinas de los trabajadores: los que hacen cosas parecidas comparten oficina; los que no están en ningún grupo
// tienen la suya. María, la jefa de los agentes, no va acá: tiene su oficina en la fila ejecutiva.
export const GRUPOS_TRABAJADORES = [
  { id: 'monitoreo', nombre: 'Monitoreo', claves: ['monitor_sitios', 'tareas_estancadas'] },
  { id: 'agenda', nombre: 'Agenda', claves: ['google_sync', 'agenda_valentina'] },
  { id: 'prensa', nombre: 'Prensa y eventos', claves: ['canillita', 'buscador_eventos', 'opera'] },
  { id: 'empleo', nombre: 'Empleo', claves: ['scraper_empleo'] },
]
export const JEFA = 'maria'
const PASO_ESCRITORIO = 2.4
const ancho = l => l.filter((p, i) => i === 0 || p.x !== l[i - 1].x || p.y !== l[i - 1].y)

// La oficina de María: la de la izquierda de la fila ejecutiva, grande, con zona de estar (`jefa: true`).
export function oficinaMaria() {
  const x0 = X0, x1 = 28.5, y0 = EJECUTIVO.y0, y1 = EJECUTIVO.y1
  const puerta = { x: x0 + 1.0, y: y1 }
  const oficina = { id: JEFA, nombre: 'Dirección', jefa: true, x0, x1, y0, y1, puerta, puestos: 1 }
  const escritorio = { x: (x0 + x1) / 2 - 0.6, y: 3.0 }
  const sentado = { x: escritorio.x, y: 2.1 }
  return { tipo: 'oficina', oficina, jefa: true, x0, x1, y0, y1, escritorio, sentado, mira: 0, puerta,
    salida: ancho([sentado, { x: puerta.x, y: sentado.y }, puerta, { x: puerta.x, y: CORREDOR_EJECUTIVO }]) }
}

// claves: las de los trabajadores en el orden del plantel. Devuelve el lugar de cada uno, en ese mismo orden.
export function oficinasTrabajadores(claves) {
  const quedan = new Set(claves)
  const grupos = []
  for (const g of GRUPOS_TRABAJADORES) {
    const miembros = g.claves.filter(c => quedan.has(c))
    if (miembros.length) { grupos.push({ id: g.id, nombre: g.nombre, miembros }); miembros.forEach(c => quedan.delete(c)) }
  }
  const conJefa = quedan.delete(JEFA)
  for (const c of claves) if (quedan.has(c)) grupos.push({ id: c, nombre: null, miembros: [c] })
  const base = g => Math.max(3.6, g.miembros.length * PASO_ESCRITORIO + 1.2)
  const escala = (OFICINAS.x1 - OFICINAS.x0) / Math.max(grupos.reduce((s, g) => s + base(g), 0), 1)
  const { y0, y1 } = OFICINAS
  const porClave = {}
  let x = OFICINAS.x0
  for (const g of grupos) {
    const w = base(g) * escala
    const x0 = x, x1 = x0 + w
    x = x1
    const puerta = { x: x1 - 0.75, y: y1 }
    const oficina = { id: g.id, nombre: g.nombre, jefa: false, x0, x1, y0, y1, puerta, puestos: g.miembros.length }
    // Los escritorios van enfrentados de a pares (uno mira a la puerta y el otro a la pared del fondo); si son impares,
    // el último queda solo. Delante de los escritorios queda el paso hasta la puerta.
    const columnas = Math.ceil(g.miembros.length / 2)
    const paso = (w - 1.6) / columnas
    const pasoFrente = y1 - 0.6
    // Un sofá contra la pared derecha, mirando hacia adentro: de dos plazas si entra, si no de una.
    const libre = w - 0.2 - paso * (columnas - 0.5) - 0.82
    const plazas = libre >= 2.2 ? 2 : 1
    const largoSofa = plazas === 2 ? 1.6 : 0.9
    oficina.sofa = { x0: x1 - 0.9, x1: x1 - 0.05, y0: y0 + 0.95, y1: y0 + 0.95 + largoSofa, plazas }
    g.miembros.forEach((clave, j) => {
      const enfrentado = j % 2 === 1
      const cx = x0 + 0.2 + paso * (Math.floor(j / 2) + 0.5)
      const escritorio = { x: cx, y: enfrentado ? y0 + 2.39 : y0 + 1.55 }
      const sentado = { x: cx, y: enfrentado ? y0 + 3.17 : y0 + 0.77 }
      // Sale por el costado de su escritorio, pasa por delante de los escritorios y sale por la puerta al pasillo.
      const salida = ancho([sentado, { x: cx + paso / 2, y: sentado.y }, { x: cx + paso / 2, y: pasoFrente }, { x: puerta.x, y: pasoFrente }, puerta, { x: puerta.x, y: PASILLO }])
      porClave[clave] = { tipo: 'oficina', oficina, jefa: false, x0, x1, y0, y1, escritorio, sentado, mira: enfrentado ? Math.PI : 0, puerta, salida }
    })
  }
  if (conJefa) porClave[JEFA] = oficinaMaria()
  return claves.map(c => porClave[c])
}

// ---------- Tablones ----------
// Un tablón con las PC enfrentadas de a pares y el último en la cabecera. x0: donde empieza; centro: su y.
// hacia: 'pasillo' (los tablones de UP y PDG, que salen al pasillo principal) o 'admin' (la mesa de Administración,
// que sale por el paso de la mampara).
function tablon(n, x0, centro, hacia) {
  const lados = Math.max(0, n - 1)
  const cols = Math.max(1, Math.ceil(lados / 2))
  const mesa = { x0, x1: x0 + cols * 1.9 + 0.6, y0: centro - 0.8, y1: centro + 0.8 }
  const finSalida = hacia === 'admin'
    ? x => [{ x, y: CARRIL_ADMIN }, { x: PASO_DIVISOR, y: CARRIL_ADMIN }, { x: PASO_DIVISOR, y: PASILLO }]
    : x => [{ x, y: PASILLO }]
  const asientos = []
  for (let i = 0; i < lados; i++) {
    const x = mesa.x0 + 1.25 + Math.floor(i / 2) * 1.9
    if (i % 2 === 0) {
      const sentado = { x, y: mesa.y0 - 0.75 }
      asientos.push({ tipo: 'mesa', sentado, mira: 0, salida: ancho([sentado, ...finSalida(x)]) })
    } else {
      const sentado = { x, y: mesa.y1 + 0.75 }
      const atras = mesa.y1 + 1.5, lado = mesa.x0 - 0.8
      asientos.push({ tipo: 'mesa', sentado, mira: Math.PI, salida: ancho([sentado, { x, y: atras }, { x: lado, y: atras }, ...finSalida(lado)]) })
    }
  }
  if (n > 0) {
    const sentado = { x: mesa.x1 + 0.75, y: centro }
    asientos.push({ tipo: 'mesa', sentado, mira: -Math.PI / 2, cabecera: true, salida: ancho([sentado, ...finSalida(sentado.x)]) })
  }
  return { mesa, asientos }
}
export function mesaUp(n) { return tablon(n, 16, 17.4, 'pasillo') }
export function mesaPdg(n) { return tablon(n, 31.2, 17.4, 'pasillo') }
export function mesaAdmin(n) { return tablon(n, 17.5, 23.6, 'admin') }
// Sistemas: su mesa, del otro lado de la entrada (también sale por el paso de la mampara).
// Sistemas: su tablón, con el resto de los que trabajan en mesa (entre UP y PDG).
export function mesaSistemas(n) { return tablon(n, 24.4, 17.4, 'pasillo') }
// La sala de servidores, vidriada, junto a Administración: dos filas de racks con un pasillo en el medio y la
// puerta del lado de la entrada.
export const SALA_SERVIDORES = {
  x0: 37.2, y0: 21.4, x1: 44.8, y1: 26.3,
  puerta: { y0: 23.35, y1: 24.35 },
  racks: [0, 1, 2, 3, 4, 5].flatMap(k => [
    { x0: 38.7 + k * 0.95, x1: 39.5 + k * 0.95, y0: 21.75, y1: 22.6 },
    { x0: 38.7 + k * 0.95, x1: 39.5 + k * 0.95, y0: 25.1, y1: 25.95 },
  ]),
  aire: { x0: 37.4, x1: 38.2, y0: 25.2, y1: 26.1 },
}
// Al lado del tablón de PDG: un rincón de trabajo en equipo (mesa alta con banquetas, pizarra con ruedas y macetones).
export const RINCON_TABLONES = {
  mesa: { x: 40.6, y: 17.5, radio: 0.55 },
  banquetas: [[40.6, 16.65], [41.45, 17.5], [40.6, 18.35], [39.75, 17.5]],
  pizarra: { x0: 39.2, x1: 42.0, y: 19.9 },
  macetones: [[38.2, 15.7], [43.4, 16.0]],
}
// Zona de descanso: dos máquinas expendedoras contra la pared del fondo (chocolates y café).
export const EXPENDEDORAS = [
  { tipo: 'chocolates', x0: 5.75, x1: 6.65, y0: 0.1, y1: 0.85 },
  { tipo: 'cafe', x0: 6.8, x1: 7.7, y0: 0.1, y1: 0.85 },
]
// Un rincón de descanso entre la entrada y la sala de servidores: dos sillones, mesa ratona, alfombra y macetones.
export const RINCON_ENTRADA = {
  sillones: [{ x: 32.2, y: 24.1, mira: Math.PI / 2 }, { x: 34.6, y: 24.1, mira: -Math.PI / 2 }],
  mesa: { x: 33.4, y: 24.1, radio: 0.4 },
}
// Los macetones grandes del rincón de la entrada.
export const MACETONES = [[31.5, 25.9], [35.3, 25.9], [31.5, 22.3]]
// Sobre la pared de PDG (la mampara de atrás de su tablón): el sistema comercial de punta a punta.
export const CUADROS_PDG = ['mapa', 'presentacion', 'escudo', 'documento', 'megafono']

// Lugar de trabajo de cada agente de un equipo, en el orden en que llegan. claves: las de sus agentes.
export function lugares(equipo, claves) {
  if (equipo === 'trabajadores') return oficinasTrabajadores(claves)
  if (equipo === 'pdg') return mesaPdg(claves.length).asientos
  if (equipo === 'admin') return mesaAdmin(claves.length).asientos
  if (equipo === 'sistemas') return mesaSistemas(claves.length).asientos
  return mesaUp(claves.length).asientos
}

// ---------- Descansos ----------
// Lugares de descanso en la columna de salas comunes (tanda: segundos que se corre la rutina de quien va ahí, para
// repartir las salidas). pose: cómo queda ahí; objeto: lo que tiene en la mano; mira: hacia dónde (0 = hacia
// adelante); altura: del asiento. carril: por qué fila se entra desde el pasillo vertical.
const d = (id, x, y, pose, mira, extra = {}) => {
  const s = { id, x, y, pose, mira, objeto: null, altura: 0, tanda: 0, ...extra }
  const carril = extra.carril ?? y
  return { ...s, llegada: ancho([{ x: VX, y: carril }, { x, y: carril }, { x, y }]) }
}
export const DESCANSOS = [
  d('barra-1', 2.0, 9.9, 'sentado', Math.PI, { objeto: 'taza', altura: 0.22, zona: 'cafeteria', tanda: 0, carril: 11.0 }),
  d('comedor-1', 2.15, 14.85, 'sentado', 0, { zona: 'comedor', tanda: 14, carril: 14.1 }),
  d('sillon-1', 1.75, 2.05, 'sentado', 0, { zona: 'ocio', tanda: 28, carril: 2.6 }),
  d('ping-1', 8.0, 3.8, 'parado', Math.PI / 2, { objeto: 'paleta', zona: 'ping', tanda: 42, carril: 5.7 }),
  d('ping-2', 13.0, 3.8, 'parado', -Math.PI / 2, { objeto: 'paleta', zona: 'ping', tanda: 42 }),
  d('barra-2', 3.6, 9.9, 'sentado', Math.PI, { objeto: 'taza', altura: 0.22, zona: 'cafeteria', tanda: 56, carril: 11.0 }),
  d('comedor-2', 3.45, 14.85, 'sentado', 0, { zona: 'comedor', tanda: 70, carril: 14.1 }),
  d('sillon-2', 3.1, 2.05, 'sentado', 0, { objeto: 'taza', zona: 'ocio', tanda: 84, carril: 2.6 }),
  d('cafe-1', 9.8, 11.9, 'parado', Math.PI / 2, { objeto: 'taza', zona: 'cafeteria', tanda: 98, carril: 11.0 }),
  d('comedor-3', 6.45, 14.85, 'sentado', 0, { zona: 'comedor', tanda: 112, carril: 14.1 }),
  d('cafe-2', 11.2, 11.9, 'parado', -Math.PI / 2, { objeto: 'taza', zona: 'cafeteria', tanda: 126 }),
  d('sillon-3', 4.45, 2.05, 'sentado', 0, { zona: 'ocio', tanda: 140, carril: 2.6 }),
  d('barra-3', 5.2, 9.9, 'sentado', Math.PI, { altura: 0.22, zona: 'cafeteria', tanda: 154, carril: 11.0 }),
  d('comedor-4', 7.75, 14.85, 'sentado', 0, { zona: 'comedor', tanda: 168, carril: 14.1 }),
]
// La cocina: mesada con anafe y pileta y la heladera, contra el costado del pasillo.
export const COCINA = { x0: 11.8, x1: 12.8, y0: 14.6, y1: 18.6 }
export const PUFS = [{ x: 6.3, y: 5 }, { x: 5.0, y: 6.2 }, { x: 6.9, y: 6.4 }]

// Rutina de cada agente según su estado (ids en el orden del plantel): { [id]: rutina }.
// - rutina: el lugar de descanso y un retraso (s); dos con el mismo lugar salen en medio ciclo distinto.
// - siesta: el puf donde duerme (pausado); si no quedan pufs, su lugar queda vacío.
export const CICLO_REFERENCIA = 200
export function rutinas(agentes) {
  const r = {}
  let libres = 0, dormidos = 0
  for (const a of agentes) {
    if (a.estado === 'libre' || a.estado === 'nuevo') {
      const k = libres++
      const descanso = DESCANSOS[k % DESCANSOS.length]
      const vuelta = Math.floor(k / DESCANSOS.length)
      r[a.id] = { tipo: 'rutina', descanso, retraso: descanso.tanda + (vuelta % 2) * (CICLO_REFERENCIA / 2) }
    } else if (a.estado === 'pausado') {
      r[a.id] = { tipo: 'siesta', puf: PUFS[dormidos++] ?? null }
    } else {
      r[a.id] = { tipo: 'escritorio' }
    }
  }
  return r
}

// Camino de su lugar al descanso: sale de su lugar hasta el pasillo principal (los de la fila ejecutiva, por su
// corredor y el pasillo vertical), va hasta el pasillo vertical y entra a la sala común por su carril.
export function camino(lugar, descanso) {
  return ancho([...alPasillo(lugar), { x: VX, y: PASILLO }, ...descanso.llegada])
}

// De su lugar hasta el pasillo principal (el principio de cualquier camino).
export function alPasillo(lugar) {
  const pts = [...lugar.salida]
  const ultimo = pts.at(-1)
  if (ultimo.y === CORREDOR_EJECUTIVO) pts.push({ x: VX, y: CORREDOR_EJECUTIVO }, { x: VX, y: PASILLO })
  return ancho(pts)
}

export function largo(pts) {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return l
}

// Punto a distancia d del inicio, con la dirección del tramo (para que el agente mire hacia donde camina).
export function puntoEn(pts, d) {
  let resto = Math.max(0, d)
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y
    const tramo = Math.hypot(dx, dy)
    if (resto <= tramo || i === pts.length - 1) {
      const f = tramo ? Math.min(1, resto / tramo) : 1
      return { x: pts[i - 1].x + dx * f, y: pts[i - 1].y + dy * f, dx: dx / (tramo || 1), dy: dy / (tramo || 1) }
    }
    resto -= tramo
  }
  return { ...pts[0], dx: 0, dy: 1 }
}

// En qué parte de su rutina está a los t segundos: sentado, yendo, en su descanso o volviendo.
export const VELOCIDAD = 1.7 // baldosas por segundo
// Pasan la mayor parte del tiempo en su lugar: unos dos minutos y medio trabajando y después un descanso corto.
// Las salidas están repartidas (tanda de cada descanso), así casi siempre hay alguien caminando pero las oficinas no
// quedan vacías.
export const TIEMPOS = { sentado: 150, descanso: 24 }
export function momentoRutina(t, largoCamino) {
  const caminar = largoCamino / VELOCIDAD
  const ciclo = TIEMPOS.sentado + caminar * 2 + TIEMPOS.descanso
  const s = ((t % ciclo) + ciclo) % ciclo
  if (s < TIEMPOS.sentado) return { fase: 'sentado', d: 0, ciclo }
  if (s < TIEMPOS.sentado + caminar) return { fase: 'yendo', d: (s - TIEMPOS.sentado) * VELOCIDAD, ciclo }
  if (s < TIEMPOS.sentado + caminar + TIEMPOS.descanso) return { fase: 'descanso', d: largoCamino, ciclo }
  return { fase: 'volviendo', d: largoCamino - (s - TIEMPOS.sentado - caminar - TIEMPOS.descanso) * VELOCIDAD, ciclo }
}

// Variante del muñequito (pelo, color de pelo y de piel) fija por agente: siempre se ve igual.
const hashDe = id => {
  let h = 2166136261
  for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h
}
// Cómo se ve cada uno: las mujeres con pelo largo o rodete; los varones, corto o con rulos.
export function variante(id) {
  const h = hashDe(id)
  const pelo = generoDe(id) === 'f' ? [2, 1][h % 2] : [0, 3][h % 2]
  return { pelo, colorPelo: (h >>> 3) % 5, piel: (h >>> 7) % 3 }
}

// Lo que cada uno se lleva a las reuniones: mate, café, una botella de agua o nada (siempre lo mismo para cada
// agente). María, la jefa de los trabajadores, va con su mate.
export const BEBIDAS = ['mate', 'taza', 'botella']
export function bebidaDe(id) {
  if (id === 'trabajadores:maria') return 'mate'
  const k = (hashDe(id) >>> 11) % 5
  return k < 2 ? 'mate' : k === 2 ? 'taza' : k === 3 ? 'botella' : null
}

// Hora de Buenos Aires para el reloj de la pared: ángulos de las agujas en grados.
export function agujas(ahoraMs) {
  const f = new Date(ahoraMs - 3 * 3600_000)
  const min = f.getUTCMinutes()
  return { hora: ((f.getUTCHours() % 12) + min / 60) * 30, minuto: min * 6 }
}

// Accesorio propio de cada agente, para reconocerlo sin leer el nombre (lo dibuja oficina3d/personaje.js).
// Un agente que no está acá no lleva nada.
export const ACCESORIOS = {
  'trabajadores:maria': 'corona',
  'trabajadores:opera': 'galera',
  'trabajadores:canillita': 'gorra-canillita',
  'trabajadores:google_sync': 'auriculares',
  'trabajadores:buscador_eventos': 'gorro-fiesta',
  'trabajadores:monitor_sitios': 'visera',
  'trabajadores:scraper_empleo': 'corbata',
  'trabajadores:tareas_estancadas': 'lentes',
  'trabajadores:agenda_valentina': 'vincha',
  'up:planificador': 'monio',
  'up:investigador': 'sombrero',
  'up:redactor': 'boina',
  'up:revisor': 'lentes',
  'up:disenador': 'vincha',
  'up:publicador': 'visera',
  'up:noruega': 'gorro-lana',
  'pdg:prospector': 'safari',
  'pdg:demo': 'headset',
  'pdg:objeciones': 'corbata',
  'pdg:propuesta': 'monio',
  'pdg:marketing': 'lentes-sol',
  'pdg:femina': 'sombrero',
  'admin:search_console': 'lentes',
  'admin:resumen_diario': 'monio',
  'admin:agenda_dulce': 'vincha',
  'admin:historial_up': 'visera',
  'admin:limpieza': 'gorra-canillita',
  'sistemas:mesa_entrada': 'headset',
  'sistemas:guardian': 'lentes-sol',
  'sistemas:operador': 'auriculares',
}

// Luz según la hora de Buenos Aires. luz: 1 de día, 0 de noche (con media hora de transición);
// calido: cuánto tiñe el amanecer o el atardecer; sol: dónde está (sale por la derecha y se pone por la izquierda).
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export const SALE = 6.5
export const SE_PONE = 19.5
export function luzDelDia(ahoraMs) {
  const f = new Date(ahoraMs - 3 * 3600_000)
  const h = f.getUTCHours() + f.getUTCMinutes() / 60
  const luz = suave(SALE - 0.5, SALE + 0.5, h) * (1 - suave(SE_PONE - 0.5, SE_PONE + 0.5, h))
  const calido = Math.max(Math.exp(-(((h - SALE) / 0.9) ** 2)), Math.exp(-(((h - SE_PONE + 0.3) / 1.0) ** 2)))
  const a = Math.min(Math.PI, Math.max(0, ((h - SALE) / (SE_PONE - SALE)) * Math.PI))
  const fase = luz < 0.15 ? 'noche' : calido > 0.45 ? (h < 12 ? 'amanecer' : 'atardecer') : 'dia'
  return { hora: h, luz, noche: 1 - luz, calido, fase, sol: { x: 18 + 42 * Math.cos(a), y: 8 + 30 * Math.sin(a), z: 30 } }
}

// ---------- Reuniones ----------
// La sala de reuniones (adelante a la izquierda, separada del ocio) tiene una mesa redonda grande. Del lado de la pantalla
// (al este, donde está la cámara) no se sienta nadie: las sillas forman un arco del otro lado, de frente a Daniela, y
// detrás, a media distancia entre silla y silla, una segunda fila de pie. Así nadie le tapa la cara a otro.
export const MESA_REUNION = { x: 4.9, y: 23.0, radio: 1.75 }
// El Archivo, al lado de la sala de reuniones: ahí quedan las actas que escribe María. Estanterías contra las paredes y
// la puerta del lado del pasillo.
export const ARCHIVO = {
  x0: 10.9, y0: 19.6, x1: 13.3, y1: 24.6,
  puerta: { y0: 21.6, y1: 22.6 },
  estantes: [{ x0: 10.95, x1: 11.45, y0: 19.7, y1: 24.5 }, { x0: 11.5, x1: 13.2, y0: 19.65, y1: 20.1 }],
}
export const PUERTA_REUNION = { x: ZONAS.reuniones.x1, y: 25.5 }
// El lugar de Daniela en la sala: del lado de la pantalla, justo debajo de la cámara (por eso no sale en la imagen),
// mirando a todos.
export const DANIELA_SALA = { x: MESA_REUNION.x + MESA_REUNION.radio + 0.8, y: MESA_REUNION.y, mira: -Math.PI / 2 }
const RADIO_SILLAS = 2.55
const RADIO_PIE = 3.25
const RADIO_PASO = 2.15 // por donde se camina adentro: entre la mesa y las sillas
const LIBRE_PANTALLA = (75 * Math.PI) / 180 // a cada lado del este no hay sillas
const SENTADOS = 15
export const MAX_ASISTENTES = 24
const enCirculo = (r, ang) => ({ x: Math.round((MESA_REUNION.x + r * Math.cos(ang)) * 1000) / 1000, y: Math.round((MESA_REUNION.y + r * Math.sin(ang)) * 1000) / 1000 })
export function asientosReunion() {
  const lista = []
  const desde = LIBRE_PANTALLA, hasta = 2 * Math.PI - LIBRE_PANTALLA
  const paso = (hasta - desde) / (SENTADOS - 1)
  const lugar = (r, ang, pose) => { const p = enCirculo(r, ang); lista.push({ ...p, ang, mira: Math.atan2(MESA_REUNION.x - p.x, MESA_REUNION.y - p.y), pose }) }
  // Primero se ocupan las sillas del centro del arco (las que mejor se ven) y después las de los costados.
  const orden = Array.from({ length: SENTADOS }, (_, k) => k).sort((a, b) => Math.abs(a - (SENTADOS - 1) / 2) - Math.abs(b - (SENTADOS - 1) / 2) || a - b)
  for (const k of orden) lugar(RADIO_SILLAS, desde + paso * k, 'sentado')
  const parados = MAX_ASISTENTES - SENTADOS
  // De pie, cada uno entre dos sillas (a media distancia), centrados en el arco.
  const inicio = Math.floor((SENTADOS - 1) / 2) - Math.floor(parados / 2) + 0.5
  for (let k = 0; k < parados; k++) lugar(RADIO_PIE, desde + paso * (inicio + k), 'parado')
  return lista
}

// Desde el pasillo principal: sube por el pasillo vertical hasta la puerta, entra, se mete entre la mesa y las
// sillas y va rodeando la mesa hasta su lugar.
export function entradaReunion(a) {
  const pts = [{ x: VX, y: PASILLO }, { x: VX, y: PUERTA_REUNION.y }, { ...PUERTA_REUNION }, { x: PUERTA_REUNION.x - 0.7, y: PUERTA_REUNION.y }]
  const inicio = LIBRE_PANTALLA * 0.5
  pts.push(enCirculo(RADIO_PASO, inicio))
  const pasos = Math.max(1, Math.ceil(Math.abs(a.ang - inicio) / 0.3))
  for (let k = 1; k <= pasos; k++) pts.push(enCirculo(RADIO_PASO, inicio + ((a.ang - inicio) * k) / pasos))
  pts.push({ x: a.x, y: a.y })
  return pts
}

// Desde un punto de un camino (a distancia d) hasta el punto del pasillo del medio más cercano, siguiendo el camino
// (hacia adelante o hacia atrás). Sirve para el que estaba caminando cuando lo llamaron.
export function haciaPasillo(pts, d) {
  const acumulado = [0]
  for (let i = 1; i < pts.length; i++) acumulado.push(acumulado[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const enPasillo = pts.map((p, i) => i).filter(i => pts[i].y === PASILLO)
  const meta = enPasillo.reduce((a, b) => (Math.abs(acumulado[b] - d) < Math.abs(acumulado[a] - d) ? b : a))
  const aqui = puntoEn(pts, d)
  const resto = acumulado[meta] >= d
    ? pts.slice(0, meta + 1).filter((p, i) => acumulado[i] > d)
    : pts.slice(meta).filter((p, i) => acumulado[meta + i] < d).reverse()
  return [{ x: aqui.x, y: aqui.y }, ...resto].filter((p, i, l) => i === 0 || p.x !== l[i - 1].x || p.y !== l[i - 1].y)
}

// Camino a la reunión: desde donde esté (hasta el pasillo principal) hasta la puerta de la sala y a su lugar.
export function caminoReunion(hastaPasillo, asiento) {
  return ancho([...hastaPasillo, ...entradaReunion(asiento)])
}
export const PLAZO_REUNION_S = 120

// ---------- La oficina de Daniela y la sala de espera ----------
// Daniela es la jefa de todos: la oficina más grande del edificio, a la derecha de la fila ejecutiva, con balcón.
// Frente a su puerta, del otro lado del corredor, la sala de espera: ahí esperan su turno los agentes que cita.
export const DIRECCION = { x0: 28.5, x1: PISO.ancho, y0: 0, y1: EJECUTIVO.y1, puerta: { x: 36.5, y: EJECUTIVO.y1 } }
export const DANIELA = { id: 'yo:daniela', nombre: 'Daniela', escritorio: { x: 36.5, y: 2.9 }, sentado: { x: 36.5, y: 2.0 }, mira: 0 }
export const VISITA = { x: 36.5, y: 4.3, mira: Math.PI } // la silla frente a su escritorio
// Roberta, la perra de Daniela: su camita al lado del escritorio. Cuando Daniela camina, la sigue.
// Las mesas de reuniones chicas (redondas, 3 sillas) de Daniela y de María, y las plantas de la oficina de Daniela.
export const MESA_CHICA_DANIELA = { x: 40.3, y: 3.0 }
// Reunión en la oficina de Daniela: hasta 5 agentes en su mesa redonda (6 sillas; la del lado de su escritorio es
// la de ella). Entran por su puerta y se sientan rodeando la mesa.
export const MAX_OFICINA = 5
const RADIO_SILLAS_OFICINA = 1.0
const enMesaOficina = (r, ang) => ({ x: Math.round((MESA_CHICA_DANIELA.x + r * Math.cos(ang)) * 1000) / 1000, y: Math.round((MESA_CHICA_DANIELA.y + r * Math.sin(ang)) * 1000) / 1000 })
export const DANIELA_OFICINA = { ...enMesaOficina(RADIO_SILLAS_OFICINA, Math.PI), mira: Math.PI / 2 }
export function asientosOficina() {
  return [0, 1, 2, 4, 5].map(k => {
    const ang = (k * Math.PI) / 3
    const p = enMesaOficina(RADIO_SILLAS_OFICINA, ang)
    return { ...p, ang, mira: Math.atan2(MESA_CHICA_DANIELA.x - p.x, MESA_CHICA_DANIELA.y - p.y), pose: 'sentado' }
  })
}
// Desde el pasillo principal: por el paso junto al living al corredor de Dirección, entra por la puerta y se acerca
// a su silla desde afuera de la mesa.
export function caminoOficina(hastaPasillo, asiento) {
  const P = DIRECCION.puerta, xPaso = (PASO_ESTE.x0 + PASO_ESTE.x1) / 2
  const afuera = enMesaOficina(1.75, asiento.ang)
  return ancho([...hastaPasillo, { x: xPaso, y: PASILLO }, { x: xPaso, y: CORREDOR_EJECUTIVO }, { x: P.x, y: CORREDOR_EJECUTIVO }, { ...P }, { x: P.x, y: 5.6 }, afuera, { x: asiento.x, y: asiento.y }])
}
export const MESA_CHICA_MARIA = { dx: 3.7, dy: 4.6 } // relativa a la oficina de María (x0, y0)
export const PLANTAS_DANIELA = [
  { x: 29.0, y: 6.55, escala: 1.2 }, { x: 31.0, y: 6.4, escala: 1.3 }, { x: 33.6, y: 6.55, escala: 1.0 },
  { x: 39.3, y: 6.5, escala: 1.1 }, { x: 41.6, y: 6.4, escala: 1.1 }, { x: 44.5, y: 1.0, escala: 1.2 },
]
export const ROBERTA = { nombre: 'Roberta', cama: { x: 34.3, y: 1.6 } }
// Los pizarrones grandes con rueditas que muestran el calendario de la oficina: uno al final del pasillo principal
// (entre el living y el rincón de PDG) y otro en la oficina de Daniela, entre el sillón de la tele y su escritorio,
// mirando hacia ella. giro: hacia dónde mira el frente (0 = al sur; π/2 = al este). Los dos miran hacia donde está la
// cámara de entrada (desde el sureste). ancho y alto del tablero, en metros.
export const PIZARRONES = [
  { id: 'pasillo', x: 43.2, y: 13.45, ancho: 2.8, alto: 1.7, giro: 0.6 },
  { id: 'daniela', x: 32.8, y: 2.6, ancho: 2.2, alto: 1.45, giro: Math.PI / 2 - 0.25 },
]
export const FONDO_PIZARRON = 0.55 // lo que ocupan las patas con rueditas, de adelante hacia atrás
// El rectángulo que ocupa en el piso (alineado a los ejes, para la caminata).
export function huellaPizarron(p) {
  const c = Math.abs(Math.cos(p.giro)), s = Math.abs(Math.sin(p.giro))
  const dx = (p.ancho / 2) * c + (FONDO_PIZARRON / 2) * s, dy = (p.ancho / 2) * s + (FONDO_PIZARRON / 2) * c
  return { x0: p.x - dx, x1: p.x + dx, y0: p.y - dy, y1: p.y + dy }
}
// Lo que hay en su oficina (lo dibuja oficina3d/mundo.js y lo esquiva su caminata): biblioteca en toda la pared del
// fondo, tele en la pared izquierda con el sillón enfrente, baño privado en el rincón y balcón del lado abierto.
export const MUEBLES_DIRECCION = {
  biblioteca: { x0: 28.6, x1: 44.95, y0: 0, y1: 0.5 },
  sillon: { x0: 30.2, x1: 31.25, y0: 2.8, y1: 5.2 },
  mesita: { x: 29.55, y: 4.0, radio: 0.35 },
  tele: { y0: 3.0, y1: 5.0 },
  bano: { x0: 42.4, x1: 44.95, y0: 4.9, y1: 6.95, puerta: { y0: 5.3, y1: 6.1 } },
  balcon: { x0: 45, x1: 47.2, y0: 0.8, y1: 4.4, puerta: { y0: 1.6, y1: 3.2 },
    // Dos sillas junto a la baranda mirando hacia afuera, con la mesita entre ellas: queda paso a lo largo del ventanal.
    sillas: [{ x: 46.4, y: 2.0 }, { x: 46.4, y: 3.2 }], mesa: { x: 46.6, y: 2.6, radio: 0.25 } },
}
export const PASO_ESTE = { x0: ZONAS.espera.x0, x1: ZONAS.espera.x0 + 1.2 }
// La espera es un rincón tipo living (no una fila de sillas): dos sillones enfrentados con una mesa ratona en el
// medio, y algunos lugares de pie hacia el pasillo. Cada lugar tiene su carril (x) para llegar y salir sin atravesar
// los sillones. Del lado de las oficinas queda un pasillo libre (PASO_ESTE).
export const LIVING = {
  sillonOeste: { x0: 40.85, x1: 41.55, y0: 9.0, y1: 12.2 },
  sillonEste: { x0: 44.05, x1: 44.95, y0: 9.0, y1: 12.2 },
  mesa: { x0: 42.5, x1: 43.1, y0: 9.6, y1: 11.6 },
}
export function asientosEspera() {
  const lista = []
  for (const y of [9.4, 10.2, 11.0, 11.8]) lista.push({ x: 41.2, y, mira: Math.PI / 2, pose: 'sentado', carril: 41.95 })
  for (const y of [9.4, 10.2, 11.0, 11.8]) lista.push({ x: 44.4, y, mira: -Math.PI / 2, pose: 'sentado', carril: 43.6 })
  for (const x of [41.95, 42.8, 43.6]) lista.push({ x, y: 12.75, mira: Math.PI, pose: 'parado', carril: x })
  return lista
}
// Ir a esperar: desde donde esté (hasta el pasillo principal) por su carril hasta su lugar en el living.
export function caminoEspera(hastaPasillo, asiento) {
  return ancho([...hastaPasillo, { x: asiento.carril, y: PASILLO }, { x: asiento.carril, y: asiento.y }, { x: asiento.x, y: asiento.y }])
}
// Pasar a la oficina: del living por su carril al corredor, por la puerta, a la silla frente a Daniela.
export function caminoTurno(asiento) {
  const P = DIRECCION.puerta
  return ancho([{ x: asiento.x, y: asiento.y }, { x: asiento.carril, y: asiento.y }, { x: asiento.carril, y: CORREDOR_EJECUTIVO }, { x: P.x, y: CORREDOR_EJECUTIVO }, { ...P }, { x: VISITA.x, y: VISITA.y }])
}
// Volver a su lugar después del turno: sale por la puerta, va por el corredor y el pasillo vertical al pasillo
// principal y sigue su camino de siempre al revés.
export function caminoVueltaTurno(lugar) {
  const P = DIRECCION.puerta
  const ida = alPasillo(lugar)
  return ancho([{ x: VISITA.x, y: VISITA.y }, { ...P }, { x: P.x, y: CORREDOR_EJECUTIVO }, { x: VX, y: CORREDOR_EJECUTIVO }, { x: VX, y: PASILLO }, ...ida.reverse()])
}

// ---------- Estilo de cada oficina ----------
// No son oficinas disfrazadas, pero cada una tiene su estilo según el área: alfombra (colores y dibujo), una pared de
// acento, cuadros que tienen que ver con lo que hacen y algún objeto. Lo dibuja oficina3d/mundo.js.
// patron de la alfombra: rayas, cuadros, puntos, rombos o borde. cuadros: los dibuja oficina3d/cuadros.js.
export const ESTILOS = {
  monitoreo: { alfombra: { patron: 'cuadros', colores: ['#e4e7e1', '#a9b5a6'] }, pared: '#e6e8e2', cuadros: ['grafico', 'mapa'], objeto: 'tablero' },
  agenda: { alfombra: { patron: 'rayas', colores: ['#e6e4df', '#b9b3aa'] }, pared: '#ebe8e2', cuadros: ['calendario', 'sobre'], objeto: 'corcho' },
  prensa: { alfombra: { patron: 'rombos', colores: ['#ece3d8', '#b89a7c'] }, pared: '#efe7dc', cuadros: ['diario', 'mascaras', 'entrada'], objeto: 'diarios' },
  empleo: { alfombra: { patron: 'borde', colores: ['#efe8da', '#c9a24a'] }, pared: '#f1ebdf', cuadros: ['maletin', 'busqueda'], objeto: 'maletin' },
  maria: { alfombra: { patron: 'borde', colores: ['#efe6d2', '#c9a24a'] }, pared: '#f0e9da', cuadros: ['grafico'], objeto: null },
}
const ESTILO_COMUN = { alfombra: { patron: 'borde', colores: ['#e6e2db', '#c8c1b6'] }, pared: '#f3f1ec', cuadros: ['grafico'], objeto: null }
export function estiloDe(oficinaId) { return ESTILOS[oficinaId] ?? ESTILO_COMUN }
