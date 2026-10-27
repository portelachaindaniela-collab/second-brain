// Vigía de Mi Agenda Dulce, la app de Valentina (13 años). Solo lee: nunca escribe en las tablas dulce_*, no le
// manda nada a ella ni a mamá y no toca su repo. Todo acá es puro (sin red ni base) para poder probarlo.
// Privacidad: del chat solo se cuentan mensajes (nunca el texto) y de la agenda solo salen los títulos de lo atrasado
// o de los exámenes que se vienen, y las notas nuevas. Nada más se guarda en trabajos_corridas.
export const TRABAJADOR = 'agenda_valentina'

const HORA = 3600_000
const DIA = 24 * HORA
const ZONA = 'America/Argentina/Buenos_Aires'

export const PARAMETROS_DEFECTO = {
  url: 'https://portelachaindaniela-collab.github.io/mi-agenda-dulce/',
  repo: 'portelachaindaniela-collab/mi-agenda-dulce',
  funcion: 'agenda-dulce',
  familia: 'Valentina',
  dias_sin_abrir: 3,
  horas_sin_leer: 6,
  dias_examenes: 3,
  dino_aviso: 200,
  modelo: 'openai/gpt-oss-120b',
}

export function leerParametros(parametros) {
  const p = { ...PARAMETROS_DEFECTO }
  for (const [k, v] of Object.entries(parametros ?? {})) {
    if (!(k in p)) continue
    if (typeof p[k] === 'number' ? Number.isFinite(v) && v > 0 : typeof v === 'string' && v.trim()) p[k] = v
  }
  if (!/^https:\/\//i.test(p.url)) p.url = PARAMETROS_DEFECTO.url
  if (!p.url.endsWith('/')) p.url += '/'
  return p
}

export const diaAR = ms => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
const masDias = (aaaammdd, n) => new Date(Date.parse(`${aaaammdd}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10)
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// La última corrida de Pages del repo, leída de la API pública de Actions (el endpoint de builds pide token).
// GitHub dice success/failure; acá se traduce a lo que muestra Pages: built / errored / building.
export function estadoPages(respuesta) {
  const corrida = (respuesta?.workflow_runs ?? []).find(r => /pages build and deployment/i.test(r?.name ?? ''))
  if (!corrida) return null
  const estado = corrida.status !== 'completed' ? 'building' : corrida.conclusion === 'success' ? 'built' : 'errored'
  return { estado, cuando: corrida.updated_at ?? corrida.created_at ?? null }
}

// Lo que dejó agenda-dulce en sus logs (function_logs y function_edge_logs). Llega como filas de texto: se cuenta,
// no se guarda ningún mensaje.
export function contarLogs({ mensajes = [], errores5xx = 0 } = {}) {
  const texto = mensajes.map(m => String(m?.event_message ?? m ?? ''))
  return {
    errores_5xx: Number(errores5xx) || 0,
    groq_429: texto.filter(t => /agenda-dulce IA 429\b/.test(t)).length,
    groq_otros: texto.filter(t => /agenda-dulce IA (?!429\b)\d{3}\b/.test(t)).length,
    cambios_vision: texto.filter(t => /no anda, paso a/.test(t)).length,
    respaldos_openrouter: texto.filter(t => /→ openrouter/.test(t)).length,
    fallos_openrouter: texto.filter(t => /agenda-dulce OpenRouter/.test(t)).length,
  }
}

// Los modelos que Groq lista hoy: el del Dino tiene que estar y tiene que haber alguno de visión para las fotos.
// Misma búsqueda que hace agenda-dulce cuando el de visión configurado desaparece.
export function revisarGroq(ids, modelo) {
  if (!Array.isArray(ids)) return { ok: false, modelo: false, vision: false }
  const vision = ids.some(id => /llama-4.*(maverick|scout)|vision|[-_]vl\b|vl[-_]|qwen/i.test(id))
  return { ok: true, modelo: ids.includes(modelo), vision }
}

// agenda: { datos, actualizado } de dulce_agenda. idsConNotaAntes: los exámenes con nota de la corrida anterior
// (null en la primera: ahí todo es punto de partida y no hay notas "nuevas").
export function revisarCole(agenda, { ahora = Date.now(), diasExamenes = 3, idsConNotaAntes = null } = {}) {
  const hoy = diaAR(ahora)
  const hasta = masDias(hoy, diasExamenes)
  const tareas = Array.isArray(agenda?.datos?.tareas) ? agenda.datos.tareas : []
  const examenes = Array.isArray(agenda?.datos?.examenes) ? agenda.datos.examenes : []
  const titulo = (materia, texto) => [materia, texto].filter(Boolean).join(': ') || 'sin título'
  const atrasadas = tareas.filter(t => !t.hecha && t.fecha && t.fecha < hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(t => ({ titulo: titulo(t.materia, t.titulo), fecha: t.fecha }))
  const proximos = examenes.filter(e => e.fecha && e.fecha >= hoy && e.fecha <= hasta && e.nota == null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(e => ({ titulo: titulo(e.materia, e.tema), fecha: e.fecha }))
  const conNota = examenes.filter(e => typeof e.nota === 'number' && e.id)
  const antes = Array.isArray(idsConNotaAntes) ? new Set(idsConNotaAntes) : null
  const notasNuevas = antes ? conNota.filter(e => !antes.has(e.id)).map(e => ({ materia: e.materia || 'sin materia', nota: e.nota })) : []
  return {
    tareas_pendientes: tareas.filter(t => !t.hecha).length,
    atrasadas, proximos_examenes: proximos, notas_nuevas: notasNuevas,
    ids_con_nota: conNota.map(e => e.id),
  }
}

// mensajes: filas { de, leido, creado } de dulce_mensajes (sin texto).
export function revisarChat(mensajes = [], { ahora = Date.now(), horasSinLeer = 6 } = {}) {
  const ult24 = mensajes.filter(m => ahora - Date.parse(m.creado) < DIA)
  const sinLeer = mensajes.filter(m => m.de === 'mama' && !m.leido)
  const viejos = sinLeer.filter(m => ahora - Date.parse(m.creado) > horasSinLeer * HORA)
  const masViejo = viejos.reduce((min, m) => Math.min(min, Date.parse(m.creado)), Infinity)
  return {
    mensajes_24h: ult24.length,
    de_mama_24h: ult24.filter(m => m.de === 'mama').length,
    de_valentina_24h: ult24.filter(m => m.de === 'chica').length,
    mama_sin_leer: sinLeer.length,
    mama_sin_leer_viejos: viejos.length,
    horas_sin_leer: viejos.length ? Math.floor((ahora - masViejo) / HORA) : 0,
  }
}

// uso: filas { dia, cantidad } de dulce_uso. Devuelve los últimos `dias` días, del más viejo a hoy, con ceros.
export function usoDino(uso = [], { ahora = Date.now(), dias = 7 } = {}) {
  const hoy = diaAR(ahora)
  const por = {}
  for (const u of uso) por[u.dia] = (por[u.dia] ?? 0) + (Number(u.cantidad) || 0)
  return Array.from({ length: dias }, (_, i) => masDias(hoy, i - dias + 1)).map(dia => ({ dia, cantidad: por[dia] ?? 0 }))
}

const SEMAFORO = { verde: '🟢', amarillo: '🟡', rojo: '🔴' }

// chequeos: lo que juntó index.ts. Devuelve el semáforo, una frase corta para el resumen diario y la lista de avisos.
export function evaluar(chequeos, parametros = PARAMETROS_DEFECTO, ahora = Date.now()) {
  const p = parametros
  const { sitio = {}, pages = null, pagesError = null, funcion = {}, ics = {}, groq = null, openrouter = null, logs = null, agenda = null, cole = null, chat = null, dino = [] } = chequeos
  const rojos = [], amarillos = [], info = []

  if (sitio.status !== 200) rojos.push(`el sitio no responde${sitio.status ? ` (${sitio.status})` : ''}`)
  const faltan = ['manifest', 'sw'].filter(k => sitio[k] !== 200).map(k => (k === 'sw' ? 'sw.js' : 'manifest.webmanifest'))
  if (faltan.length) rojos.push(`falta ${faltan.join(' y ')}`)
  if (pages?.estado === 'errored') rojos.push('falló el último build de Pages')
  else if (!pages) amarillos.push(`no pude ver el build de Pages${pagesError ? ` (${pagesError})` : ''}`)

  if (!funcion.ok) rojos.push(`la función ${p.funcion} no responde bien${funcion.status ? ` (${funcion.status})` : ''}`)
  if (ics.probado === false) amarillos.push('no pude probar el calendario de mamá (no hay familia cargada)')
  else if (!ics.ok) rojos.push(`el calendario de mamá no devuelve text/calendar${ics.status ? ` (${ics.status})` : ''}`)

  // openrouter: 'ok' | 'error' | 'sin_clave' (el respaldo del Dino). Con respaldo andando, Groq caído no rompe la app.
  const sinGroq = !groq?.ok ? 'Groq no responde' : !groq.modelo ? `Groq ya no tiene ${p.modelo}` : null
  if (sinGroq && openrouter === 'ok') amarillos.push(`${sinGroq}: el Dino contesta por OpenRouter`)
  else if (sinGroq) rojos.push(`${sinGroq}: el Dino no puede contestar`)
  else if (!groq.vision && openrouter !== 'ok') amarillos.push('Groq no tiene ningún modelo de visión: las fotos no van a andar')
  if (openrouter === 'error') amarillos.push('OpenRouter no responde o se quedó sin créditos: el Dino no tiene respaldo')
  if (logs) {
    if (logs.errores_5xx) rojos.push(`${plural(logs.errores_5xx, 'error 5xx', 'errores 5xx')} en 24 h`)
    if (logs.groq_429) amarillos.push(`Groq dijo "ocupado" ${plural(logs.groq_429, 'vez', 'veces')} en 24 h`)
    if (logs.groq_otros) amarillos.push(`${plural(logs.groq_otros, 'error', 'errores')} de Groq en 24 h`)
    if (logs.cambios_vision) amarillos.push('el modelo de visión configurado dejó de andar y la función eligió otro')
    if (logs.fallos_openrouter) amarillos.push(`OpenRouter también falló ${plural(logs.fallos_openrouter, 'vez', 'veces')} en 24 h`)
    if (logs.respaldos_openrouter) info.push(`${plural(logs.respaldos_openrouter, 'respuesta', 'respuestas')} del Dino por OpenRouter`)
  }

  if (!agenda) amarillos.push('Valentina todavía no sincronizó la agenda')
  else {
    const pasado = ahora - Date.parse(agenda.actualizado)
    const dias = Math.floor(pasado / DIA)
    if (pasado > p.dias_sin_abrir * DIA) amarillos.push(`Valentina no abre la agenda hace ${dias} días`)
  }
  if (cole?.atrasadas.length) amarillos.push(`${plural(cole.atrasadas.length, 'tarea atrasada', 'tareas atrasadas')}`)
  if (cole?.proximos_examenes.length) info.push(`${plural(cole.proximos_examenes.length, 'examen', 'exámenes')} en ${p.dias_examenes} días`)
  if (cole?.notas_nuevas.length) info.push(`${plural(cole.notas_nuevas.length, 'nota nueva', 'notas nuevas')}`)
  if (chat?.mama_sin_leer_viejos) amarillos.push(`un mensaje de mamá lleva ${chat.horas_sin_leer} h sin leer`)

  const hoy = dino[dino.length - 1]?.cantidad ?? 0
  const cerca = dino.slice(-2).filter(d => d.cantidad > p.dino_aviso)
  if (cerca.length) amarillos.push(`el Dino pasó los ${p.dino_aviso} mensajes (${cerca.map(d => `${d.cantidad} el ${d.dia.slice(8)}/${d.dia.slice(5, 7)}`).join(', ')}); el límite es 250`)
  info.unshift(`${plural(hoy, 'mensaje', 'mensajes')} al Dino hoy`)

  const semaforo = rojos.length ? 'rojo' : amarillos.length ? 'amarillo' : 'verde'
  const cabeza = semaforo === 'rojo' ? 'rota' : semaforo === 'amarillo' ? 'algo para mirar' : 'todo bien'
  const detalle = [...rojos, ...amarillos, ...info].join(' · ')
  return {
    semaforo,
    resumen: `${SEMAFORO[semaforo]} Agenda de Valentina: ${cabeza}${detalle ? ` — ${detalle}` : ''}.`,
    avisos: [...rojos.map(texto => ({ nivel: 'rojo', texto })), ...amarillos.map(texto => ({ nivel: 'amarillo', texto }))],
  }
}

// Lo que queda en trabajos_corridas: cifras, semáforo y los títulos permitidos. Que la app esté rota es un resultado,
// no una falla de la corrida.
export function resultadoAgenda(chequeos, parametros = PARAMETROS_DEFECTO, ahora = Date.now()) {
  const ev = evaluar(chequeos, parametros, ahora)
  const { sitio, pages, funcion, ics, groq, openrouter, logs, agenda, cole, chat, dino } = chequeos
  return {
    estado: 'ok',
    cantidad: ev.avisos.length,
    payload: {
      ...ev,
      sitio: { ...sitio, pages: pages?.estado ?? null },
      backend: { funcion: funcion?.status ?? null, ics: ics?.ok ?? null, groq: groq ?? null, openrouter: openrouter ?? null, logs: logs ?? 'sin acceso' },
      uso: {
        ultima_sincronizacion: agenda?.actualizado ?? null,
        dino_por_dia: dino ?? [],
      },
      cole: cole ? {
        tareas_pendientes: cole.tareas_pendientes,
        atrasadas: cole.atrasadas,
        proximos_examenes: cole.proximos_examenes,
        notas_nuevas: cole.notas_nuevas,
        ids_con_nota: cole.ids_con_nota,
      } : null,
      chat: chat ?? null,
    },
  }
}

// Avisar al toque por push solo cuando pasa a rojo (no en cada corrida mientras siga rota).
export const avisarYa = (semaforo, anterior) => semaforo === 'rojo' && anterior !== 'rojo'
