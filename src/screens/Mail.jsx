import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

export default function Mail({ gmailId, volver }) {
  const [mail, setMail] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setMail(null); setError('')
    supabase.functions.invoke('google-mail', { body: { gmail_id: gmailId } }).then(({ data, error }) => {
      if (!vivo) return
      if (error || data?.error) { setError(data?.error || 'No se pudo leer el mensaje.'); return }
      setMail(data)
    })
    return () => { vivo = false }
  }, [gmailId])

  return (
    <div>
      <button className="btn btn-sm" style={{ marginBottom: 16 }} onClick={volver}>← Volver a Hoy</button>
      {error && <p className="empty-state">{error}</p>}
      {!mail && !error && <p className="empty-state">Cargando…</p>}
      {mail && (
        <div className="card card-pad">
          <h1 style={{ fontSize: 17, marginBottom: 6 }}>{mail.asunto}</h1>
          <p className="page-sub" style={{ marginBottom: 16 }}>{mail.de} · {mail.fecha}</p>
          {mail.texto ? (
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{mail.texto}</p>
          ) : mail.html ? (
            <iframe title="mail" srcDoc={mail.html} style={{ width: '100%', height: '60vh', border: '1px solid var(--gray-200)', borderRadius: 8 }} />
          ) : (
            <p style={{ fontSize: 13.5, color: 'var(--gray-500)' }}>{mail.snippet}</p>
          )}
          <a href={mail.url} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ marginTop: 16, display: 'inline-flex' }}>Abrir en Gmail</a>
        </div>
      )}
    </div>
  )
}
