import { useEffect, useState } from 'react'
import { supabase, ESTADOS } from '../supabase.js'

export default function Flujo({ proyectos }) {
  const [tareas, setTareas] = useState([])
  const [filtro, setFiltro] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [nuevoProyecto, setNuevoProyecto] = useState('')

  async function cargar() {
    const { data } = await supabase.from('tasks').select('id,title,project_id,status,done').order('created_at', { ascending: false })
    setTareas(data || [])
  }
  useEffect(() => { cargar() }, [])

  const visibles = filtro ? tareas.filter(t => t.project_id === filtro) : tareas

  async function anotar() {
    if (!nuevo.trim()) return
    await supabase.from('tasks').insert({ title: nuevo.trim(), project_id: nuevoProyecto || null, status: 'ideas' })
    setNuevo('')
    cargar()
  }
  async function avanzar(t) {
    const i = ESTADOS.findIndex(e => e.id === t.status)
    const next = ESTADOS[(i + 1) % ESTADOS.length].id
    await supabase.from('tasks').update({ status: next, done: next === 'listo', touched_at: new Date().toISOString() }).eq('id', t.id)
    cargar()
  }
  async function borrar(id) {
    await supabase.from('tasks').delete().eq('id', id)
    cargar()
  }

  return (
    <div>
      <div className="page-head">
        <h1>Flujo</h1>
        <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos</option>
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => e.key === 'Enter' && anotar()} placeholder="Anotá algo" />
        <select value={nuevoProyecto} onChange={e => setNuevoProyecto(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Sin proyecto</option>
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={anotar}>Anotar</button>
      </div>

      {ESTADOS.map(estado => {
        const items = visibles.filter(t => t.status === estado.id)
        return (
          <div className="card card-pad" key={estado.id} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>{estado.label} · {items.length}</h3>
            {items.length === 0 && <p className="empty-state">Nada acá.</p>}
            {items.map(t => (
              <div className="list-item" key={t.id}>
                <span className="list-main">{t.title}</span>
                <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-sm" onClick={() => avanzar(t)}>Mover</button>
                  <button className="btn btn-sm btn-danger" onClick={() => borrar(t.id)}>Borrar</button>
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
