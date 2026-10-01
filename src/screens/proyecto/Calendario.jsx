import { useEffect, useState } from 'react'
import { supabase, fechaHora } from '../../supabase.js'
import EditorEvento from '../EditorEvento.jsx'
import { Bloque } from '../../estructura.jsx'

export default function Calendario({ proyecto }) {
  const [proximos, setProximos] = useState([])
  const [pasados, setPasados] = useState([])
  const [editando, setEditando] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let vivo = true
    const nowIso = new Date().toISOString()
    Promise.all([
      supabase.from('calendar_events').select('id,title,description,starts_at,ends_at,location,all_day,google_event_id,calendar_id,project_id').eq('project_id', proyecto.id).gte('starts_at', nowIso).order('starts_at', { ascending: true }).limit(30),
      supabase.from('calendar_events').select('id,title,description,starts_at,ends_at,location,all_day,google_event_id,calendar_id,project_id').eq('project_id', proyecto.id).lt('starts_at', nowIso).order('starts_at', { ascending: false }).limit(10),
    ]).then(([p, a]) => {
      if (!vivo) return
      setProximos(p.data || [])
      setPasados(a.data || [])
    })
    return () => { vivo = false }
  }, [proyecto.id, revision])

  return (
    <div>
      <Bloque titulo="Calendario" accion={<button className="btn btn-primary btn-sm" onClick={() => setEditando({})}>+ Nuevo evento</button>}>
        <h3 className="bloque-subtitulo">Próximos</h3>
        {proximos.length === 0 && <p className="empty-state">Sin eventos próximos.</p>}
        {proximos.map(e => (
          <div className="list-item" key={e.id}>
            <span className="list-main">{e.title}{e.location ? ` · ${e.location}` : ''}</span>
            <span className="list-side">{fechaHora(e.starts_at)}</span><button className="btn btn-sm" onClick={() => setEditando(e)} aria-label={`Editar ${e.title}`}>Editar</button>
          </div>
        ))}
        <h3 className="bloque-subtitulo">Pasados recientes</h3>
        {pasados.length === 0 && <p className="empty-state">Sin eventos pasados registrados.</p>}
        {pasados.map(e => (
          <div className="list-item" key={e.id}>
            <span className="list-main">{e.title}</span>
            <span className="list-side">{fechaHora(e.starts_at)}</span><button className="btn btn-sm" onClick={() => setEditando(e)} aria-label={`Editar ${e.title}`}>Editar</button>
          </div>
        ))}
      </Bloque>
      {editando && <EditorEvento evento={editando} proyectoId={proyecto.id} cerrar={() => setEditando(null)} guardado={() => setRevision(v => v+1)} eliminado={() => setRevision(v => v+1)} />}
    </div>
  )
}
