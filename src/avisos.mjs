// Avisos de Hoy: lo que María consolida en process_reports, escrito en texto claro. No es el estado del
// trabajador María (eso está en Trabajadores) sino lo que encontró: un sitio que no responde, tareas quietas.
export const AGENTES_MARIA = ['monitor_sitios', 'tareas_estancadas', 'sync_estado']
const ZONA = 'America/Argentina/Buenos_Aires'
const DIA_MS = 86_400_000

function host(url) {
  try { return new URL(url).host } catch { return url }
}

function fechaCorta(iso) {
  const [, m, d] = new Intl.DateTimeFormat('sv-SE', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)).split('-')
  return `${d}/${m}`
}

export function haceDias(iso, ahora) {
  const dias = Math.floor((ahora - Date.parse(iso)) / DIA_MS)
  return dias <= 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`
}

const nivelDe = n => (n === 'error' ? 'error' : 'aviso')

function avisoDeChequeo(sitio, c) {
  const detalles = [c.detalle, host(sitio.url)].filter(Boolean)
  if (c.tipo === 'sitio online') {
    return { nivel: nivelDe(c.nivel), texto: c.nivel === 'error' ? `${sitio.nombre} no responde` : `${sitio.nombre} responde con problemas`, detalles }
  }
  if (c.tipo === 'corrida del scraper') return { nivel: nivelDe(c.nivel), texto: 'El scraper de empleo está atrasado', detalles: [c.detalle] }
  if (c.tipo === 'GitHub Actions') {
    return { nivel: nivelDe(c.nivel), texto: c.nivel === 'error' ? 'Falló la última corrida del scraper en GitHub' : 'La corrida del scraper en GitHub no terminó', detalles: [c.detalle] }
  }
  return { nivel: nivelDe(c.nivel), texto: `${sitio.nombre}: ${c.tipo}`, detalles: [c.detalle] }
}

function sitios(r, avisos, enOrden) {
  const lista = r.detalle?.sitios
  if (!Array.isArray(lista)) {
    if (r.estado !== 'ok') avisos.push({ nivel: 'error', texto: 'María no pudo revisar los sitios', detalles: [r.resumen].filter(Boolean) })
    return
  }
  let enLinea = 0
  for (const sitio of lista) {
    const fallas = (sitio.chequeos ?? []).filter(c => c.nivel !== 'ok')
    if (!fallas.length) { enLinea++; continue }
    for (const c of fallas) avisos.push(avisoDeChequeo(sitio, c))
  }
  if (enLinea) enOrden.push(enLinea === lista.length ? (enLinea === 1 ? '1 sitio online' : `${enLinea} sitios online`) : `${enLinea} de ${lista.length} sitios bien`)
}

function tareas(r, avisos, enOrden, { proyectoDeTarea, nombreProyecto, ahora }) {
  const lista = Array.isArray(r.detalle) ? r.detalle : null
  if (!lista) {
    if (r.estado !== 'ok') avisos.push({ nivel: 'error', texto: 'María no pudo revisar las tareas', detalles: [r.resumen].filter(Boolean) })
    return
  }
  if (!lista.length) { enOrden.push('ninguna tarea quieta'); return }
  avisos.push({
    nivel: lista.length > 5 ? 'error' : 'aviso',
    texto: lista.length === 1 ? '1 tarea sin tocar hace más de 3 días' : `${lista.length} tareas sin tocar hace más de 3 días`,
    detalles: lista.map(t => `${t.title} — ${nombreProyecto(proyectoDeTarea[t.id]) ?? 'sin proyecto'} · sin tocar desde el ${fechaCorta(t.touched_at)} (${haceDias(t.touched_at, ahora)})`),
  })
}

function google(r, avisos, enOrden) {
  if (r.estado === 'ok') { enOrden.push('Google sincronizado'); return }
  const d = r.detalle ?? {}
  if (d.vinculado === false) avisos.push({ nivel: 'aviso', texto: 'Google no está vinculado', detalles: ['Conectalo desde Mail y Calendario.'] })
  else if (d.refrescable === false) avisos.push({ nivel: 'aviso', texto: 'Google puede pedir reconectar la cuenta pronto', detalles: ['Si deja de sincronizar, reconectalo desde Mail y Calendario.'] })
  else if (Number.isFinite(d.horas)) avisos.push({ nivel: nivelDe(r.estado), texto: `Google no se sincroniza hace ${Math.round(d.horas)} h`, detalles: ['El trabajador Google corre cada 15 minutos: mirá qué le pasa en Trabajadores.'] })
  else avisos.push({ nivel: nivelDe(r.estado), texto: 'Algo anda mal con Google', detalles: [r.resumen].filter(Boolean) })
}

const LECTORES = { monitor_sitios: sitios, tareas_estancadas: tareas, sync_estado: google }

// reportes: filas de process_reports (de cualquier antigüedad); se usa la última de cada chequeo de María.
export function avisosDeMaria(reportes, { proyectoDeTarea = {}, proyectos = [], ahora = Date.now() } = {}) {
  const ultimos = {}
  for (const r of reportes ?? []) {
    if (!AGENTES_MARIA.includes(r.agente)) continue
    if (!ultimos[r.agente] || Date.parse(r.iniciado_at) > Date.parse(ultimos[r.agente].iniciado_at)) ultimos[r.agente] = r
  }
  const nombreProyecto = id => (id ? proyectos.find(p => p.id === id)?.name ?? null : null)
  const avisos = [], enOrden = []
  for (const agente of AGENTES_MARIA) if (ultimos[agente]) LECTORES[agente](ultimos[agente], avisos, enOrden, { proyectoDeTarea, nombreProyecto, ahora })
  const fechas = Object.values(ultimos).map(r => Date.parse(r.iniciado_at))
  return {
    avisos: avisos.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'error' ? -1 : 1)),
    enOrden,
    consolidado_at: fechas.length ? new Date(Math.max(...fechas)).toISOString() : null,
  }
}

export function tareasEstancadasIds(reportes) {
  const r = (reportes ?? []).filter(x => x.agente === 'tareas_estancadas').sort((a, b) => Date.parse(b.iniciado_at) - Date.parse(a.iniciado_at))[0]
  return Array.isArray(r?.detalle) ? r.detalle.map(t => t.id) : []
}

export function haceCuantoConsolidado(iso, ahora = Date.now()) {
  if (!iso) return null
  const min = Math.round((ahora - Date.parse(iso)) / 60_000)
  const hora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  if (min < 1) return `consolidado recién · ${hora}`
  if (min < 60) return `consolidado hace ${min} min · ${hora}`
  const h = Math.round(min / 60)
  return `consolidado hace ${h} h · ${hora}`
}
