// Plano del edificio de la Oficina (lo dibuja screens/Oficina3D.jsx). Medidas en baldosas: x hacia la derecha,
// y hacia adelante (la pared del fondo es y = 0 y la izquierda x = 0; la entrada está adelante).
//
// La oficina tiene jerarquía. De la entrada hacia el fondo:
// - Administración: una mesa con las tareas de apoyo (Search Console, Resumen diario, Agenda dulce, Historial de UP,
//   Limpieza).
// - Una mampara con plantas divide el ambiente.
// - Los dos tablones: UP y PDG comercial (son un mismo sistema), con las PC enfrentadas.
// - Las oficinas de los trabajadores (compartidas por tema) y, frente a la puerta de Daniela, la sala de espera.
// - Al fondo, sobre una tarima, las dos más importantes: la de María y la de Daniela (con su balcón).
// A la izquierda, en columna: sala de reuniones, cafetería, comedor, ocio y ping pong.
//
// Qué hace cada uno sale de su estado real (ver oficina.mjs): trabajando o con un problema está en su lugar;
// libre trabaja y cada tanto sale a la cafetería, el comedor, el ocio o el ping pong y vuelve; pausado duerme en un puf.

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
export function alturaPiso(x, y) { return x >= X0 && y <= EJECUTIVO.y1 ? EJECUTIVO.tarima : 0 }

