// Diseñador de UP: pide a la Edge Function up-disenador los carruseles pendientes, renderiza sus placas
// con Playwright y las devuelve en PNG. Lo corre .github/workflows/up-disenador.yml.
//   node scripts/up-disenador/disenar.mjs                                     (en la Action: renderiza y sube)
//   UP_DISENADOR_SECRETO=... node scripts/up-disenador/disenar.mjs           (lo mismo, a mano)
//   node scripts/up-disenador/disenar.mjs --prueba ejemplo.json carpeta/     (solo renderiza, sin red)
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { ANCHO, ALTO, htmlCarrusel } from './plantilla.mjs'

const FUNCION = 'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/up-disenador'
const APIKEY = 'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu'

// En la Action se identifica con un token OIDC de GitHub (uno nuevo por llamada, duran pocos minutos);
// a mano, con el secreto de Vault.
async function cabeceras() {
  const base = { apikey: APIKEY, 'Content-Type': 'application/json' }
  const { ACTIONS_ID_TOKEN_REQUEST_URL: url, ACTIONS_ID_TOKEN_REQUEST_TOKEN: pedido, UP_DISENADOR_SECRETO: secreto } = process.env
  if (url && pedido) {
    const r = await fetch(`${url}&audience=up-disenador`, { headers: { Authorization: `bearer ${pedido}` } })
    if (!r.ok) throw new Error(`GitHub no dio el token OIDC (HTTP ${r.status}).`)
    return { ...base, 'x-github-oidc': (await r.json()).value }
  }
  if (secreto) return { ...base, 'x-trabajador-secreto': secreto }
  throw new Error('Sin credenciales: corré esto desde la Action o con UP_DISENADOR_SECRETO.')
}

async function renderizar(navegador, pieza, firma) {
  const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } })
  await pagina.setContent(htmlCarrusel({ antetitulo: pieza.antetitulo, placas: pieza.placas, firma }), { waitUntil: 'networkidle' })
  await pagina.waitForSelector('body[data-listo="1"]')
  const pngs = []
  for (const placa of await pagina.$$('.placa')) pngs.push(await placa.screenshot({ type: 'png' }))
  await pagina.close()
  return pngs
}

const navegador = await chromium.launch()
try {
  if (process.argv[2] === '--prueba') {
    const { firma, piezas } = JSON.parse(readFileSync(process.argv[3], 'utf8'))
    const carpeta = process.argv[4] || '.'
    mkdirSync(carpeta, { recursive: true })
    for (const p of piezas) (await renderizar(navegador, p, firma)).forEach((png, i) => writeFileSync(`${carpeta}/${p.id}-${i + 1}.png`, png))
  } else {
    const r = await fetch(FUNCION, { headers: await cabeceras() })
    const pendientes = await r.json()
    if (!r.ok) throw new Error(pendientes.error || `up-disenador respondió HTTP ${r.status}.`)
    console.log(`${pendientes.piezas.length} carrusel(es) para armar.`)
    let fallas = 0
    for (const p of pendientes.piezas) {
      const pngs = await renderizar(navegador, p, pendientes.firma)
      const s = await fetch(FUNCION, { method: 'POST', headers: await cabeceras(), body: JSON.stringify({ id: p.id, texto: p.texto, placas: pngs.map(b => b.toString('base64')) }) })
      const res = await s.json()
      if (s.status === 409) console.log(`${p.fecha}: ${res.motivo}`)
      else if (!s.ok) { fallas++; console.error(`${p.fecha}: ${res.error || `HTTP ${s.status}`}`) }
      else console.log(`${p.fecha}: ${res.assets.length} placas subidas.`)
    }
    if (fallas) process.exitCode = 1
  }
} finally {
  await navegador.close()
}
