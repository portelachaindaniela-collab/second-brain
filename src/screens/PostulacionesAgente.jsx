import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, abrirEnlaceOAuth } from '../supabase.js'
import {
  TIPOS_CV, avisoPanel, historialParaEnviar, paraGuardar, NOMBRE_HERRAMIENTA, errorDocumento, rutaDocumento, medidaCaptura, fechaSubida,
  documentosPorTipo, MAX_CAPTURAS,
} from '../postulacionesAgente.mjs'

// Agente de Postulaciones: el chat (función postulaciones-agente, con la API de Claude) y Mis CVs. Igual que BS67, la
// charla se guarda en la base (postulaciones_charla) y cada mensaje viaja con el historial en texto.

const BUCKET = 'postulaciones-docs'

async function llamar(body) {
  const { data, error } = await supabase.functions.invoke('postulaciones-agente', { body })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) return { ...r, error: r?.error || 'El agente no respondió. Probá de nuevo en un momento.' }
  return r
}

function Texto({ texto }) {
  return texto.split(/(https?:\/\/[^\s)]+)/g).map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p))
}

// Una captura achicada a JPEG en base64 (lo que acepta la función).
function leerCaptura(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      const { ancho, alto } = medidaCaptura(img.naturalWidth, img.naturalHeight)
      const lienzo = document.createElement('canvas')
      lienzo.width = ancho; lienzo.height = alto
      lienzo.getContext('2d').drawImage(img, 0, 0, ancho, alto)
      URL.revokeObjectURL(url)
      const dataUrl = lienzo.toDataURL('image/jpeg', 0.85)
      resolve({ media_type: 'image/jpeg', data: dataUrl.split(',')[1], vista: dataUrl, nombre: archivo.name || 'captura' })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pude leer esa imagen.')) }
    img.src = url
  })
}

