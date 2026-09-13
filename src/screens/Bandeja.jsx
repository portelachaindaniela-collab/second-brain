import { useEffect, useState } from 'react'
import { supabase, fechaCorta } from '../supabase.js'

export default function Bandeja({ abrirMail, revision, proyectoId }) {
  const [mails, setMails] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [sinLeer, setSinLeer] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)
  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    let query = supabase.from('emails').select('id,gmail_id,subject,from_name,from_addr,received_at,is_unread', { count:'exact' }).order('received_at', { ascending:false }).range(pagina * 50, pagina * 50 + 49)
    if (proyectoId) query = query.eq('project_id', proyectoId)
    if (sinLeer) query = query.eq('is_unread', true)
    if (busqueda.trim()) query = query.ilike('subject', '%' + busqueda.trim().replace(/[%_]/g, '') + '%')
    query.then(({ data, count, error }) => { if (!vivo) return; if (error) setError('No se pudieron cargar los mails: ' + error.message); else { setMails(data || []); setTotal(count || 0) }; setCargando(false) }).catch(() => { if (vivo) { setError('No se pudo conectar. Probá nuevamente.'); setCargando(false) } })
    return () => { vivo = false }
  }, [revision, proyectoId, pagina, sinLeer, busqueda])
  return <div>
    <div className="page-head"><div><h1>Mail</h1><p className="page-sub">Mensajes sincronizados de Google · {total}</p></div></div>
    <div className="action-row"><input aria-label="Buscar por asunto" placeholder="Buscar por asunto" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(0) }} /><label className="check-label"><input type="checkbox" checked={sinLeer} onChange={e => { setSinLeer(e.target.checked); setPagina(0) }} />Sin leer</label></div>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    <div className="card">{cargando ? <p className="empty-state">Cargando…</p> : mails.length === 0 ? <p className="empty-state">No hay mensajes para mostrar.</p> : mails.map(m => <button className="list-item mail-row" key={m.id} disabled={!m.gmail_id} onClick={() => abrirMail(m.gmail_id)}><span className="list-main"><strong>{m.is_unread ? '● ' : ''}{m.from_name || m.from_addr || '(sin remitente)'}</strong><span className="mail-subject">{m.subject || '(sin asunto)'}</span></span><span className="list-side">{fechaCorta(m.received_at)}</span></button>)}</div>
    <div className="pagination"><button className="btn btn-sm" disabled={pagina === 0 || cargando} onClick={() => setPagina(p => p - 1)}>Anterior</button><span>Página {pagina + 1}</span><button className="btn btn-sm" disabled={(pagina + 1) * 50 >= total || cargando} onClick={() => setPagina(p => p + 1)}>Siguiente</button></div>
  </div>
}
