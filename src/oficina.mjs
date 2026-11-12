// Lógica pura de la Oficina: los agentes de Trabajadores, UP y PDG en un solo plantel, qué está haciendo cada uno
// y lo que te toca a vos. Todo sale de datos reales (trabajos_corridas, up_corridas, up_chequeos, pdg_trabajos…);
// nada es decorativo: si un agente está en su escritorio trabajando es porque tiene una corrida en curso.
import { trabada, haceCuanto, duracionLegible } from './trabajadores.mjs'
import { RECORRIDOS, FUENTES, vidaDeTrabajador, textoTrabajador, alertas as calcularAlertas } from './tablero.mjs'
import { NOMBRE_DESTINO } from './orbital.mjs'
import { AGENTES_UP, ORDEN_UP, herramientasPdg, idAgente, generoDe } from '../supabase/functions/_shared/oficina.mjs'

import { EQUIPOS as EQUIPOS_SERVIDOR } from '../supabase/functions/_shared/oficina.mjs'
export { partirId } from '../supabase/functions/_shared/oficina.mjs'

// Administración solo existe en la pantalla: son tareas programadas (cron), no conversan con la IA.
export const EQUIPOS = {
  ...EQUIPOS_SERVIDOR,
  admin: { nombre: 'Administración', descripcion: 'Tareas programadas de apoyo: corren solas a su hora.' },
  sistemas: { nombre: 'Sistemas', descripcion: 'Reciben los pedidos de María y Noruega y cuidan las conexiones y las tareas programadas. Nada se hace sin tu aprobación.' },
}

// Estados: trabajando (corrida en curso), libre (hizo lo suyo y espera su turno), error (la última falló o quedó
// trabada), pausado (desactivado), nuevo (todavía no hizo nada).
export const ESTADOS = {
  trabajando: 'Trabajando',
  libre: 'Libre',
  error: 'Con un problema',
  pausado: 'Pausado',
  nuevo: 'Todavía no trabajó',
}

const recortar = (texto, max = 160) => {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
const ms = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null }

// ---------- Trabajadores ----------
function herramientasTrabajador(clave) {
  const r = RECORRIDOS[clave]
  if (!r) return []
  return [...r.fuentes.map(f => `Lee: ${FUENTES[f] ?? f}`), ...r.destinos.map(d => `Escribe en: ${NOMBRE_DESTINO[d] ?? d}`)]
}

function textoCorrida(c, ahora) {
  if (c.estado === 'corriendo') return trabada(c, ahora) ? 'Quedó trabada' : 'Corriendo'
  if (c.estado === 'error') return `Falló${c.error ? `: ${recortar(c.error, 120)}` : ''}`
  return [c.cantidad_resultados != null ? `${c.cantidad_resultados} resultados` : 'Terminó bien', c.duracion_ms != null ? duracionLegible(c.duracion_ms) : null].filter(Boolean).join(' · ')
}

export function agenteTrabajador(t, corridas = [], ahora = Date.now()) {
  const ultima = corridas[0]
  const terminada = corridas.find(c => c.estado !== 'corriendo')
  const estaTrabada = ultima && trabada(ultima, ahora, t.minutos_trabado)
  const corriendo = ultima?.estado === 'corriendo' && !estaTrabada
  let estado = 'libre'
  if (!t.activo) estado = 'pausado'
  else if (corriendo) estado = 'trabajando'
  else if (estaTrabada || terminada?.estado === 'error') estado = 'error'
  else if (!ultima) estado = 'nuevo'
  let ahoraTexto = textoTrabajador(t, vidaDeTrabajador(t, corridas, ahora), corriendo, ahora)
  if (t.activo && estaTrabada) ahoraTexto = `trabado desde ${haceCuanto(ultima.iniciado_at, ahora)}`
  else if (t.activo && estado === 'error') ahoraTexto = `la última corrida falló ${haceCuanto(terminada.finalizado_at || terminada.iniciado_at, ahora)}`
  return {
    id: idAgente('trabajadores', t.clave), equipo: 'trabajadores', clave: t.clave,
    nombre: t.nombre, rol: t.tipo === 'monitor' ? 'Monitor' : t.tipo === 'scraper' ? 'Scraper' : 'Cliente de API',
    descripcion: t.descripcion || '', color: t.color || null, estado, ahora: ahoraTexto,
    ultima: ms(ultima?.iniciado_at),
    tareas: corridas.slice(0, 8).map(c => ({ at: ms(c.iniciado_at), texto: textoCorrida(c, ahora), nivel: c.estado === 'error' || trabada(c, ahora, t.minutos_trabado) ? 'error' : c.estado === 'corriendo' ? 'trabajando' : 'ok' })),
    herramientas: herramientasTrabajador(t.clave),
  }
}

