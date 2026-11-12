// Leer la web de una cuenta (la usan pdg-agente y Femina, pdg-femina).
import { urlPermitida, htmlATexto, MAX_TEXTO_WEB } from './logic.mjs'

// Primero la página tal cual; si casi no tiene texto (sitios armados con JavaScript), la lee el lector de Jina,
// que la abre en un navegador y devuelve el texto.
export async function leerWeb(web) {
  const url = urlPermitida(web)
  if (!url) return { aviso: 'la dirección no es una web pública' }
  let aviso = 'no respondió a tiempo'
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (PDG comercial)', Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) })
    if (!r.ok) aviso = `la web respondió ${r.status}`
    else if (!(r.headers.get('content-type') || '').includes('html')) return { aviso: 'la dirección no es una página web' }
    else {
      const texto = htmlATexto(await r.text())
      if (texto.length >= 300) return { texto }
      aviso = 'la página casi no tiene texto (se arma con JavaScript)'
    }
  } catch { /* se prueba con el lector */ }
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, { headers: { 'X-Return-Format': 'text' }, signal: AbortSignal.timeout(30000) })
    const texto = r.ok ? (await r.text()).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim().slice(0, MAX_TEXTO_WEB) : ''
    if (texto.length >= 80) return { texto }
  } catch { /* queda el aviso */ }
  return { aviso }
}
