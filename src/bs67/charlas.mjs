// BS67 en las tres apps: las charlas guardadas (bs67_charlas) y cómo se le habla a cada función. Sin React ni base,
// para probarlo con node --test.

export const NOMBRE_APP = { bs67: 'BS67', up: 'UP', pdg: 'PDG' }
export const MAX_MENSAJES_GUARDADOS = 200
const ZONA = 'America/Argentina/Buenos_Aires'

export const SUGERENCIAS = {
  bs67: ['¿Cómo viene mi día?', '¿Qué tareas tengo vencidas?', 'Agendame un café el jueves a las 17', 'Resumime los mails sin leer'],
  up: ['¿Qué tengo pendiente en UP?', '¿Qué se publica esta semana?', 'Armemos el calendario de noviembre', 'Buscá ideas de posts sobre comunicación deportiva'],
  pdg: ['¿Qué cuentas tienen una acción pendiente?', '¿Cómo viene el embudo de ventas?', 'Agregá una cuenta nueva', '¿Qué dice el Manual sobre las propuestas?'],
}

const plano = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// El título de una charla: su primera pregunta, cortada en una palabra.
export function tituloDe(mensajes) {
  const primera = (mensajes || []).find(m => m.rol === 'user' && m.texto?.trim())?.texto.replace(/\s+/g, ' ').trim()
  if (!primera) return 'Charla nueva'
  if (primera.length <= 60) return primera
  const corte = primera.slice(0, 60)
  return `${corte.slice(0, corte.lastIndexOf(' ') > 30 ? corte.lastIndexOf(' ') : 60)}…`
}

const diaAR = ms => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))

// El menú de charlas: Hoy, Ayer, Últimos 7 días, Este mes y Antes (las vacías no aparecen).
export function agruparCharlas(charlas, ahora = Date.now()) {
  const hoy = diaAR(ahora)
  const ayer = diaAR(ahora - 86_400_000)
  const grupos = [['Hoy', []], ['Ayer', []], ['Últimos 7 días', []], ['Este mes', []], ['Antes', []]]
  for (const c of [...charlas].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))) {
    const t = Date.parse(c.updated_at)
    const dia = diaAR(t)
    const i = dia === hoy ? 0 : dia === ayer ? 1 : ahora - t < 7 * 86_400_000 ? 2 : dia.slice(0, 7) === hoy.slice(0, 7) ? 3 : 4
    grupos[i][1].push(c)
  }
  return grupos.filter(([, lista]) => lista.length).map(([titulo, lista]) => ({ titulo, charlas: lista }))
}

export function filtrarCharlas(charlas, texto) {
  const palabras = plano(texto).split(/\s+/).filter(Boolean)
  return palabras.length ? charlas.filter(c => palabras.every(p => plano(c.titulo).includes(p))) : charlas
}

// Lo que se guarda: sin estados de un momento (una propuesta a medio confirmar vuelve a quedar sin decidir).
export function paraGuardar(mensajes) {
  return (mensajes || []).slice(-MAX_MENSAJES_GUARDADOS).map(m => {
    const { decision, ...resto } = m
    return decision && decision !== 'confirmando' ? { ...resto, decision } : resto
  })
}

// El historial para la IA: lo dicho y lo que pasó con cada propuesta.
export function historialDe(mensajes) {
  return (mensajes || []).filter(m => m.rol === 'user' || m.rol === 'bot').slice(-20).map(m => ({
    rol: m.rol,
    texto: m.propuesta ? `${m.texto ? `${m.texto}\n` : ''}(Propuse: ${m.propuesta.descripcion} — ${m.decision === 'confirmada' ? 'Daniela confirmó' : m.decision === 'cancelada' ? 'Daniela canceló' : 'sin respuesta todavía'})` : m.texto,
  })).filter(m => m.texto)
}

// UP tiene su propio agente (up-asistente, con las herramientas de UP); BS67 y PDG usan bs67-chat.
export const funcionDe = app => (app === 'up' ? 'up-asistente' : 'bs67-chat')

export function cuerpoPregunta(app, { mensaje, mensajes, pantalla = null, proyectoId = null }) {
  const historial = historialDe(mensajes)
  if (app === 'up') return { mensajes: [...historial.map(m => ({ rol: m.rol === 'user' ? 'usuario' : 'asistente', texto: m.texto })), { rol: 'usuario', texto: mensaje }] }
  return { mensaje, historial, pantalla, proyecto_id: proyectoId, app }
}

export const cuerpoAccion = (app, propuesta) => ({ ejecutar: { nombre: propuesta.nombre, args: propuesta.args }, ...(app === 'up' ? {} : { app }) })