// ---------- UP ----------
// corridas: las últimas de up_corridas (la más nueva primero). Cada agente toma sus pasos de las corridas donde aparece.
// chequeo: la última revisión de Noruega; si marca una falla de un agente (su id es el del agente), ese agente está en problemas.
export function agentesUp(corridas = [], chequeo = null, ahora = Date.now()) {
  const fallas = Object.fromEntries((chequeo?.chequeos ?? []).filter(c => c.estado === 'falla' && AGENTES_UP[c.id]).map(c => [c.id, c.detalle]))
  return ORDEN_UP.map(clave => {
    const def = AGENTES_UP[clave]
    const base = { id: idAgente('up', clave), equipo: 'up', clave, nombre: def.nombre, rol: def.rol, descripcion: def.descripcion, color: null, herramientas: def.herramientas }
    if (clave === 'noruega') {
      const items = chequeo?.chequeos ?? []
      const malos = items.filter(c => c.estado !== 'ok')
      return {
        ...base, estado: chequeo ? 'libre' : 'nuevo', ultima: ms(chequeo?.at),
        ahora: chequeo ? `revisó ${haceCuanto(chequeo.at, ahora)}: ${malos.length ? malos.map(c => c.nombre).join(', ') : 'todo en orden'}` : 'todavía no revisó',
        tareas: items.map(c => ({ at: ms(chequeo.at), texto: `${c.nombre}: ${recortar(c.detalle)}`, nivel: c.estado === 'falla' ? 'error' : c.estado === 'aviso' ? 'aviso' : 'ok' })),
      }
    }
    const suyas = corridas.filter(c => (c.pasos || []).some(p => p.agente === clave))
    const ultima = suyas[0]
    const pasosUltima = (ultima?.pasos || []).filter(p => p.agente === clave)
    const ultimoPaso = (ultima?.pasos || []).at(-1)
    const enCurso = ultima?.estado === 'corriendo' && ultimoPaso?.agente === clave
    const fallo = ultima?.estado === 'error' && ultimoPaso?.agente === clave
    let estado = ultima ? 'libre' : 'nuevo'
    let ahoraTexto = ultima ? `trabajó ${haceCuanto(pasosUltima.at(-1)?.at || ultima.iniciado_at, ahora)}: ${recortar(pasosUltima.at(-1)?.accion, 80)}` : 'todavía no trabajó'
    if (enCurso) { estado = 'trabajando'; ahoraTexto = recortar(ultimoPaso.accion, 120) }
    else if (fallas[clave]) { estado = 'error'; ahoraTexto = `Noruega avisa: ${recortar(fallas[clave], 140)}` }
    else if (fallo) { estado = 'error'; ahoraTexto = `la corrida falló${ultima.error ? `: ${recortar(ultima.error, 120)}` : ''}` }
    const pasos = suyas.flatMap(c => (c.pasos || []).filter(p => p.agente === clave).reverse())
    return {
      ...base, estado, ahora: ahoraTexto, ultima: ms(pasosUltima.at(-1)?.at || ultima?.iniciado_at),
      tareas: pasos.slice(0, 8).map(p => ({ at: ms(p.at), texto: recortar(`${p.accion}${p.detalle ? ` — ${p.detalle}` : ''}`), nivel: /^(marcó|no pudo|error|cortó)/.test(p.accion) ? 'error' : 'ok' })),
    }
  })
}

