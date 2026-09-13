import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { detectarTipo } from '../archivoTipo.js'

export default function VisorArchivo({ archivo, cerrar }) {
  const [vista, setVista] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    let objectUrl
    const controller = new AbortController()
    setVista(null); setError('')
    async function cargar() {
      try {
        let blob = archivo.file
        if (!blob) {
          const { data, error } = await supabase.storage.from('archivos').createSignedUrl(archivo.storage_path, 3600)
          if (error || !data?.signedUrl) throw new Error('No se pudo acceder al archivo.')
          const response = await fetch(data.signedUrl, { signal:controller.signal })
          if (!response.ok) throw new Error('No se pudo descargar el contenido para mostrarlo.')
          blob = await response.blob()
        }
        const bytes = new Uint8Array(await blob.slice(0, 8192).arrayBuffer())
        const tipo = detectarTipo(bytes)
        if (tipo === 'html') {
          const html = await blob.text()
          if (vivo) setVista({ tipo, html })
        } else {
          objectUrl = URL.createObjectURL(new Blob([blob], { type:tipo === 'pdf' ? 'application/pdf' : tipo === 'imagen' ? detectarTipo(bytes, true) : 'application/octet-stream' }))
          if (vivo) setVista({ tipo, url:objectUrl })
          else URL.revokeObjectURL(objectUrl)
        }
      } catch (error) { if (vivo && error.name !== 'AbortError') setError(error.message || 'No se pudo abrir el archivo.') }
    }
    cargar()
    return () => { vivo = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [archivo.file, archivo.storage_path])
  useEffect(() => {
    const key = e => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [cerrar])
  return <div className="modal-backdrop" style={{ padding:16 }} onClick={e => e.target === e.currentTarget && cerrar()}>
    <section className="modal file-viewer" role="dialog" aria-modal="true" aria-label={archivo.name}>
      <div className="modal-head"><h3 style={{ fontSize:14 }}>{archivo.name}</h3><button className="close-x" aria-label="Cerrar visor" onClick={cerrar}>✕</button></div>
      <div className="file-viewer-body">
        {error && <p role="alert" className="empty-state">{error}</p>}
        {!vista && !error && <p className="empty-state">Cargando vista previa…</p>}
        {vista?.tipo === 'html' && <iframe title={archivo.name} srcDoc={vista.html} sandbox="allow-scripts allow-forms allow-downloads" referrerPolicy="no-referrer" />}
        {vista?.tipo === 'pdf' && <iframe title={archivo.name} src={vista.url} />}
        {vista?.tipo === 'imagen' && <img src={vista.url} alt={archivo.name} />}
        {vista?.tipo === 'otro' && <div className="empty-state"><p>No hay vista previa para este tipo de archivo.</p><a className="btn" href={vista.url} download={archivo.name.split('/').pop()}>Descargar archivo</a></div>}
      </div>
    </section>
  </div>
}
