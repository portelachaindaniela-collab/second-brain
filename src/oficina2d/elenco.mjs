// Quién es quién en la Oficina 2D: cada agente tiene un personaje fijo (uno de los 8 del diseño, o una variación de
// colores de uno de ellos), así siempre es la misma persona. Los que aparezcan más adelante reciben uno a partir de su id,
// que tampoco cambia.
import { CAST, DANI } from './dibujo.mjs'
import { generoDe } from '../../supabase/functions/_shared/oficina.mjs'

// Agente → [personaje base, variación]. La variación 0 es el personaje tal cual está en el diseño.
export const PERSONAJES = {
  'trabajadores:maria': ['c6', 0],
  'pdg:femina': ['c8', 0],
  'up:noruega': ['c5', 0],
  'pdg:marketing': ['c1', 0],
  'trabajadores:opera': ['c1', 1],
  'trabajadores:google_sync': ['c6', 1],
  'trabajadores:agenda_valentina': ['c8', 1],
  'trabajadores:tareas_estancadas': ['c5', 1],
  'admin:agenda_dulce': ['c1', 2],
  'admin:historial_up': ['c6', 2],
  'admin:limpieza': ['c8', 2],
  'sistemas:mesa_entrada': ['c5', 2],
  'trabajadores:canillita': ['c4', 0],
  'trabajadores:buscador_eventos': ['c3', 0],
  'trabajadores:monitor_sitios': ['c7', 0],
  'trabajadores:scraper_empleo': ['c2', 0],
  'up:planificador': ['c2', 1],
  'up:investigador': ['c7', 1],
  'up:redactor': ['c3', 1],
  'up:revisor': ['c2', 2],
  'up:disenador': ['c5', 3],
  'up:publicador': ['c4', 1],
  'pdg:demo': ['c3', 2],
  'pdg:objeciones': ['c7', 2],
  'pdg:propuesta': ['c2', 3],
  'pdg:prospector': ['c4', 2],
  'admin:search_console': ['c7', 3],
  'admin:resumen_diario': ['c3', 3],
  'sistemas:guardian': ['c4', 3],
  'sistemas:operador': ['c2', 4],
}

// Colores apagados de oficina para las variaciones.
const ARRIBA = ['#c9775a', '#9bb0a0', '#bcd0e3', '#d8cbb5', '#8f9fb5', '#b8a3a3', '#a3b18a', '#7d8ca3']
const ABAJO = ['#2f3e56', '#3a3a3a', '#5d7590', '#6b5a4a', '#4a5a4a', '#d8cbb5']
const PELO = ['#2a1d17', '#6b4a2e', '#262626', '#8a5a3a', '#4a3426', '#b08a5a']
const PIEL = ['#f3d2b8', '#e0b48e', '#c68b59', '#8d5a3b', '#5e3b28']

export function variacion(baseId, v) {
  const i = CAST.findIndex(c => c.id === baseId)
  const base = CAST[i] ?? CAST[0]
  if (!v) return { ...base }
  const k = i + v * 3
  const c = { ...base, id: `${base.id}-${v}` }
  // Las camisas y blusas blancas quedan blancas (es parte de la ropa); cambia el color de lo demás.
  if (base.tc !== '#fafafa') c.tc = ARRIBA[k % ARRIBA.length]
  if (base.jc) c.jc = ABAJO[(k + 1) % ABAJO.length]
  c.bc = ABAJO[k % ABAJO.length]
  if (c.jc && c.jc === c.bc) c.jc = ABAJO[(k + 2) % ABAJO.length]
  c.hc = PELO[(k + v) % PELO.length]
  c.skin = PIEL[(k + 2 * v) % PIEL.length]
  if (base.tie) c.tie = ABAJO[(k + 3) % ABAJO.length]
  return c
}

const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }
const BASES_F = ['c1', 'c6', 'c8', 'c5']
const BASES_M = ['c2', 'c3', 'c4', 'c7', 'c5']

// [base, variación] de un agente: el fijo si está en PERSONAJES; si no, uno estable que sale de su id.
export function personajeDe(id) {
  if (PERSONAJES[id]) return PERSONAJES[id]
  const h = hash(id)
  const bases = generoDe(id) === 'f' ? BASES_F : BASES_M
  return [bases[h % bases.length], 5 + ((h >>> 4) % 7)]
}
export const figuraDe = id => (id === 'dani' ? DANI : variacion(...personajeDe(id)))
