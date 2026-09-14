import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, tipoDe, fechaCorta } from '../../supabase.js'
import VisorArchivo from '../VisorArchivo.jsx'

const VISTA_STORAGE_KEY = 'second-brain:archivos:vista'
const ASSET_MIME = 'application/x-second-brain-asset'

function vistaGuardada() {
  try {
    const guardada = localStorage.getItem(VISTA_STORAGE_KEY)
    return guardada === 'lista' || guardada === 'iconos' ? guardada : 'iconos'
  } catch { return 'iconos' }
}

const ICONOS = { pdf: '📕', imagen: '🖼️', documento: '📄', planilla: '📊', presentacion: '📈', video: '🎬', otro: '📁' }

function agrupar(archivos) {
  const carpetas = new Map()
  const sueltos = []
  for (const a of archivos) {
    // Se agrupa por el primer segmento de la ruta (la carpeta raíz que subiste), no por el
    // último: así una carpeta con subcarpetas adentro entra como una sola tarjeta, no dividida.
    const idx = a.name.indexOf('/')
    if (idx === -1) { sueltos.push(a); continue }
    const carpeta = a.name.slice(0, idx)
    const base = a.name.slice(idx + 1)
    const item = { ...a, base }
    if (!carpetas.has(carpeta)) carpetas.set(carpeta, [])
    carpetas.get(carpeta).push(item)
  }
  return { carpetas, sueltos }
}

function nombreBase(nombre) {
  const idx = nombre.indexOf('/')
  return idx === -1 ? nombre : nombre.slice(idx + 1)
}

