import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { supabase } from '../supabase.js'
import { VACIO, claveEscrito, cuerpoEscrito, leerContenido, leerLocales, combinarEscritos, serializarGuardados } from '../escritos.mjs'
import Ambiente from './Ambiente.jsx'
import './Escritor.css'

const guardarRemoto = serializarGuardados(async registro => {
  const { pendiente: _pendiente, ...datos } = registro
  const { error } = await supabase.from('docs').upsert(datos, { onConflict: 'id' })
  if (error) throw error
})
const mostrarFecha = valor => new Date(valor).toLocaleDateString('es-AR', { day:'numeric', month:'short' })

const ESTADOS_GUARDADO = new Set(['Guardado', 'Guardado en tu cuenta'])

function Documento({ inicial, cambiar, borrar }) {
  const actual = useRef(inicial)
  const [titulo, setTitulo] = useState(inicial.title)
  const [estado, setEstado] = useState(inicial.pendiente ? 'Borrador en este dispositivo' : 'Guardado')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [fuente, setFuente] = useState('serif')
  const [tamano, setTamano] = useState(18)
  const [enfoque, setEnfoque] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const montado = useRef(true)
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), TextAlign.configure({ types: ['heading','paragraph'] })],
    content: leerContenido(inicial.body) || VACIO,
    editorProps: { attributes: { role:'textbox', 'aria-label':'Contenido del documento', 'aria-multiline':'true', spellcheck:'true' } },
    onUpdate: ({ editor: instancia }) => modificar({ body: cuerpoEscrito(instancia.getJSON()) })
  })
  const formato = useEditorState({ editor, selector: ({ editor: instancia }) => instancia ? {
    negrita: instancia.isActive('bold'), cursiva: instancia.isActive('italic'), subrayado: instancia.isActive('underline'),
    lista: instancia.isActive('bulletList'), numerada: instancia.isActive('orderedList'),
    palabras: instancia.getText().trim() ? instancia.getText().trim().split(/\s+/u).length : 0,
    caracteres: instancia.getText().length
  } : {} })

  function modificar(cambios) {
    const doc = { ...actual.current, ...cambios, updated_at: new Date().toISOString(), pendiente: true }
    actual.current = doc
    try { localStorage.setItem(claveEscrito(doc.owner_id, doc.id), JSON.stringify(doc)); setEstado('Borrador guardado en este dispositivo'); setError('') }
    catch { setError('No se pudo guardar la copia local. Usá Guardar o descargá una copia antes de cerrar.'); setEstado('Cambios sin guardar') }
    cambiar(doc); setVersion(v => v + 1)
  }

  const guardar = useCallback(async () => {
    const doc = { ...actual.current, title: actual.current.title.trim() || 'Sin título' }
    if (!doc.pendiente) return
    if (montado.current) setEstado('Guardando…')
    try {
      await guardarRemoto(doc)
      if (actual.current.updated_at === doc.updated_at && actual.current.body === doc.body && (actual.current.title.trim() || 'Sin título') === doc.title) {
        actual.current = { ...doc, pendiente: false }
        try {
          const clave = claveEscrito(doc.owner_id, doc.id)
          const local = JSON.parse(localStorage.getItem(clave) || 'null')
          if (!local || (local.updated_at === doc.updated_at && local.body === doc.body && (local.title.trim() || 'Sin título') === doc.title)) localStorage.setItem(clave, JSON.stringify(actual.current))
        } catch { /* La copia en la cuenta ya está confirmada. */ }
        if (montado.current) { setEstado('Guardado en tu cuenta'); setError(''); cambiar(actual.current) }
      }
    } catch {
      if (montado.current) { setEstado('Pendiente de guardar en tu cuenta'); setError('No se pudo guardar en tu cuenta. Conservamos el borrador local si el almacenamiento está disponible. Podés reintentar con Guardar.') }
    }
  }, [cambiar])

  useEffect(() => { const timer = setTimeout(guardar, 1000); return () => clearTimeout(timer) }, [version, guardar])
  useEffect(() => {
    montado.current = true
    const alCerrar = e => { if (actual.current.pendiente) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', alCerrar)
    return () => { montado.current = false; window.removeEventListener('beforeunload', alCerrar); guardar() }
  }, [guardar])

  function descargar(tipo) {
    if (!editor) return
    const escapar = texto => texto.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c])
    const nombre = (titulo.trim() || 'Sin título').replace(/[<>:"/\\|?*]/g,'_').split('').map(c => c.charCodeAt(0) < 32 ? '_' : c).join('')
    const contenido = tipo === 'txt' ? editor.getText() : `<!doctype html><html lang="es"><meta charset="utf-8"><title>${escapar(titulo)}</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;font:18px/1.7 Georgia,serif}</style><h1>${escapar(titulo)}</h1>${editor.getHTML()}</html>`
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo === 'txt' ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `${nombre}.${tipo}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function boton(nombre, texto, accion, activo = false) { return <button type="button" title={nombre} aria-label={nombre} aria-pressed={activo} disabled={!editor} onMouseDown={e => e.preventDefault()} onClick={accion}>{texto}</button> }
  const guardando = estado === 'Guardando…'
  const textoGuardar = guardando ? 'Guardando…' : ESTADOS_GUARDADO.has(estado) ? 'Guardado' : 'Guardar'

  return <section className={`escritor-documento${enfoque ? ' escritor-enfoque' : ''}`}>
    <div className="escritor-documento-cabecera"><input aria-label="Título del documento" maxLength={250} value={titulo} placeholder="Sin título" onChange={e => { setTitulo(e.target.value); modificar({title:e.target.value}) }} /><button className="btn btn-sm" disabled={guardando} onClick={guardar}>{textoGuardar}</button><button className="btn btn-sm" aria-pressed={enfoque} onClick={() => setEnfoque(!enfoque)}>{enfoque ? 'Salir de enfoque' : 'Enfoque'}</button><button className="btn btn-sm btn-danger" onClick={() => setConfirmando(true)}>Eliminar</button></div>
    {confirmando && (
      <div className="confirm-box">
        ¿Eliminar "{titulo.trim() || 'Sin título'}"? No se puede deshacer.
        <div className="actions">
          <button type="button" className="btn btn-sm btn-danger" onClick={() => borrar(inicial.id)}>Sí, eliminar</button>
          <button type="button" className="btn btn-sm" onClick={() => setConfirmando(false)}>Cancelar</button>
        </div>
      </div>
    )}
    <div className="escritor-barra" role="toolbar" aria-label="Formato del texto">
      {boton('Deshacer','↶',() => editor.chain().focus().undo().run())}{boton('Rehacer','↷',() => editor.chain().focus().redo().run())}
      <select aria-label="Estilo de párrafo" value={editor?.isActive('heading',{level:1}) ? '1' : editor?.isActive('heading',{level:2}) ? '2' : '0'} onChange={e => Number(e.target.value) ? editor.chain().focus().setHeading({level:Number(e.target.value)}).run() : editor.chain().focus().setParagraph().run()}><option value="0">Texto normal</option><option value="1">Título</option><option value="2">Subtítulo</option></select>
      {boton('Negrita','N',() => editor.chain().focus().toggleBold().run(),formato?.negrita)}{boton('Cursiva','C',() => editor.chain().focus().toggleItalic().run(),formato?.cursiva)}{boton('Subrayado','S',() => editor.chain().focus().toggleUnderline().run(),formato?.subrayado)}
      {boton('Lista con viñetas','• Lista',() => editor.chain().focus().toggleBulletList().run(),formato?.lista)}{boton('Lista numerada','1. Lista',() => editor.chain().focus().toggleOrderedList().run(),formato?.numerada)}
      {boton('Alinear a la izquierda','Izq.',() => editor.chain().focus().setTextAlign('left').run())}{boton('Centrar','Centro',() => editor.chain().focus().setTextAlign('center').run())}{boton('Alinear a la derecha','Der.',() => editor.chain().focus().setTextAlign('right').run())}
      <select aria-label="Fuente para escribir" value={fuente} onChange={e => setFuente(e.target.value)}><option value="serif">Serif</option><option value="sans-serif">Sans serif</option><option value="monospace">Monoespaciada</option></select>
      <select aria-label="Tamaño para escribir" value={tamano} onChange={e => setTamano(Number(e.target.value))}>{[16,18,20,24].map(n => <option key={n} value={n}>{n} px</option>)}</select>
    </div>
    <Ambiente />
    {error && <p className="feedback-error" role="alert">{error}</p>}
    <div className="escritor-papel" style={{'--escritor-fuente':fuente, '--escritor-tamano':`${tamano}px`}} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar() } }}><EditorContent editor={editor} /></div>
    <footer className="escritor-estado"><span role="status">{estado}</span><span>{formato?.palabras || 0} palabras · {formato?.caracteres || 0} caracteres</span><button className="btn btn-sm" onClick={() => descargar('txt')}>Descargar TXT</button><button className="btn btn-sm" onClick={() => descargar('html')}>Descargar con formato</button></footer>
  </section>
}

export default function Escritor({ ownerId }) {
  const [docs, setDocs] = useState([])
  const [seleccion, setSeleccion] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const cambiar = useCallback(doc => setDocs(prev => [doc, ...prev.filter(d => d.id !== doc.id)]), [])
  useEffect(() => {
    let vivo = true
    async function cargar() {
      let locales = []
      try { locales = leerLocales(localStorage, ownerId) } catch { if (vivo) setError('No se pudo leer el almacenamiento local.') }
      if (vivo) { setDocs(locales); setSeleccion(locales[0]?.id || null) }
      try {
        const remotos = []
        for (let pagina = 0; ; pagina += 500) {
          const { data, error } = await supabase.from('docs').select('id,owner_id,project_id,title,body,updated_at').eq('owner_id',ownerId).is('project_id',null).order('id').range(pagina,pagina+499)
          if (error) throw error
          remotos.push(...data); if (data.length < 500) break
        }
        if (!vivo) return
        const todos = combinarEscritos(remotos, locales)
        setDocs(todos); setSeleccion(todos[0]?.id || null)
      } catch { if (vivo) setError('No se pudieron cargar los textos de tu cuenta. Podés trabajar con tus borradores locales.') }
      finally { if (vivo) setCargando(false) }
    }
    cargar(); return () => { vivo = false }
  }, [ownerId])
  function nuevo() {
    const doc = { id:crypto.randomUUID(), owner_id:ownerId, project_id:null, title:'Sin título', body:cuerpoEscrito(VACIO), updated_at:new Date().toISOString(), pendiente:true }
    try { localStorage.setItem(claveEscrito(ownerId,doc.id),JSON.stringify(doc)) } catch { setError('El almacenamiento local no está disponible. Recordá guardar en tu cuenta o descargar una copia.') }
    cambiar(doc); setSeleccion(doc.id)
  }
  async function borrar(id) {
    try { localStorage.removeItem(claveEscrito(ownerId, id)) } catch { /* la copia local puede quedar huérfana, no bloquea el borrado */ }
    const { error } = await supabase.from('docs').delete().eq('id', id)
    if (error) { setError('No se pudo eliminar: ' + error.message); return }
    const resto = docs.filter(d => d.id !== id)
    setDocs(resto)
    if (seleccion === id) setSeleccion(resto[0]?.id || null)
  }
  const actual = docs.find(d => d.id === seleccion)
  return <div className="escritor"><div className="page-head"><div><h1>Escribir</h1><p className="hint">Un espacio para tus textos privados.</p></div><button className="btn btn-primary" disabled={cargando} onClick={nuevo}>+ Nuevo texto</button></div>
    {error && <p className="feedback-error" role="alert">{error}</p>}
    <div className="escritor-layout"><aside className="escritor-biblioteca"><label htmlFor="buscar-escritos">Mis textos</label><input id="buscar-escritos" type="search" placeholder="Buscar por título…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />{docs.filter(d => d.title.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase())).map(d => <button className={d.id === seleccion ? 'seleccionado' : ''} key={d.id} onClick={() => setSeleccion(d.id)} aria-current={d.id === seleccion ? 'true' : undefined}><strong>{d.title || 'Sin título'}</strong><small>{mostrarFecha(d.updated_at)}{d.pendiente ? ' · Borrador' : ''}</small></button>)}</aside>
      {cargando ? <p className="empty-state">Abriendo tus textos…</p> : actual ? <Documento key={actual.id} inicial={actual} cambiar={cambiar} borrar={borrar} /> : <div className="card card-pad escritor-vacio"><h2>La página está en blanco.</h2><p>Una idea, un relato, algo que quieras guardar. Empezá por donde quieras.</p><button className="btn" onClick={nuevo}>Escribir mi primer texto</button></div>}
    </div><p className="hint escritor-creditos">Sonidos CC0 de SFX Producer, recopilados por <a href="https://github.com/mateusfg7/Noisekun#sounds" target="_blank" rel="noreferrer">Noisekun</a>. Se reproducen desde la app.</p></div>
}
