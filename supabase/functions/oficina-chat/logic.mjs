// Lógica pura de oficina-chat: validar el pedido, armar el contexto de cada agente con sus datos reales y el prompt.
// El agente solo habla de lo que está en sus datos; no hace cambios (para eso están sus pantallas).
import { armarProveedores } from '../_shared/ia.mjs'
import { AGENTES_UP, EQUIPOS, herramientasPdg, partirId } from '../_shared/oficina.mjs'

export const MAX_MENSAJES = 12
export const MAX_CARACTERES = 2000
const MAX_DATO = 600

export const proveedores = env => armarProveedores(env, 'oficina-chat', { groq: env.OFICINA_MODELO_GROQ || 'openai/gpt-oss-120b', gemini: env.BS67_MODEL || 'gemini-3.6-flash' })

const recortar = (t, max = MAX_DATO) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// { agente: 'up:redactor', mensajes: [{ role: 'user' | 'assistant', content }] }; el último tiene que ser de la dueña.
export function validar(body) {
  const id = partirId(body?.agente)
  if (!id) return { ok: false, error: 'Agente desconocido.' }
  if (id.equipo === 'up' && !AGENTES_UP[id.clave]) return { ok: false, error: 'Agente desconocido.' }
  if (!Array.isArray(body?.mensajes) || !body.mensajes.length) return { ok: false, error: 'Falta el mensaje.' }
  const mensajes = body.mensajes.slice(-MAX_MENSAJES).map(m => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? '').slice(0, MAX_CARACTERES).trim(),
  })).filter(m => m.content)
  if (!mensajes.length || mensajes.at(-1).role !== 'user') return { ok: false, error: 'Falta el mensaje.' }
  return { ok: true, ...id, mensajes }
}

const hora = iso => (iso ? new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) : '?')

// datos: lo que index.ts leyó de la base para ese agente. Devuelve { nombre, rol, descripcion, herramientas, registro }.
export function contexto(equipo, clave, datos = {}) {
  if (equipo === 'trabajadores') {
    const t = datos.trabajador
    if (!t) return null
    return {
      nombre: t.nombre, rol: `trabajador (${t.tipo}) del equipo ${EQUIPOS.trabajadores.nombre}`, descripcion: t.descripcion || '',
      herramientas: [`corre con este cron (UTC): ${t.frecuencia}`, t.activo ? 'está activo' : 'está pausado'],
      registro: (datos.corridas || []).map(c => `- ${hora(c.iniciado_at)} · ${c.estado}${c.cantidad_resultados != null ? ` · ${c.cantidad_resultados} resultados` : ''}${c.duracion_ms != null ? ` · ${Math.round(c.duracion_ms / 100) / 10} s` : ''}${c.error ? ` · error: ${recortar(c.error, 300)}` : ''}${c.payload ? `\n  resultado: ${recortar(JSON.stringify(c.payload))}` : ''}`),
    }
  }
  if (equipo === 'up') {
    const def = AGENTES_UP[clave]
    if (!def) return null
    const registro = clave === 'noruega'
      ? (datos.chequeos || []).flatMap(ch => [`- revisión ${hora(ch.at)}: ${ch.estado}`, ...(ch.chequeos || []).map(c => `  · ${c.nombre}: ${c.estado} — ${recortar(c.detalle, 300)}`)])
      : (datos.pasos || []).map(p => `- ${hora(p.at)}${p.red ? ` · ${p.red}` : ''} · ${recortar(`${p.accion}${p.detalle ? ` — ${p.detalle}` : ''}`, 400)}`)
    for (const p of datos.pendientes || []) registro.push(`- pendiente para Daniela (${p.fecha}${p.red ? `, ${p.red}` : ''}): ${recortar(p.texto, 300)}`)
    return { nombre: def.nombre, rol: `${def.rol}, en el equipo UP`, descripcion: def.descripcion, herramientas: def.herramientas, registro }
  }
  if (equipo === 'pdg') {
    const a = datos.agente
    if (!a) return null
    return {
      nombre: a.nombre, rol: `agente comercial de ${EQUIPOS.pdg.nombre}`, descripcion: `${a.rol || ''}${a.instrucciones ? `\nTus instrucciones de trabajo (resumen): ${recortar(a.instrucciones, 1500)}` : ''}`,
      herramientas: herramientasPdg(clave),
      registro: (datos.trabajos || []).map(t => `- ${hora(t.created_at)} · ${t.pdg_cuentas?.nombre ? `cuenta ${t.pdg_cuentas.nombre}` : 'sin cuenta'} · ${t.estado}${t.pedido ? ` · pedido: ${recortar(t.pedido, 200)}` : ''}\n  empieza: ${recortar(t.texto, 400)}`),
    }
  }
  return null
}

