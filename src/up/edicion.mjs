// Lógica de la mesa de trabajo (Redes) y de la ficha de cada publicación (Calendario). Sin React ni base, para
// probarla con node --test.

export const LIMITE = { linkedin: 3000, x: 280, instagram: 2200 }

// El hilo de X se guarda como «1/ uno\n\n2/ dos» (así lo arma el redactor). Un texto sin numerar es un solo post.
export function postsDeX(texto = '') {
  const t = texto.trim()
  if (!t) return []
  if (!/^1\/\s/.test(t)) return [t]
  return t.split(/\n+(?=\d+\/\s)/).map(p => p.replace(/^\d+\/\s*/, '').trim()).filter(Boolean)
}

export function aHilo(posts) {
  return posts.length === 1 ? posts[0] : posts.map((p, i) => `${i + 1}/ ${p}`).join('\n\n')
}

// En un carrusel el texto trae las placas y, después de «Caption:», lo que va abajo de la foto.
export function captionDe(texto = '') {
  const partes = texto.split(/^Caption:[ \t]*$/m)
  return (partes.length > 1 ? partes[1] : texto).trim()
}

const largo = t => [...t].length

// Cuánto ocupa el texto en cada red y si se pasa del límite.
export function medir(red, texto = '') {
  if (red === 'x') {
    const posts = postsDeX(texto).map(p => ({ largo: largo(p), excede: largo(p) > LIMITE.x }))
    return { red, limite: LIMITE.x, posts, usados: Math.max(0, ...posts.map(p => p.largo)), excede: posts.some(p => p.excede) }
  }
  const usados = largo(red === 'instagram' ? captionDe(texto) : texto.trim())
  return { red, limite: LIMITE[red], usados, excede: usados > LIMITE[red] }
}

// Lo que se ve antes del «ver más». Corta en el último espacio para no partir palabras.
export function recorte(texto = '', max) {
  const t = texto.trim()
  if (largo(t) <= max) return { visible: t, cortado: false }
  const corte = [...t].slice(0, max).join('')
  const espacio = corte.lastIndexOf(' ')
  return { visible: (espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:]+$/, ''), cortado: true }
}

// Color de una pieza en el calendario: el de su red si salió; gris si está aprobada y todavía no.
export function marcaCalendario(pieza) {
  if (pieza.estado === 'publicado') return pieza.red
  if (pieza.estado === 'aprobado') return 'aprobado'
  return null
}

const n = v => (Number.isFinite(v) ? v : null)

// Métricas de una pieza: la última medición, la tasa de interacción y la curva de impresiones.
export function resumenMetricas(filas = []) {
  const orden = [...filas].sort((a, b) => a.dia.localeCompare(b.dia))
  const ultima = orden.at(-1) || null
  if (!ultima) return null
  const interacciones = ['reacciones', 'comentarios', 'compartidos'].map(k => n(ultima[k])).filter(v => v !== null)
  const total = interacciones.length ? interacciones.reduce((a, b) => a + b, 0) : null
  return {
    ultima,
    interaccion: n(ultima.impresiones) && total !== null ? total / ultima.impresiones : null,
    serie: orden.filter(f => n(f.impresiones) !== null).map(f => ({ dia: f.dia, valor: f.impresiones })),
  }
}

// Impresiones de esta pieza frente al promedio de las otras de la misma red (null si hay menos de 2 para comparar).
export function versusMedia(impresiones, otras) {
  const vals = otras.filter(v => Number.isFinite(v))
  if (!Number.isFinite(impresiones) || vals.length < 2) return null
  const media = vals.reduce((a, b) => a + b, 0) / vals.length
  return media > 0 ? impresiones / media - 1 : null
}

// Números escritos por la dueña: vacío es "sin dato", no cero.
export function leerCifra(valor) {
  const t = String(valor ?? '').replace(/[.\s]/g, '').trim()
  if (!t) return null
  return /^\d+$/.test(t) ? Number(t) : NaN
}
