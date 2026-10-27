// La IA de BS67 (bs67-chat y up-asistente): Groq primero, después OpenRouter (créditos pagos, mismo modelo que Groq) y
// por último Gemini. Si uno falla por límite (429), por créditos (402), por un error suyo (5xx) o no responde, el mismo
// mensaje se hace de cero con el siguiente. Recién si fallan todos se devuelve el error.
// OpenRouter usa OPENROUTER_API_KEY; sin esa clave se saltea.
// Gemini usa GEMINI_API_KEY_BS67, una clave de otro proyecto de Google: el cupo gratis es por proyecto (5 consultas por
// minuto y 20 por día) y GEMINI_API_KEY lo comparten los agentes de UP y evaluar-evento. Sin esa clave, no hay Gemini.

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
export const ESPERA_REINTENTO_S = 5
export const MAX_ESPERA_REINTENTO_S = 20

// modelos: { groq, openrouter?, gemini } con el modelo de cada uno para esta función (OpenRouter usa el de Groq si no
// se dice otro: tiene los mismos). El orden es el de prueba.
export function armarProveedores(env, funcion, modelos) {
  const lista = []
  if (env.GROQ_API_KEY) lista.push({ nombre: 'groq', funcion, url: GROQ_URL, clave: env.GROQ_API_KEY, modelo: modelos.groq })
  if (env.OPENROUTER_API_KEY) lista.push({ nombre: 'openrouter', funcion, url: OPENROUTER_URL, clave: env.OPENROUTER_API_KEY, modelo: modelos.openrouter || modelos.groq })
  if (env.GEMINI_API_KEY_BS67) lista.push({ nombre: 'gemini', funcion, url: GEMINI_URL, clave: env.GEMINI_API_KEY_BS67, modelo: modelos.gemini })
  return lista
}

export class ErrorIA extends Error {
  constructor(info) {
    super(info.mensaje)
    this.info = info
  }
}

const segundosDe = t => {
  const ms = String(t ?? '').match(/^(\d+(?:\.\d+)?)ms$/)
  if (ms) return Math.ceil(+ms[1] / 1000)
  const m = String(t ?? '').match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?$/)
  if (!m || !(m[1] || m[2] || m[3])) return null
  return Math.ceil((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0))
}