export default function Archivos({ proyecto }) {
  const [archivos, setArchivos] = useState([])
  const [progreso, setProgreso] = useState(null)
  const [error, setError] = useState('')
  const [viendo, setViendo] = useState(null)
  const [vista, setVista] = useState(vistaGuardada)
  const [abiertas, setAbiertas] = useState({})
  const [pidiendoCarpeta, setPidiendoCarpeta] = useState(null) // File[] en espera de carpeta
  const [carpetaInput, setCarpetaInput] = useState('')
  const [arrastreSobre, setArrastreSobre] = useState(null) // nombre de carpeta ('' = sueltos) resaltada al arrastrar encima
  const [borrandoCarpeta, setBorrandoCarpeta] = useState(null) // nombre de la carpeta con el borrado en confirmación
  const inputRef = useRef(null)
  const carpetaRef = useRef(null)
  const cancelarRef = useRef(false)

  function cambiarVista(nuevaVista) {
    setVista(nuevaVista)
    try { localStorage.setItem(VISTA_STORAGE_KEY, nuevaVista) } catch { /* La vista actual sigue disponible si el almacenamiento local está bloqueado. */ }
  }

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
    if (upErr) { setError('No se pudo subir: ' + upErr.message); return false }
    const { error } = await supabase.from('assets').insert({ storage_path: path, name: nombre, kind: tipoDe(file.name), size_bytes: file.size, source: 'subido', project_id: proyecto.id })
    if (error) { setError('El archivo se subió pero no se pudo registrar: ' + error.message); return false }
    return true
  }

  async function subirVarios(files, carpetaDestino) {
    if (!files.length) return
    setError('')
    setProgreso({ hecho: 0, total: files.length })
    for (const file of files) {
      await subirUno(file, carpetaDestino ? `${carpetaDestino}/${file.name}` : file.name)
      setProgreso(p => ({ hecho: (p?.hecho ?? 0) + 1, total: files.length }))
    }
    setProgreso(null)
    cargar()
  }

  function subirArchivo(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setError('')
    setPidiendoCarpeta(files)
    setCarpetaInput(nombresCarpetas[0] || '')
  }

  async function confirmarSubidaConCarpeta() {
    const files = pidiendoCarpeta
    if (!files?.length) return
    setPidiendoCarpeta(null)
    await subirVarios(files, carpetaInput.trim() || null)
  }

  async function subirCarpeta(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    cancelarRef.current = false
    setProgreso({ hecho: 0, total: files.length })
    for (const file of files) {
      if (cancelarRef.current) break
      const nombre = file.webkitRelativePath || file.name
      await subirUno(file, nombre)
      setProgreso(p => ({ hecho: (p?.hecho ?? 0) + 1, total: files.length }))
    }
    setProgreso(null)
    cargar()
  }

  function cancelarSubida() {
    cancelarRef.current = true
  }

  async function borrar(a) {
    const { error: storageError } = await supabase.storage.from('archivos').remove([a.storage_path])
    if (storageError) { setError('No se pudo borrar el archivo: ' + storageError.message); return }
    const { error } = await supabase.from('assets').delete().eq('id', a.id)
    if (error) { setError('No se pudo borrar el registro: ' + error.message); return }
    cargar()
  }

  async function borrarCarpeta(carpeta) {
    setBorrandoCarpeta(null)
    const items = carpetas.get(carpeta) || []
    if (!items.length) return
    const { error: storageError } = await supabase.storage.from('archivos').remove(items.map(a => a.storage_path))
    if (storageError) { setError('No se pudo borrar los archivos de la carpeta: ' + storageError.message); return }
    const { error } = await supabase.from('assets').delete().in('id', items.map(a => a.id))
    if (error) { setError('No se pudo borrar el registro de la carpeta: ' + error.message); return }
    cargar()
  }

  async function mover(assetId, nombreActual, carpetaDestino) {
    const base = nombreBase(nombreActual)
    const nuevoNombre = carpetaDestino ? `${carpetaDestino}/${base}` : base
    if (nuevoNombre === nombreActual) return
    setArchivos(prev => prev.map(a => a.id === assetId ? { ...a, name: nuevoNombre } : a))
    const { error } = await supabase.from('assets').update({ name: nuevoNombre }).eq('id', assetId)
    if (error) { setError('No se pudo mover el archivo: ' + error.message); cargar(); return }
  }

  function alArrastrarArchivo(e, a) {
    e.dataTransfer.setData(ASSET_MIME, a.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function alSoltar(e, carpetaDestino) {
    e.preventDefault(); e.stopPropagation(); setArrastreSobre(null)
    const assetId = e.dataTransfer.getData(ASSET_MIME)
    if (assetId) { const a = archivos.find(x => x.id === assetId); if (a) mover(a.id, a.name, carpetaDestino); return }
    const files = [...(e.dataTransfer.files || [])]
    if (!files.length) return
    if (carpetaDestino != null) { subirVarios(files, carpetaDestino); return }
    setPidiendoCarpeta(files); setCarpetaInput('')
  }

  function alPasarPorEncima(e, carpeta) {
    e.preventDefault(); e.stopPropagation()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(ASSET_MIME) ? 'move' : 'copy'
    if (arrastreSobre !== carpeta) setArrastreSobre(carpeta)
  }

  const subiendo = progreso !== null

  function fila(a, nombreMostrado) {
    return (
      <div className="list-item clickable" key={a.id} draggable onDragStart={e => alArrastrarArchivo(e, a)} onClick={() => setViendo(a)}>
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
      <div className="archivo-icono-card" key={a.id} draggable onDragStart={e => alArrastrarArchivo(e, a)} onClick={() => setViendo(a)} title={nombreMostrado}>
        <span className="ic">{ICONOS[a.kind] || ICONOS.otro}</span>
        <span className="nombre">{nombreMostrado}</span>
      </div>
    )
  }

  return (
    <div onDragOver={e => alPasarPorEncima(e, '')} onDrop={e => alSoltar(e, null)}>
      <div className="page-head">
        <h1 style={{ fontSize: 15 }}>Archivos</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="vista-toggle">
            <button className={vista === 'lista' ? 'active' : ''} aria-pressed={vista === 'lista'} onClick={() => cambiarVista('lista')}>Lista</button>
            <button className={vista === 'iconos' ? 'active' : ''} aria-pressed={vista === 'iconos'} onClick={() => cambiarVista('iconos')}>Iconos</button>
          </div>
          <button className="btn" onClick={() => carpetaRef.current?.click()} disabled={subiendo}>Agregar carpeta</button>
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={subiendo}>Subir archivo</button>
        </div>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={subirArchivo} />
        <input ref={carpetaRef} type="file" webkitdirectory="" directory="" multiple style={{ display: 'none' }} onChange={subirCarpeta} />
      </div>

      <p className="hint" style={{ marginBottom: 12 }}>Arrastrá archivos desde Windows para subirlos, o arrastrá un archivo de acá a otra carpeta para moverlo.</p>

      {error && <p className="feedback-error" role="alert">{error}</p>}
      {progreso && (
        <p className="hint" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          Subiendo {progreso.hecho} de {progreso.total}…
          {progreso.total > 1 && <button className="btn btn-sm btn-danger" type="button" onClick={cancelarSubida}>Cancelar</button>}
        </p>
      )}

      {archivos.length === 0 && <div className="card card-pad empty-state">Sin archivos. Agregá una carpeta, subí un archivo o arrastralo acá.</div>}

      {nombresCarpetas.map(carpeta => {
        const items = carpetas.get(carpeta)
        const abierta = abiertas[carpeta] !== false
        return (
          <div className={`card${arrastreSobre === carpeta ? ' carpeta-dragover' : ''}`} key={carpeta} style={{ marginBottom: 12 }}
            onDragOver={e => alPasarPorEncima(e, carpeta)} onDragLeave={() => setArrastreSobre(s => s === carpeta ? null : s)} onDrop={e => alSoltar(e, carpeta)}>
            <div className="carpeta-header" onClick={() => setAbiertas(s => ({ ...s, [carpeta]: !abierta }))}>
              <span>{abierta ? '▾' : '▸'} 📁 {carpeta}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--gray-500)', fontWeight: 500 }}>{items.length}</span>
              <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); setBorrandoCarpeta(carpeta) }}>Borrar carpeta</button>
            </div>
            {borrandoCarpeta === carpeta && (
              <div className="confirm-box" style={{ margin: '0 14px 12px' }}>
                ¿Borrar la carpeta "{carpeta}" y sus {items.length} archivo{items.length === 1 ? '' : 's'}? No se puede deshacer.
                <div className="actions">
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => borrarCarpeta(carpeta)}>Sí, borrar</button>
                  <button type="button" className="btn btn-sm" onClick={() => setBorrandoCarpeta(null)}>Cancelar</button>
                </div>
              </div>
            )}
            {abierta && (vista === 'lista'
              ? items.map(a => fila(a, a.base))
              : <div className="archivo-iconos">{items.map(a => icono(a, a.base))}</div>)}
          </div>
        )
      })}

      {sueltos.length > 0 && (
        <div className={`card${arrastreSobre === '' ? ' carpeta-dragover' : ''}`} style={{ marginBottom: 12 }}
          onDragOver={e => alPasarPorEncima(e, '')} onDragLeave={() => setArrastreSobre(s => s === '' ? null : s)} onDrop={e => alSoltar(e, null)}>
          <div className="carpeta-header" style={{ cursor: 'default' }}>
            <span>📎 Archivos sueltos</span>
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
              <h3 style={{ fontSize: 15 }}>¿A qué carpeta va{pidiendoCarpeta.length > 1 ? 'n' : ''}?</h3>
              <button className="close-x" onClick={() => setPidiendoCarpeta(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="hint" style={{ marginBottom: 10 }}>
                {pidiendoCarpeta.length > 1
                  ? `${pidiendoCarpeta.length} archivos. Dejá la carpeta vacía para subirlos sueltos.`
                  : `"${pidiendoCarpeta[0].name}". Dejá la carpeta vacía para subirlo suelto.`}
              </p>
              <div className="field">
                <label>Carpeta (opcional)</label>
                <input value={carpetaInput} autoFocus onChange={e => setCarpetaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmarSubidaConCarpeta()}
                  placeholder="Nombre de la carpeta, o vacío para sueltos" list="carpetas-existentes" />
                <datalist id="carpetas-existentes">
                  {nombresCarpetas.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setPidiendoCarpeta(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarSubidaConCarpeta}>Subir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