export const ZONAS = {
  reuniones: { x0: 0.5, y0: 0.5, x1: 10.5, y1: 7.5, nombre: 'Sala de reuniones' },
  cafeteria: { x0: 0.5, y0: 8, x1: 13, y1: 13, nombre: 'Cafetería' },
  comedor: { x0: 0.5, y0: 13.5, x1: 13, y1: 19, nombre: 'Comedor' },
  ocio: { x0: 0.5, y0: 19.5, x1: 8, y1: 26, nombre: 'Ocio' },
  ping: { x0: 7.5, y0: 19.5, x1: 13.3, y1: 26, nombre: 'Ping pong' },
  up: { x0: X0, y0: 14.5, x1: 29, y1: 20.5, nombre: 'UP · mesa de trabajo' },
  pdg: { x0: 29.6, y0: 14.5, x1: 45, y1: 20.5, nombre: 'PDG comercial' },
  admin: { x0: X0, y0: 21, x1: 45, y1: PISO.fondo, nombre: 'Administración' },
  espera: { x0: 39.3, y0: 8.5, x1: 45, y1: 13, nombre: 'Sala de espera' },
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
    const paso = (w - 1.6) / g.miembros.length
    g.miembros.forEach((clave, j) => {
      const escritorio = { x: x0 + 0.2 + paso * (j + 0.5), y: y0 + 2.3 }
      const sentado = { x: escritorio.x, y: y0 + 1.52 }
      // Sale por el costado de su escritorio, pasa por delante de los escritorios y sale por la puerta al pasillo.
      const salida = ancho([sentado, { x: escritorio.x + paso / 2, y: sentado.y }, { x: escritorio.x + paso / 2, y: y1 - 0.9 }, { x: puerta.x, y: y1 - 0.9 }, puerta, { x: puerta.x, y: PASILLO }])
      porClave[clave] = { tipo: 'oficina', oficina, jefa: false, x0, x1, y0, y1, escritorio, sentado, mira: 0, puerta, salida }
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
// Sobre la pared de PDG (la mampara de atrás de su tablón): el sistema comercial de punta a punta.
export const CUADROS_PDG = ['mapa', 'presentacion', 'escudo', 'documento', 'megafono']

// Lugar de trabajo de cada agente de un equipo, en el orden en que llegan. claves: las de sus agentes.
export function lugares(equipo, claves) {
  if (equipo === 'trabajadores') return oficinasTrabajadores(claves)
  if (equipo === 'pdg') return mesaPdg(claves.length).asientos
  if (equipo === 'admin') return mesaAdmin(claves.length).asientos
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
  d('sillon-1', 1.75, 21.05, 'sentado', 0, { zona: 'ocio', tanda: 28, carril: 21.6 }),
  d('ping-1', 8.0, 22.8, 'parado', Math.PI / 2, { objeto: 'paleta', zona: 'ping', tanda: 42, carril: 24.7 }),
  d('ping-2', 13.0, 22.8, 'parado', -Math.PI / 2, { objeto: 'paleta', zona: 'ping', tanda: 42 }),
  d('barra-2', 3.6, 9.9, 'sentado', Math.PI, { objeto: 'taza', altura: 0.22, zona: 'cafeteria', tanda: 56, carril: 11.0 }),
  d('comedor-2', 3.45, 14.85, 'sentado', 0, { zona: 'comedor', tanda: 70, carril: 14.1 }),
  d('sillon-2', 3.1, 21.05, 'sentado', 0, { objeto: 'taza', zona: 'ocio', tanda: 84, carril: 21.6 }),
  d('cafe-1', 9.8, 11.9, 'parado', Math.PI / 2, { objeto: 'taza', zona: 'cafeteria', tanda: 98, carril: 11.0 }),
  d('comedor-3', 6.45, 14.85, 'sentado', 0, { zona: 'comedor', tanda: 112, carril: 14.1 }),
  d('cafe-2', 11.2, 11.9, 'parado', -Math.PI / 2, { objeto: 'taza', zona: 'cafeteria', tanda: 126 }),
  d('sillon-3', 4.45, 21.05, 'sentado', 0, { zona: 'ocio', tanda: 140, carril: 21.6 }),
  d('barra-3', 5.2, 9.9, 'sentado', Math.PI, { altura: 0.22, zona: 'cafeteria', tanda: 154, carril: 11.0 }),
  d('comedor-4', 7.75, 14.85, 'sentado', 0, { zona: 'comedor', tanda: 168, carril: 14.1 }),
]
export const PUFS = [{ x: 6.3, y: 24.0 }, { x: 5.0, y: 25.2 }, { x: 6.9, y: 25.4 }]

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
  'admin:search_console': 'lentes',
  'admin:resumen_diario': 'monio',
  'admin:agenda_dulce': 'vincha',
  'admin:historial_up': 'visera',
  'admin:limpieza': 'gorra-canillita',
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
// La sala de reuniones (arriba de la columna de salas comunes) tiene una mesa redonda. Las sillas forman una
// herradura que deja libre el lado de la pantalla (al este, donde está la cámara): así Daniela ve a todos de frente.
// Si vienen más de 16, el resto queda parado detrás. Se entra por la puerta del lado de la pantalla.
export const MESA_REUNION = { x: 5.1, y: 4.0, radio: 1.6 }
export const PUERTA_REUNION = { x: ZONAS.reuniones.x1, y: 6.5 }
const RADIO_SILLAS = 2.4
const RADIO_PASO = 1.98 // por donde se camina adentro: entre la mesa y las sillas
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
    const ang = Math.PI - 0.9 + (1.8 * k) / 7
    const p = enCirculo(3.05, ang)
    lista.push({ ...p, ang, mira: Math.atan2(MESA_REUNION.x - p.x, MESA_REUNION.y - p.y), pose: 'parado' })
  }
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
export const ROBERTA = { nombre: 'Roberta', cama: { x: 34.3, y: 1.6 } }
// Lo que hay en su oficina (lo dibuja oficina3d/mundo.js y lo esquiva su caminata): biblioteca en toda la pared del
// fondo, tele en la pared izquierda con el sillón enfrente, baño privado en el rincón y balcón del lado abierto.
export const MUEBLES_DIRECCION = {
  biblioteca: { x0: 28.6, x1: 44.95, y0: 0, y1: 0.5 },
  sillon: { x0: 30.2, x1: 31.25, y0: 2.8, y1: 5.2 },
  mesita: { x: 29.55, y: 4.0, radio: 0.35 },
  tele: { y0: 3.0, y1: 5.0 },
  bano: { x0: 42.4, x1: 44.95, y0: 4.9, y1: 6.95, puerta: { y0: 5.3, y1: 6.1 } },
  balcon: { x0: 45, x1: 47.2, y0: 0.8, y1: 4.4, puerta: { y0: 1.6, y1: 3.2 } },
}
export function asientosEspera() {
  const Z = ZONAS.espera
  const lista = []
  for (let k = 0; k < 6; k++) lista.push({ x: Z.x0 + 0.45 + k * 0.92, y: 9.4, mira: Math.PI, pose: 'sentado' })
  for (let k = 0; k < 5; k++) lista.push({ x: Z.x0 + 0.91 + k * 0.92, y: 10.6, mira: Math.PI, pose: 'sentado' })
  for (let k = 0; k < 6; k++) lista.push({ x: Z.x0 + 0.45 + k * 0.92, y: 11.9, mira: Math.PI, pose: 'parado' })
  return lista
}
// Ir a esperar: desde donde esté (hasta el pasillo principal) por el pasillo hasta su lugar en la espera.
export function caminoEspera(hastaPasillo, asiento) {
  return ancho([...hastaPasillo, { x: asiento.x, y: PASILLO }, { x: asiento.x, y: asiento.y }])
}
// Pasar a la oficina: de la espera al corredor, por la puerta, a la silla frente a Daniela.
export function caminoTurno(asiento) {
  const P = DIRECCION.puerta
  return ancho([{ x: asiento.x, y: asiento.y }, { x: asiento.x, y: CORREDOR_EJECUTIVO }, { x: P.x, y: CORREDOR_EJECUTIVO }, { ...P }, { x: VISITA.x, y: VISITA.y }])
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
  monitoreo: { alfombra: { patron: 'cuadros', colores: ['#d4f1ef', '#9fd9d3'] }, pared: '#d8f0ee', cuadros: ['grafico', 'mapa'], objeto: 'tablero' },
  agenda: { alfombra: { patron: 'rayas', colores: ['#dfeaff', '#f9d3e0'] }, pared: '#e6edff', cuadros: ['calendario', 'sobre'], objeto: 'corcho' },
  prensa: { alfombra: { patron: 'rombos', colores: ['#f3dcc8', '#c97b7b'] }, pared: '#f6e4d6', cuadros: ['diario', 'mascaras', 'entrada'], objeto: 'diarios' },
  empleo: { alfombra: { patron: 'borde', colores: ['#fbecc9', '#e0a948'] }, pared: '#fbf0d6', cuadros: ['maletin', 'busqueda'], objeto: 'maletin' },
  maria: { alfombra: { patron: 'borde', colores: ['#f3e6c4', '#c9a24a'] }, pared: '#f1e6cf', cuadros: ['grafico'], objeto: null },
}
const ESTILO_COMUN = { alfombra: { patron: 'borde', colores: ['#e8dffa', '#cfc2ef'] }, pared: '#efe8fb', cuadros: ['grafico'], objeto: null }
export function estiloDe(oficinaId) { return ESTILOS[oficinaId] ?? ESTILO_COMUN }