// ---------- PDG ----------
// trabajos: los últimos de pdg_trabajos (el más nuevo primero), con la cuenta si la tiene.
const ESTADO_TRABAJO = { borrador: 'borrador sin revisar', aprobado: 'aprobado', descartado: 'descartado' }
export function agentesPdg(agentes = [], trabajos = [], ahora = Date.now()) {
  return [...agentes].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map(a => {
    const suyos = trabajos.filter(t => t.agente === a.clave)
    const ultimo = suyos[0]
    const sobre = t => t.cuenta?.nombre ? `para ${t.cuenta.nombre}` : t.pedido ? `«${recortar(t.pedido, 60)}»` : 'sin cuenta'
    return {
      id: idAgente('pdg', a.clave), equipo: 'pdg', clave: a.clave, nombre: a.nombre, rol: recortar(a.rol?.split('.')[0], 70),
      descripcion: a.rol || '', color: null, estado: ultimo ? 'libre' : 'nuevo', ultima: ms(ultimo?.created_at),
      ahora: ultimo ? `escribió ${haceCuanto(ultimo.created_at, ahora)} ${sobre(ultimo)} (${ESTADO_TRABAJO[ultimo.estado] ?? ultimo.estado})` : 'todavía no escribió nada',
      tareas: suyos.slice(0, 8).map(t => ({ at: ms(t.created_at), texto: `${sobre(t)} · ${ESTADO_TRABAJO[t.estado] ?? t.estado}`, nivel: t.estado === 'borrador' ? 'aviso' : 'ok' })),
      herramientas: herramientasPdg(a.clave),
    }
  })
}

// ---------- Administración ----------
// Las tareas programadas que no son trabajadores. corridas: lo que devuelve la función oficina_administracion()
// (una fila por corrida, las últimas 5 de cada tarea; una tarea sin corridas viene con inicio null).
export const AGENTES_ADMIN = {
  search_console: { nombre: 'Search Console', jobs: ['search-console'], rol: 'Trae los datos de Google Search Console', descripcion: 'Una vez por día baja de Google Search Console cómo te encuentran en Google (búsquedas, clics, posiciones) y lo guarda para tus tableros.' },
  resumen_diario: { nombre: 'Resumen diario', jobs: ['resumen-diario-push'], rol: 'Te manda el resumen del día', descripcion: 'Cada día arma el resumen de lo que pasó y te lo manda como notificación.' },
  agenda_dulce: { nombre: 'Agenda dulce', jobs: ['agenda-dulce-1410', 'agenda-dulce-1900'], rol: 'Avisos de la agenda dulce', descripcion: 'Dos veces por día (14:10 y 19:00) manda los avisos de la agenda dulce.' },
  historial_up: { nombre: 'Historial de UP', jobs: ['up-historial'], rol: 'Guarda el historial de UP', descripcion: 'Guarda el historial de lo publicado en UP para que los agentes de UP no repitan.' },
  limpieza: { nombre: 'Limpieza', jobs: ['limpiar-historial'], rol: 'Limpia los registros viejos', descripcion: 'Borra los registros viejos de las corridas para que la base no crezca sin fin.' },
}
const ESTADO_CRON = { succeeded: 'Terminó bien', failed: 'Falló', running: 'Corriendo', starting: 'Arrancando' }

