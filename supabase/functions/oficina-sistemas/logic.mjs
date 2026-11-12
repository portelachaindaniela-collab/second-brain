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
  return false
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
