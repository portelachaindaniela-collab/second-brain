// Plano del edificio de la Oficina (lo dibuja screens/Oficina3D.jsx). Medidas en baldosas: x hacia la derecha,
// y hacia adelante (la pared del fondo es y = 0 y la izquierda x = 0).
//
// - Cada trabajador tiene su oficina contra la pared del fondo; cada comercial de PDG, contra la pared izquierda.
//   Todas con frente de vidrio y puerta al pasillo.
// - Los agentes de UP comparten un tablón grande con las PC enfrentadas; Noruega, la madre, en la cabecera.
// - Sala de reuniones, cafetería, comedor, sala de ocio y ping pong.
//
// Qué hace cada uno sale de su estado real (ver oficina.mjs): trabajando o con un problema está en su lugar;
// libre trabaja y cada tanto sale a la cafetería, el comedor, el ocio o el ping pong y vuelve; pausado duerme en un puf.

export const PISO = { ancho: 36, fondo: 22, pared: 2.6 }
export const FONDO_OFICINAS = 4.5 // profundidad de las oficinas del fondo
export const ANCHO_OFICINAS_IZQ = 4.5 // ancho de las oficinas de la izquierda
export const CORREDOR = 5.5 // pasillo frente a las oficinas (y para las del fondo, x para las de la izquierda)
export const PASILLO = 13.75 // pasillo que cruza el piso entre las zonas de arriba y las de abajo
const VERTICALES = [5.5, 17.75, 26.75] // pasillos que bajan del corredor al pasillo

export const ZONAS = {
  up: { x0: 6.5, y0: 6.5, x1: 17.25, y1: 13, nombre: 'UP · mesa de trabajo' },
  reuniones: { x0: 18.5, y0: 7, x1: 26, y1: 13, nombre: 'Sala de reuniones' },
  cafeteria: { x0: 27.5, y0: 6.5, x1: 36, y1: 13, nombre: 'Cafetería' },
  comedor: { x0: 6.5, y0: 14.5, x1: 17.25, y1: 22, nombre: 'Comedor' },
  ocio: { x0: 18.25, y0: 14.5, x1: 27, y1: 22, nombre: 'Ocio' },
  ping: { x0: 27.75, y0: 14.5, x1: 36, y1: 22, nombre: 'Ping pong' },
}

// Oficinas privadas del fondo (trabajadores): una por agente. jefa: el índice de la jefa (María), que tiene la mejor
// oficina: la del rincón, del doble de ancho, con zona de estar (la arma el dibujo con `jefa: true`).
export function oficinasFondo(n, jefa = -1) {
  const conJefa = jefa >= 0 && jefa < n
  const unidad = Math.min(4.6, PISO.ancho / Math.max(n + (conJefa ? 1 : 0), 1))
  const total = unidad * (n + (conJefa ? 1 : 0))
  let x = (PISO.ancho - total) / 2
  // Las comunes en orden; la de la jefa, última (el rincón de la derecha).
  const orden = [...Array(n).keys()].filter(i => i !== jefa)
  if (conJefa) orden.push(jefa)
  const porAgente = []
  for (const i of orden) {
    const esJefa = i === jefa
    const w = unidad * (esJefa ? 2 : 1)
    const x0 = x, cx = x0 + w / 2
    x += w
    const escritorio = esJefa ? { x: cx - 0.6, y: 2.2 } : { x: cx - 0.3, y: 2.3 }
    const sentado = { x: escritorio.x, y: esJefa ? 1.3 : 1.52 }
    const puerta = { x: esJefa ? x0 + 1.0 : cx + 1.05, y: FONDO_OFICINAS }
    porAgente[i] = {
      tipo: 'oficina', lado: 'fondo', jefa: esJefa, x0, x1: x0 + w, y0: 0, y1: FONDO_OFICINAS, escritorio, sentado, mira: 0, puerta,
      salida: [sentado, { x: puerta.x, y: sentado.y }, puerta, { x: puerta.x, y: CORREDOR }],
    }
  }
  return porAgente
}

