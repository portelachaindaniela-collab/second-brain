import { useEffect, useRef, useState } from 'react'
import { supabase, ESTADOS } from '../supabase.js'

export default function Flujo({ proyectos, pantallasWeb = [], abrirPantalla, abrirHtml }) {
  const [tareas, setTareas] = useState([])
  const [filtro, setFiltro] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [nuevoProyecto, setNuevoProyecto] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(null)
  const [modalTitulo, setModalTitulo] = useState('')
  const [modalProyecto, setModalProyecto] = useState('')
  const [modalEstado, setModalEstado] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const bloqueo = useRef(false)

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
      const { data, error } = await supabase.from('tasks').insert({ title: nuevo.trim(), project_id: nuevoProyecto || null, status: 'ideas', done: false }).select('id,title,project_id,status,done').single()
      if (error) throw error
      setTareas(prev => [data, ...prev])
      setNuevo('')
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

  function abrirModal(t) {
    setModal(t); setModalTitulo(t.title); setModalProyecto(t.project_id || ''); setModalEstado(t.status); setConfirmando(false)
  }

  async function guardarModal() {
    if (!modal || bloqueo.current) return
    bloqueo.current = true; setOcupado(true); setError('')
    try {
      const valores = { title: modalTitulo.trim() || modal.title, project_id: modalProyecto || null, status: modalEstado, done: modalEstado === 'listo', touched_at: new Date().toISOString() }
      const { data, error } = await supabase.from('tasks').update(valores).eq('id', modal.id).select('id,title,project_id,status,done').single()
      if (error) throw error
      setTareas(prev => prev.map(t => t.id === modal.id ? data : t))
      setModal(null)
    } catch (error) { setError('No se pudo guardar: ' + error.message) }
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
      setModal(prev => prev?.id === id ? null : prev)
    } catch (error) { setError(error.message) }
    finally { bloqueo.current = false; setOcupado(false) }
  }

  const visibles = filtro ? tareas.filter(t => t.project_id === filtro) : tareas
  const columnas = [...ESTADOS, ...[...new Set(visibles.map(t => t.status))].filter(s => !ESTADOS.some(e => e.id === s)).map(s => ({ id: s, label: s || 'Sin estado' }))]
  const herramientas = pantallasWeb.filter(p => p.grupo === 'herramientas')

  return <div>
    <div className="page-head"><h1>Flujo</h1><div style={{ display:'flex', gap:8 }}><button className="btn" onClick={abrirHtml}>Abrir HTML</button><select aria-label="Filtrar por proyecto" value={filtro} onChange={e => setFiltro(e.target.value)} style={{ width:'auto' }}><option value="">Todos</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
    {herramientas.length > 0 && (
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, marginBottom: 10 }}>Herramientas</h3>
        <div className="herramientas-grid">
          {herramientas.map(p => <button className="herramienta-block" key={p.id} onClick={() => abrirPantalla(p.id)}>{p.nombre}</button>)}
        </div>
      </div>
    )}
    <form className="action-row" onSubmit={guardar}>
      <input aria-label="Anotá algo" value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="Anotá algo" disabled={cargando || ocupado} required />
      <select aria-label="Proyecto de la tarea" value={nuevoProyecto} onChange={e => setNuevoProyecto(e.target.value)} disabled={cargando || ocupado}><option value="">Sin proyecto</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button className="btn btn-primary" disabled={cargando || ocupado || !nuevo.trim()}>{ocupado ? 'Guardando…' : 'Anotar'}</button>
    </form>
    {cargando && <p className="empty-state">Cargando tareas…</p>}
    {error && !modal && <p role="alert" className="feedback-error">{error}</p>}
    {columnas.map(estado => <div className="card card-pad flujo-columna" key={estado.id || 'sin-estado'}>
      <h3 style={{ fontSize:13, marginBottom:10 }}>{estado.label} · {visibles.filter(t => t.status === estado.id).length}</h3>
      <div className="flujo-lista">
        {visibles.filter(t => t.status === estado.id).map(t => <div className="list-item" key={t.id}><button className="list-main text-button" disabled={ocupado} onClick={() => abrirModal(t)}>{t.title}</button><span className="row-actions"><button className="btn btn-sm" disabled={ocupado} onClick={() => avanzar(t)}>Mover</button><button className="btn btn-sm btn-danger" disabled={ocupado} onClick={() => borrar(t.id)}>Borrar</button></span></div>)}
        {!visibles.some(t => t.status === estado.id) && <p className="empty-state">Nada acá.</p>}
      </div>
    </div>)}

    {modal && (
      <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !ocupado) setModal(null) }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Editar tarea">
          <div className="modal-head"><h3>Editar tarea</h3><button className="close-x" disabled={ocupado} onClick={() => setModal(null)}>✕</button></div>
          <div className="modal-body">
            <div className="field"><label htmlFor="tarea-titulo">Título</label><input id="tarea-titulo" autoFocus value={modalTitulo} disabled={ocupado} onChange={e => setModalTitulo(e.target.value)} /></div>
            <div className="field"><label htmlFor="tarea-proyecto">Proyecto</label><select id="tarea-proyecto" value={modalProyecto} disabled={ocupado} onChange={e => setModalProyecto(e.target.value)}><option value="">Sin proyecto</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label htmlFor="tarea-estado">Estado</label><select id="tarea-estado" value={modalEstado} disabled={ocupado} onChange={e => setModalEstado(e.target.value)}>{ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></div>
            {error && <p role="alert" className="feedback-error">{error}</p>}
            {confirmando && (
              <div className="confirm-box">
                ¿Borrar esta tarea? No se puede deshacer.
                <div className="actions">
                  <button type="button" className="btn btn-sm btn-danger" disabled={ocupado} onClick={() => borrar(modal.id)}>{ocupado ? 'Borrando…' : 'Sí, borrar'}</button>
                  <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => setConfirmando(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn btn-danger" disabled={ocupado} onClick={() => setConfirmando(true)}>Eliminar</button>
            <button className="btn" disabled={ocupado} onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={ocupado || !modalTitulo.trim()} onClick={guardarModal}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    )}
  </div>
}
