import { useEffect, useState } from 'react'
import { supabase, fechaCorta, fechaHora } from '../../supabase.js'
import { Bloques, Bloque } from '../../estructura.jsx'

export default function Resumen({ proyecto, irA }) {
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      const nowIso = new Date().toISOString()
      const [archivos, docs, tareas, eventos] = await Promise.all([
        supabase.from('assets').select('id,name,created_at', { count: 'exact' }).eq('project_id', proyecto.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('docs').select('id,title,updated_at', { count: 'exact' }).eq('project_id', proyecto.id).order('updated_at', { ascending: false }).limit(5),
        supabase.from('tasks').select('id,title,touched_at', { count: 'exact' }).eq('project_id', proyecto.id).eq('done', false).order('touched_at', { ascending: true }).limit(5),
        supabase.from('calendar_events').select('id,title,starts_at').eq('project_id', proyecto.id).gte('starts_at', nowIso).order('starts_at', { ascending: true }).limit(3),
      ])
      if (!vivo) return
      setDatos({ archivos, docs, tareas, eventos })
    }
    cargar()
    return () => { vivo = false }
  }, [proyecto.id])

  if (!datos) return <p className="empty-state">Cargando…</p>

  const { archivos, docs, tareas, eventos } = datos

  // Los totales del proyecto están en la cabecera (ProyectoShell); acá van las listas.
  return (
    <Bloques>
      <Bloque titulo="Archivos recientes" accion={<button className="btn btn-sm" onClick={() => irA('archivosydocs')}>Ver todos</button>}>
        {(archivos.data || []).length === 0 && <p className="empty-state">Sin archivos todavía.</p>}
        {(archivos.data || []).map(a => (
          <div className="list-item" key={a.id}><span className="list-main">{a.name}</span><span className="list-side">{fechaCorta(a.created_at)}</span></div>
        ))}
      </Bloque>

      <Bloque titulo="Notas recientes" accion={<button className="btn btn-sm" onClick={() => irA('archivosydocs')}>Ver todas</button>}>
        {(docs.data || []).length === 0 && <p className="empty-state">Sin notas todavía.</p>}
        {(docs.data || []).map(d => (
          <div className="list-item" key={d.id}><span className="list-main">{d.title}</span><span className="list-side">{fechaCorta(d.updated_at)}</span></div>
        ))}
      </Bloque>

      <Bloque titulo="Necesitan una mano">
        {(tareas.data || []).length === 0 && <p className="empty-state">No hay tareas pendientes.</p>}
        {(tareas.data || []).map(t => (
          <div className="list-item" key={t.id}><span className="list-main">{t.title}</span></div>
        ))}
      </Bloque>

      <Bloque titulo="Próximos eventos" accion={<button className="btn btn-sm" onClick={() => irA('mailcal')}>Ver calendario</button>}>
        {(eventos.data || []).length === 0 && <p className="empty-state">Sin eventos próximos.</p>}
        {(eventos.data || []).map(e => (
          <div className="list-item" key={e.id}><span className="list-main">{e.title}</span><span className="list-side">{fechaHora(e.starts_at)}</span></div>
        ))}
      </Bloque>
    </Bloques>
  )
}
