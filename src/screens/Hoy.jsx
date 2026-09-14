import { useEffect, useState } from 'react'
import { supabase, hora, fechaCorta } from '../supabase.js'
import ResumenDiario from './ResumenDiario.jsx'

function inicioDia() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function finDia() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

const NIVEL_BADGE = { ok: 'badge-green', aviso: 'badge-amber', error: 'badge-red' }
const NOMBRE_AGENTE = { monitor_sitios: 'Sitios', tareas_estancadas: 'Tareas estancadas', sync_estado: 'Sincronización' }

export default function Hoy({ proyectos, revision, ownerId, abrirProyecto, abrirMail, abrirMaria, abrirBandeja, abrirCalendario }) {
  const [eventos, setEventos] = useState([])
  const [tareas, setTareas] = useState([])
  const [mails, setMails] = useState([])
  const [agentes, setAgentes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    async function cargar() {
      setCargando(true)
      const [ev, ta, ma, ag] = await Promise.all([
        supabase.from('calendar_events').select('id,title,starts_at,ends_at,project_id')
          .gte('starts_at', inicioDia().toISOString()).lte('starts_at', finDia().toISOString())
          .order('starts_at', { ascending: true }),
        supabase.from('tasks').select('id,title,project_id,status').eq('done', false).order('touched_at', { ascending: true }).limit(20),
        supabase.from('emails').select('id,gmail_id,subject,from_name,received_at,is_unread').eq('is_unread', true).order('received_at', { ascending: false }).limit(10),
        supabase.from('process_reports').select('id,agente,estado,resumen,iniciado_at').order('iniciado_at', { ascending: false }).limit(15),
      ])
      if (!vivo) return
      const fallos = [ev, ta, ma, ag].filter(r => r.error)
      if (fallos.length) setError('No se pudo cargar parte del resumen. Entrá a Mail o Calendario para reintentar.')
      setEventos(ev.data || [])
      setTareas(ta.data || [])
      setMails(ma.data || [])
      const ultimos = {}
      for (const r of ag.data || []) if (!ultimos[r.agente]) ultimos[r.agente] = r
      setAgentes(Object.values(ultimos))
      setCargando(false)
    }
    cargar()
    return () => { vivo = false }
  }, [revision])

  function colorDe(projectId) {
    return proyectos.find(p => p.id === projectId)?.color || '#71717a'
  }
  function nombreDe(projectId) {
    return proyectos.find(p => p.id === projectId)?.name || 'Sin proyecto'
  }

  const hoyTexto = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{hoyTexto[0].toUpperCase() + hoyTexto.slice(1)}</h1>
          <p className="page-sub">{cargando ? 'Cargando…' : `${eventos.length} eventos · ${tareas.length} tareas pendientes · ${mails.length} mails sin leer`}</p>
        </div>
      </div>

      {error && <p className="feedback-error" role="alert">{error}</p>}
      <ResumenDiario ownerId={ownerId} />
      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card card-pad">
          <div className="section-heading"><h3>Calendario · Hoy</h3><button className="btn btn-sm" onClick={abrirCalendario}>Ver calendario</button></div>
          {!cargando && eventos.length === 0 && <p className="empty-state">Sin eventos para hoy.</p>}
          {eventos.slice(0, 3).map(e => (
            <button className="task-item mail-row" key={e.id} onClick={abrirCalendario}>
              <span className="task-dot" style={{ background: colorDe(e.project_id) }} />
              <div className="task-main">
                <div className="task-title">{e.title}</div>
                <div className="task-sub">{hora(e.starts_at)}{e.ends_at ? ` – ${hora(e.ends_at)}` : ''} · {nombreDe(e.project_id)}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 13, marginBottom: 12 }}>Tareas pendientes</h3>
          {!cargando && tareas.length === 0 && <p className="empty-state">No hay tareas abiertas.</p>}
          {tareas.slice(0, 8).map(t => (
            <div className="task-item clickable" key={t.id} onClick={() => t.project_id && abrirProyecto(t.project_id)} style={{ cursor: t.project_id ? 'pointer' : 'default' }}>
              <span className="task-dot" style={{ background: colorDe(t.project_id) }} />
              <div className="task-main">
                <div className="task-title">{t.title}</div>
                <div className="task-sub">{nombreDe(t.project_id)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {agentes.length > 0 && (
        <div className="card card-pad clickable" onClick={abrirMaria} style={{ marginBottom: 20, cursor: 'pointer' }}>
          <h3 style={{ fontSize: 13, marginBottom: 12 }}>Estado de agentes (María)</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {agentes.map(a => (
              <span key={a.agente} style={{ fontSize: 12.5 }}>
                <span className={`badge ${NIVEL_BADGE[a.estado] || 'badge-gray'}`} style={{ marginRight: 6 }}>{a.estado}</span>
                {NOMBRE_AGENTE[a.agente] || a.agente}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card card-pad">
        <div className="section-heading"><h3>Mail · Sin leer</h3><button className="btn btn-sm" onClick={abrirBandeja}>Ver todos los mails</button></div>
        {!cargando && mails.length === 0 && <p className="empty-state">Todo leído.</p>}
        {mails.slice(0, 4).map(m => (
          <button className="list-item mail-row" key={m.id} disabled={!m.gmail_id} onClick={() => abrirMail(m.gmail_id)}>
            <span className="list-main">{m.from_name || '(desconocido)'} — {m.subject || '(sin asunto)'}</span>
            <span className="list-side">{fechaCorta(m.received_at)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
