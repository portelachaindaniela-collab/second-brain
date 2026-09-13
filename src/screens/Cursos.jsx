import { useEffect, useState } from 'react'
import { supabase, fechaCorta } from '../supabase.js'

const ESTADOS_CURSO = [
  { id: 'en_curso', label: 'En curso', badge: 'badge-green' },
  { id: 'pausado', label: 'Pausado', badge: 'badge-amber' },
  { id: 'terminado', label: 'Terminado', badge: 'badge-gray' },
]
const ESTADO_LABEL = Object.fromEntries(ESTADOS_CURSO.map(e => [e.id, e.label]))
const ESTADO_BADGE = Object.fromEntries(ESTADOS_CURSO.map(e => [e.id, e.badge]))

export default function Cursos() {
  const [cursos, setCursos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('en_curso')
  const [abierto, setAbierto] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [plataforma, setPlataforma] = useState('')
  const [url, setUrl] = useState('')
  const [progreso, setProgreso] = useState('')
  const [estado, setEstado] = useState('en_curso')
  const [notas, setNotas] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  async function cargar() {
    const { data, error } = await supabase.from('cursos').select('id,title,plataforma,url,progreso,estado,notas,updated_at').order('updated_at', { ascending: false })
    setCargando(false)
    if (error) { setError('No se pudieron cargar los cursos: ' + error.message); return }
    setCursos(data || [])
  }
  useEffect(() => { cargar() }, [])

  function abrir(curso) {
    setAbierto(curso || {})
    setTitulo(curso?.title || '')
    setPlataforma(curso?.plataforma || '')
    setUrl(curso?.url || '')
    setProgreso(curso?.progreso || '')
    setEstado(curso?.estado || 'en_curso')
    setNotas(curso?.notas || '')
    setMensaje('')
    setConfirmando(false)
  }

  async function guardar() {
    if (!titulo.trim() || guardando) return
    setGuardando(true); setMensaje('')
    const valores = { title: titulo.trim(), plataforma: plataforma.trim() || null, url: url.trim() || null, progreso: progreso.trim() || null, estado, notas: notas.trim() || null, updated_at: new Date().toISOString() }
    try {
      const { error } = abierto?.id
        ? await supabase.from('cursos').update(valores).eq('id', abierto.id)
        : await supabase.from('cursos').insert(valores)
      if (error) { setMensaje('No se pudo guardar: ' + error.message); return }
      setAbierto(null)
      cargar()
    } finally { setGuardando(false) }
  }

  async function eliminar() {
    if (!abierto?.id) return
    const { error } = await supabase.from('cursos').delete().eq('id', abierto.id)
    if (error) { setMensaje('No se pudo eliminar: ' + error.message); return }
    setAbierto(null)
    cargar()
  }

  const visibles = filtro === 'todos' ? cursos : cursos.filter(c => c.estado === filtro)

  return (
    <div>
      <div className="page-head">
        <h1>Cursos</h1>
        <button className="btn btn-primary" onClick={() => abrir(null)}>+ Nuevo curso</button>
      </div>
      <p className="page-sub" style={{ marginBottom: 16 }}>Los que empezaste y quedaron a mitad de camino, para no tener que volver a buscarlos.</p>

      <div className="vista-toggle" style={{ marginBottom: 16 }}>
        <button className={filtro === 'en_curso' ? 'active' : ''} onClick={() => setFiltro('en_curso')}>En curso</button>
        <button className={filtro === 'pausado' ? 'active' : ''} onClick={() => setFiltro('pausado')}>Pausados</button>
        <button className={filtro === 'terminado' ? 'active' : ''} onClick={() => setFiltro('terminado')}>Terminados</button>
        <button className={filtro === 'todos' ? 'active' : ''} onClick={() => setFiltro('todos')}>Todos</button>
      </div>

      {error && <p role="alert" className="feedback-error">{error}</p>}
      {cargando && <p className="empty-state">Cargando…</p>}
      {!cargando && visibles.length === 0 && <div className="card card-pad empty-state">Nada acá todavía.</div>}

      <div className="card">
        {visibles.map(c => (
          <div className="list-item clickable" key={c.id} onClick={() => abrir(c)}>
            <span className="list-main">
              <span className={`badge ${ESTADO_BADGE[c.estado] || 'badge-gray'}`} style={{ marginRight: 8 }}>{ESTADO_LABEL[c.estado] || c.estado}</span>
              <strong>{c.title}</strong>{c.plataforma ? ` · ${c.plataforma}` : ''}{c.progreso ? ` · ${c.progreso}` : ''}
            </span>
            <span className="list-side">{fechaCorta(c.updated_at)}</span>
          </div>
        ))}
      </div>

      {abierto && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && !guardando && setAbierto(null)}>
          <div className="modal">
            <div className="modal-head">
              <h3>{abierto.id ? 'Editar curso' : 'Nuevo curso'}</h3>
              <button className="close-x" disabled={guardando} onClick={() => setAbierto(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field"><label>Título</label><input value={titulo} autoFocus disabled={guardando} onChange={e => setTitulo(e.target.value)} /></div>
              <div className="grid grid-2">
                <div className="field"><label>Plataforma</label><input value={plataforma} disabled={guardando} placeholder="Coursera, Udemy…" onChange={e => setPlataforma(e.target.value)} /></div>
                <div className="field"><label>Estado</label>
                  <select value={estado} disabled={guardando} onChange={e => setEstado(e.target.value)}>
                    {ESTADOS_CURSO.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label>Link</label><input value={url} disabled={guardando} placeholder="https://…" onChange={e => setUrl(e.target.value)} /></div>
              <div className="field"><label>En qué quedaste</label><input value={progreso} disabled={guardando} placeholder="Módulo 3 de 8, clase 12, 40%…" onChange={e => setProgreso(e.target.value)} /></div>
              <div className="field"><label>Notas</label><textarea rows={3} value={notas} disabled={guardando} onChange={e => setNotas(e.target.value)} /></div>
              {mensaje && <p className="feedback-error" role="alert">{mensaje}</p>}
              {confirmando && (
                <div className="confirm-box">
                  ¿Eliminar este curso? No se puede deshacer.
                  <div className="actions">
                    <button className="btn btn-sm btn-danger" onClick={eliminar}>Sí, eliminar</button>
                    <button className="btn btn-sm" onClick={() => setConfirmando(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-foot">
              {url && <a className="btn" href={url} target="_blank" rel="noreferrer">Abrir link</a>}
              {abierto.id && <button className="btn btn-danger" disabled={guardando} onClick={() => setConfirmando(true)}>Eliminar</button>}
              <button className="btn btn-primary" disabled={guardando || !titulo.trim()} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