export function agentesAdmin(corridas = [], ahora = Date.now()) {
  return Object.entries(AGENTES_ADMIN).map(([clave, def]) => {
    const filas = corridas.filter(c => def.jobs.includes(c.jobname))
    const suyas = filas.filter(c => c.inicio).sort((a, b) => (ms(b.inicio) ?? 0) - (ms(a.inicio) ?? 0))
    const activo = filas.some(c => c.activo)
    const ultima = suyas[0]
    let estado = 'libre'
    if (filas.length && !activo) estado = 'pausado'
    else if (!ultima) estado = 'nuevo'
    else if (ultima.estado === 'running' || ultima.estado === 'starting') estado = 'trabajando'
    else if (ultima.estado === 'failed') estado = 'error'
    const horario = [...new Set(filas.map(c => c.schedule).filter(Boolean))].join(' y ')
    return {
      id: idAgente('admin', clave), equipo: 'admin', clave, nombre: def.nombre, rol: def.rol,
      descripcion: `${def.descripcion}${horario ? ` Horario (cron, UTC): ${horario}.` : ''}`, color: null, estado, ultima: ms(ultima?.inicio),
      ahora: estado === 'pausado' ? 'Está desactivada.'
        : !ultima ? 'Todavía no corrió.'
          : `Corrió ${haceCuanto(ultima.inicio, ahora)}: ${ESTADO_CRON[ultima.estado] ?? ultima.estado}${ultima.estado === 'failed' && ultima.mensaje ? ` (${recortar(ultima.mensaje, 120)})` : ''}`,
      tareas: suyas.slice(0, 8).map(c => ({ at: ms(c.inicio), texto: `${ESTADO_CRON[c.estado] ?? c.estado}${c.mensaje && c.estado === 'failed' ? `: ${recortar(c.mensaje, 100)}` : ''}`, nivel: c.estado === 'failed' ? 'error' : 'ok' })),
      herramientas: def.jobs.map(j => `Tarea programada: ${j}`),
      sinCharla: true,
    }
  })
}

// ---------- Sistemas ----------
// Tres agentes que trabajan con datos reales y no cambian nada solos:
// - Mesa de entrada: ordena los pedidos que derivan María y Noruega y recomienda qué hacer con cada uno.
// - Guardián de claves: mira cuándo vence cada conexión (nunca ve ni entrega las claves).
// - Operador: mira cada tarea programada (si corrió y cuántas veces falló en el día).
const DIA = 86400_000
const RIESGOSO = /token|clave|secret|vault|contraseñ|password|credencial|permiso|acceso|editar la action|workflow/i
export function riesgoDe(solicitud) {
  return RIESGOSO.test(`${solicitud.titulo} ${solicitud.detalle ?? ''}`) ? 'alto' : 'normal'
}
// La recomendación de la Mesa de entrada para un pedido pendiente.
export function recomendacion(solicitud) {
  if (solicitud.accion?.tipo === 'frenar_pieza') return 'Recomiendo aprobar: frena una publicación que podría salir mal; después se revisa con calma.'
  return riesgoDe(solicitud) === 'alto'
    ? 'Riesgo alto: pide accesos, permisos o claves. Recomiendo rechazar salvo que sepas para qué hace falta.'
    : 'Riesgo normal: revisalo y aprobalo si coincide con lo que querés.'
}

