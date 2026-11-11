// Plano del edificio de la Oficina (lo dibuja screens/Oficina3D.jsx). Medidas en baldosas: x hacia la derecha,
// y hacia adelante (la pared del fondo es y = 0 y la izquierda x = 0).
//
// - Los trabajadores tienen sus oficinas contra la pared del fondo (compartidas por tema; María, la suya), con frente
//   de vidrio y puerta al pasillo.
// - UP y PDG comercial trabajan cada uno en un tablón grande con las PC enfrentadas: son un mismo sistema. En UP,
//   Noruega (la madre) va en la cabecera; en PDG, el último comercial.
// - Sala de reuniones, cafetería, comedor, sala de ocio y ping pong.
//
// Qué hace cada uno sale de su estado real (ver oficina.mjs): trabajando o con un problema está en su lugar;
// libre trabaja y cada tanto sale a la cafetería, el comedor, el ocio o el ping pong y vuelve; pausado duerme en un puf.

export const PISO = { ancho: 45, fondo: 22, pared: 2.6 }
export const ANCHO_FONDO = 36 // hasta acá llegan las oficinas del fondo; de ahí a la derecha, el ala de Dirección
export const FONDO_OFICINAS = 4.5 // profundidad de las oficinas del fondo
export const CORREDOR = 5.5 // pasillo frente a las oficinas del fondo (y = 5.5) y al costado del tablón de PDG (x = 5.5)
export const PASILLO = 13.75 // pasillo que cruza el piso entre las zonas de arriba y las de abajo
const VERTICALES = [5.5, 17.75, 26.75] // pasillos que bajan del corredor al pasillo

export const ZONAS = {
  pdg: { x0: 0, y0: 6.5, x1: 5, y1: 22, nombre: 'PDG comercial' },
  up: { x0: 6.5, y0: 6.5, x1: 17.25, y1: 13, nombre: 'UP · mesa de trabajo' },
  reuniones: { x0: 18.5, y0: 7, x1: 26, y1: 13, nombre: 'Sala de reuniones' },
  cafeteria: { x0: 27.5, y0: 6.5, x1: 36, y1: 13, nombre: 'Cafetería' },
  comedor: { x0: 6.5, y0: 14.5, x1: 17.25, y1: 22, nombre: 'Comedor' },
  ocio: { x0: 18.25, y0: 14.5, x1: 27, y1: 22, nombre: 'Ocio' },
  ping: { x0: 27.75, y0: 14.5, x1: 36, y1: 22, nombre: 'Ping pong' },
}

// Oficinas del fondo (trabajadores). Los que hacen cosas parecidas comparten oficina; los que no están en ningún
// grupo tienen la suya. María, la jefa, tiene la mejor: la del rincón, sola, con zona de estar (`jefa: true`).
export const GRUPOS_TRABAJADORES = [
  { id: 'monitoreo', nombre: 'Monitoreo', claves: ['monitor_sitios', 'tareas_estancadas'] },
  { id: 'agenda', nombre: 'Agenda', claves: ['google_sync', 'agenda_valentina'] },
  { id: 'prensa', nombre: 'Prensa y eventos', claves: ['canillita', 'buscador_eventos', 'opera'] },
  { id: 'empleo', nombre: 'Empleo', claves: ['scraper_empleo'] },
]
export const JEFA = 'maria'
const PASO_ESCRITORIO = 2.4

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
  if (conJefa) grupos.push({ id: JEFA, nombre: 'Dirección', miembros: [JEFA], jefa: true })
  // La de la jefa siempre es la más grande (más que la compartida más grande).
  const comun = g => Math.max(3.6, g.miembros.length * PASO_ESCRITORIO + 1.2)
  const mayor = Math.max(7.2, ...grupos.filter(g => !g.jefa).map(comun))
  const base = g => (g.jefa ? mayor + 1.2 : comun(g))
  const escala = ANCHO_FONDO / Math.max(grupos.reduce((s, g) => s + base(g), 0), 1)
  const porClave = {}
  let x = 0
  for (const g of grupos) {
    const w = base(g) * escala
    const x0 = x, x1 = x0 + w
    x = x1
    const puerta = { x: g.jefa ? x0 + 1.0 : x1 - 0.75, y: FONDO_OFICINAS }
    const oficina = { id: g.id, nombre: g.nombre, jefa: Boolean(g.jefa), lado: 'fondo', x0, x1, y0: 0, y1: FONDO_OFICINAS, puerta, puestos: g.miembros.length }
    const util = w - 1.6
    const paso = util / g.miembros.length
    g.miembros.forEach((clave, j) => {
      const escritorio = g.jefa ? { x: x0 + w / 2 - 0.6, y: 2.2 } : { x: x0 + 0.2 + paso * (j + 0.5), y: 2.3 }
      const sentado = { x: escritorio.x, y: g.jefa ? 1.3 : 1.52 }
      // Sale por el costado de su escritorio, pasa por delante de los escritorios y sale por la puerta.
      const salida = g.jefa
        ? [sentado, { x: puerta.x, y: sentado.y }, puerta, { x: puerta.x, y: CORREDOR }]
        : [sentado, { x: escritorio.x + paso / 2, y: sentado.y }, { x: escritorio.x + paso / 2, y: 3.6 }, { x: puerta.x, y: 3.6 }, puerta, { x: puerta.x, y: CORREDOR }]
      porClave[clave] = { tipo: 'oficina', lado: 'fondo', oficina, jefa: oficina.jefa, x0, x1, y0: 0, y1: FONDO_OFICINAS, escritorio, sentado, mira: 0, puerta, salida: salida.filter((p, i, l) => i === 0 || p.x !== l[i - 1].x || p.y !== l[i - 1].y) }
    })
  }
  return claves.map(c => porClave[c])
}

