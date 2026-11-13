// Lógica pura de oficina-sistemas: validar el pedido y armar la nota con lo que se hizo.
export const REPO = 'portelachaindaniela-collab/second-brain'
export const WORKFLOW_DISENADOR = 'up-disenador.yml'
export const MOTIVO_FRENO = 'Frenada por Noruega (aprobado por Daniela): el Diseñador no armó las placas a tiempo. Revisá las placas y volvé a aprobarla.'

// { solicitud: 12 } — el id del pedido a aprobar y ejecutar.
export function validarPedido(body) {
  const id = Number(body?.solicitud)
  return Number.isInteger(id) && id > 0 ? { ok: true, id } : { ok: false, error: 'Falta el pedido.' }
}

// Solo se ejecutan acciones conocidas.
export function accionValida(accion) {
  if (accion?.tipo === 'frenar_pieza') return Array.isArray(accion.piezas) && accion.piezas.every(p => typeof p === 'string' && p.length <= 64)
  if (accion?.tipo === 'cargar_calendario_up') return diasValidos(accion.dias).length > 0 && diasValidos(accion.dias).length === accion.dias.length
  if (accion?.tipo === 'programar') return true
  if (accion?.tipo === 'tarea') return AREAS.includes(accion.area) && ID.test(accion.responsable ?? '') && ID.test(accion.supervisor ?? '')
  return false
}
const AREAS = ['trabajadores', 'up', 'pdg', 'sistemas', 'admin']
const ID = /^(trabajadores|up|pdg|sistemas|admin):[a-z_]{1,40}$/

// ---------- Programar (Sistemas) ----------
// Al aprobarse un pedido de código, Sistemas lo abre como issue en GitHub con la etiqueta «sistemas»: la Action
// «Sistemas · Claude programa» lo toma, escribe el código y deja una rama lista para el PR. Nada se publica sin que
// Daniela revise y apruebe el PR.
export const ETIQUETA = 'sistemas'
export function issueDelPedido(s) {
  return {
    title: `Sistemas: ${String(s.titulo).slice(0, 180)}`,
    labels: [ETIQUETA],
    body: [
      `Pedido #${s.id} de la Oficina, aprobado por Daniela. Lo pidió \`${s.agente}\`.`,
      '',
      '## Qué hay que hacer',
      String(s.detalle || s.titulo),
      '',
      '## Cómo trabajar',
      '- Leé `CLAUDE.md` antes de empezar y mirá el código que vas a tocar: cambios mínimos, sin tocar lo que no hace falta.',
      '- Antes de terminar corré `node --test src/*.test.mjs supabase/functions/*/*.test.mjs`, `npx oxlint` y `npx vite build`.',
      '- Dejá el cambio en una rama y el link para abrir el PR contra `master`. No mergees: Daniela lo revisa.',
      '- Si hace falta una migración o una Edge Function, dejalas en el repo y explicá en el PR cómo aplicarlas (desde acá no hay acceso a Supabase).',
      '- Nunca pongas claves ni tokens en el código. Si el pedido no se puede hacer o no está claro, explicalo en un comentario en vez de inventar.',
    ].join('\n'),
  }
}
export function notaProgramar({ estado, url, detalle }) {
  if (estado === 'abierto') return `Sistemas lo abrió en GitHub y Claude lo está programando: ${url} . Cuando termine te deja el PR para revisar; nada se publica sin que lo apruebes.`
  if (estado === 'sin_token') return 'Aprobado, pero Sistemas no pudo abrirlo en GitHub: falta configurar un token de GitHub con permiso para crear issues (GITHUB_TOKEN en las funciones de Supabase).'
  return `Aprobado, pero Sistemas no pudo abrirlo en GitHub (${detalle}).`
}

// ---------- Tarea ----------
// Lo que no necesita código queda como tarea del agente que lo pidió, a cargo del supervisor de su área (se ve en el
// Archivo y la sigue en las reuniones).
export function tareaDelPedido(s) {
  const texto = `${s.titulo}${s.detalle ? `: ${s.detalle}` : ''}`.replace(/\s+/g, ' ').trim().slice(0, 500)
  return { tarea: texto, area: s.accion.area, responsable: s.accion.responsable, supervisor: s.accion.supervisor }
}

// Los días de un calendario para UP (los arma María en el acta): fecha, tema, redes y formato de Instagram.
const REDES = ['linkedin', 'x', 'instagram']
export function diasValidos(dias) {
  if (!Array.isArray(dias) || dias.length > 62) return []
  return dias.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d?.fecha ?? '')) && typeof d.tema === 'string' && d.tema.trim().length >= 3 && d.tema.length <= 300
    && Array.isArray(d.redes) && d.redes.length && d.redes.every(x => REDES.includes(x)) && ['reel', 'carrusel', 'ninguno'].includes(d.formato_instagram))
}
// Las filas para up_calendario, salteando los días que ya tienen algo cargado (no se pisa nada).
export function filasCalendario(accion, fechasOcupadas) {
  const ocupadas = new Set(fechasOcupadas)
  return diasValidos(accion.dias).filter(d => !ocupadas.has(d.fecha)).map(d => ({
    fecha: d.fecha, tema_semana: String(accion.titulo || 'Plan de la Oficina').slice(0, 200), tema_dia: d.tema.trim(),
    redes: d.redes, formato_instagram: d.redes.includes('instagram') ? d.formato_instagram : 'ninguno',
  }))
}
export function notaCalendario({ pedidos, cargados }) {
  const salteados = pedidos - cargados
  return `Cargué ${plural(cargados, 'día', 'días')} en el calendario de UP${salteados ? ` (${plural(salteados, 'día ya tenía', 'días ya tenían')} publicación y no lo${salteados === 1 ? '' : 's'} toqué)` : ''}. Desde ahí la cadena de UP escribe los borradores sola y te llegan para aprobar.`
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
// cancelacion: { estado: 'sin_token' | 'sin_corridas' | 'canceladas' | 'error' | 'no_pedida', n?, detalle? }
export function notaResultado({ pedidas, frenadas, cancelacion }) {
  const partes = []
  if (pedidas) partes.push(frenadas === pedidas ? `${plural(frenadas, 'pieza volvió', 'piezas volvieron')} a revisión: no se van a publicar sin que las apruebes de nuevo.`
    : `${frenadas} de ${pedidas} piezas volvieron a revisión (las otras ya no estaban aprobadas).`)
  else partes.push('No había piezas aprobadas para frenar.')
  const c = cancelacion
  if (c.estado === 'canceladas') partes.push(`Cancelé ${plural(c.n, 'corrida', 'corridas')} del Diseñador.`)
  else if (c.estado === 'sin_corridas') partes.push('El Diseñador no tenía corridas en curso para cancelar.')
  else if (c.estado === 'sin_token') partes.push('No pude cancelar la Action: falta un token de GitHub con permiso para Actions. Igual se corta sola a los 15 minutos.')
  else if (c.estado === 'error') partes.push(`No pude cancelar la Action (${c.detalle}). Igual se corta sola a los 15 minutos.`)
  return partes.join(' ')
}