export function agentesSistemas({ solicitudes = [], conexiones = [], operador = [] } = {}, ahora = Date.now()) {
  const id = clave => idAgente('sistemas', clave)
  const base = (clave, nombre, rol, descripcion, herramientas) => ({ id: id(clave), equipo: 'sistemas', clave, nombre, rol, descripcion, color: null, herramientas, sinCharla: true })

  const pendientes = solicitudes.filter(x => x.estado === 'pendiente')
  const riesgosos = pendientes.filter(x => riesgoDe(x) === 'alto').length
  const mesa = {
    ...base('mesa_entrada', 'Mesa de entrada', 'Ordena los pedidos para Sistemas', 'Recibe lo que derivan María y Noruega, marca los riesgosos (accesos, permisos, claves) y te los presenta con una recomendación. No aprueba nada: decidís vos.', ['Pedidos a Sistemas']),
    estado: pendientes.length ? 'trabajando' : 'libre',
    ultima: ms(solicitudes[0]?.creada),
    ahora: pendientes.length ? `${plural(pendientes.length, 'pedido espera', 'pedidos esperan')} tu aprobación${riesgosos ? ` (${plural(riesgosos, 'riesgoso', 'riesgosos')})` : ''}` : 'No hay pedidos esperando.',
    tareas: solicitudes.slice(0, 8).map(x => ({ at: ms(x.creada), texto: `${x.titulo} · ${x.estado}`, nivel: x.estado === 'pendiente' && riesgoDe(x) === 'alto' ? 'aviso' : 'ok' })),
  }

  const vencimientos = conexiones.map(c => {
    const vence = ms(c.expira_at)
    // Las que se renuevan solas (Google) no vencen mientras tengan con qué renovarse.
    const dias = c.renovable || vence == null ? null : Math.floor((vence - ahora) / DIA)
    return { ...c, dias }
  })
  const vencidas = vencimientos.filter(c => c.dias != null && c.dias < 0)
  const porVencer = vencimientos.filter(c => c.dias != null && c.dias >= 0 && c.dias <= 7)
  const guardian = {
    ...base('guardian', 'Guardián de claves', 'Cuida que las conexiones no venzan', 'Revisa cuándo vence cada conexión (las de UP con LinkedIn, X e Instagram, y Google) y avisa antes de que se corte. Nunca ve ni entrega las claves. Las claves de la IA las prueba María en cada vuelta.', ['Vencimiento de las conexiones']),
    estado: vencidas.length ? 'error' : conexiones.length ? 'libre' : 'nuevo',
    ultima: ahora,
    ahora: vencidas.length ? `Vencida: ${vencidas.map(c => c.origen).join(', ')}. Hay que volver a conectarla.`
      : porVencer.length ? `Por vencer: ${porVencer.map(c => `${c.origen} (${c.dias === 0 ? 'hoy' : `en ${plural(c.dias, 'día', 'días')}`})`).join(', ')}.`
        : conexiones.length ? `${plural(conexiones.length, 'conexión vigente', 'conexiones vigentes')}.` : 'No hay conexiones para cuidar.',
    tareas: vencimientos.map(c => ({ at: null, texto: `${c.origen}${c.nombre ? ` (${c.nombre})` : ''}: ${c.dias == null ? 'se renueva sola' : c.dias < 0 ? 'vencida' : `vence en ${plural(c.dias, 'día', 'días')}`}`, nivel: c.dias != null && c.dias <= 7 ? (c.dias < 0 ? 'error' : 'aviso') : 'ok' })),
    porVencer, vencidas,
  }

  const conProblemas = operador.filter(j => j.activo && (j.estado === 'failed' || j.fallas_24h >= 2))
  const sinCorrer = operador.filter(j => j.activo && !j.ultima)
  const corriendo = operador.filter(j => j.estado === 'running' || j.estado === 'starting').length
  const op = {
    ...base('operador', 'Operador', 'Vigila las tareas programadas', 'Mira cada tarea programada del servidor: si corrió y cuántas veces falló en las últimas 24 horas. Ojo: «corrió» quiere decir que se disparó; si el trabajador falló adentro, lo cuenta María.', ['Tareas programadas del servidor']),
    estado: conProblemas.length ? 'error' : corriendo ? 'trabajando' : operador.length ? 'libre' : 'nuevo',
    ultima: Math.max(0, ...operador.map(j => ms(j.ultima) ?? 0)) || null,
    ahora: conProblemas.length ? `Con problemas: ${conProblemas.map(j => j.jobname).join(', ')}.`
      : operador.length ? `${plural(operador.filter(j => j.activo).length, 'tarea activa', 'tareas activas')}, sin fallas en las últimas 24 horas${sinCorrer.length ? ` (${plural(sinCorrer.length, 'no corrió nunca', 'no corrieron nunca')})` : ''}.` : 'Todavía no leí las tareas.',
    tareas: [...conProblemas, ...operador.filter(j => !conProblemas.includes(j))].slice(0, 8).map(j => ({ at: ms(j.ultima), texto: `${j.jobname}: ${j.corridas_24h} corridas y ${j.fallas_24h} fallas en 24 h${!j.activo ? ' · desactivada' : ''}`, nivel: conProblemas.includes(j) ? 'error' : 'ok' })),
    conProblemas,
  }
  return [mesa, guardian, op]
}

