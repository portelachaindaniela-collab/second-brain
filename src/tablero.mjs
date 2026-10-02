// Cálculos del tablero de Trabajadores: actividad por hora, alertas y el grafo del mapa de flujo.
// Solo presentación: todo sale de `trabajadores`, `trabajos_corridas` y salud_sistema().
import { franjaHoras, programaDe, resumenFranja, trabada, duracionLegible, parsearCron, minutosProgramados, haceCuanto } from './trabajadores.mjs'

const HORA_MS = 3600_000

// Color de identidad: nombre de un token de tema (--id-<color>). Nunca dice el estado.
export function colorIdentidad(color) {
  return color ? `var(--id-${color}, var(--gray-500))` : 'var(--gray-500)'
}

// Corridas por hora de todos los trabajadores juntos, del más viejo al más nuevo; el último es la hora en curso.
export function actividadPorHora(trabajadores, corridasPor, ahora = Date.now(), horas = 24) {
  const actual = Math.floor(ahora / HORA_MS) * HORA_MS
  return Array.from({ length: horas }, (_, i) => {
    const inicio = actual - (horas - 1 - i) * HORA_MS
    const partes = trabajadores.map(t => ({
      clave: t.clave,
      n: (corridasPor[t.clave] || []).filter(c => { const x = Date.parse(c.iniciado_at); return x >= inicio && x < inicio + HORA_MS }).length,
    })).filter(p => p.n)
    return { inicio, partes, total: partes.reduce((s, p) => s + p.n, 0) }
  })
}

// Alertas pendientes: lo que hoy pide mirar. nivel 'error' antes que 'aviso'.
export function alertas({ trabajadores, corridasPor, ahora = Date.now(), salud = null }) {
  const lista = []
  for (const t of trabajadores) {
    if (!t.activo) continue
    const corridas = corridasPor[t.clave] || []
    const ultima = corridas[0]
    const terminada = corridas.find(c => c.estado !== 'corriendo')
    if (ultima && trabada(ultima, ahora, t.minutos_trabado)) {
      lista.push({ nivel: 'error', texto: `${t.nombre}: trabado hace ${duracionLegible(ahora - Date.parse(ultima.iniciado_at))}` })
    } else if (terminada?.estado === 'error') {
      lista.push({ nivel: 'error', texto: `${t.nombre}: la última corrida falló${terminada.error ? ` (${terminada.error})` : ''}` })
    }
    const huecos = resumenFranja(franjaHoras(corridas, ahora, programaDe(t))).huecos
    if (huecos) lista.push({ nivel: 'aviso', texto: `${t.nombre}: ${huecos} ${huecos === 1 ? 'hora' : 'horas'} sin correr cuando le tocaba` })
    // Lo que encontró María (sitios caídos, tareas estancadas) es su resultado, no una falla suya: igual pide mirar.
    for (const a of terminada?.estado === 'ok' ? terminada.payload?.agentes ?? [] : []) {
      if (a.estado === 'error') lista.push({ nivel: 'aviso', texto: `${t.nombre} · ${a.agente.replace(/_/g, ' ')}: ${a.resumen}` })
    }
  }
  if (salud) {
    for (const clave of salud.trabajadores_sin_job ?? []) {
      const t = trabajadores.find(x => x.clave === clave)
      lista.push({ nivel: 'error', texto: `${t?.nombre ?? clave}: está activo pero su job de cron no` })
    }
    if (salud.fallos_cron_24h) lista.push({ nivel: 'aviso', texto: `pg_cron: ${salud.fallos_cron_24h} ${salud.fallos_cron_24h === 1 ? 'job falló' : 'jobs fallaron'} en 24 h` })
  }
  return lista.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'error' ? -1 : 1))
}

