import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, tipoDe, fechaCorta } from '../../supabase.js'
import VisorArchivo from '../VisorArchivo.jsx'

const ICONOS = { pdf: '📕', imagen: '🖼️', documento: '📄', planilla: '📊', presentacion: '📈', video: '🎬', otro: '📁' }

function agrupar(archivos) {
  const carpetas = new Map()
  const sueltos = []
  for (const a of archivos) {
    const idx = a.name.lastIndexOf('/')
    if (idx === -1) { sueltos.push(a); continue }
    const carpeta = a.name.slice(0, idx)
    const base = a.name.slice(idx + 1)
    const item = { ...a, base }
    if (!carpetas.has(carpeta)) carpetas.set(carpeta, [])
    carpetas.get(carpeta).push(item)
  }
  return { carpetas, sueltos }
}

export default function Archivos({ proyecto }) {
  const [archivos, setArchivos] = useState([])
  const [progreso, setProgreso] = useState(null)
  const [viendo, setViendo] = useState(null)
  const [vista, setVista] = useState('lista')
  const [abiertas, setAbiertas] = useState({})
  const [pidiendoCarpeta, setPidiendoCarpeta] = useState(null) // archivo File en espera de carpeta
  const [carpetaInput, setCarpetaInput] = useState('')
  const inputRef = useRef(null)
  const carpetaRef = useRef(null)

  async function cargar() {
    const { data } = await supabase.from('assets').select('id,name,kind,created_at,storage_path').eq('project_id', proyecto.id).order('created_at', { ascending: false })
    setArchivos(data || [])
  }
  useEffect(() => { cargar() }, [proyecto.id])

  const { carpetas, sueltos } = useMemo(() => agrupar(archivos), [archivos])
  const nombresCarpetas = useMemo(() => [...carpetas.keys()].sort(), [carpetas])

  async function subirUno(file, nombre) {
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('archivos').upload(path, file)
    if (upErr) return false
    await supabase.from('assets').insert({ storage_path: path, name: nombre, kind: tipoDe(file.name), size_bytes: file.size, source: 'subido', project_id: proyecto.id })
    return true
  }

  function subirArchivo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (tipoDe(file.name) === 'pdf') {
      confirmarSubidaSuelta(file)
      return
    }
    setPidiendoCarpeta(file)
    setCarpetaInput(nombresCarpetas[0] || '')
  }

  async function confirmarSubidaSuelta(file) {
    setProgreso({ hecho: 0, total: 1 })
    await subirUno(file, file.name)
    setProgreso(null)
    cargar()
  }

  async function confirmarSubidaConCarpeta() {
    const file = pidiendoCarpeta
    if (!file || !carpetaInput.trim()) return
    setPidiendoCarpeta(null)
    setProgreso({ hecho: 0, total: 1 })
    await subirUno(file, `${carpetaInput.trim()}/${file.name}`)
    setProgreso(null)
    cargar()
  }

  async function subirCarpeta(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setProgreso({ hecho: 0, total: files.length })
    for (const file of files) {
      const nombre = file.webkitRelativePath || file.name
      await subirUno(file, nombre)
      setProgreso(p => ({ hecho: (p?.hecho ?? 0) + 1, total: files.length }))
    }
    setProgreso(null)
    cargar()
  }

  async function borrar(a) {
    await supabase.storage.from('archivos').remove([a.storage_path])
    await supabase.from('assets').delete().eq('id', a.id)
    cargar()
  }

  const subiendo = progreso !== null

  function fila(a, nombreMostrado) {
    return (
      <div className="list-item clickable" key={a.id} onClick={() => setViendo(a)}>
        <span className="list-main">{nombreMostrado}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span className="badge badge-gray">{a.kind}</span>
          <span className="list-side">{fechaCorta(a.created_at)}</span>
          <button className="btn btn-sm" onClick={e => { e.stopPropagation(); setViendo(a) }}>Ver</button>
          <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); borrar(a) }}>Borrar</button>
        </span>
      </div>
    )
  }

  function icono(a, nombreMostrado) {
    return (
      <div className="archivo-icono-card" key={a.id} onClick={() => setViendo(a)} title={nombreMostrado}>
        <span className="ic">{ICONOS[a.kind] || ICONOS.otro}</span>
        <span className="nombre">{nombreMostrado}</span>
      </div>
    )
  }

  return (
    <div>
      <div className="page-head">
        <h1 style={{ fontSize: 15 }}>Archivos</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="vista-toggle">
            <button className={vista === 'lista' ? 'active' : ''} onClick={() => setVista('lista')}>Lista</button>
            <button className={vista === 'iconos' ? 'active' : ''} onClick={() => setVista('iconos')}>Iconos</button>
          </div>
          <button className="btn" onClick={() => carpetaRef.current?.click()} disabled={subiendo}>Agregar carpeta</button>
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={subiendo}>Subir archivo</button>
        </div>
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={subirArchivo} />
        <input ref={carpetaRef} type="file" webkitdirectory="" directory="" multiple style={{ display: 'none' }} onChange={subirCarpeta} />
      </div>

      {progreso && <p className="hint" style={{ marginBottom: 12 }}>Subiendo {progreso.hecho} de {progreso.total}…</p>}

      {archivos.length === 0 && <div className="card card-pad empty-state">Sin archivos. Agregá una carpeta o subí un PDF suelto.</div>}

      {nombresCarpetas.map(carpeta => {
        const items = carpetas.get(carpeta)
        const abierta = abiertas[carpeta] !== false
        return (
          <div className="card" key={carpeta} style={{ marginBottom: 12 }}>
            <div className="carpeta-header" onClick={() => setAbiertas(s => ({ ...s, [carpeta]: !abierta }))}>
              <span>{abierta ? '▾' : '▸'} 📁 {carpeta}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--gray-500)', fontWeight: 500 }}>{items.length}</span>
            </div>
            {abierta && (vista === 'lista'
              ? items.map(a => fila(a, a.base))
              : <div className="archivo-iconos">{items.map(a => icono(a, a.base))}</div>)}
          </div>
        )
      })}

      {sueltos.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="carpeta-header" style={{ cursor: 'default' }}>
            <span>📎 Sueltos (PDF)</span>
          </div>
          {vista === 'lista'
            ? sueltos.map(a => fila(a, a.name))
            : <div className="archivo-iconos">{sueltos.map(a => icono(a, a.name))}</div>}
        </div>
      )}

      {viendo && <VisorArchivo archivo={viendo} cerrar={() => setViendo(null)} />}

      {pidiendoCarpeta && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setPidiendoCarpeta(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3 style={{ fontSize: 15 }}>¿En qué carpeta va?</h3>
              <button className="close-x" onClick={() => setPidiendoCarpeta(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="hint" style={{ marginBottom: 10 }}>
                Los archivos (salvo PDF) tienen que estar dentro de una carpeta. "{pidiendoCarpeta.name}"
              </p>
              <div className="field">
                <label>Carpeta</label>
                <input value={carpetaInput} autoFocus onChange={e => setCarpetaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmarSubidaConCarpeta()}
                  placeholder="Nombre de la carpeta" list="carpetas-existentes" />
                <datalist id="carpetas-existentes">
                  {nombresCarpetas.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setPidiendoCarpeta(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarSubidaConCarpeta} disabled={!carpetaInput.trim()}>Subir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
