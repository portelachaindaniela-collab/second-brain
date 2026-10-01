// Detalle legible de una corrida: una frase que dice qué pasó y secciones con nombres en castellano, en un orden
// que se lee de arriba abajo. Cada trabajador conocido tiene su forma; el resto cae en una versión genérica.
// Los datos crudos siguen disponibles aparte (plegados) para diagnosticar.
const ZONA = 'America/Argentina/Buenos_Aires'
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

const n = v => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('es-AR') : '—')
const plural = (cantidad, uno, varios) => `${n(cantidad)} ${Number(cantidad) === 1 ? uno : varios}`

function diaCorto(aaaammdd) {
  const [a, m, d] = aaaammdd.split('-').map(Number)
  return `${DIAS[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function horaDe(iso) {
  const t = Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)
  return Number.isFinite(t) ? new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(t) : null
}

// "2026-10-01 · AI IN LATAM" → { dia: 'jue 01/10', texto: 'AI IN LATAM' }
export function itemConFecha(s) {
  const m = /^(\d{4}-\d{2}-\d{2}) · (.+)$/.exec(String(s))
  return m ? { dia: diaCorto(m[1]), texto: m[2] } : { dia: null, texto: String(s) }
}

function buscador(p) {
  const descartados = Object.entries(p.descartados ?? {})
  const totalDescartados = descartados.reduce((s, [, v]) => s + Number(v || 0), 0)
  const cargados = Array.isArray(p.cargados) ? p.cargados : []
  const resumen = `Encontró ${plural(p.encontrados, 'evento', 'eventos')}; ${n(p.en_ventana)} caen en los próximos días, ${n(p.ya_estaban)} ya estaban y ${n(totalDescartados)} se descartaron. `
    + (cargados.length ? `Cargó ${plural(cargados.length, 'evento nuevo', 'eventos nuevos')}.` : 'No cargó ninguno nuevo.')
  const secciones = [
    { titulo: 'recorrido', filas: [
      { etiqueta: 'encontrados', valor: n(p.encontrados) },
      { etiqueta: 'en la ventana de días', valor: n(p.en_ventana) },
      { etiqueta: 'ya estaban en Eventos', valor: n(p.ya_estaban), tenue: true },
      { etiqueta: 'descartados', valor: n(totalDescartados), tenue: true },
      ...descartados.map(([motivo, v]) => ({ etiqueta: motivo, valor: n(v), sangria: true, tenue: true })),
      ...(Number(p.sin_abrir_por_tope) ? [{ etiqueta: 'sin abrir por el tope de la corrida', valor: n(p.sin_abrir_por_tope), nivel: 'aviso' }] : []),
      { etiqueta: 'cargados', valor: n(cargados.length), fuerte: true },
    ] },
  ]
  if (cargados.length) secciones.push({ titulo: 'eventos cargados', items: cargados.map(itemConFecha) })
  const terminos = Object.entries(p.por_termino ?? {})
  if (terminos.length) secciones.push({ titulo: 'resultados por búsqueda', filas: terminos.map(([k, v]) => {
    const [fuente, termino] = k.includes(': ') ? k.split(': ') : [null, k]
    return { etiqueta: termino, detalle: fuente, valor: n(v) }
  }) })
  if (p.errores?.length) secciones.push({ titulo: 'errores', items: p.errores.map(texto => ({ texto, nivel: 'error' })) })
  return { resumen, secciones }
}

function google(p) {
  if (!p.conectado) return { resumen: p.reconectar ? 'Google pide volver a conectar la cuenta.' : 'Google no está vinculado.', secciones: [] }
  if (p.eventos == null && p.error) return { resumen: `Google rechazó la consulta: ${p.error}`, secciones: [] }
  return {
    resumen: `Trajo ${plural(p.eventos, 'evento', 'eventos')} de los próximos 7 días y ${plural(p.mails, 'mail sin leer', 'mails sin leer')}${Number(p.eliminados) ? `, y quitó ${plural(p.eliminados, 'evento borrado', 'eventos borrados')} en Google` : ''}.`,
    secciones: [
      { titulo: 'sincronización', filas: [
        { etiqueta: 'cuenta', valor: p.cuenta ?? '—', texto: true },
        { etiqueta: 'eventos del calendario', valor: n(p.eventos) },
        { etiqueta: 'mails sin leer', valor: n(p.mails) },
        { etiqueta: 'eventos borrados en Google', valor: n(p.eliminados), tenue: !Number(p.eliminados) },
      ] },
      ...(p.error ? [{ titulo: 'avisos', items: [{ texto: p.error, nivel: 'aviso' }] }] : []),
    ],
  }
}

const AGENTES = { monitor_sitios: 'sitios', tareas_estancadas: 'tareas estancadas', sync_estado: 'enlace con Google' }

function maria(p) {
  const agentes = p.agentes ?? []
  const problemas = agentes.filter(a => a.estado !== 'ok')
  return {
    resumen: problemas.length
      ? `Revisó ${agentes.length} cosas; ${problemas.map(a => AGENTES[a.agente] ?? a.agente).join(' y ')} ${problemas.length === 1 ? 'pide' : 'piden'} mirar.`
      : `Revisó ${agentes.length} cosas y todo está bien.`,
    secciones: [{ titulo: 'chequeos', filas: agentes.map(a => ({
      etiqueta: AGENTES[a.agente] ?? a.agente, detalle: a.resumen, valor: a.estado, estado: a.estado, texto: true,
    })) }],
  }
}

function scraper(p) {
  const portales = Object.entries(p.portales ?? {})
  const caidos = portales.filter(([, v]) => v?.estado !== 'ok')
  const desde = p.inicio ? horaDe(p.inicio) : null, hasta = p.fin ? horaDe(p.fin) : null
  return {
    resumen: `El scraper publicó ${plural(p.publicados, 'oferta nueva', 'ofertas nuevas')} (${n(p.nuevos_totales)} nuevas antes de filtrar)`
      + (desde && hasta ? `, en su corrida de ${desde} a ${hasta}` : '') + (caidos.length ? `. Fallaron: ${caidos.map(([k]) => k).join(', ')}.` : '.'),
    secciones: portales.length ? [{ titulo: 'portales · ofertas encontradas', filas: portales.map(([k, v]) => ({
      etiqueta: k, detalle: v?.errores?.length ? v.errores.join(' · ') : null, valor: n(v?.encontrados), estado: v?.estado === 'ok' ? null : 'error',
    })) }] : [],
  }
}

const FORMAS = { buscador_eventos: buscador, google_sync: google, maria, scraper_empleo: scraper }

const legible = k => String(k).replace(/_/g, ' ')

// Genérico: claves sin guiones bajos, números alineados, listas como ítems, objetos como sub-filas.
function generico(p) {
  const filas = [], secciones = []
  for (const [k, v] of Object.entries(p ?? {})) {
    if (Array.isArray(v)) secciones.push({ titulo: legible(k), items: v.length ? v.map(x => (typeof x === 'object' ? { texto: JSON.stringify(x) } : itemConFecha(x))) : [{ texto: 'ninguno', tenue: true }] })
    else if (v && typeof v === 'object') secciones.push({ titulo: legible(k), filas: Object.entries(v).map(([k2, v2]) => ({ etiqueta: legible(k2), valor: typeof v2 === 'object' ? JSON.stringify(v2) : typeof v2 === 'number' ? n(v2) : String(v2), texto: typeof v2 !== 'number' })) })
    else filas.push({ etiqueta: legible(k), valor: typeof v === 'number' ? n(v) : String(v ?? '—'), texto: typeof v !== 'number' })
  }
  return { resumen: null, secciones: filas.length ? [{ titulo: 'datos', filas }, ...secciones] : secciones }
}

export function detalleCorrida(clave, corrida) {
  if (!corrida?.payload) return { resumen: null, secciones: [] }
  try { return (FORMAS[clave] ?? generico)(corrida.payload) } catch { return generico(corrida.payload) }
}
