import { useEffect, useState } from 'react'
import { supabase, fechaCorta } from '../supabase.js'
import { CabeceraPantalla, Bloques, Bloque } from '../estructura.jsx'

const ESTADOS_CURSO = [
  { id: 'en_curso', label: 'En curso', badge: 'badge-green' },
  { id: 'pausado', label: 'Pausado', badge: 'badge-amber' },
  { id: 'terminado', label: 'Terminado', badge: 'badge-gray' },
]

export default function Cursos() {
  const [cursos, setCursos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
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

  const de = estadoId => cursos.filter(c => c.estado === estadoId)
  const enCurso = de('en_curso'), pausados = de('pausado'), terminados = de('terminado')
  const lista = (items, vacio) => (cargando ? null : items.length === 0
    ? <p className="empty-state">{vacio}</p>
    : items.map(c => (
      <div className="list-item clickable" key={c.id} onClick={() => abrir(c)}>
        <span className="list-main">
          <strong>{c.title}</strong>{c.plataforma ? ` · ${c.plataforma}` : ''}{c.progreso ? ` · ${c.progreso}` : ''}
        </span>
        <span className="list-side">{fechaCorta(c.updated_at)}</span>
      </div>
    )))

  return (
    <div>
      <CabeceraPantalla sobretitulo="Aprendizaje" titulo="Cursos" cargando={cargando}
        subtitulo="Los que empezaste y quedaron a mitad de camino, para no tener que volver a buscarlos."
        cifras={[
          { valor: enCurso.length, etiqueta: 'en curso' },
          { valor: pausados.length, etiqueta: 'pausados', nivel: pausados.length ? 'aviso' : undefined },
          { valor: terminados.length, etiqueta: 'terminados' },
        ]} />

      {error && <p role="alert" className="feedback-error">{error}</p>}
      {cargando && <p className="empty-state">Cargando…</p>}
      <Bloques>
        <Bloque titulo="En curso" accion={<button className="btn btn-sm btn-primary" onClick={() => abrir(null)}>+ Nuevo curso</button>}>
          {lista(enCurso, 'Nada en curso.')}
        </Bloque>
        <Bloque titulo="Pausados">
          {lista(pausados, 'Ninguno quedó pausado.')}
        </Bloque>
        <Bloque titulo="Terminados" ancho="completo">
          {lista(terminados, 'Todavía no terminaste ninguno.')}
        </Bloque>
      </Bloques>

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
