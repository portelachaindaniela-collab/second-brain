// Plano de la Oficina: un solo piso isométrico con zonas (Trabajadores, UP, sala de reuniones de PDG, cocina y living),
// dónde se sienta cada agente y su rutina. Lógica pura: la dibuja screens/OficinaPlano.jsx.
//
// Qué significa cada lugar (sale del estado real del agente, ver oficina.mjs):
// - trabajando o con un problema: sentado en su escritorio todo el tiempo.
// - libre o nuevo: trabaja en su escritorio y cada tanto se va a la cocina o al living y vuelve (su "descanso").
// - pausado: duerme en un puf del living.

export const BALDOSA = 30
export const PISO = { ancho: 28, fondo: 16, pared: 2.4 }

// Zonas del piso, en baldosas (x hacia la derecha-abajo, y hacia la izquierda-abajo).
export const ZONAS = {
  trabajadores: { x0: 0, y0: 0, x1: 17, y1: 8 },
  up: { x0: 17, y0: 0, x1: 28, y1: 8 },
  pdg: { x0: 0, y0: 8, x1: 9, y1: 16 },
  cocina: { x0: 9, y0: 8, x1: 18.5, y1: 16 },
  living: { x0: 18.5, y0: 8, x1: 28, y1: 16 },
}

// Proyección isométrica (30°). z hacia arriba.
const COS = Math.cos(Math.PI / 6)
export function iso(x, y, z = 0, b = BALDOSA) {
  return { x: Math.round((x - y) * COS * b * 100) / 100, y: Math.round(((x + y) / 2 - z) * b * 100) / 100 }
}
export const puntos = lista => lista.map(p => `${p.x},${p.y}`).join(' ')

// Escritorios en grilla dentro de una zona: columnas fijas y filas repartidas en el fondo disponible.
function grilla(n, { x0, paso, cols, yDesde, yHasta }) {
  const filas = Math.max(1, Math.ceil(n / cols))
  const pasoY = filas === 1 ? 0 : Math.min(3.2, (yHasta - yDesde) / (filas - 1))
  const y0 = filas === 1 ? (yDesde + yHasta) / 2 : yDesde
  return Array.from({ length: n }, (_, i) => {
    const fila = Math.floor(i / cols)
    const enFila = Math.min(cols, n - fila * cols)
    const corrimiento = ((cols - enFila) * paso) / 2
    return { x: x0 + corrimiento + (i % cols) * paso, y: y0 + fila * pasoY, tipo: 'escritorio' }
  })
}

// Lugar de trabajo de cada agente de un equipo, en el orden en que llegan.
export function puestos(equipo, n) {
  if (equipo === 'trabajadores') return grilla(n, { x0: 1.9, paso: 3.1, cols: 5, yDesde: 2.3, yHasta: 7.2 })
  if (equipo === 'up') return grilla(n, { x0: 19.3, paso: 3, cols: 3, yDesde: 1.9, yHasta: 7.2 })
  // PDG: sentados del otro lado de la mesa de reuniones, mirando hacia nosotros.
  const paso = n > 1 ? Math.min(1.5, 5.6 / (n - 1)) : 0
  const desde = 4.5 - (paso * (n - 1)) / 2
  return Array.from({ length: n }, (_, i) => ({ x: desde + i * paso, y: 11.7, tipo: 'mesa' }))
}

// Lugares de descanso. pose: cómo queda el agente ahí; objeto: lo que tiene en la mano. tanda: segundos que se corre
// su rutina (los dos de ping pong comparten tanda para jugar juntos).
export const DESCANSOS = [
  { id: 'cafe', x: 15.6, y: 10.4, pose: 'parado', objeto: 'taza', tanda: 0 },
  { id: 'banqueta-1', x: 12.4, y: 14.3, pose: 'sentado', objeto: 'taza', tanda: 6 },
  { id: 'sillon-1', x: 21.3, y: 10.1, pose: 'sentado', objeto: null, tanda: 3 },
  { id: 'banqueta-2', x: 14.1, y: 14.3, pose: 'sentado', objeto: null, tanda: 11 },
  { id: 'sillon-2', x: 22.6, y: 10.1, pose: 'sentado', objeto: 'taza', tanda: 9 },
  { id: 'ping-1', x: 20.4, y: 13.6, pose: 'parado', objeto: 'paleta', tanda: 14 },
  { id: 'ping-2', x: 26.7, y: 13.6, pose: 'parado', objeto: 'paleta', tanda: 14 },
  { id: 'banqueta-3', x: 15.8, y: 14.3, pose: 'sentado', objeto: 'taza', tanda: 17 },
  { id: 'sillon-3', x: 23.9, y: 10.1, pose: 'sentado', objeto: null, tanda: 20 },
  { id: 'heladera', x: 11.9, y: 10.6, pose: 'parado', objeto: null, tanda: 23 },
]
export const PUFS = [{ x: 26.9, y: 10.4 }, { x: 27.1, y: 11.9 }]

export const CICLO_S = 48

// Rutina de cada agente según su estado. ids en el orden del plantel; devuelve { [id]: rutina }.
// - descanso: el lugar adonde va en su descanso y retraso (s) para arrancar el ciclo; dos agentes con el mismo
//   lugar salen en medio ciclo distinto, así nunca están los dos ahí a la vez.
// - siesta: el puf donde duerme (pausado); si no hay más pufs, su escritorio queda vacío.
export function rutinas(agentes) {
  const r = {}
  let libres = 0
  let dormidos = 0
  for (const a of agentes) {
    if (a.estado === 'libre' || a.estado === 'nuevo') {
      const k = libres++
      const descanso = DESCANSOS[k % DESCANSOS.length]
      const vuelta = Math.floor(k / DESCANSOS.length)
      r[a.id] = { tipo: 'rutina', descanso, retraso: descanso.tanda + (vuelta % 2) * (CICLO_S / 2) }
    } else if (a.estado === 'pausado') {
      r[a.id] = { tipo: 'siesta', puf: PUFS[dormidos++] ?? null }
    } else {
      r[a.id] = { tipo: 'escritorio' }
    }
  }
  return r
}

// Retraso negativo para la animación: la rutina sigue el reloj (no arranca de cero cada vez que se abre la pantalla).
export function retrasoAnimacion(retraso, ahoraMs, ciclo = CICLO_S) {
  const fase = ((ahoraMs / 1000 + retraso) % ciclo + ciclo) % ciclo
  const r = Math.round(fase * 10) / 10
  return r ? -r : 0
}

// Variante del dibujito (pelo, color de pelo y de piel) fija por agente: siempre se ve igual.
export function variante(id) {
  let h = 2166136261
  for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return { pelo: h % 4, colorPelo: (h >>> 3) % 5, piel: (h >>> 7) % 3 }
}

// Hora de Buenos Aires para el reloj de la pared: ángulos de las agujas en grados.
export function agujas(ahoraMs) {
  const d = new Date(ahoraMs - 3 * 3600_000)
  const min = d.getUTCMinutes()
  return { hora: ((d.getUTCHours() % 12) + min / 60) * 30, minuto: min * 6 }
}
