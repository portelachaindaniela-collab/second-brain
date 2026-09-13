export const MARCA = 'second-brain-escrito-v1'
export const VACIO = { type: 'doc', content: [{ type: 'paragraph' }] }

export function leerContenido(body) {
  try {
    const datos = JSON.parse(body)
    return datos.formato === MARCA && datos.contenido?.type === 'doc' ? datos.contenido : null
  } catch { return null }
}

export function cuerpoEscrito(contenido) { return JSON.stringify({ formato: MARCA, contenido }) }
export function claveEscrito(owner, id) { return `second-brain:escritos:${owner}:${id}` }
export function leerLocales(storage, owner) {
  const prefijo = claveEscrito(owner, '')
  const documentos = []
  for (let i = 0; i < storage.length; i++) {
    const clave = storage.key(i)
    if (!clave?.startsWith(prefijo)) continue
    try {
      const doc = JSON.parse(storage.getItem(clave))
      if (doc.owner_id === owner && leerContenido(doc.body)) documentos.push(doc)
    } catch { /* Un borrador ilegible no impide abrir los demás. */ }
  }
  return documentos
}
export function combinarEscritos(remotos, locales) {
  const porId = new Map(remotos.filter(d => leerContenido(d.body)).map(d => [d.id, d]))
  for (const local of locales) {
    const remoto = porId.get(local.id)
    if (!remoto || local.pendiente || local.updated_at > remoto.updated_at) porId.set(local.id, local)
  }
  return [...porId.values()].sort((a,b) => b.updated_at.localeCompare(a.updated_at))
}
export function serializarGuardados(escribir) {
  const colas = new Map()
  return registro => {
    const clave = `${registro.owner_id}:${registro.id}`
    const anterior = colas.get(clave) || Promise.resolve()
    const siguiente = anterior.catch(() => {}).then(() => escribir(registro))
    colas.set(clave, siguiente)
    const limpiar = () => { if (colas.get(clave) === siguiente) colas.delete(clave) }
    siguiente.then(limpiar, limpiar)
    return siguiente
  }
}
