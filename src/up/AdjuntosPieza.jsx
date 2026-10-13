import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { NOMBRE_RED } from './pipeline.js'
import { ACEPTA, tipoAdjunto, validarAdjuntos, rutaAdjunto, pesoLegible } from './adjuntos.mjs'

const BUCKET = 'up-adjuntos'
const ICONO = { pdf: 'PDF', ppt: 'PPT', pptx: 'PPT', doc: 'DOC', docx: 'DOC' }
const extension = nombre => nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''

// Adjuntos de la publicación de una red: se suben al bucket privado y quedan en up_piezas.adjuntos. En LinkedIn el
// publicador los sube junto con el texto; en X e Instagram quedan para bajarlos y publicarlos a mano.
// asegurarPieza() crea la pieza si todavía no existe (se puede adjuntar antes de escribir el texto).
export default function AdjuntosPieza({ red, pieza, campos, editable, asegurarPieza, alCambiar, alVer }) {
  const [subiendo, setSubiendo] = useState(false)
  const [aviso, setAviso] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef(null)
  const adjuntos = pieza?.adjuntos ?? []

  // Las imágenes se ven en la simulación con links firmados (el bucket es privado).
  useEffect(() => {
    const imagenes = adjuntos.filter(a => a.tipo === 'imagen')
    if (!imagenes.length) { alVer?.(red, {}); return }
    supabase.storage.from(BUCKET).createSignedUrls(imagenes.map(a => a.ruta), 3600).then(({ data }) => {
      alVer?.(red, Object.fromEntries((data || []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl])))
    })
  }, [red, JSON.stringify(adjuntos.map(a => a.ruta))]) // eslint-disable-line react-hooks/exhaustive-deps

  async function subir(archivos) {
    const lista = [...archivos]
    if (!lista.length) return
    const error = validarAdjuntos(adjuntos, lista)
    if (error) { setAviso(error); return }
    setSubiendo(true); setAviso('')
    try {
      const actual = await asegurarPieza()
      const { data: { session } } = await supabase.auth.getSession()
      const nuevos = []
      for (const f of lista) {
        const { tipo, mime } = tipoAdjunto(f.name)
        const ruta = rutaAdjunto(session.user.id, actual.calendario_id, red, f.name)
        const { error: e } = await supabase.storage.from(BUCKET).upload(ruta, f, { contentType: mime, upsert: false })
        if (e) throw new Error(`No se pudo subir «${f.name}»: ${e.message}`)
        nuevos.push({ ruta, nombre: f.name, tipo, mime, bytes: f.size })
      }
      const { data, error: e } = await supabase.from('up_piezas').update({ adjuntos: [...(actual.adjuntos ?? []), ...nuevos], error_publicacion: null }).eq('id', actual.id).select(campos).single()
      if (e) throw new Error('Se subió, pero no se pudo guardar en la publicación: ' + e.message)
      alCambiar(data)
    } catch (e) { setAviso(e.message) }
    setSubiendo(false)
  }

  async function quitar(a) {
    setSubiendo(true); setAviso('')
    const { data, error } = await supabase.from('up_piezas').update({ adjuntos: adjuntos.filter(x => x.ruta !== a.ruta), error_publicacion: null }).eq('id', pieza.id).select(campos).single()
    if (error) { setAviso('No se pudo quitar: ' + error.message); setSubiendo(false); return }
    await supabase.storage.from(BUCKET).remove([a.ruta])
    alCambiar(data); setSubiendo(false)
  }

  async function abrir(a) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.ruta, 600, { download: red !== 'linkedin' ? a.nombre : false })
    if (error) { setAviso('No se pudo abrir: ' + error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className={`up-adjuntos${arrastrando ? ' arrastrando' : ''}`}
      onDragOver={e => { if (!editable) return; e.preventDefault(); setArrastrando(true) }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={e => { if (!editable) return; e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files) }}>
      <div className="up-adjuntos-cab">
        <span className="up-mono-k">Adjuntos{adjuntos.length ? ` · ${adjuntos.length}` : ''}</span>
        {editable && (
          <>
            <input ref={input} type="file" multiple accept={ACEPTA} hidden onChange={e => { subir(e.target.files); e.target.value = '' }} />
            <button className="up-btn" disabled={subiendo} onClick={() => input.current?.click()}>{subiendo ? 'Subiendo…' : '+ Adjuntar'}</button>
          </>
        )}
      </div>
      {adjuntos.length > 0 ? (
        <ul className="up-adjuntos-lista">
          {adjuntos.map(a => (
            <li key={a.ruta}>
              <span className={`up-adjunto-ico t-${a.tipo}`}>{a.tipo === 'imagen' ? 'IMG' : ICONO[extension(a.nombre)] ?? 'DOC'}</span>
              <button className="up-adjunto-nombre" onClick={() => abrir(a)} title={red === 'linkedin' ? 'Ver' : 'Bajar para publicarlo'}>{a.nombre}</button>
              <small>{pesoLegible(a.bytes)}</small>
              {editable && <button className="up-adjunto-quitar" disabled={subiendo} onClick={() => quitar(a)} aria-label={`Quitar ${a.nombre}`}>×</button>}
            </li>
          ))}
        </ul>
      ) : editable && <p className="up-adjuntos-vacio">Arrastrá acá un PDF, PowerPoint, Word o imágenes, o tocá Adjuntar.</p>}
      <p className="up-adjuntos-nota">
        {red === 'linkedin'
          ? 'Sale con el post a la hora programada: un documento (se ve como carrusel) o hasta 20 imágenes.'
          : `${NOMBRE_RED[red]} se publica a mano: tocá el archivo para bajarlo cuando lo subas.`}
      </p>
      {aviso && <p role="alert" className="up-error">{aviso}</p>}
    </div>
  )
}