function Chat({ estado, recargar }) {
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [capturas, setCapturas] = useState([])
  const [consultando, setConsultando] = useState(false)
  const [aviso, setAviso] = useState('')
  const final = useRef(null)
  const elegir = useRef(null)
  const aviso0 = avisoPanel(estado)
  const sinClave = aviso0?.clave === 'sin_clave'

  useEffect(() => {
    supabase.from('postulaciones_charla').select('mensajes').maybeSingle().then(({ data }) => { if (data?.mensajes) setMensajes(data.mensajes) })
  }, [])
  useEffect(() => { final.current?.scrollIntoView({ block: 'end' }) }, [mensajes, consultando])

  const guardar = useCallback(async lista => {
    const { error } = await supabase.from('postulaciones_charla').upsert({ mensajes: paraGuardar(lista), updated_at: new Date().toISOString() })
    if (error) setAviso('No pude guardar la charla: ' + error.message)
  }, [])

  async function sumarCapturas(archivos) {
    const imagenes = [...archivos].filter(a => a.type.startsWith('image/'))
    if (!imagenes.length) return
    if (capturas.length + imagenes.length > MAX_CAPTURAS) { setAviso(`Hasta ${MAX_CAPTURAS} capturas por mensaje.`); return }
    try { const nuevas = await Promise.all(imagenes.map(leerCaptura)); setCapturas(c => [...c, ...nuevas]); setAviso('') } catch (e) { setAviso(e.message) }
  }

  async function enviar(e) {
    e?.preventDefault()
    const t = texto.trim()
    if ((!t && !capturas.length) || consultando || sinClave) return
    const propio = { rol: 'user', texto: t, ...(capturas.length && { capturas: capturas.length }) }
    const antes = mensajes
    setMensajes([...antes, propio]); setTexto(''); setCapturas([]); setAviso(''); setConsultando(true)
    const r = await llamar({ mensaje: t, historial: historialParaEnviar(antes), imagenes: capturas.map(({ media_type, data }) => ({ media_type, data })) })
    setConsultando(false)
    if (r.sin_clave) recargar()
    const respuesta = r.error ? { rol: 'bot', texto: r.error, error: true } : { rol: 'bot', texto: r.respuesta, acciones: r.acciones, herramientas: r.herramientas }
    const lista = [...antes, propio, respuesta]
    setMensajes(lista)
    if (!r.error) guardar(lista)
  }

  async function nueva() {
    setMensajes([]); setAviso('')
    await guardar([])
  }

  async function conectar() {
    const r = await llamar({ accion: 'conectar' })
    if (r.error) setAviso(r.error); else abrirEnlaceOAuth(r.url)
  }

  return <section className="postu-agente-chat" aria-label="Chat con el agente de Postulaciones">
    <header className="postu-agente-cab">
      <div><strong>Agente de Postulaciones</strong><small>Evalúa avisos, carga la planilla y arma borradores en Gmail. Nunca manda mails.</small></div>
      <button className="btn btn-sm" onClick={nueva} disabled={!mensajes.length || consultando}>Charla nueva</button>
    </header>

    {aviso0 && <div className={`postu-agente-aviso${sinClave ? ' fuerte' : ''}`} role="status">
      <p>{aviso0.texto}</p>
      {aviso0.clave === 'permisos' && <div className="postu-acciones"><button className="btn btn-primary btn-sm" onClick={conectar}>Dar permisos de Google</button><button className="btn btn-sm" onClick={recargar}>Ya lo autoricé</button></div>}
    </div>}

    <div className="postu-agente-mensajes" role="log" aria-live="polite">
      {!mensajes.length && <p className="postu-vacio">Pegá un aviso, un link o subí capturas. También podés decirle «ya mandé el de …» o «revisá los rechazos».</p>}
      {mensajes.map((m, i) => <div key={i} className={`postu-msj m-${m.rol}${m.error ? ' error' : ''}`}>
        {m.texto && <p><Texto texto={m.texto} /></p>}
        {m.capturas > 0 && <small className="postu-msj-uso">{m.capturas === 1 ? '1 captura' : `${m.capturas} capturas`}</small>}
        {m.acciones?.length > 0 && <ul className="postu-msj-acciones">{m.acciones.map((a, j) => <li key={j}>{a}</li>)}</ul>}
        {m.herramientas?.length > 0 && <small className="postu-msj-uso">usó: {[...new Set(m.herramientas.map(h => NOMBRE_HERRAMIENTA[h] || h))].join(' · ')}</small>}
      </div>)}
      {consultando && <p className="postu-msj-pensando" role="status">Trabajando…</p>}
      {aviso && <p className="feedback-error" role="alert">{aviso}</p>}
      <div ref={final} />
    </div>

    {capturas.length > 0 && <ul className="postu-capturas">{capturas.map((c, i) => <li key={i}>
      <img src={c.vista} alt={c.nombre} />
      <button onClick={() => setCapturas(cs => cs.filter((_, j) => j !== i))} aria-label={`Quitar ${c.nombre}`}>×</button>
    </li>)}</ul>}

    <form className="postu-agente-pie" onSubmit={enviar}>
      <input ref={elegir} type="file" accept="image/*" multiple hidden onChange={e => { sumarCapturas(e.target.files); e.target.value = '' }} />
      <button type="button" className="btn btn-sm" onClick={() => elegir.current?.click()} disabled={sinClave || consultando} title="Subir capturas">Capturas</button>
      <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)} maxLength={20000} disabled={sinClave}
        placeholder={sinClave ? 'Falta configurar la API de Claude' : 'Pegá el aviso, un link o capturas (también con Ctrl+V)…'} aria-label="Mensaje para el agente"
        onPaste={e => { const imgs = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (imgs.length) { e.preventDefault(); sumarCapturas(imgs) } }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} />
      <button type="submit" className="btn btn-primary" disabled={sinClave || consultando || (!texto.trim() && !capturas.length)}>{consultando ? '…' : 'Enviar'}</button>
    </form>
  </section>
}

