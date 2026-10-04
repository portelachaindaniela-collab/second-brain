// Plantilla fija de las placas del carrusel de UP (estilo A: diario en papel, 1080x1350).
// La primera placa es la portada; una placa cuyo título es solo una cifra ("+170%", "4.300") va como dato grande.

export const ANCHO = 1080
export const ALTO = 1350

const FUENTES = 'https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@600;700&family=Playfair+Display:wght@800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400&display=block'

export function esCifra(titulo) {
  return /^[+\-−]?\s?\d[\d.,]*\s?(%|k|M|mil)?$/i.test(String(titulo).trim())
}

const escapar = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Párrafos del texto; las líneas que empiezan con guion o viñeta van como lista con filetes.
function cuerpo(texto) {
  const lineas = String(texto).split('\n').map(l => l.trim()).filter(Boolean)
  const items = lineas.filter(l => /^[-•·]\s/.test(l))
  if (items.length && items.length === lineas.length) return `<ul class="lista">${items.map(l => `<li>${escapar(l.replace(/^[-•·]\s+/, ''))}</li>`).join('')}</ul>`
  return lineas.map(l => `<p>${escapar(l)}</p>`).join('')
}

function placa({ titulo, texto }, i, total, antetitulo, firma) {
  const cab = `<div class="cab"><span>${escapar(antetitulo)}</span></div><div class="cab2"></div>`
  const pie = `<div class="pie"><span class="firma">${escapar(firma)}</span><span>${i + 1} / ${total}</span></div>`
  let contenido
  if (i === 0) contenido = `<h1 class="ajustar">${escapar(titulo)}</h1>${texto ? `<div class="bajada ajustar">${escapar(texto)}</div>` : ''}`
  else if (esCifra(titulo)) contenido = `<div class="cifra">${escapar(titulo)}</div>${texto ? `<div class="cifra-t ajustar">${cuerpo(texto)}</div>` : ''}`
  else contenido = `${titulo ? `<h2 class="ajustar">${escapar(titulo)}</h2>` : ''}${texto ? `<div class="texto ajustar">${cuerpo(texto)}</div>` : ''}`
  return `<section class="placa">${cab}<div class="contenido">${contenido}</div>${pie}</section>`
}

export function htmlCarrusel({ antetitulo, placas, firma }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="${FUENTES}"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#ccc}
.placa{width:${ANCHO}px;height:${ALTO}px;background:#F7F4EC;color:#121212;padding:90px 96px;display:flex;flex-direction:column;overflow:hidden}
.cab{display:flex;padding-bottom:22px;border-bottom:2px solid #121212;margin-bottom:6px;font:700 24px/1.2 'Libre Franklin',sans-serif;letter-spacing:.08em;text-transform:uppercase}
.cab span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cab2{border-top:6px double #121212}
.contenido{flex:1;min-height:0;overflow:hidden;padding:70px 0 40px;display:flex;flex-direction:column}
h1{font:800 104px/1.04 'Playfair Display',serif;letter-spacing:-.01em}
.bajada{font:italic 400 40px/1.4 'Source Serif 4',serif;color:#363636;margin-top:40px}
h2{font:800 80px/1.06 'Playfair Display',serif;letter-spacing:-.01em;margin-bottom:40px}
.texto{font:400 44px/1.42 'Source Serif 4',serif}
.texto p+p,.cifra-t p+p{margin-top:24px}
.cifra{font:800 250px/0.95 'Playfair Display',serif;letter-spacing:-.03em}
.cifra-t{font:400 46px/1.35 'Source Serif 4',serif;margin-top:34px;max-width:840px}
.lista{list-style:none}
.lista li{padding:22px 0;border-bottom:1px solid #DDD8CC}
.lista li:first-child{padding-top:0}
.pie{display:flex;justify-content:space-between;align-items:center;padding-top:24px;border-top:1px solid #DDD8CC;color:#6E6A62;font:600 26px/1 'Libre Franklin',sans-serif;letter-spacing:.04em}
</style></head><body>${placas.map((p, i) => placa(p, i, placas.length, antetitulo, firma)).join('')}
<script>
// Achica la letra hasta que el contenido entra en la placa (títulos y textos largos).
document.fonts.ready.then(() => {
  for (const c of document.querySelectorAll('.contenido')) {
    const partes = [...c.querySelectorAll('.ajustar')]
    for (let n = 0; n < 40 && c.scrollHeight > c.clientHeight; n++) {
      for (const el of partes) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * 0.95) + 'px'
    }
  }
  document.body.dataset.listo = '1'
})
</script></body></html>`
}