// ---------- Lo que te toca ----------
// alertas: las de tablero.mjs (trabajadores). piezas: up_piezas de hoy en adelante en falta_info, revision o pendiente.
// chequeo: la última revisión de Noruega. trabajos / cuentas: de PDG. hoy: 'AAAA-MM-DD' en Buenos Aires.
// Cada ítem dice dónde se resuelve (donde) y, si es de un agente, cuál (agente).
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
export function teToca({ alertas = [], piezas = [], chequeo = null, trabajos = [], cuentas = [], hoy }) {
  const lista = alertas.map(a => ({ nivel: a.nivel === 'error' ? 'error' : 'aviso', texto: a.texto, donde: 'Trabajadores' }))
  for (const c of chequeo?.chequeos ?? []) {
    if (c.estado === 'ok') continue
    lista.push({ nivel: c.estado === 'falla' ? 'error' : 'aviso', texto: `Noruega · ${c.nombre}: ${recortar(c.detalle)}`, donde: 'UP › Agentes', agente: idAgente('up', AGENTES_UP[c.id] ? c.id : 'noruega') })
  }
  const futuras = piezas.filter(p => !hoy || p.fecha >= hoy)
  const diasPregunta = new Set(futuras.filter(p => p.estado === 'falta_info').map(p => p.fecha)).size
  if (diasPregunta) lista.push({ nivel: 'aviso', texto: `El Investigador te dejó preguntas para ${plural(diasPregunta, 'día', 'días')}`, donde: 'UP › Preguntas', agente: idAgente('up', 'investigador') })
  const revision = futuras.filter(p => p.estado === 'revision').length
  if (revision) lista.push({ nivel: 'aviso', texto: `El Revisor marcó ${plural(revision, 'borrador', 'borradores')} para que los mires`, donde: 'UP › Hoy', agente: idAgente('up', 'revisor') })
  const aprobar = futuras.filter(p => p.estado === 'pendiente' && p.tiene_texto).length
  if (aprobar) lista.push({ nivel: 'aviso', texto: `${plural(aprobar, 'borrador espera', 'borradores esperan')} tu aprobación`, donde: 'UP › Hoy', agente: idAgente('up', 'redactor') })
  const borradores = trabajos.filter(t => t.estado === 'borrador')
  if (borradores.length) lista.push({ nivel: 'aviso', texto: `PDG: ${plural(borradores.length, 'borrador', 'borradores')} para revisar`, donde: 'PDG › Trabajos', agente: idAgente('pdg', borradores[0].agente) })
  const vencidas = cuentas.filter(c => c.proxima_fecha && hoy && c.proxima_fecha <= hoy && !['ganada', 'perdida'].includes(c.etapa))
  if (vencidas.length) lista.push({ nivel: 'aviso', texto: `PDG: ${plural(vencidas.length, 'cuenta tiene', 'cuentas tienen')} la próxima acción para hoy o vencida (${vencidas.slice(0, 3).map(c => c.nombre).join(', ')}${vencidas.length > 3 ? '…' : ''})`, donde: 'PDG › Cuentas' })
  return lista.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'error' ? -1 : 1))
}