// De dónde lee y adónde escribe cada trabajador. Un trabajador que no está acá igual aparece, con su hilo
// a trabajos_corridas. Sumar uno = sumar una entrada.
export const FUENTES = {
  github_pages: 'GitHub Pages',
  google: 'API de Google',
  sitios: 'Sitios propios',
  eventbrite: 'Eventbrite',
  medios: 'Webs de medios',
  x: 'X (FxTwitter)',
}
export const RECORRIDOS = {
  scraper_empleo: { fuentes: ['github_pages'], destinos: [] },
  google_sync: { fuentes: ['google'], destinos: ['calendar_events', 'emails'] },
  maria: { fuentes: ['sitios', 'github_pages'], destinos: ['process_reports'] },
  buscador_eventos: { fuentes: ['eventbrite'], destinos: ['eventos'] },
  canillita: { fuentes: ['medios', 'x'], destinos: ['noticias'] },
}
export const REGISTRO = 'trabajos_corridas'

export const GRAFO = { ancho: 760, fila: 84, margen: 34, nodoAncho: 160, nodoAlto: 32, radio: 16, x: { fuente: 100, trabajador: 380, destino: 660 } }

function columna(ids, alto) {
  const paso = ids.length ? alto / ids.length : 0
  return Object.fromEntries(ids.map((id, i) => [id, GRAFO.margen + paso * (i + 0.5)]))
}

export function grafoFlujo(trabajadores) {
  const recorridos = trabajadores.map(t => ({ t, ...(RECORRIDOS[t.clave] ?? { fuentes: [], destinos: [] }) }))
  const fuentes = [...new Set(recorridos.flatMap(r => r.fuentes))]
  const destinos = [...new Set(recorridos.flatMap(r => r.destinos))]
  const filas = Math.max(fuentes.length, trabajadores.length, destinos.length + 1, 1)
  const alto = filas * GRAFO.fila
  const yF = columna(fuentes, alto)
  const yT = columna(trabajadores.map(t => t.clave), alto)
  const yD = columna(destinos, alto - GRAFO.fila)
  const nodos = [
    ...fuentes.map(id => ({ id: `f:${id}`, tipo: 'fuente', etiqueta: FUENTES[id] ?? id, x: GRAFO.x.fuente, y: yF[id] })),
    ...trabajadores.map(t => ({ id: `t:${t.clave}`, tipo: 'trabajador', etiqueta: t.nombre, clave: t.clave, color: t.color, x: GRAFO.x.trabajador, y: yT[t.clave] })),
    ...destinos.map(id => ({ id: `d:${id}`, tipo: 'destino', etiqueta: id, x: GRAFO.x.destino, y: yD[id] })),
    { id: `d:${REGISTRO}`, tipo: 'destino', etiqueta: REGISTRO, registro: true, x: GRAFO.x.destino, y: GRAFO.margen + alto - GRAFO.fila / 2 },
  ]
  const hilos = recorridos.flatMap(({ t, fuentes: fs, destinos: ds }) => [
    ...fs.map(f => ({ id: `f:${f}>t:${t.clave}`, desde: `f:${f}`, hasta: `t:${t.clave}`, clave: t.clave })),
    ...[...ds, REGISTRO].map(d => ({ id: `t:${t.clave}>d:${d}`, desde: `t:${t.clave}`, hasta: `d:${d}`, clave: t.clave })),
  ])
  return { nodos, hilos, alto: alto + GRAFO.margen * 2 }
}

// El camino de un nodo: los trabajadores que pasan por él y todo lo que tocan. Desde un destino solo se ve
// ese destino, no los otros adonde escriben los mismos trabajadores.
export function caminoDe(id, { hilos }) {
  if (!id) return null
  const claves = new Set(hilos.filter(h => h.desde === id || h.hasta === id).map(h => h.clave))
  const soloDestino = id.startsWith('d:')
  const elegidos = hilos.filter(h => claves.has(h.clave) && (!soloDestino || !h.desde.startsWith('t:') || h.hasta === id))
  return { nodos: new Set([id, ...elegidos.flatMap(h => [h.desde, h.hasta])]), hilos: new Set(elegidos.map(h => h.id)) }
}

