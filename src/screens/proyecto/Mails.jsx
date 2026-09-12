import { useEffect, useState } from 'react'
import { supabase, fechaCorta } from '../../supabase.js'

export default function Mails({ proyecto }) {
  const [mails, setMails] = useState([])

  useEffect(() => {
    let vivo = true
    supabase.from('emails').select('id,subject,from_name,from_addr,received_at,is_unread')
      .eq('project_id', proyecto.id).order('received_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (vivo) setMails(data || []) })
    return () => { vivo = false }
  }, [proyecto.id])

  return (
    <div>
      <div className="page-head">
        <h1 style={{ fontSize: 15 }}>Mails</h1>
      </div>
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card kpi-card"><div className="kpi-label">Mails</div><div className="kpi-value">{mails.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Sin leer</div><div className="kpi-value">{mails.filter(m => m.is_unread).length}</div></div>
      </div>
      <div className="card">
        {mails.length === 0 && <p className="empty-state">Sin mails asignados a este proyecto todavía.</p>}
        {mails.map(m => (
          <div className="list-item" key={m.id}>
            <span className="list-main">{m.is_unread ? '● ' : ''}{m.subject || '(sin asunto)'}</span>
            <span className="list-side">{fechaCorta(m.received_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