// El tablón de PDG comercial, contra la pared izquierda (a lo largo): enfrentados de a pares, cada uno con su PC, y
// el último en la cabecera de arriba. Los de la pared salen por debajo de la mesa; los del otro lado, directo al pasillo.
export function mesaPdg(n) {
  const lados = Math.max(0, n - 1)
  const filas = Math.max(1, Math.ceil(lados / 2))
  const mesa = { x0: 1.35, x1: 2.95, y0: 8.6, y1: 8.6 + filas * 1.9 + 0.6 }
  const asientos = []
  for (let i = 0; i < lados; i++) {
    const y = mesa.y0 + 1.25 + Math.floor(i / 2) * 1.9
    if (i % 2 === 0) {
      const sentado = { x: 0.6, y }
      asientos.push({ tipo: 'mesa', sentado, mira: Math.PI / 2, salida: [sentado, { x: 0.6, y: mesa.y1 + 0.6 }, { x: CORREDOR, y: mesa.y1 + 0.6 }] })
    } else {
      const sentado = { x: 3.7, y }
      asientos.push({ tipo: 'mesa', sentado, mira: -Math.PI / 2, salida: [sentado, { x: CORREDOR, y }] })
    }
  }
  if (n > 0) {
    const sentado = { x: (mesa.x0 + mesa.x1) / 2, y: mesa.y0 - 0.75 }
    asientos.push({ tipo: 'mesa', sentado, mira: 0, cabecera: true, salida: [sentado, { x: sentado.x, y: 7.1 }, { x: CORREDOR, y: 7.1 }] })
  }
  return { mesa, asientos }
}
// Sobre la pared, junto al tablón: el sistema comercial de punta a punta, un cuadro por etapa.
export const CUADROS_PDG = ['mapa', 'presentacion', 'escudo', 'documento', 'megafono']

// El tablón de UP: los primeros enfrentados de a pares (con su PC cada uno) y el último en la cabecera.
export function mesaUp(n) {
  const lados = Math.max(0, n - 1)
  const cols = Math.max(1, Math.ceil(lados / 2))
  const mesa = { x0: 8, x1: 8 + cols * 1.9 + 0.6, y0: 9.6, y1: 11.2 }
  const xs = i => mesa.x0 + 1.25 + i * 1.9
  const asientos = []
  for (let i = 0; i < lados; i++) {
    const col = Math.floor(i / 2)
    const x = xs(col)
    if (i % 2 === 0) {
      const sentado = { x, y: 8.85 }
      asientos.push({ tipo: 'mesa', sentado, mira: 0, salida: [sentado, { x, y: 8.15 }, { x: VERTICALES[1], y: 8.15 }] })
    } else {
      const sentado = { x, y: 11.95 }
      asientos.push({ tipo: 'mesa', sentado, mira: Math.PI, salida: [sentado, { x, y: 12.7 }, { x, y: PASILLO }] })
    }
  }
  if (n > 0) {
    const sentado = { x: mesa.x1 + 0.75, y: 10.4 }
    asientos.push({ tipo: 'mesa', sentado, mira: -Math.PI / 2, cabecera: true, salida: [sentado, { x: sentado.x + 0.7, y: 10.4 }, { x: VERTICALES[1], y: 10.4 }] })
  }
  return { mesa, asientos }
}