export function destinosDe(clave, { hilos }) {
  return hilos.filter(h => h.clave === clave && h.desde === `t:${clave}`).map(h => h.hasta)
}

// Un trabajador "corre" en el mapa solo si su última corrida está en curso y no quedó trabada.
export function corriendoAhora(trabajadores, corridasPor, ahora = Date.now()) {
  return trabajadores.filter(t => {
    const ultima = (corridasPor[t.clave] || [])[0]
    return ultima?.estado === 'corriendo' && !trabada(ultima, ahora, t.minutos_trabado)
  }).map(t => t.clave)
}

// ---------- Señales de vida del mapa: todo sale de datos reales, nada es decorativo ----------
const MIN_MS = 60_000

// Próxima corrida según el cron del trabajador (UTC, como pg_cron). null si está pausado o el cron no se entiende.
export function proximaCorrida(trabajador, ahora = Date.now()) {
  if (!trabajador?.activo) return null
  const cron = parsearCron(trabajador.frecuencia)
  if (!cron) return null
  const inicio = Math.floor(ahora / HORA_MS) * HORA_MS
  for (let h = 0; h <= 48; h++) {
    const hora = inicio + h * HORA_MS
    for (const m of minutosProgramados(cron, hora)) {
      const t = hora + m * MIN_MS
      if (t > ahora) return t
    }
  }
  return null
}

export function enCuanto(t, ahora = Date.now()) {
  const min = Math.ceil((t - ahora) / MIN_MS)
  if (min <= 1) return 'en 1 min'
  if (min < 60) return `en ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `en ${h} h` : `en ${Math.round(h / 24)} d`
}

// progreso: cuánto pasó entre la última corrida terminada y la próxima (0 a 1). Es lo que llena el arco del nodo.
export function vidaDeTrabajador(trabajador, corridas = [], ahora = Date.now()) {
  const terminada = corridas.find(c => c.estado !== 'corriendo')
  const ultimaFin = terminada ? Date.parse(terminada.finalizado_at || terminada.iniciado_at) : null
  const proxima = proximaCorrida(trabajador, ahora)
  const corridas24 = corridas.filter(c => Date.parse(c.iniciado_at) >= ahora - 24 * HORA_MS).length
  const progreso = proxima && ultimaFin && proxima > ultimaFin ? Math.min(1, Math.max(0, (ahora - ultimaFin) / (proxima - ultimaFin))) : null
  return { corridas24, ultimaFin, proxima, progreso }
}

// El grosor del hilo es el tráfico: corridas en 24 h, en escala logarítmica para que cada 15 min no aplaste al diario.
export function grosorHilo(corridas24) {
  return Math.round(Math.min(3.6, 1 + Math.log2(1 + (corridas24 || 0)) * 0.45) * 10) / 10
}

// Última vez que alguno de los trabajadores conectados a un nodo leyó o escribió ahí.
export function ultimaActividad(id, { hilos }, vidas) {
  const claves = new Set(hilos.filter(h => h.desde === id || h.hasta === id).map(h => h.clave))
  const tiempos = [...claves].map(k => vidas[k]?.ultimaFin).filter(Number.isFinite)
  return tiempos.length ? Math.max(...tiempos) : null
}

export function textoTrabajador(trabajador, vida, corriendo, ahora = Date.now()) {
  if (!trabajador.activo) return 'pausado'
  if (corriendo) return 'corriendo ahora'
  const partes = [vida.ultimaFin ? `corrió ${haceCuanto(new Date(vida.ultimaFin).toISOString(), ahora)}` : 'todavía no corrió']
  if (vida.proxima) partes.push(`vuelve ${enCuanto(vida.proxima, ahora)}`)
  return partes.join(' · ')
}
