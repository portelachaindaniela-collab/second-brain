// Diseñador de UP: qué carruseles hay que armar y con qué placas.
// Las placas se leen del texto de la pieza (no de contenido) para que lo que la dueña edite en Hoy o en el
// Revisor sea lo que sale en las imágenes. El formato es el que escribe armarPieza en up-pipeline:
//   Placa 1. Título\nTexto\n\nPlaca 2. ...\n\nCaption:\n...

export const FIRMA = '@danielachain'
export const BUCKET = 'up-assets'
export const MAX_PLACAS = 10

// La GitHub Action se identifica con su token OIDC (firmado por GitHub): no hace falta guardar ningún secreto en el repo.
// Solo vale el workflow del diseñador corriendo desde master de este repo.
export const OIDC = {
  emisor: 'https://token.actions.githubusercontent.com',
  audiencia: 'up-disenador',
  repositorio: 'portelachaindaniela-collab/second-brain',
  workflow: 'portelachaindaniela-collab/second-brain/.github/workflows/up-disenador.yml@refs/heads/master',
}

export function oidcValido(claims) {
  return claims?.repository === OIDC.repositorio && claims?.workflow_ref === OIDC.workflow
}

export function placasDeTexto(texto) {
  const [cuerpo, ...resto] = String(texto ?? '').split(/^Caption:[ \t]*$/m)
  const caption = resto.join('').trim()
  const placas = []
  for (const bloque of cuerpo.split(/^(?=Placa\s+\d+\.)/m)) {
    const m = bloque.match(/^Placa\s+\d+\.[ \t]*(.*)\n?([\s\S]*)$/)
    if (!m) continue
    const placa = { titulo: m[1].trim(), texto: m[2].trim() }
    if (placa.titulo || placa.texto) placas.push(placa)
  }
  return { placas, caption }
}

// Un carrusel para armar: Instagram, formato carrusel, con texto, sin publicar y con placas viejas (o sin placas).
export function necesitaDiseno(pieza) {
  return pieza.red === 'instagram' && pieza.contenido?.formato === 'carrusel' && Boolean(pieza.texto)
    && pieza.estado !== 'publicado' && pieza.assets_texto !== pieza.texto
}

// Ruta dentro del bucket a partir de la URL pública, para borrar las placas reemplazadas.
export function rutaDeAsset(url) {
  const marca = `/storage/v1/object/public/${BUCKET}/`
  const i = String(url).indexOf(marca)
  return i === -1 ? null : decodeURIComponent(String(url).slice(i + marca.length))
}