export const sinSecretos = t => String(t ?? '')
  .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[clave]').replace(/gsk_[0-9A-Za-z]+/g, '[clave]').replace(/sk-or-[0-9A-Za-z-]+/g, '[clave]').replace(/Bearer\s+\S+/gi, 'Bearer [clave]')
  .replace(/([?&]key=)[^&\s"']+/gi, '$1[clave]').replace(/\borg_[0-9A-Za-z]+/g, 'org_[oculto]')

// Qué cuota se pasó, en corto: Groq la dice entre paréntesis (RPM, TPM, RPD, TPD); Gemini en el quotaId.
function tipoDeCuota(texto, cuotas) {
  const groq = texto.match(/\((RPM|TPM|RPD|TPD|ASH|ASD)\)/)?.[1]
  if (groq) return groq
  const q = cuotas.join(' ')
  const periodo = /PerDay/i.test(q) ? 'D' : /PerMinute/i.test(q) ? 'M' : null
  return periodo ? `${/token/i.test(q) ? 'T' : 'R'}P${periodo}` : null
}

// Errores de la IA. Groq: 429 con header retry-after y el límite en el mensaje («on requests per minute (RPM)»,
// «tokens per day (TPD)», «Please try again in 7m12s»). Gemini («Please retry in 43.3s»): 429 RESOURCE_EXHAUSTED con QuotaFailure (quotaId
// …PerMinute… o …PerDay…) y RetryInfo.retryDelay; su API compatible con OpenAI a veces manda el error dentro de un array.
// status 0: no hubo respuesta (timeout o red).
export function errorDeIA(status, cuerpo, retryAfter = null) {
  const c = Array.isArray(cuerpo) ? cuerpo[0] : cuerpo
  const e = c?.error ?? c ?? {}
  const texto = typeof e === 'string' ? e : String(e.message ?? '')
  const detalles = Array.isArray(e.details) ? e.details : []
  const cuotas = detalles.flatMap(d => d?.violations ?? []).map(v => `${v?.quotaId ?? ''} ${v?.quotaMetric ?? ''}`.trim()).filter(Boolean)
  const espera = [
    Number.isFinite(+retryAfter) && retryAfter !== null && retryAfter !== '' ? Math.ceil(+retryAfter) : null,
    segundosDe(detalles.find(d => d?.retryDelay)?.retryDelay),
    segundosDe(texto.match(/(?:try again|retry) in ((?:\d+(?:\.\d+)?(?:ms|[hms]))+)/i)?.[1]),
  ].find(s => s !== null) ?? null
  const pistas = `${cuotas.join(' ')} ${texto}`
  // Un 429 sin pistas de límite diario se toma como por minuto: avisar «se agotó el cupo de hoy» de más es peor.
  const limite = status !== 429 ? null : /per ?day|\b(RPD|TPD)\b|daily/i.test(pistas) ? 'dia' : 'minuto'
  const codigo = [typeof e === 'object' && e.status, typeof e === 'object' && e.code].filter(x => x && x !== status).join(' ')
  const detalle = sinSecretos([status ? `HTTP ${status}` : 'sin respuesta', codigo, cuotas.length && `cuota=${cuotas.join(',')}`, espera !== null && `esperar=${espera}s`].filter(Boolean).join(' ') + (texto ? `: ${texto}` : '')).slice(0, 500)
  const mensaje = status === 402
    ? 'Se terminaron los créditos de la IA de respaldo (OpenRouter).'
    : limite === 'minuto'
      ? 'BS67 recibió demasiadas consultas seguidas (límite por minuto de la IA gratis). Esperá un minuto y probá de nuevo.'
      : limite === 'dia'
        ? 'Se agotó el cupo de hoy de la IA gratis. Probá más tarde o mañana.'
        : status
          ? `La IA respondió con un error (HTTP ${status}${texto ? `: ${sinSecretos(texto).slice(0, 200)}` : ''}).`
          : `La IA no respondió (${sinSecretos(texto).slice(0, 200) || 'sin conexión'}). Probá de nuevo en un momento.`
  return { status, limite, tipo: status === 429 ? tipoDeCuota(texto, cuotas) : null, esperar_s: espera, detalle, mensaje }
}

// Solo el límite por minuto se reintenta, una vez, y si la espera es corta (la función tiene tiempo máximo).
export function esperaParaReintento(info) {
  if (info?.limite !== 'minuto') return null
  const s = info.esperar_s ?? ESPERA_REINTENTO_S
  return s <= MAX_ESPERA_REINTENTO_S ? Math.max(1, s) : null
}

export const pasaAlRespaldo = info => info.status === 0 || info.status === 402 || info.status === 429 || info.status >= 500

export const etiqueta = f => [f.ia, f.status || 'sin respuesta', f.tipo].filter(Boolean).join(' ')

// Cuando fallan todos: «cupo de hoy» solo si todos llegaron al diario; si alguno es por minuto, en un minuto vuelve a
// andar (y se espera lo menos). Si no fue un límite, queda el último error.
export function combinarFallas(fallas) {
  const ultima = fallas[fallas.length - 1]
  const porMinuto = fallas.filter(f => f.limite === 'minuto')
  const base = fallas.every(f => f.limite === 'dia') ? ultima : porMinuto.length ? porMinuto[0] : ultima
  const esperas = porMinuto.map(f => f.esperar_s).filter(s => s !== null)
  return {
    ...base,
    ia: ultima.ia,
    esperar_s: porMinuto.length ? (esperas.length ? Math.min(...esperas) : null) : base.esperar_s,
    detalle: fallas.map(f => `${f.ia} ${f.detalle}`).join(' | ').slice(0, 500),
    respaldo: fallas.length > 1 ? fallas.map(etiqueta).join(' → ') : null,
  }
}

// Corre tarea(prov) con cada proveedor en orden y desde cero. Cada intento recibe su propio prov.turno: el reintento
// con espera es uno solo por mensaje y únicamente en el último proveedor (antes conviene pasar al respaldo).
export async function conRespaldo(provs, tarea) {
  const fallas = []
  for (const [i, prov] of provs.entries()) {
    try {
      const resultado = await tarea({ ...prov, turno: { reintentos: 0, ultimo: i === provs.length - 1 } })
      return { resultado, ia: prov.nombre, respaldo: fallas.length ? [...fallas.map(etiqueta), prov.nombre].join(' → ') : null }
    } catch (e) {
      if (!(e instanceof ErrorIA)) throw e
      fallas.push({ ...e.info, ia: prov.nombre })
      if (!pasaAlRespaldo(e.info)) break
    }
  }
  throw new ErrorIA(combinarFallas(fallas))
}

// Una llamada al chat de la IA (API compatible con OpenAI). cuerpo: messages, tools, temperature, max_tokens.
export async function llamarModelo(prov, cuerpo, { timeoutMs = 60000, pedir = fetch, dormir = s => new Promise(listo => setTimeout(listo, s * 1000)) } = {}) {
  const turno = prov.turno ?? { reintentos: 0, ultimo: true }
  const quien = `${prov.funcion ?? 'ia'}: ${prov.nombre} ${prov.modelo}`
  for (let reintentando = false; ; reintentando = true) {
    let info
    try {
      const r = await pedir(prov.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${prov.clave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: prov.modelo, ...cuerpo }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const data = await r.json().catch(() => null)
      if (r.ok) {
        if (reintentando) console.warn(`${quien} respondió al reintentar`)
        return data?.choices?.[0]?.message ?? {}
      }
      info = errorDeIA(r.status, data, r.headers.get('retry-after'))
    } catch (e) {
      info = errorDeIA(0, { error: { message: e instanceof Error ? e.message : String(e) } })
    }
    console.error(`${quien} ${info.detalle}`)
    const espera = turno.ultimo && !turno.reintentos ? esperaParaReintento(info) : null
    if (espera === null) throw new ErrorIA(info)
    turno.reintentos++
    console.warn(`${quien} reintento en ${espera}s`)
    await dormir(espera)
  }
}

// Búsqueda en Google integrada de Gemini (API nativa).
export async function buscarConGoogle(prov, consulta, { pedir = fetch } = {}) {
  let r, data
  try {
    r = await pedir(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(prov.modelo)}:generateContent?key=${prov.clave}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Buscá en internet y respondé en español: ${consulta}` }] }], tools: [{ google_search: {} }] }),
      signal: AbortSignal.timeout(45000),
    })
    data = await r.json().catch(() => null)
  } catch (e) {
    throw new ErrorIA(errorDeIA(0, { error: { message: e instanceof Error ? e.message : String(e) } }))
  }
  if (!r.ok) {
    const info = errorDeIA(r.status, data, r.headers.get('retry-after'))
    console.error(`${prov.funcion ?? 'ia'}: búsqueda web ${prov.nombre} ${info.detalle}`)
    throw new ErrorIA(info)
  }
  const c = data?.candidates?.[0]
  const fuentes = (c?.groundingMetadata?.groundingChunks || []).map(g => g.web && `${g.web.title}: ${g.web.uri}`).filter(Boolean).slice(0, 6)
  return { resultado: (c?.content?.parts || []).map(p => p.text ?? '').join(''), fuentes }
}

// Búsqueda web: con Groq, su modelo Compound (busca solo); con OpenRouter, el mismo modelo con :online (le agrega
// resultados de búsqueda); con Gemini, la de Google. Arranca por el proveedor que está respondiendo y, si falla por
// límite o error suyo, sigue con los de después.
export async function buscarWeb(provs, actual, consulta, modelo) {
  const desde = Math.max(0, provs.findIndex(p => p.nombre === actual.nombre))
  let falla = null
  for (const prov of provs.slice(desde)) {
    try {
      if (prov.nombre === 'groq') {
        const m = await modelo({ ...prov, modelo: 'groq/compound', turno: { reintentos: 0, ultimo: false } }, [{ role: 'user', content: `Buscá en internet y respondé en español con las fuentes (URLs): ${consulta}` }], false)
        return { resultado: m.content || 'Sin resultados.' }
      }
      if (prov.nombre === 'openrouter') {
        const m = await modelo({ ...prov, modelo: `${prov.modelo}:online`, turno: { reintentos: 0, ultimo: false } }, [{ role: 'user', content: `Buscá en internet y respondé en español con las fuentes (URLs): ${consulta}` }], false)
        return { resultado: m.content || 'Sin resultados.' }
      }
      return await buscarConGoogle(prov, consulta)
    } catch (e) {
      if (!(e instanceof ErrorIA)) throw e
      falla = e.info
      if (!pasaAlRespaldo(e.info)) break
    }
  }
  return { error: `La búsqueda web no está disponible ahora (${falla?.mensaje ?? 'sin IA configurada'})` }
}
