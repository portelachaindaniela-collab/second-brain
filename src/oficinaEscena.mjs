// El plano de la oficina dibujada: un salón con una isla de escritorios por equipo (dos filas enfrentadas), la sala
// de Sistemas (con los servidores atrás), un rincón de descanso y, a la derecha, dos oficinas vidriadas: la tuya y la
// de María. Lógica pura: la escena (OficinaEscena.jsx) solo lo dibuja.
// Medidas en metros de la escena (un escritorio mide 1.26 × 0.98). x crece a la derecha, z hacia la cámara.
// mira: hacia dónde mira la persona sentada (0 = hacia +z, π = hacia -z).
import { generoDe } from '../supabase/functions/_shared/oficina.mjs'

export const ORDEN_EQUIPOS = ['trabajadores', 'up', 'pdg', 'admin', 'sistemas']
export const PUESTO = { ancho: 1.4, escritorio: 0.75, fila: 2.5 } // entre columnas, de la silla al centro de la mesa, entre filas
export const MARIA = 'trabajadores:maria'
export const OFICINA = { ancho: 5, fondo: 5.2 }
export const FONDO_SALA = 1.3 // lo que se agranda la sala de Sistemas hacia atrás para los servidores
const MARGEN_X = 1.3
const MARGEN_FRENTE = 1.6 // adelante de la isla queda lugar para el cartel del equipo
const MARGEN_FONDO = 1.1
const SEPARACION = 0.8
const ANCHO_MAX = 24
export const DESCANSO = { ancho: 5.2, fondo: 5.2 }

const columnas = n => Math.max(1, Math.ceil(n / 2))

// agentes: [{ id, equipo }]. Devuelve { zonas, puestos, daniela, ancho, fondo }.
// zonas: [{ equipo, x, z, ancho, fondo, sala? }] (x, z: la esquina de atrás a la izquierda). Además de los equipos
//   están 'descanso', 'oficina-daniela' y 'oficina-maria' (esta última, si María está).
// puestos: [{ id, equipo, zona, x, z, mira, oficina? }] (x, z: donde se sienta; zona: el equipo de la zona donde está).
// daniela: { x, z, mira }, tu silla en tu oficina.
export function planoOficina(agentes) {
  const maria = agentes.find(a => a.id === MARIA)
  const porEquipo = new Map()
  for (const a of agentes) {
    if (a.id === MARIA) continue
    if (!porEquipo.has(a.equipo)) porEquipo.set(a.equipo, [])
    porEquipo.get(a.equipo).push(a)
  }
  const equipos = [...porEquipo.keys()].sort((a, b) => rango(a) - rango(b))
  const cajas = equipos.map(e => {
    const n = porEquipo.get(e).length
    const sala = e === 'sistemas'
    return { equipo: e, sala, ancho: columnas(n) * PUESTO.ancho + MARGEN_X * 2, fondo: MARGEN_FONDO + (sala ? FONDO_SALA : 0) + (n > 1 ? PUESTO.fila : 0) + MARGEN_FRENTE }
  })
  cajas.push({ equipo: 'descanso', ...DESCANSO })

  // Se acomodan en filas de izquierda a derecha: cada zona va en la primera fila donde entra (así el descanso
  // aprovecha el hueco que quede); si no entra en ninguna, empieza otra fila más adelante.
  const filas = []
  for (const c of cajas) {
    let fila = filas.find(f => f.zonas.length === 0 || f.ancho + SEPARACION + c.ancho <= ANCHO_MAX)
    if (!fila) { fila = { zonas: [], ancho: 0, alto: 0 }; filas.push(fila) }
    fila.zonas.push({ ...c, x: fila.zonas.length ? fila.ancho + SEPARACION : 0 })
    fila.ancho = fila.zonas.at(-1).x + c.ancho
    fila.alto = Math.max(fila.alto, c.fondo)
  }
  const zonas = []
  let z = 0
  for (const f of filas) {
    for (const zona of f.zonas) zonas.push({ ...zona, z })
    z += f.alto + SEPARACION
  }
  const anchoIslas = Math.max(0, ...filas.map(f => f.ancho))
  const fondoIslas = filas.length ? z - SEPARACION : 0

  // Las oficinas, en una columna a la derecha: la tuya atrás y la de María adelante.
  const xo = anchoIslas + SEPARACION
  const tuya = { equipo: 'oficina-daniela', x: xo, z: 0, ...OFICINA }
  zonas.push(tuya)
  const enOficina = zona => ({ x: zona.x + zona.ancho / 2, z: zona.z + 1.5, mira: 0 })
  const daniela = enOficina(tuya)
  let fondoOficinas = OFICINA.fondo
  const puestos = []
  if (maria) {
    const suya = { equipo: 'oficina-maria', x: xo, z: OFICINA.fondo + SEPARACION, ...OFICINA }
    zonas.push(suya)
    fondoOficinas = suya.z + suya.fondo
    puestos.push({ id: maria.id, equipo: maria.equipo, zona: suya.equipo, ...enOficina(suya), oficina: true })
  }

  for (const zona of zonas) {
    const del = porEquipo.get(zona.equipo)
    if (!del) continue
    const x0 = zona.x + MARGEN_X + PUESTO.ancho / 2
    // Fila de atrás mirando hacia adelante (+z); fila de adelante mirando hacia atrás, con las mesas pegadas.
    const zAtras = zona.z + MARGEN_FONDO + (zona.sala ? FONDO_SALA : 0)
    del.forEach((a, i) => {
      const fila = del.length > 1 ? i % 2 : 0
      const col = del.length > 1 ? Math.floor(i / 2) : 0
      puestos.push({ id: a.id, equipo: a.equipo, zona: zona.equipo, x: x0 + col * PUESTO.ancho, z: zAtras + fila * PUESTO.fila, mira: fila ? Math.PI : 0 })
    })
    zona.columnas = columnas(del.length)
  }
  return { zonas, puestos, daniela, ancho: xo + OFICINA.ancho, fondo: Math.max(fondoIslas, fondoOficinas) }
}

function rango(equipo) {
  const i = ORDEN_EQUIPOS.indexOf(equipo)
  return i === -1 ? ORDEN_EQUIPOS.length : i
}

// Qué hace cada uno en su puesto según su estado. Los libres cada tanto toman un café (sin levantarse): un rato
// fijo por agente para que no tomen todos a la vez. t: segundos.
export function poseDe(estado, t, fase = 0) {
  if (estado === 'trabajando') return { estado: 'trabajando', objeto: null }
  if (estado === 'error') return { estado: 'error', objeto: null }
  if (estado === 'pausado') return { estado: 'pausado', objeto: null }
  const ciclo = ((t + fase * 7.3) % 40 + 40) % 40
  return { estado: 'libre', objeto: ciclo < 9 ? 'taza' : null }
}

// El muñequito de cada agente: mujer u hombre según su nombre, y el resto (cuál de los modelos) sale de su id, así
// es siempre el mismo. Devuelve lo que espera crearPersonaje: { pelo, colorPelo, piel } (pelo 1 o 2: mujer).
export function varianteDe(id) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { pelo: generoDe(id) === 'f' ? 1 + (h % 2) : 3 * (h % 2), colorPelo: (h >>> 3) % 5, piel: (h >>> 7) % 3 }
}

// Lo que tiene puesto cada uno (los de siempre): corona para María, galera para Opera, etc.
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