export function sistema(c, hoy) {
  return `Sos ${c.nombre}, ${c.rol}, en la Oficina de agentes del Second Brain de Daniela. Hoy es ${hoy}.

Qué hacés: ${c.descripcion}
Con qué trabajás: ${c.herramientas.join('; ') || 'nada declarado'}.

Tu registro reciente (lo más nuevo primero; es todo lo que sabés de tu trabajo):
${c.registro.length ? c.registro.join('\n') : '(vacío: todavía no hay nada registrado)'}

Cómo responder:
- En primera persona, en español rioplatense, corto y concreto (2 a 6 oraciones salvo que te pidan detalle).
- Usá solo lo que está en tu registro y en tu descripción. Si te preguntan algo que no está ahí, decí que no lo sabés; no inventes fechas, cifras ni resultados.
- No podés cambiar nada desde esta charla (ni correr, ni aprobar, ni editar). Si Daniela quiere eso, decile en qué pantalla se hace: Trabajadores para los trabajadores, la app UP para los agentes de UP, la app PDG para los comerciales.
- Si algo falló, explicá qué dice el registro y qué podría revisar ella.`
}

export function armarMensajes(c, mensajes, hoy) {
  return [{ role: 'system', content: sistema(c, hoy) }, ...mensajes]
}

// ---------- Reunión ----------
// { reunion: true, asistentes: ['up:redactor', ...], mensajes } — Daniela habla con todos los que vinieron.
// Responde una sola llamada a la IA con los que tengan algo que decir: { respuestas: [{ agente, texto }] }.
export const MAX_ASISTENTES = 24
const MAX_REGISTRO_REUNION = 4

export function validarReunion(body) {
  const ids = Array.isArray(body?.asistentes) ? [...new Set(body.asistentes.map(String))] : []
  const asistentes = ids.map(id => ({ id, ...partirId(id) })).filter(a => a.equipo && (a.equipo !== 'up' || AGENTES_UP[a.clave]))
  if (!asistentes.length || asistentes.length !== ids.length || asistentes.length > MAX_ASISTENTES) return { ok: false, error: 'Asistentes inválidos.' }
  if (!Array.isArray(body?.mensajes) || !body.mensajes.length) return { ok: false, error: 'Falta el mensaje.' }
  const mensajes = body.mensajes.slice(-16).map(m => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? '').slice(0, MAX_CARACTERES).trim(),
  })).filter(m => m.content)
  if (!mensajes.length || mensajes.at(-1).role !== 'user') return { ok: false, error: 'Falta el mensaje.' }
  return { ok: true, asistentes, mensajes }
}

// participantes: [{ id, c }] con c = contexto() de cada uno.
export function sistemaReunion(participantes, hoy) {
  const fichas = participantes.map(({ id, c }) => [
    `### ${c.nombre} (id: ${id}) — ${c.rol}`,
    `Qué hace: ${recortar(c.descripcion, 300)}`,
    `Registro reciente:`,
    ...(c.registro.length ? c.registro.slice(0, MAX_REGISTRO_REUNION).map(l => recortar(l, 220)) : ['(vacío)']),
  ].join('\n')).join('\n\n')
  return `Es una reunión en la Oficina de agentes del Second Brain de Daniela, por videollamada. Hoy es ${hoy}.
Daniela habla con todos los agentes que vinieron. Vos das voz a esos agentes: cada uno habla en primera persona,
en español rioplatense, como en una reunión de trabajo normal (natural, cordial, concreto).

Participantes y lo que sabe cada uno (es TODO lo que saben; no inventen fechas, cifras ni resultados):

${fichas}

Cómo se responde:
- Hablan solo los que tienen algo que aportar a lo que dijo Daniela (normalmente 1 a 3). Si nombra a alguien, responde ese.
  Si pide que hablen todos (una ronda, "¿cómo están todos?"), responde cada uno con una oración.
- Cada respuesta: 1 a 3 oraciones. Pueden hablarse entre ellos o preguntarle algo a Daniela si lo necesitan.
- Nadie puede cambiar nada desde la reunión (correr, aprobar, editar): si Daniela pide eso, el agente dice en qué pantalla se hace.
- Si nadie sabe algo, el que más se acerque lo dice con honestidad.

Respondé SOLO con JSON, sin texto alrededor: {"respuestas":[{"agente":"<id exacto de la lista>","texto":"..."}]}`
}

// Los mensajes de los agentes vuelven al modelo como "Nombre: texto" para que sepa quién dijo qué.
export function mensajesReunion(participantes, mensajes, hoy) {
  return [{ role: 'system', content: sistemaReunion(participantes, hoy) }, ...mensajes]
}

// Lee la respuesta del modelo: tolera texto alrededor y descarta agentes que no están en la reunión.
export function leerRespuestas(texto, idsValidos) {
  const crudo = String(texto ?? '')
  const desde = crudo.indexOf('{'), hasta = crudo.lastIndexOf('}')
  let datos = null
  if (desde >= 0 && hasta > desde) { try { datos = JSON.parse(crudo.slice(desde, hasta + 1)) } catch { datos = null } }
  const lista = Array.isArray(datos?.respuestas) ? datos.respuestas : []
  const validos = new Set(idsValidos)
  return lista
    .map(r => ({ agente: String(r?.agente ?? ''), texto: String(r?.texto ?? '').trim().slice(0, 1200) }))
    .filter(r => validos.has(r.agente) && r.texto)
    .slice(0, MAX_ASISTENTES)
}