function MisCvs({ docs, recargar }) {
  const [subiendo, setSubiendo] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const { cvs, otros } = documentosPorTipo(docs, TIPOS_CV)

  async function subir(tipo, archivo) {
    if (!archivo) return
    const err = errorDocumento(archivo.name, archivo.size)
    if (err) { setError(err); return }
    setSubiendo(tipo); setError(''); setMensaje('')
    const { data: u } = await supabase.auth.getUser()
    const ruta = rutaDocumento(u?.user?.id, archivo.name, crypto.randomUUID())
    const { error: eS } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type || undefined })
    if (eS) { setSubiendo(null); setError('No se pudo subir: ' + eS.message); return }
    const r = await llamar({ accion: 'subir_doc', tipo, ruta, archivo: archivo.name, mime: archivo.type })
    setSubiendo(null)
    if (r.error) { await supabase.storage.from(BUCKET).remove([ruta]); setError(r.error); return }
    setMensaje(r.aviso || `Listo: ${tipo === 'Otros' ? archivo.name : `CV ${tipo}`} subido.`)
    recargar()
  }

  async function borrar(d) {
    if (!window.confirm(`¿Borrar «${d.archivo}»?`)) return
    const r = await llamar({ accion: 'borrar_doc', id: d.id })
    if (r.error) setError(r.error); else recargar()
  }

  const subirBoton = (tipo, etiqueta) => <label className={`btn btn-sm${subiendo ? ' disabled' : ''}`}>
    {subiendo === tipo ? 'Subiendo…' : etiqueta}
    <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden disabled={!!subiendo}
      onChange={e => { subir(tipo, e.target.files[0]); e.target.value = '' }} />
  </label>

  return <section className="postu-cvs" aria-label="Mis CVs">
    <h2>Mis CVs</h2>
    <p className="postu-nota">Un archivo por tipo (PDF o .docx). Si subís uno nuevo, reemplaza al anterior. El agente usa su texto como lo que puede afirmar y adjunta el que corresponde al borrador.</p>
    <ul className="postu-cvs-lista">
      {cvs.map(({ tipo, doc }) => <li key={tipo}>
        <strong>{tipo}</strong>
        <span className="postu-cvs-archivo">{doc ? <>{doc.archivo} <small>subido el {fechaSubida(doc.subido_at)}{!doc.con_texto && ' · sin texto legible'}</small></> : <small>Sin subir</small>}</span>
        {subirBoton(tipo, doc ? 'Reemplazar' : 'Subir')}
      </li>)}
    </ul>
    <h3>Otros documentos</h3>
    <p className="postu-nota">Analítico, certificados, portfolio… El agente los lee si los necesita, pero solo los adjunta si se lo pedís.</p>
    <ul className="postu-cvs-lista">
      {otros.map(d => <li key={d.id}>
        <strong>Otros</strong>
        <span className="postu-cvs-archivo">{d.archivo} <small>subido el {fechaSubida(d.subido_at)}{!d.con_texto && ' · sin texto legible'}</small></span>
        <button className="btn btn-sm" onClick={() => borrar(d)}>Borrar</button>
      </li>)}
    </ul>
    {subirBoton('Otros', 'Subir otro documento')}
    {mensaje && <p className="postu-nota" role="status">{mensaje}</p>}
    {error && <p className="feedback-error" role="alert">{error}</p>}
  </section>
}

export default function PostulacionesAgente() {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const mostrar = r => { if (r.error) setError(r.error); else { setError(''); setEstado(r) } }
  const cargar = useCallback(async () => mostrar(await llamar({ accion: 'estado' })), [])
  useEffect(() => { llamar({ accion: 'estado' }).then(mostrar) }, [])
  // Al volver de autorizar en el navegador, se vuelve a mirar el permiso.
  useEffect(() => {
    if (!avisoPanel(estado)) return
    window.addEventListener('focus', cargar)
    return () => window.removeEventListener('focus', cargar)
  }, [estado, cargar])

  if (error) return <p role="alert" className="feedback-error">{error} <button className="btn btn-sm" onClick={cargar}>Reintentar</button></p>
  if (!estado) return <p className="empty-state">Cargando el agente…</p>
  return <div className="postu-agente">
    <Chat estado={estado} recargar={cargar} />
    <MisCvs docs={estado.docs} recargar={cargar} />
  </div>
}