// Lugar de trabajo de cada agente de un equipo, en el orden en que llegan. claves: las de sus agentes.
export function lugares(equipo, claves) {
  if (equipo === 'trabajadores') return oficinasTrabajadores(claves)
  if (equipo === 'pdg') return mesaPdg(claves.length).asientos
  return mesaUp(claves.length).asientos
}

// Lugares de descanso (tanda: segundos que se corre la rutina de quien va ahí, para repartir las salidas). pose: cómo queda ahí; objeto: lo que tiene en la mano; mira: hacia dónde (0 = hacia adelante);
// altura: del asiento; llegada: cómo se llega desde el pasillo. Los dos de ping pong comparten tanda (juegan juntos).
const bajar = s => [{ x: s.x, y: PASILLO }, { x: s.x, y: s.y }]
const sillon = s => [{ x: 18.9, y: PASILLO }, { x: 18.9, y: 16.9 }, { x: s.x, y: 16.9 }, { x: s.x, y: s.y }]
const d = (id, x, y, pose, mira, extra = {}) => {
  const s = { id, x, y, pose, mira, objeto: null, altura: 0, tanda: 0, ...extra }
  return { ...s, llegada: (extra.llegada ?? bajar)(s) }
}
export const DESCANSOS = [
  d('barra-1', 29.3, 8.6, 'sentado', Math.PI, { objeto: 'taza', altura: 0.22, zona: 'cafeteria', tanda: 0 }),
  d('comedor-1', 9.05, 15.75, 'sentado', 0, { zona: 'comedor', tanda: 14 }),
  d('sillon-1', 20.1, 16.45, 'sentado', 0, { zona: 'ocio', tanda: 28, llegada: sillon }),
  d('ping-1', 28.8, 17.8, 'parado', Math.PI / 2, { objeto: 'paleta', zona: 'ping', tanda: 42 }),
  d('ping-2', 34.6, 17.8, 'parado', -Math.PI / 2, { objeto: 'paleta', zona: 'ping', tanda: 42 }),
  d('barra-2', 30.9, 8.6, 'sentado', Math.PI, { objeto: 'taza', altura: 0.22, zona: 'cafeteria', tanda: 56 }),
  d('comedor-2', 10.35, 15.75, 'sentado', 0, { zona: 'comedor', tanda: 70 }),
  d('sillon-2', 21.5, 16.45, 'sentado', 0, { objeto: 'taza', zona: 'ocio', tanda: 84, llegada: sillon }),
  d('cafe-1', 31.0, 11.3, 'parado', Math.PI / 2, { objeto: 'taza', zona: 'cafeteria', tanda: 98 }),
  d('comedor-3', 13.05, 15.75, 'sentado', 0, { zona: 'comedor', tanda: 112 }),
  d('cafe-2', 32.4, 11.3, 'parado', -Math.PI / 2, { objeto: 'taza', zona: 'cafeteria', tanda: 126 }),
  d('sillon-3', 22.9, 16.45, 'sentado', 0, { zona: 'ocio', tanda: 140, llegada: sillon }),
  d('barra-3', 32.5, 8.6, 'sentado', Math.PI, { altura: 0.22, zona: 'cafeteria', tanda: 154 }),
  d('comedor-4', 14.35, 15.75, 'sentado', 0, { zona: 'comedor', tanda: 168 }),
]
export const PUFS = [{ x: 24.7, y: 20.2 }, { x: 25.9, y: 21.1 }, { x: 23.5, y: 21.2 }]

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

