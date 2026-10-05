// Cálculos de los gráficos de Hoy. Fechas en la hora local del dispositivo (la de la usuaria). Sin red.
const DIA_MS = 86_400_000
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export const inicioDelDia = (ms = Date.now()) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const horaDecimal = ms => { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60 }

// Eventos de hoy como bloques sobre el eje de horas [desde, hasta]. Los de todo el día van aparte.
export function bloquesDelDia(eventos, ahora = Date.now(), desde = 7, hasta = 24) {
  const hoy = inicioDelDia(ahora)
  const todoElDia = [], bloques = []
  for (const e of eventos) {
    if (e.all_day) { todoElDia.push(e); continue }
    const ini = Date.parse(e.starts_at)
    const fin = e.ends_at ? Date.parse(e.ends_at) : ini + 3_600_000
    const a = ini < hoy ? 0 : horaDecimal(ini)
    const b = fin >= hoy + DIA_MS ? 24 : horaDecimal(fin)
    bloques.push({ evento: e, desde: Math.max(desde, Math.min(hasta, a)), hasta: Math.max(desde, Math.min(hasta, Math.max(b, a + 0.25))) })
  }
  bloques.sort((x, y) => x.desde - y.desde)
  // Carriles: un evento que se pisa con otro baja a la línea siguiente.
  const finCarril = []
  for (const bl of bloques) {
    let c = finCarril.findIndex(f => f <= bl.desde)
    if (c < 0) { c = finCarril.length; finCarril.push(0) }
    finCarril[c] = bl.hasta
    bl.carril = c
  }
  return { bloques, todoElDia, carriles: Math.max(1, finCarril.length) }
}

// Cuántos ítems caen en cada uno de `dias` días a partir de `desde` (inicio de día). fecha(item) → ISO.
export function porDia(items, fecha, desde, dias) {
  const salida = Array.from({ length: dias }, (_, i) => {
    const d = new Date(desde + i * DIA_MS + 12 * 3_600_000)
    return { inicio: inicioDelDia(d.getTime()), etiqueta: DIAS[d.getDay()], dia: d.getDate(), n: 0 }
  })
  for (const it of items) {
    const t = Date.parse(fecha(it))
    const i = salida.findIndex(s => t >= s.inicio && t < s.inicio + DIA_MS)
    if (i >= 0) salida[i].n++
  }
  return salida
}

export function topRemitentes(mails, n = 4) {
  const cuenta = new Map()
  for (const m of mails) {
    const quien = (m.from_name || m.from_addr || 'desconocido').trim()
    cuenta.set(quien, (cuenta.get(quien) ?? 0) + 1)
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)
}

export function tareasPorProyecto(tareas, proyectos) {
  const cuenta = new Map()
  for (const t of tareas) cuenta.set(t.project_id ?? null, (cuenta.get(t.project_id ?? null) ?? 0) + 1)
  return [...cuenta.entries()].map(([id, n]) => {
    const p = proyectos.find(x => x.id === id)
    return { id, nombre: p?.name ?? 'Sin proyecto', color: p?.color ?? 'var(--gray-500)', n }
  }).sort((a, b) => b.n - a.n)
}

// Sitios que revisó el trabajador de sitios en su último reporte: nombre, nivel y cuánto tardó en responder.
export function sitiosRevisados(reportes) {
  const r = reportes.find(x => x.agente === 'monitor_sitios')
  const lista = r?.detalle?.sitios
  if (!Array.isArray(lista)) return []
  return lista.map(s => ({
    nombre: s.nombre,
    url: s.url,
    nivel: s.nivel ?? 'ok',
    latencia: s.chequeos?.find(c => Number.isFinite(c.latencia_ms))?.latencia_ms ?? null,
  }))
}

export function contarTemas(noticias) {
  const cuenta = {}
  for (const n of noticias) for (const t of n.temas ?? []) cuenta[t] = (cuenta[t] ?? 0) + 1
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1])
}

// Corridas de los trabajadores por hora en las últimas 24 h: [{ inicio, ok, error }], de la más vieja a la actual.
export function corridasPorHora(corridas, ahora = Date.now()) {
  const actual = Math.floor(ahora / 3_600_000) * 3_600_000
  const horas = Array.from({ length: 24 }, (_, i) => ({ inicio: actual - (23 - i) * 3_600_000, ok: 0, error: 0 }))
  for (const c of corridas) {
    const i = Math.floor((Date.parse(c.iniciado_at) - horas[0].inicio) / 3_600_000)
    if (i < 0 || i > 23) continue
    if (c.estado === 'error') horas[i].error++
    else if (c.estado === 'ok') horas[i].ok++
  }
  return horas
}

export function diaCorto(ms) {
  const d = new Date(ms)
  return `${DIAS[d.getDay()]} ${d.getDate()}`
}