// Junta los datos crudos que carga la pantalla (ver cargarOficina en screens/Oficina.jsx) en el plantel y lo que te toca.
export function armarOficina(d, ahora) {
  const agentes = [
    ...d.trabajadores.map(t => agenteTrabajador(t, d.corridasPor[t.clave] || [], ahora)),
    ...agentesUp(d.upCorridas, d.chequeo, ahora),
    ...agentesPdg(d.pdgAgentes, d.pdgTrabajos, ahora),
    ...agentesAdmin(d.admin ?? [], ahora),
    ...agentesSistemas({ solicitudes: d.solicitudes ?? [], conexiones: d.conexiones ?? [], operador: d.operador ?? [] }, ahora),
  ]
  const alertas = calcularAlertas({ trabajadores: d.trabajadores, corridasPor: d.corridasPor, ahora, salud: d.salud })
  const pendientes = teToca({ alertas, piezas: d.piezas, chequeo: d.chequeo, trabajos: d.pdgTrabajos, cuentas: d.pdgCuentas, hoy: d.hoy })
  const [, guardian, operador] = agentes.filter(a => a.equipo === 'sistemas')
  for (const c of guardian.vencidas) pendientes.push({ nivel: 'error', texto: `Guardián de claves: venció la conexión ${c.origen}. Volvé a conectarla.`, donde: 'UP › Redes', agente: guardian.id })
  for (const c of guardian.porVencer) pendientes.push({ nivel: 'aviso', texto: `Guardián de claves: la conexión ${c.origen} vence ${c.dias === 0 ? 'hoy' : `en ${plural(c.dias, 'día', 'días')}`}.`, donde: 'UP › Redes', agente: guardian.id })
  if (operador.conProblemas.length) pendientes.push({ nivel: 'error', texto: `Operador: ${plural(operador.conProblemas.length, 'tarea programada con problemas', 'tareas programadas con problemas')} (${operador.conProblemas.map(j => j.jobname).join(', ')})`, donde: 'Oficina › Sistemas', agente: operador.id })
  // Tareas de las reuniones: las que vencen en 3 días o ya vencieron, con el supervisor que se encarga.
  const hoy = d.hoy ?? hoyAR(ahora)
  const en3 = new Date(Date.parse(`${hoy}T12:00:00Z`) + 3 * 86400_000).toISOString().slice(0, 10)
  for (const t of (d.tareas ?? []).filter(t => t.estado !== 'hecha' && t.vence && t.vence <= en3)) {
    const sup = agentes.find(a => a.id === t.responsable)
    pendientes.push({ nivel: t.vence < hoy ? 'error' : 'aviso', texto: `${t.vence < hoy ? 'Venció' : t.vence === hoy ? 'Vence hoy' : `Vence el ${t.vence}`}: ${t.tarea}${sup ? ` (a cargo de ${sup.nombre.split(' (')[0]})` : ''}`, donde: 'Oficina › Archivo', agente: sup?.id })
  }
  // Cuando el equipo de un área termina todas sus tareas de un plan, su supervisor pide una reunión para mostrarlo.
  const grupos = new Map()
  for (const t of d.tareas ?? []) {
    if (!t.acta_id || !t.supervisor) continue
    const k = `${t.acta_id}|${t.supervisor}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(t)
  }
  for (const lista of grupos.values()) {
    if (!lista.every(t => t.estado === 'hecha') || lista.some(t => t.presentada)) continue
    const sup = agentes.find(a => a.id === lista[0].supervisor)
    if (!sup) continue
    const acta = (d.actas ?? []).find(a => a.id === lista[0].acta_id)
    const equipo = [...new Set([sup.id, ...lista.map(t => t.responsable)])].filter(id => agentes.some(a => a.id === id))
    pendientes.push({ nivel: 'aviso', texto: `${sup.nombre.split(' (')[0]} pide una reunión para mostrarte ${acta?.titulo ? `«${acta.titulo}»` : 'el proyecto'}: su equipo terminó ${plural(lista.length, 'tarea', 'tareas')}.`, donde: 'Oficina', agente: sup.id, reunion: { asistentes: equipo, tareas: lista.map(t => t.id) } })
  }
  const porAprobar = (d.solicitudes ?? []).filter(x => x.estado === 'pendiente').length
  if (porAprobar) pendientes.push({ nivel: 'aviso', texto: `Sistemas: ${plural(porAprobar, 'pedido espera', 'pedidos esperan')} tu aprobación`, donde: 'Oficina › Sistemas' })
  for (const a of agentes) if (a.equipo === 'admin' && a.estado === 'error') pendientes.push({ nivel: 'error', texto: `${a.nombre}: ${a.ahora}`, donde: 'Oficina › Administración', agente: a.id })
  // Las alertas de los trabajadores empiezan con su nombre ("Ópera: …"): así se sabe de quién son.
  for (const p of pendientes) {
    if (p.agente) continue
    const a = agentes.find(x => x.equipo === 'trabajadores' && (p.texto.startsWith(`${x.nombre}:`) || p.texto.startsWith(`${x.nombre} ·`)))
    if (a) p.agente = a.id
  }
  return { agentes, pendientes }
}

export function contarEstados(agentes) {
  const r = { total: agentes.length, trabajando: 0, libre: 0, error: 0, pausado: 0, nuevo: 0 }
  for (const a of agentes) r[a.estado] = (r[a.estado] ?? 0) + 1
  return r
}

// Hoy en Buenos Aires, 'AAAA-MM-DD'.
export function hoyAR(ahora = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ahora))
}

// ---------- Reunión ----------
// El informe que da cada agente en la reunión, armado con sus datos (sin IA): qué está haciendo, lo último que
// hizo y qué necesita de vos. pendientes: lo de teToca(); los que tienen `agente` son de él.
const minuscula = t => (t ? t[0].toLowerCase() + t.slice(1) : t)
export function informeDe(a, pendientes = [], ahora = Date.now()) {
  const partes = [`Hola, soy ${a.nombre.split(' (')[0]}.`]
  if (a.estado === 'trabajando') partes.push(`Estoy trabajando en este momento: ${minuscula(a.ahora)}.`)
  else if (a.estado === 'error') partes.push(`Tengo un problema: ${minuscula(a.ahora)}.`)
  else if (a.estado === 'pausado') partes.push(generoDe(a.id) === 'f' ? 'Estoy pausada.' : 'Estoy pausado.')
  else if (a.estado === 'nuevo') partes.push('Todavía no me tocó trabajar.')
  else partes.push(`Estoy al día: ${minuscula(a.ahora)}.`)
  const ultima = a.tareas?.[0]
  if (ultima && a.estado !== 'nuevo') partes.push(`Lo último: ${minuscula(ultima.texto)}${ultima.at ? ` (${haceCuanto(new Date(ultima.at).toISOString(), ahora)})` : ''}.`)
  const mios = pendientes.filter(p => p.agente === a.id)
  partes.push(mios.length ? `Necesito de vos: ${mios.map(p => minuscula(p.texto)).join('; ')}.` : 'No necesito nada de vos por ahora.')
  return partes.join(' ').replace(/\.\./g, '.')
}

// Cierre de la jefa: cómo está el equipo que vino a la reunión.
export function resumenReunion(asistentes, pendientes = []) {
  const c = contarEstados(asistentes)
  const partes = [`Resumen: vinieron ${asistentes.length}.`]
  partes.push(c.trabajando ? `${c.trabajando} ${c.trabajando === 1 ? 'está trabajando' : 'están trabajando'} ahora.` : 'Nadie está corriendo ahora.')
  if (c.error) partes.push(`${c.error} ${c.error === 1 ? 'tiene un problema' : 'tienen problemas'}: ${asistentes.filter(a => a.estado === 'error').map(a => a.nombre.split(' (')[0]).join(', ')}.`)
  else partes.push('Nadie tiene problemas.')
  const ids = new Set(asistentes.map(a => a.id))
  const tuyos = pendientes.filter(p => !p.agente || ids.has(p.agente)).length
  partes.push(tuyos ? `Te ${tuyos === 1 ? 'toca 1 cosa' : `tocan ${tuyos} cosas`}: están en "Te toca".` : 'No te toca nada por ahora.')
  return partes.join(' ')
}

// Orden de los turnos: en el orden del plantel, y la jefa (si vino) cierra.
export function turnosReunion(asistentes, idJefa = 'trabajadores:maria') {
  return [...asistentes.filter(a => a.id !== idJefa), ...asistentes.filter(a => a.id === idJefa)]
}
