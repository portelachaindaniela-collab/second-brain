import { useEffect, useState } from 'react'
import { supabase, fechaHora } from '../supabase.js'
import EditorEvento from './EditorEvento.jsx'
import { fechaEvento } from '../eventoFecha.js'

export default function Agenda({ proyectos, sincronizar, sincronizando, revision }) {
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [eventos, setEventos] = useState([])
  const [seleccion, setSeleccion] = useState(null)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)
  const [version, setVersion] = useState(0)
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    supabase.from('calendar_events').select('id,title,description,starts_at,ends_at,location,project_id,all_day,google_event_id,calendar_id').gte('starts_at', new Date(Date.UTC(mes.getFullYear(), mes.getMonth(), 1)-86400000).toISOString()).lt('starts_at', new Date(Date.UTC(mes.getFullYear(), mes.getMonth()+1, 2)).toISOString()).order('starts_at').then(({ data, error }) => { if (!vivo) return; if (error) setError('No se pudo cargar el calendario: ' + error.message); else setEventos((data || []).filter(e => fechaEvento(e).getMonth() === mes.getMonth() && fechaEvento(e).getFullYear() === mes.getFullYear())); setCargando(false) }).catch(() => { if (vivo) { setError('No se pudo conectar. Probá nuevamente.'); setCargando(false) } })
    return () => { vivo = false }
  }, [mes, revision, version])
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const inicio = (mes.getDay() + 6) % 7
  function mover(n) { setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1)); setSeleccion(null) }
  const visibles = seleccion ? eventos.filter(e => fechaEvento(e).getDate() === seleccion) : eventos
  return <div>
    <div className="page-head"><h1>Calendario</h1><div style={{ display:'flex', gap:8 }}><button className="btn btn-primary" onClick={() => setEditando({})}>+ Nuevo evento</button><button className="btn" disabled={sincronizando} onClick={sincronizar}>{sincronizando ? 'Sincronizando…' : 'Sincronizar'}</button></div></div>
    <div className="calendar-toolbar"><button className="btn btn-sm" onClick={() => mover(-1)} aria-label="Mes anterior">←</button><strong>{mes.toLocaleDateString('es-AR', { month:'long', year:'numeric' })}</strong><button className="btn btn-sm" onClick={() => mover(1)} aria-label="Mes siguiente">→</button><button className="btn btn-sm" onClick={() => { setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSeleccion(new Date().getDate()) }}>Hoy</button></div>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    <div className="card calendar-grid">
      {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => <span className="calendar-weekday" key={d}>{d}</span>)}
      {Array.from({ length:inicio }, (_, i) => <span key={'empty' + i} />)}
      {Array.from({ length:dias }, (_, i) => { const dia = i + 1; const items = eventos.filter(e => fechaEvento(e).getDate() === dia); return <button className={`calendar-day${seleccion === dia ? ' selected' : ''}`} key={dia} onClick={() => setSeleccion(dia)} aria-label={`${dia}, ${items.length} eventos`} aria-pressed={seleccion === dia}><span>{dia}</span>{items.slice(0, 2).map(e => <small key={e.id}>{e.title}</small>)}{items.length > 2 && <small>+{items.length - 2}</small>}</button> })}
    </div>
    <div className="page-head" style={{ marginTop:18 }}><h2 style={{ fontSize:14 }}>{seleccion ? `Eventos del día ${seleccion}` : 'Eventos del mes'}</h2>{seleccion && <button className="btn btn-sm" onClick={() => setSeleccion(null)}>Ver todo el mes</button>}</div>
    <div className="card">{cargando ? <p className="empty-state">Cargando…</p> : !visibles.length ? <p className="empty-state">Sin eventos en este período.</p> : visibles.map(e => <details className="calendar-event" key={e.id}><summary>{e.title || '(sin título)'} <span>{e.all_day ? fechaEvento(e).toLocaleDateString('es-AR')+' · Todo el día' : fechaHora(e.starts_at)}</span></summary><p>{fechaHora(e.starts_at)}{e.ends_at ? ' — ' + fechaHora(e.ends_at) : ''}</p>{e.location && <p>{e.location}</p>}<p>{proyectos.find(p => p.id === e.project_id)?.name || 'Sin proyecto'}</p><button className="btn btn-sm" style={{ marginTop:10 }} onClick={() => setEditando(e)}>Editar evento</button></details>)}</div>
    {editando && <EditorEvento evento={editando} cerrar={() => setEditando(null)}
      guardado={e => { const fecha = fechaEvento(e); setMes(new Date(fecha.getFullYear(), fecha.getMonth(), 1)); setSeleccion(fecha.getDate()); setVersion(v => v + 1) }}
      eliminado={id => { setEventos(prev => prev.filter(item => item.id !== id)); setVersion(v => v + 1) }} />}
  </div>
}
