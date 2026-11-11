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
  return accion?.tipo === 'frenar_pieza' && Array.isArray(accion.piezas) && accion.piezas.every(p => typeof p === 'string' && p.length <= 64)
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