// Camino de su lugar al descanso: sale por su puerta (o se levanta del tablón), toma el corredor, baja por el
// pasillo vertical más cercano hasta el pasillo del medio y entra a la zona.
export function camino(lugar, descanso) {
  const pts = [...lugar.salida]
  const ultimo = pts.at(-1)
  if (ultimo.y !== PASILLO) {
    const vx = VERTICALES.reduce((a, b) => (Math.abs(b - ultimo.x) < Math.abs(a - ultimo.x) ? b : a))
    pts.push({ x: vx, y: ultimo.y }, { x: vx, y: PASILLO })
  }
  pts.push(...descanso.llegada)
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
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
export function variante(id) {
  let h = 2166136261
  for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return { pelo: h % 4, colorPelo: (h >>> 3) % 5, piel: (h >>> 7) % 3 }
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
// La sala de reuniones tiene una mesa redonda. Las sillas forman una herradura que deja libre el lado de la pantalla
// (al este, donde está la cámara): así Daniela ve a todos de frente. Si vienen más de 16, el resto queda parado
// detrás, contra el vidrio del fondo. Se entra por la puerta del rincón, del lado de la pantalla.
export const MESA_REUNION = { x: 22.25, y: 10, radio: 1.7 }
export const PUERTA_REUNION = { x: 25.4, y: 13 }
const RADIO_SILLAS = 2.5
const RADIO_PASO = 2.05 // por donde se camina adentro: entre la mesa y las sillas
const LIBRE_PANTALLA = (52 * Math.PI) / 180 // a cada lado del este no hay sillas
export const MAX_ASISTENTES = 24
const enCirculo = (r, ang) => ({ x: Math.round((MESA_REUNION.x + r * Math.cos(ang)) * 1000) / 1000, y: Math.round((MESA_REUNION.y + r * Math.sin(ang)) * 1000) / 1000 })
export function asientosReunion() {
  const lista = []
  const desde = LIBRE_PANTALLA, hasta = 2 * Math.PI - LIBRE_PANTALLA
  for (let k = 0; k < 16; k++) {
    const ang = desde + ((hasta - desde) * k) / 15
    const p = enCirculo(RADIO_SILLAS, ang)
    lista.push({ ...p, ang, mira: Math.atan2(MESA_REUNION.x - p.x, MESA_REUNION.y - p.y), pose: 'sentado' })
  }
  for (let k = 0; k < 8; k++) {
    const ang = Math.PI - 0.95 + (1.9 * k) / 7
    const p = enCirculo(3.1, ang)
    lista.push({ ...p, ang, mira: Math.atan2(MESA_REUNION.x - p.x, MESA_REUNION.y - p.y), pose: 'parado' })
  }
  return lista
}

// Desde el pasillo del medio: entra por la puerta del rincón, se mete entre la mesa y las sillas y va rodeando la mesa
// hasta su lugar.
export function entradaReunion(a) {
  const pts = [{ x: PUERTA_REUNION.x, y: PASILLO }, { x: PUERTA_REUNION.x, y: 12.4 }]
  const inicio = LIBRE_PANTALLA * 0.55
  pts.push(enCirculo(RADIO_PASO, inicio))
  const meta = a.ang
  const pasos = Math.max(1, Math.ceil(Math.abs(meta - inicio) / 0.3))
  for (let k = 1; k <= pasos; k++) pts.push(enCirculo(RADIO_PASO, inicio + ((meta - inicio) * k) / pasos))
  pts.push({ x: a.x, y: a.y })
  return pts
}

// De su lugar hasta el pasillo del medio (el principio de cualquier camino de descanso).
export function alPasillo(lugar) {
  const c = camino(lugar, DESCANSOS[0])
  return c.slice(0, c.findIndex(p => p.y === PASILLO) + 1)
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

// Camino a la reunión: desde donde esté (hasta el pasillo) por el pasillo hasta la puerta de la sala y a su lugar.
export function caminoReunion(hastaPasillo, asiento) {
  const pts = [...hastaPasillo, ...entradaReunion(asiento)]
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
}
export const PLAZO_REUNION_S = 120

// ---------- Ala de Dirección: la oficina de Daniela y la sala de espera ----------
// Daniela es la jefa de todos: su oficina es la más grande del edificio (x 36..45, y 0..9), con puerta al frente.
// Afuera, la sala de espera: ahí esperan su turno los agentes que cita a su oficina.
export const DIRECCION = { x0: 36, x1: PISO.ancho, y0: 0, y1: 9, puerta: { x: 40.5, y: 9 } }
export const DANIELA = { id: 'yo:daniela', nombre: 'Daniela', escritorio: { x: 40.5, y: 3.2 }, sentado: { x: 40.5, y: 2.3 }, mira: 0 }
export const VISITA = { x: 40.5, y: 4.55, mira: Math.PI } // la silla frente a su escritorio
// Roberta, la perra de Daniela: su camita al lado del escritorio. Cuando Daniela camina, la sigue.
export const ROBERTA = { nombre: 'Roberta', cama: { x: 38.7, y: 2.0 } }
// Lo que hay en su oficina (lo dibuja oficina3d/mundo.js y lo esquiva su caminata): biblioteca en toda la pared del
// fondo, tele en la pared izquierda con el sillón enfrente, baño privado en el rincón y balcón del lado abierto.
export const MUEBLES_DIRECCION = {
  biblioteca: { x0: 36.05, x1: 44.95, y0: 0, y1: 0.5 },
  sillon: { x0: 37.7, x1: 38.75, y0: 4.3, y1: 6.7 },
  mesita: { x: 37.05, y: 5.5, radio: 0.35 },
  bano: { x0: 36.05, x1: 38.5, y0: 7.05, y1: 8.95, puerta: { y0: 7.35, y1: 8.15 } },
  balcon: { x0: 45, x1: 47.2, y0: 1.0, y1: 6.5, puerta: { y0: 2.9, y1: 4.5 } },
}
const FRENTE_DIRECCION = 9.7
export function asientosEspera() {
  const lista = []
  for (let k = 0; k < 8; k++) lista.push({ x: 37.3 + k * 0.95, y: 10.6, mira: Math.PI, pose: 'sentado' })
  for (let k = 0; k < 8; k++) lista.push({ x: 37.3 + k * 0.95, y: 11.8, mira: Math.PI, pose: 'parado' })
  return lista
}

// Ir a esperar: desde donde esté (hasta el pasillo) por el pasillo hasta su lugar en la espera.
export function caminoEspera(hastaPasillo, asiento) {
  const pts = [...hastaPasillo, { x: asiento.x, y: PASILLO }, { x: asiento.x, y: asiento.y }]
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
}
// Pasar a la oficina: de la espera a la silla frente a Daniela.
export function caminoTurno(asiento) {
  const pts = [{ x: asiento.x, y: asiento.y }, { x: asiento.x, y: FRENTE_DIRECCION }, { x: DIRECCION.puerta.x, y: FRENTE_DIRECCION }, { x: VISITA.x, y: VISITA.y }]
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
}
// Volver a su lugar después del turno: sale por la puerta, baja al pasillo y sigue su camino de siempre al revés.
export function caminoVueltaTurno(lugar) {
  const ida = alPasillo(lugar)
  const pts = [{ x: VISITA.x, y: VISITA.y }, { x: DIRECCION.puerta.x, y: FRENTE_DIRECCION }, { x: DIRECCION.puerta.x, y: PASILLO }, ...ida.reverse()]
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
}

// ---------- Estilo de cada oficina ----------
// No son oficinas disfrazadas, pero cada una tiene su estilo según el área: alfombra (colores y dibujo), una pared de
// acento, cuadros que tienen que ver con lo que hacen y algún objeto. Lo dibuja oficina3d/mundo.js.
// patron de la alfombra: rayas, cuadros, puntos, rombos o borde. cuadros: los dibuja oficina3d/cuadros.js.
export const ESTILOS = {
  monitoreo: { alfombra: { patron: 'cuadros', colores: ['#d4f1ef', '#9fd9d3'] }, pared: '#d8f0ee', cuadros: ['grafico', 'mapa'], objeto: 'tablero' },
  agenda: { alfombra: { patron: 'rayas', colores: ['#dfeaff', '#f9d3e0'] }, pared: '#e6edff', cuadros: ['calendario', 'sobre'], objeto: 'corcho' },
  prensa: { alfombra: { patron: 'rombos', colores: ['#f3dcc8', '#c97b7b'] }, pared: '#f6e4d6', cuadros: ['diario', 'mascaras', 'entrada'], objeto: 'diarios' },
  empleo: { alfombra: { patron: 'borde', colores: ['#fbecc9', '#e0a948'] }, pared: '#fbf0d6', cuadros: ['maletin', 'busqueda'], objeto: 'maletin' },
  maria: { alfombra: { patron: 'borde', colores: ['#f3e6c4', '#c9a24a'] }, pared: '#f1e6cf', cuadros: ['grafico'], objeto: null },
}
const ESTILO_COMUN = { alfombra: { patron: 'borde', colores: ['#e8dffa', '#cfc2ef'] }, pared: '#efe8fb', cuadros: ['grafico'], objeto: null }
export function estiloDe(oficinaId) { return ESTILOS[oficinaId] ?? ESTILO_COMUN }
