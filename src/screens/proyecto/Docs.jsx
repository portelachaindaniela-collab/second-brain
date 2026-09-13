import { useEffect, useState } from 'react'
import { supabase, fechaCorta } from '../../supabase.js'

export default function Docs({ proyecto }) {
  const [docs, setDocs] = useState([])
  const [abierto, setAbierto] = useState(null) // doc en edición, o {} para nuevo
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    const { data } = await supabase.from('docs').select('id,title,body,updated_at').eq('project_id', proyecto.id).order('updated_at', { ascending: false })
    setDocs(data || [])
  }
  useEffect(() => { cargar() }, [proyecto.id])

  function abrir(doc) {
    setAbierto(doc || {})
    setTitulo(doc?.title || '')
    setCuerpo(doc?.body || '')
    setMensaje('')
    setConfirmando(false)
  }

  async function guardar() {
    if (guardando) return
    setGuardando(true)
    try {
    setMensaje('Guardando…')
    if (abierto?.id) {
      const { error } = await supabase.from('docs').update({ title: titulo.trim() || 'Sin título', body: cuerpo, updated_at: new Date().toISOString() }).eq('id', abierto.id)
      if (error) { setMensaje('No se pudo guardar: ' + error.message); return }
    } else {
      const { error } = await supabase.from('docs').insert({ project_id: proyecto.id, title: titulo.trim() || 'Sin título', body: cuerpo })
      if (error) { setMensaje('No se pudo crear: ' + error.message); return }
    }
    setAbierto(null)
    cargar()
    } catch (error) { setMensaje('No se pudo guardar: ' + error.message) }
    finally { setGuardando(false) }
  }

  async function eliminar() {
    if (!abierto?.id) return
    const { error } = await supabase.from('docs').delete().eq('id', abierto.id)
    if (error) { setMensaje('No se pudo eliminar: ' + error.message); return }
    setAbierto(null)
    cargar()
  }

  return (
    <div>
      <div className="page-head">
        <h1 style={{ fontSize: 15 }}>Docs</h1>
        <button className="btn btn-primary" onClick={() => abrir(null)}>Nuevo doc</button>
      </div>

      <div className="card">
        {docs.length === 0 && <p className="empty-state">Sin docs. Creá el primero.</p>}
        {docs.map(d => (
          <div className="list-item clickable" key={d.id} onClick={() => abrir(d)}>
            <span className="list-main">{d.title}</span>
            <span className="list-side">editado el {fechaCorta(d.updated_at)}</span>
          </div>
        ))}
      </div>

      {abierto && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setAbierto(null)}>
          <div className="modal">
            <div className="modal-head">
              <h3>{abierto.id ? 'Editar nota' : 'Nuevo doc'}</h3>
              <button className="close-x" onClick={() => setAbierto(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Título</label>
                <input value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label>Contenido</label>
                <textarea rows={10} value={cuerpo} onChange={e => setCuerpo(e.target.value)} />
              </div>
              {mensaje && <p className="hint">{mensaje}</p>}
              {confirmando && (
                <div className="confirm-box">
                  ¿Eliminar esta nota? No se puede deshacer.
                  <div className="actions">
                    <button className="btn btn-sm btn-danger" onClick={eliminar}>Sí, eliminar</button>
                    <button className="btn btn-sm" onClick={() => setConfirmando(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-foot">
              {abierto.id && <button className="btn btn-danger" onClick={() => setConfirmando(true)}>Eliminar</button>}
              <button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
