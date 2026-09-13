import { useEffect, useRef, useState } from 'react'
import { supabase, ESTADOS } from '../supabase.js'

export default function Flujo({ proyectos, pantallasWeb = [], abrirPantalla }) {
  const [tareas, setTareas] = useState([])
  const [filtro, setFiltro] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [nuevoProyecto, setNuevoProyecto] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null)
  const bloqueo = useRef(false)
  const entrada = useRef(null)

  async function cargar() {
    const { data, error } = await supabase.from('tasks').select('id,title,project_id,status,done').order('created_at', { ascending: false })
    setCargando(false)
    if (error) { setError('No se pudieron cargar las tareas: ' + error.message); return }
    setTareas(data || [])
  }
  useEffect(() => { cargar() }, [])
  async function guardar(e) {
    e.preventDefault()
    if (!nuevo.trim() || bloqueo.current) return
    bloqueo.current = true; setOcupado(true); setError('')
    try {
      const valores = { title: nuevo.trim(), project_id: nuevoProyecto || null }
      const query = editando ? supabase.from('tasks').update(valores).eq('id', editando) : supabase.from('tasks').insert({ ...valores, status: 'ideas', done: false })
      const { data, error } = await query.select('id,title,project_id,status,done').single()
      if (error) throw error
      setTareas(prev => editando ? prev.map(t => t.id === editando ? data : t) : [data, ...prev])
      setNuevo(''); setEditando(null)
    } catch (error) { setError('No se pudo guardar: ' + error.message) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  async function avanzar(t) {
    if (bloqueo.current) return
    bloqueo.current = true; setOcupado(true); setError('')
    const next = ESTADOS[(ESTADOS.findIndex(e => e.id === t.status) + 1) % ESTADOS.length].id
    try {
      const { data, error } = await supabase.from('tasks').update({ status: next, done: next === 'listo', touched_at: new Date().toISOString() }).eq('id', t.id).select('id,title,project_id,status,done').single()
      if (error) throw error
      setTareas(prev => prev.map(item => item.id === t.id ? data : item))
    } catch (error) { setError('No se pudo mover: ' + error.message) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  async function borrar(id) {
    if (bloqueo.current) return
    bloqueo.current = true; setOcupado(true); setError('')
    try {
      const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('La tarea no se pudo eliminar.')
      setTareas(prev => prev.filter(t => t.id !== id))
    } catch (error) { setError(error.message) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  const visibles = filtro ? tareas.filter(t => t.project_id === filtro) : tareas
  const columnas = [...ESTADOS, ...[...new Set(visibles.map(t => t.status))].filter(s => !ESTADOS.some(e => e.id === s)).map(s => ({ id: s, label: s || 'Sin estado' }))]
  const herramientas = pantallasWeb.filter(p => p.grupo === 'herramientas')
  return <div>
    <div className="page-head"><h1>Flujo</h1><select aria-label="Filtrar por proyecto" value={filtro} onChange={e => setFiltro(e.target.value)} style={{ width:'auto' }}><option value="">Todos</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
    {herramientas.length > 0 && (
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, marginBottom: 10 }}>Herramientas</h3>
        <div className="herramientas-grid">
          {herramientas.map(p => <button className="herramienta-block" key={p.id} onClick={() => abrirPantalla(p.id)}>{p.nombre}</button>)}
        </div>
      </div>
    )}
    <form className="action-row" onSubmit={guardar}>
      <input ref={entrada} aria-label="Anotá algo" value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="Anotá algo" disabled={cargando || ocupado} required />
      <select aria-label="Proyecto de la tarea" value={nuevoProyecto} onChange={e => setNuevoProyecto(e.target.value)} disabled={cargando || ocupado}><option value="">Sin proyecto</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button className="btn btn-primary" disabled={cargando || ocupado || !nuevo.trim()}>{ocupado ? 'Guardando…' : editando ? 'Guardar' : 'Anotar'}</button>
      {editando && <button type="button" className="btn" disabled={cargando || ocupado} onClick={() => { setEditando(null); setNuevo('') }}>Cancelar</button>}
    </form>
    {cargando && <p className="empty-state">Cargando tareas…</p>}
    {error && <p role="alert" className="feedback-error">{error}</p>}
    {columnas.map(estado => <div className="card card-pad" key={estado.id || 'sin-estado'} style={{ marginBottom:12 }}><h3 style={{ fontSize:13, marginBottom:10 }}>{estado.label} · {visibles.filter(t => t.status === estado.id).length}</h3>
      {visibles.filter(t => t.status === estado.id).map(t => <div className="list-item" key={t.id}><button className="list-main text-button" disabled={cargando || ocupado} onClick={() => { setEditando(t.id); setNuevo(t.title); setNuevoProyecto(t.project_id || ''); entrada.current?.scrollIntoView({ block:'center', behavior:'smooth' }); entrada.current?.focus() }}>{t.title}</button><span className="row-actions"><button className="btn btn-sm" disabled={cargando || ocupado} onClick={() => avanzar(t)}>Mover</button><button className="btn btn-sm btn-danger" disabled={cargando || ocupado} onClick={() => borrar(t.id)}>Borrar</button></span></div>)}
      {!visibles.some(t => t.status === estado.id) && <p className="empty-state">Nada acá.</p>}
    </div>)}
  </div>
}
