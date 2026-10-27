import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorDeIA, esperaParaReintento, sinSecretos, conRespaldo, combinarFallas, llamarModelo, buscarWeb, ErrorIA, armarProveedores, pasaAlRespaldo } from './ia.mjs'

const groq429 = texto => ({ error: { message: texto, type: 'requests', code: 'rate_limit_exceeded' } })
const geminiCuerpo = cuota => [{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota.', details: [
  { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: cuota }] },
  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' },
] } }]

test('Groq: distingue límite por minuto y por día, y qué cuota', () => {
  const rpm = errorDeIA(429, groq429('Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01abcXYZ` service tier `on_demand` on requests per minute (RPM): Limit 30, Used 30, Requested 1. Please try again in 2s.'), '2')
  assert.equal(rpm.limite, 'minuto')
  assert.equal(rpm.tipo, 'RPM')
  assert.equal(rpm.esperar_s, 2)
  assert.match(rpm.mensaje, /Esperá un minuto/)
  assert.match(rpm.detalle, /^HTTP 429 rate_limit_exceeded esperar=2s: Rate limit/)
  assert.doesNotMatch(rpm.detalle, /org_01abcXYZ/)
  const tpd = errorDeIA(429, groq429('Rate limit reached for model `openai/gpt-oss-120b` on tokens per day (TPD): Limit 200000, Used 199500, Requested 900. Please try again in 7m12.5s.'), null)
  assert.equal(tpd.limite, 'dia')
  assert.equal(tpd.tipo, 'TPD')
  assert.equal(tpd.esperar_s, 433)
  assert.match(tpd.mensaje, /cupo de hoy/)
  assert.equal(errorDeIA(429, groq429('... on tokens per minute (TPM) ... Please try again in 450ms.')).esperar_s, 1)
  assert.equal(errorDeIA(429, [{ error: { code: 429, message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 5. Please retry in 43.355978936s.' } }]).esperar_s, 44)
})

test('Gemini: lee QuotaFailure y RetryInfo, también dentro de un array', () => {
  const min = errorDeIA(429, geminiCuerpo('GenerateRequestsPerMinutePerProjectPerModel-FreeTier'))
  assert.equal(min.limite, 'minuto')
  assert.equal(min.tipo, 'RPM')
  assert.equal(min.esperar_s, 37)
  assert.match(min.detalle, /RESOURCE_EXHAUSTED cuota=GenerateRequestsPerMinute/)
  const dia = errorDeIA(429, geminiCuerpo('GenerateRequestsPerDayPerProjectPerModel-FreeTier'))
  assert.equal(dia.limite, 'dia')
  assert.equal(dia.tipo, 'RPD')
  assert.equal(errorDeIA(429, geminiCuerpo('GenerateContentInputTokensPerModelPerMinute-FreeTier')).tipo, 'TPM')
})

test('otros errores no son límite y no muestran claves', () => {
  const e = errorDeIA(503, { error: { message: 'Overloaded, key=AIzaSyA1234567890abcdefghijk' } })
  assert.equal(e.limite, null)
  assert.equal(e.tipo, null)
  assert.match(e.mensaje, /HTTP 503/)
  assert.doesNotMatch(e.detalle + e.mensaje, /AIzaSy/)
  assert.equal(errorDeIA(500, null).detalle, 'HTTP 500')
  assert.equal(errorDeIA(429, null).limite, 'minuto')
  assert.match(errorDeIA(0, { error: { message: 'Signal timed out.' } }).mensaje, /no respondió/)
  assert.equal(errorDeIA(0, { error: { message: 'Signal timed out.' } }).detalle, 'sin respuesta: Signal timed out.')
  assert.equal(sinSecretos('Bearer gsk_abc123 y ?key=xyz&a=1'), 'Bearer [clave] y ?key=[clave]&a=1')
})

test('reintenta solo el límite por minuto y con espera corta', () => {
  assert.equal(esperaParaReintento({ limite: 'minuto', esperar_s: null }), 5)
  assert.equal(esperaParaReintento({ limite: 'minuto', esperar_s: 0 }), 1)
  assert.equal(esperaParaReintento({ limite: 'minuto', esperar_s: 12 }), 12)
  assert.equal(esperaParaReintento({ limite: 'minuto', esperar_s: 45 }), null)
  assert.equal(esperaParaReintento({ limite: 'dia', esperar_s: 3 }), null)
  assert.equal(esperaParaReintento({ limite: null }), null)
})

const PROVS = armarProveedores({ GROQ_API_KEY: 'g', GEMINI_API_KEY_BS67: 'x' }, 'prueba', { groq: 'm-groq', gemini: 'm-gemini' })
const falla = (status, cuerpo = null) => new ErrorIA(errorDeIA(status, cuerpo))

test('si Groq llega a un límite, da error 5xx o no responde, el mensaje lo responde Gemini', async () => {
  for (const [e, motivo] of [
    [falla(429, groq429('... on tokens per minute (TPM) ...')), 'groq 429 TPM → gemini'],
    [falla(429, groq429('... on requests per day (RPD) ...')), 'groq 429 RPD → gemini'],
    [falla(503), 'groq 503 → gemini'],
    [falla(0, { error: { message: 'Signal timed out.' } }), 'groq sin respuesta → gemini'],
  ]) {
    const r = await conRespaldo(PROVS, async p => { if (p.nombre === 'groq') throw e; return 'hola' })
    assert.deepEqual(r, { resultado: 'hola', ia: 'gemini', respaldo: motivo })
  }
  assert.deepEqual(await conRespaldo(PROVS, async () => 'directo'), { resultado: 'directo', ia: 'groq', respaldo: null })
})

test('solo el último proveedor reintenta con espera', async () => {
  const turnos = []
  await conRespaldo(PROVS, async p => { turnos.push(`${p.nombre} ${p.turno.ultimo}`); if (p.nombre === 'groq') throw falla(503); return 'ok' })
  assert.deepEqual(turnos, ['groq false', 'gemini true'])
})

test('un error que no es de límite ni 5xx no pasa a Gemini', async () => {
  let gemini = false
  await assert.rejects(conRespaldo(PROVS, async p => { if (p.nombre === 'gemini') gemini = true; throw falla(400, { error: { message: 'bad' } }) }),
    e => e instanceof ErrorIA && e.info.status === 400 && e.info.respaldo === null)
  assert.equal(gemini, false)
})

test('si fallan los dos: cupo de hoy solo si los dos llegaron al diario', async () => {
  const dosFallas = (g, m) => conRespaldo(PROVS, async p => { throw p.nombre === 'groq' ? g : m }).catch(e => e.info)
  const diaYMinuto = await dosFallas(falla(429, groq429('... per day (TPD) ...')), new ErrorIA({ ...errorDeIA(429, geminiCuerpo('GenerateRequestsPerMinutePerProjectPerModel-FreeTier')) }))
  assert.equal(diaYMinuto.limite, 'minuto')
  assert.equal(diaYMinuto.esperar_s, 37)
  assert.equal(diaYMinuto.respaldo, 'groq 429 TPD → gemini 429 RPM')
  assert.equal(diaYMinuto.ia, 'gemini')
  assert.match(diaYMinuto.detalle, /^groq HTTP 429 .* \| gemini HTTP 429 /)
  const dosDias = await dosFallas(falla(429, groq429('... per day (TPD) ...')), falla(429, geminiCuerpo('GenerateRequestsPerDayPerProjectPerModel-FreeTier')))
  assert.equal(dosDias.limite, 'dia')
  assert.match(dosDias.mensaje, /cupo de hoy/)
  const conError = await dosFallas(falla(503), falla(500))
  assert.equal(conError.limite, null)
  assert.match(conError.mensaje, /HTTP 500/)
  assert.equal(combinarFallas([{ ...errorDeIA(429, groq429('(RPM) try again in 3s')), ia: 'groq' }]).respaldo, null)
})

const respuesta = (status, cuerpo, headers = {}) => ({ ok: status < 400, status, json: async () => cuerpo, headers: { get: k => headers[k] ?? null } })

test('llamarModelo: devuelve el mensaje, y con límite por minuto reintenta una vez solo si es el último', async () => {
  const ok = { choices: [{ message: { content: 'hola' } }] }
  const limite = respuesta(429, groq429('(RPM) Please try again in 2s.'), { 'retry-after': '2' })
  const esperas = []
  const dormir = async s => { esperas.push(s) }
  let n = 0
  assert.deepEqual(await llamarModelo({ ...PROVS[1], turno: { reintentos: 0, ultimo: true } }, {}, { pedir: async () => (n++ ? respuesta(200, ok) : limite), dormir }), { content: 'hola' })
  assert.deepEqual(esperas, [2])
  await assert.rejects(llamarModelo({ ...PROVS[0], turno: { reintentos: 0, ultimo: false } }, {}, { pedir: async () => limite, dormir }), e => e.info.limite === 'minuto')
  assert.deepEqual(esperas, [2])
  await assert.rejects(llamarModelo(PROVS[0], {}, { pedir: async () => { throw new Error('Signal timed out.') }, dormir }), e => e.info.status === 0)
})

test('buscarWeb: si Compound de Groq falla, busca con Google por Gemini', async () => {
  const modelo = async () => { throw falla(429, groq429('(TPM)')) }
  const pedir = globalThis.fetch
  globalThis.fetch = async () => respuesta(200, { candidates: [{ content: { parts: [{ text: 'Boca ganó' }] }, groundingMetadata: { groundingChunks: [{ web: { title: 'Olé', uri: 'https://ole.com.ar' } }] } }] })
  try {
    assert.deepEqual(await buscarWeb(PROVS, PROVS[0], 'boca', modelo), { resultado: 'Boca ganó', fuentes: ['Olé: https://ole.com.ar'] })
    globalThis.fetch = async () => respuesta(429, geminiCuerpo('GenerateRequestsPerDayPerProjectPerModel-FreeTier'))
    assert.match((await buscarWeb(PROVS, PROVS[1], 'boca', modelo)).error, /cupo de hoy/)
  } finally { globalThis.fetch = pedir }
})

test('Gemini de respaldo solo con su clave propia, no con la que comparten los agentes de UP', () => {
  const nombres = env => armarProveedores(env, 'prueba', { groq: 'g', gemini: 'm' }).map(p => p.nombre)
  assert.deepEqual(nombres({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'compartida' }), ['groq'])
  assert.deepEqual(nombres({ GROQ_API_KEY: 'g', GEMINI_API_KEY_BS67: 'propia' }), ['groq', 'gemini'])
  assert.equal(armarProveedores({ GEMINI_API_KEY: 'compartida', GEMINI_API_KEY_BS67: 'propia' }, 'prueba', { gemini: 'm' })[0].clave, 'propia')
})

test('OpenRouter va entre Groq y Gemini, con el modelo de Groq si no se dice otro', () => {
  const provs = armarProveedores({ GROQ_API_KEY: 'g', OPENROUTER_API_KEY: 'sk-or-v1-abc', GEMINI_API_KEY_BS67: 'p' }, 'prueba', { groq: 'openai/gpt-oss-120b', gemini: 'm' })
  assert.deepEqual(provs.map(p => p.nombre), ['groq', 'openrouter', 'gemini'])
  assert.equal(provs[1].modelo, 'openai/gpt-oss-120b')
  assert.equal(armarProveedores({ OPENROUTER_API_KEY: 'k' }, 'prueba', { groq: 'a', openrouter: 'b' })[0].modelo, 'b')
})

test('sin créditos en OpenRouter (402) pasa al siguiente y no muestra la clave', async () => {
  const info = errorDeIA(402, { error: { message: 'Insufficient credits for sk-or-v1-abc123' } })
  assert.equal(pasaAlRespaldo(info), true)
  assert.match(info.mensaje, /créditos/)
  assert.doesNotMatch(info.detalle, /sk-or-v1-abc123/)
  const r = await conRespaldo([{ nombre: 'groq' }, { nombre: 'openrouter' }], async p => {
    if (p.nombre === 'groq') throw new ErrorIA(errorDeIA(503, {}))
    return 'ok'
  })
  assert.deepEqual(r, { resultado: 'ok', ia: 'openrouter', respaldo: 'groq 503 → openrouter' })
})

test('buscarWeb con OpenRouter usa el modelo :online', async () => {
  let usado = null
  const modelo = async p => { usado = p.modelo; return { content: 'Boca ganó (https://ole.com.ar)' } }
  const provs = [{ nombre: 'openrouter', modelo: 'openai/gpt-oss-120b' }]
  assert.deepEqual(await buscarWeb(provs, provs[0], 'boca', modelo), { resultado: 'Boca ganó (https://ole.com.ar)' })
  assert.equal(usado, 'openai/gpt-oss-120b:online')
})
