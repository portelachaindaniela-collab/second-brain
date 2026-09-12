import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

export default function VisorArchivo({ archivo, cerrar }) {
  const [url, setUrl] = useState(null)
  const [tipoReal, setTipoReal] = useState(null) // 'pdf' | 'imagen' | 'otro'
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setUrl(null); setError(''); setTipoReal(null)
    supabase.storage.from('archivos').createSignedUrl(archivo.storage_path, 3600).then(async ({ data, error }) => {
      if (!vivo) return
      if (error || !data?.signedUrl) { setError('No se pudo abrir el archivo.'); return }
      setUrl(data.signedUrl)
      // El nombre (y hasta el Content-Type guardado) pueden mentir — ej. un PDF
      // subido con extensión .html queda guardado como text/html. Miramos los
      // primeros bytes de verdad para saber si es un PDF o una imagen.
      try {
        const resp = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-200' } })
        const buffer = await resp.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const inicio = new TextDecoder('latin1').decode(bytes.slice(0, 5))
        if (inicio.startsWith('%PDF-')) { if (vivo) setTipoReal('pdf'); return }
        const firma = [...bytes.slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join('')
        const esImagen = firma.startsWith('89504e47') || firma.startsWith('ffd8ffe') || firma.startsWith('47494638') || firma.startsWith('52494646')
        if (esImagen) { if (vivo) setTipoReal('imagen'); return }
        const textoInicio = new TextDecoder('utf-8').decode(bytes).toLowerCase()
        if (textoInicio.includes('<!doctype html') || textoInicio.includes('<html')) { if (vivo) setTipoReal('html'); return }
      } catch { /* si falla la lectura, seguimos con lo que dice el nombre */ }
      if (vivo) setTipoReal(archivo.kind === 'pdf' ? 'pdf' : archivo.kind === 'imagen' ? 'imagen' : 'otro')
    })
    return () => { vivo = false }
  }, [archivo.storage_path, archivo.kind])

  const tipo = tipoReal ?? (archivo.kind === 'pdf' ? 'pdf' : archivo.kind === 'imagen' ? 'imagen' : 'otro')
  const grande = tipo === 'pdf' || tipo === 'html'

  return (
    <div className="modal-backdrop" style={grande ? { padding: '16px' } : undefined} onClick={e => e.target === e.currentTarget && cerrar()}>
      <div className="modal" style={grande ? { maxWidth: 'none', width: '96vw', height: '94vh', display: 'flex', flexDirection: 'column' } : { maxWidth: 860, width: '92vw' }}>
        <div className="modal-head">
          <h3 style={{ fontSize: 14 }}>{archivo.name}</h3>
          <button className="close-x" onClick={cerrar}>✕</button>
        </div>
        <div className="modal-body" style={grande ? { padding: 0, flex: 1, minHeight: 0, maxHeight: 'none' } : { maxHeight: '75vh', padding: 0 }}>
          {error && <p className="empty-state">{error}</p>}
          {!url && !error && <p className="empty-state">Cargando…</p>}
          {url && (tipo === 'pdf' || tipo === 'html') && (
            <iframe title={archivo.name} src={url} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
          )}
          {url && tipo === 'imagen' && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <img src={url} alt={archivo.name} style={{ maxWidth: '100%', maxHeight: '68vh', borderRadius: 6 }} />
            </div>
          )}
          {url && tipo === 'otro' && (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <p className="empty-state" style={{ marginBottom: 14 }}>
                {archivo.kind === 'documento' || archivo.kind === 'planilla' || archivo.kind === 'presentacion'
                  ? 'Editar documentos de Office adentro de la app todavía no está disponible — necesitaría un servicio de oficina online pago. Podés abrirlo con el programa de tu PC.'
                  : 'Este tipo de archivo se abre con el programa de tu PC.'}
              </p>
              <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary">Abrir con el programa de la PC</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