// Oficinas privadas de la izquierda (PDG): debajo del corredor, hasta el frente.
export function oficinasIzquierda(n) {
  const y0Total = FONDO_OFICINAS + 2
  const h = (PISO.fondo - y0Total) / Math.max(n, 1)
  return Array.from({ length: n }, (_, i) => {
    const y0 = y0Total + i * h, cy = y0 + h / 2
    const escritorio = { x: 2.3, y: cy - 0.3 }
    const sentado = { x: 1.52, y: escritorio.y }
    const puerta = { x: ANCHO_OFICINAS_IZQ, y: cy + 1.05 }
    return {
      tipo: 'oficina', lado: 'izquierda', x0: 0, x1: ANCHO_OFICINAS_IZQ, y0, y1: y0 + h, escritorio, sentado, mira: Math.PI / 2, puerta,
      salida: [sentado, { x: sentado.x, y: puerta.y }, puerta, { x: CORREDOR, y: puerta.y }],
    }
  })
}

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

// Lugar de trabajo de cada agente de un equipo, en el orden en que llegan.
// jefa: índice de la jefa dentro del equipo (solo trabajadores).
export function lugares(equipo, n, jefa = -1) {
  if (equipo === 'trabajadores') return oficinasFondo(n, jefa)
  if (equipo === 'pdg') return oficinasIzquierda(n)
  return mesaUp(n).asientos
}

// Lugares de descanso. pose: cómo queda ahí; objeto: lo que tiene en la mano; mira: hacia dónde (0 = hacia adelante);
// altura: del asiento; llegada: cómo se llega desde el pasillo. Los dos de ping pong comparten tanda (juegan juntos).
const bajar = s => [{ x: s.x, y: PASILLO }, { x: s.x, y: s.y }]
const sillon = s => [{ x: 18.9, y: PASILLO }, { x: 18.9, y: 16.9 }, { x: s.x, y: 16.9 }, { x: s.x, y: s.y }]
const d = (id, x, y, pose, mira, extra = {}) => {
  const s = { id, x, y, pose, mira, objeto: null, altura: 0, tanda: 0, ...extra }
  return { ...s, llegada: (extra.llegada ?? bajar)(s) }
}
export const DESCANSOS = [
  d('barra-1', 29.3, 8.6, 'sentado', Math.PI, { objeto: 'taza', altura: 0.22, zona: 'cafeteria', tanda: 0 }),
  d('comedor-1', 9.05, 15.75, 'sentado', 0, { zona: 'comedor', tanda: 4 }),
  d('sillon-1', 20.1, 16.45, 'sentado', 0, { zona: 'ocio', tanda: 8, llegada: sillon }),
  d('ping-1', 28.8, 17.8, 'parado', Math.PI / 2, { objeto: 'paleta', zona: 'ping', tanda: 12 }),
  d('ping-2', 34.6, 17.8, 'parado', -Math.PI / 2, { objeto: 'paleta', zona: 'ping', tanda: 12 }),
  d('barra-2', 30.9, 8.6, 'sentado', Math.PI, { objeto: 'taza', altura: 0.22, zona: 'cafeteria', tanda: 16 }),
  d('comedor-2', 10.35, 15.75, 'sentado', 0, { zona: 'comedor', tanda: 20 }),
  d('sillon-2', 21.5, 16.45, 'sentado', 0, { objeto: 'taza', zona: 'ocio', tanda: 24, llegada: sillon }),
  d('cafe-1', 31.0, 11.3, 'parado', Math.PI / 2, { objeto: 'taza', zona: 'cafeteria', tanda: 28 }),
  d('comedor-3', 13.05, 15.75, 'sentado', 0, { zona: 'comedor', tanda: 32 }),
  d('cafe-2', 32.4, 11.3, 'parado', -Math.PI / 2, { objeto: 'taza', zona: 'cafeteria', tanda: 36 }),
  d('sillon-3', 22.9, 16.45, 'sentado', 0, { zona: 'ocio', tanda: 40, llegada: sillon }),
  d('barra-3', 32.5, 8.6, 'sentado', Math.PI, { altura: 0.22, zona: 'cafeteria', tanda: 44 }),
  d('comedor-4', 14.35, 15.75, 'sentado', 0, { zona: 'comedor', tanda: 48 }),
]
export const PUFS = [{ x: 24.7, y: 20.2 }, { x: 25.9, y: 21.1 }, { x: 23.5, y: 21.2 }]

// Rutina de cada agente según su estado (ids en el orden del plantel): { [id]: rutina }.
// - rutina: el lugar de descanso y un retraso (s); dos con el mismo lugar salen en medio ciclo distinto.
// - siesta: el puf donde duerme (pausado); si no quedan pufs, su lugar queda vacío.
export const CICLO_REFERENCIA = 90
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
export const TIEMPOS = { sentado: 40, descanso: 16 }
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
