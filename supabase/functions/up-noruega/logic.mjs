// Noruega, el agente madre de UP: cada 30 minutos chequea que el resto de los agentes esté funcionando.
// Cada chequeo devuelve { id, nombre, estado: 'ok' | 'aviso' | 'falla', detalle }. Todo lo que no consulta la base
// vive acá para probarlo con node --test.

export const ESPERA_DISENADOR_MIN = 45
export const TOLERANCIA_PUBLICACION_MIN = 30
export const CORRIDA_COLGADA_MIN = 15
export const DIAS_AVISO_CONEXION = 7
export const HORA_FIN_PIPELINE = '08:00'
const MIN = 60_000

export function hoyAR(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}
export function horaAR(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ahora)
}
function sumarDia(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const NOMBRE_RED = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' }
const r = (id, nombre, estado, detalle) => ({ id, nombre, estado, detalle })

// Qué redes lleva un día (igual que el planificador).
export function redesDelDia(dia) {
  const redes = []
  if (dia.redes.includes('linkedin')) redes.push('linkedin')
  if (dia.redes.includes('x')) redes.push('x')
  if (dia.redes.includes('instagram') && dia.formato_instagram !== 'ninguno') redes.push('instagram')
  return redes
}

// 1. Los borradores de hoy: después de las 08:00 cada red del día tiene que tener texto o estar esperando un dato.
export function chequearBorradores({ dia, piezas, ahora }) {
  const nombre = 'Borradores de hoy'
  if (!dia) return r('borradores', nombre, 'ok', 'Hoy no hay publicación en el calendario.')
  if (dia.salteado) return r('borradores', nombre, 'ok', 'Salteaste el día de hoy.')
  const sinHacer = redesDelDia(dia).filter(red => {
    const p = piezas.find(x => x.red === red)
    return !p || (!p.texto && p.estado !== 'falta_info')
  })
  if (!sinHacer.length) return r('borradores', nombre, 'ok', 'Están todos los borradores del día.')
  if (horaAR(ahora) < HORA_FIN_PIPELINE) return r('borradores', nombre, 'ok', `Faltan ${sinHacer.map(x => NOMBRE_RED[x]).join(', ')}; los agentes trabajan hasta las 07:52.`)
  return r('borradores', nombre, 'falla', `No se generó ${sinHacer.map(x => NOMBRE_RED[x]).join(', ')}. Mirá el registro de corridas o tocá Generar en Hoy.`)
}

// 2. Las corridas de las últimas 24 horas: errores, corridas colgadas y cortes de cuota seguidos. Un error que
// después se resolvió (una corrida posterior del mismo día terminó bien) ya no cuenta.
export function chequearCorridas({ corridas, ahora }) {
  const nombre = 'Corridas'
  const recientes = corridas.filter(c => ahora - Date.parse(c.iniciado_at) < 24 * 60 * MIN)
  const resuelta = c => recientes.some(o => o.fecha === c.fecha && o.estado === 'ok' && o.iniciado_at > c.iniciado_at)
  const colgadas = recientes.filter(c => c.estado === 'corriendo' && ahora - Date.parse(c.iniciado_at) > CORRIDA_COLGADA_MIN * MIN)
  if (colgadas.length) return r('corridas', nombre, 'falla', `${plural(colgadas.length, 'corrida quedó', 'corridas quedaron')} sin terminar hace más de ${CORRIDA_COLGADA_MIN} minutos.`)
  const errores = recientes.filter(c => c.estado === 'error' && !resuelta(c))
  // Gemini saturado (503) es pasajero: aviso para volver a probar, no una falla del sistema.
  const saturado = c => /high demand|overloaded|unavailable|\b503\b/i.test(c.error || '')
  const graves = errores.filter(c => !saturado(c))
  if (graves.length) return r('corridas', nombre, 'falla', `${plural(graves.length, 'corrida terminó', 'corridas terminaron')} con error: ${graves[0].error || 'mirá el registro'}.`)
  if (errores.length) return r('corridas', nombre, 'aviso', `Gemini estaba saturado y ${plural(errores.length, 'corrida no terminó', 'corridas no terminaron')}. Lo que ya estaba escrito no se tocó; probá de nuevo en un rato.`)
  const cortadas = recientes.filter(c => c.estado === 'cortado' && !resuelta(c)).length
  if (cortadas >= 3) return r('corridas', nombre, 'aviso', `Gemini cortó ${cortadas} corridas por cuota en 24 horas; lo que falta sigue en la próxima.`)
  return r('corridas', nombre, 'ok', recientes.length ? `${plural(recientes.length, 'corrida', 'corridas')} en 24 horas, sin errores.` : 'Sin corridas en las últimas 24 horas.')
}

// 3. El diseñador: un carrusel con texto nuevo no puede esperar más de 45 minutos por sus placas.
export function chequearDisenador({ carruseles, ahora }) {
  const nombre = 'Diseñador'
  const pendientes = carruseles.filter(p => p.texto && p.estado !== 'publicado' && p.assets_texto !== p.texto)
  const atrasados = pendientes.filter(p => ahora - Date.parse(p.updated_at) > ESPERA_DISENADOR_MIN * MIN)
  if (atrasados.length) return r('disenador', nombre, 'falla', `${plural(atrasados.length, 'carrusel espera', 'carruseles esperan')} sus placas hace más de ${ESPERA_DISENADOR_MIN} minutos. Revisá la Action «UP · Diseñador» en GitHub.`)
  if (pendientes.length) return r('disenador', nombre, 'ok', `Armando ${plural(pendientes.length, 'carrusel', 'carruseles')}.`)
  return r('disenador', nombre, 'ok', 'No hay placas pendientes.')
}

// 4. El publicador: lo aprobado de hoy tiene que salir a su hora (con 30 minutos de tolerancia).
export function chequearPublicador({ piezasHoy, horarios, conexiones, ahora, redesAutomaticas }) {
  const nombre = 'Publicador'
  const conError = piezasHoy.filter(p => p.error_publicacion)
  if (conError.length) return r('publicador', nombre, 'falla', `No salió ${conError.map(p => NOMBRE_RED[p.red]).join(', ')}: ${conError[0].error_publicacion}`)
  const hm = horaAR(new Date(ahora - TOLERANCIA_PUBLICACION_MIN * MIN))
  const trabadas = piezasHoy.filter(p => {
    const hora = horarios.find(h => h.red === p.red)?.hora
    return p.estado === 'aprobado' && redesAutomaticas.includes(p.red) && hora && conexiones.some(c => c.red === p.red) && hm >= String(hora).slice(0, 5)
  })
  if (trabadas.length) return r('publicador', nombre, 'falla', `${trabadas.map(p => NOMBRE_RED[p.red]).join(', ')} estaba aprobado y no salió a su hora.`)
  const publicadas = piezasHoy.filter(p => p.estado === 'publicado').length
  return r('publicador', nombre, 'ok', publicadas ? `Hoy ${plural(publicadas, 'publicación salió', 'publicaciones salieron')}.` : 'Nada para publicar todavía.')
}

// 5. Las conexiones con las redes: vencidas o por vencer.
export function chequearConexiones({ conexiones, ahora }) {
  const nombre = 'Conexiones'
  if (!conexiones.length) return r('conexiones', nombre, 'ok', 'Ninguna red conectada: lo aprobado lo publicás vos.')
  const vencidas = conexiones.filter(c => c.expira_at && Date.parse(c.expira_at) <= ahora)
  if (vencidas.length) return r('conexiones', nombre, 'falla', `Venció la conexión con ${vencidas.map(c => NOMBRE_RED[c.red]).join(', ')}. Reconectala en Redes.`)
  const porVencer = conexiones.filter(c => c.expira_at && Date.parse(c.expira_at) - ahora < DIAS_AVISO_CONEXION * 24 * 60 * MIN)
  if (porVencer.length) return r('conexiones', nombre, 'aviso', `La conexión con ${porVencer.map(c => NOMBRE_RED[c.red]).join(', ')} vence en menos de ${DIAS_AVISO_CONEXION} días. Reconectala en Redes.`)
  return r('conexiones', nombre, 'ok', `${conexiones.map(c => NOMBRE_RED[c.red]).join(', ')} conectado.`)
}

// 6. Preguntas sin responder para hoy o mañana: sin respuesta, esos días no tienen borrador.
export function chequearPreguntas({ faltaInfo, ahora }) {
  const nombre = 'Preguntas para vos'
  const hoy = hoyAR(new Date(ahora)), manana = sumarDia(hoy, 1)
  const urgentes = [...new Set(faltaInfo.filter(p => p.fecha === hoy || p.fecha === manana).map(p => p.fecha))]
  if (urgentes.length) return r('preguntas', nombre, 'aviso', `Hay una pregunta sin responder para ${urgentes.map(f => (f === hoy ? 'hoy' : 'mañana')).join(' y ')}. Respondela en «Necesito que me cuentes».`)
  const otras = new Set(faltaInfo.map(p => p.fecha)).size
  return r('preguntas', nombre, 'ok', otras ? `${plural(otras, 'día espera', 'días esperan')} una respuesta, sin apuro.` : 'No hay preguntas pendientes.')
}

// 7. Los crons: que cada uno haya corrido cuando le tocaba.
export const CRONS = {
  'up-pipeline': { nombre: 'pipeline de la mañana', cadaMin: 26 * 60 },
  'up-publicador': { nombre: 'publicador', cadaMin: 20 },
}
export function chequearCrons({ crons, ahora }) {
  const nombre = 'Crons'
  const problemas = []
  for (const [job, { nombre: n, cadaMin }] of Object.entries(CRONS)) {
    const c = crons.find(x => x.jobname === job)
    if (!c) { problemas.push(`no existe el cron del ${n}`); continue }
    if (!c.ultimo_inicio || ahora - Date.parse(c.ultimo_inicio) > cadaMin * MIN) problemas.push(`el ${n} no corre desde hace más de lo esperado`)
    else if (c.ultimo_estado === 'failed') problemas.push(`la última corrida del ${n} falló`)
  }
  return problemas.length ? r('crons', nombre, 'falla', `${problemas.join('; ')}.`) : r('crons', nombre, 'ok', 'Los crons corren a horario.')
}

export function estadoGeneral(chequeos) {
  if (chequeos.some(c => c.estado === 'falla')) return 'falla'
  if (chequeos.some(c => c.estado === 'aviso')) return 'aviso'
  return 'ok'
}
