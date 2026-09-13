import { useRef, useState } from 'react'
import { consultarPublicacion, normalizarPublicacion } from '../metricasPublicas.mjs'
import './Metricas.css'

const EJEMPLO = 'https://x.com/danielachain/status/2095695909770113318'
const CAMPOS = [['vistas', 'Visualizaciones'], ['likes', 'Me gusta'], ['reposts', 'Reposts'], ['respuestas', 'Respuestas'], ['citas', 'Citas'], ['guardados', 'Guardados']]
const formato = new Intl.NumberFormat('es-AR')
const fecha = valor => valor ? new Date(valor).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : ''

function leer(clave) {
  try {
    const items = JSON.parse(localStorage.getItem(clave) || '[]')
    return Array.isArray(items) ? items.filter(p => { try { return normalizarPublicacion(p.enlace).id === p.id } catch { return false } }).slice(0, 100) : []
  } catch { return [] }
}

export default function Metricas({ ownerId }) {
  const clave = `second-brain:publicaciones:${ownerId}`
  const [posts, setPosts] = useState(() => leer(clave))
  const [enlace, setEnlace] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const bloqueo = useRef(false)

  function guardar(items) {
    setPosts(items)
    try { localStorage.setItem(clave, JSON.stringify(items)) }
    catch { setError('No se pudo guardar en este dispositivo. Las tarjetas seguirán visibles mientras mantengas abierta esta pantalla.') }
  }

  async function agregar(valor = enlace) {
    if (bloqueo.current) return
    setError(''); setAviso('')
    let identificada
    try { identificada = normalizarPublicacion(valor) } catch (e) { setError(e.message); return }
    if (posts.some(p => p.id === identificada.id)) { setAviso('Ya agregaste esta publicación. Podés actualizarla desde su tarjeta.'); return }
    if (posts.length >= 100) { setError('Podés guardar hasta 100 publicaciones en este dispositivo. Quitá alguna para agregar otra.'); return }
    bloqueo.current = true; setOcupado('nueva')
    try {
      const nueva = await consultarPublicacion(valor)
      guardar([nueva, ...posts]); setEnlace(''); setAviso('Publicación agregada.')
    } catch (e) { setError(e.name === 'TimeoutError' ? 'La consulta tardó demasiado. Volvé a intentar.' : e.message) }
    finally { bloqueo.current = false; setOcupado(null) }
  }

  async function actualizar(post) {
    if (bloqueo.current) return
    bloqueo.current = true; setOcupado(post.id); setError(''); setAviso('')
    try {
      const nueva = await consultarPublicacion(post.enlace)
      guardar(posts.map(p => p.id === nueva.id ? nueva : p)); setAviso('Métricas actualizadas.')
    } catch { setError('No se pudo actualizar. Conservamos la última consulta y su fecha. Probá nuevamente en unos minutos.') }
    finally { bloqueo.current = false; setOcupado(null) }
  }

  return <div className="metricas-publicas">
    <div className="page-head"><div><h1>Métricas por enlace</h1><p className="hint">Tus publicaciones, a simple vista. Sin conectar tus redes.</p></div><span className="metricas-insignia">X · Datos públicos</span></div>
    <form className="card card-pad metricas-form" onSubmit={e => { e.preventDefault(); agregar() }}>
      <label htmlFor="enlace-publicacion">Enlace de la publicación</label>
      <div className="metricas-entrada"><input id="enlace-publicacion" type="url" required placeholder="https://x.com/usuario/status/…" value={enlace} onChange={e => setEnlace(e.target.value)} disabled={!!ocupado} /><button className="btn btn-primary" disabled={!!ocupado || !enlace.trim()}>{ocupado === 'nueva' ? 'Consultando…' : 'Agregar publicación'}</button></div>
      <p className="hint">También podés pegar el enlace terminado en /analytics. Por ahora, las métricas automáticas están disponibles para X.</p>
    </form>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    <p role="status" className="metricas-aviso">{aviso}</p>
    <div className="metricas-lista-titulo"><h2>Publicaciones guardadas <span>{posts.length}</span></h2><p className="hint">Guardadas en este dispositivo</p></div>
    {posts.length === 0 ? <div className="card card-pad metricas-vacio"><div className="metricas-marca">↗</div><h2>De un enlace a sus números</h2><p>Pegá una publicación para ver su contenido y las interacciones disponibles.</p><button className="btn" type="button" disabled={!!ocupado} onClick={() => agregar(EJEMPLO)}>Agregar tu publicación del mapa de fútbol</button></div> : <div className="metricas-tarjetas">{posts.map(p => <article className="card metricas-tarjeta" key={p.id}>
      <div className="metricas-contenido"><div className="card-pad"><div className="metricas-autor">{p.avatar && <img src={p.avatar} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} />}<div><strong>{p.autor}</strong><p className="hint">{p.usuario ? `@${p.usuario} · ` : ''}{fecha(p.publicado)}</p></div><span className="metricas-x">𝕏</span></div><p className="metricas-texto">{p.texto}</p></div>
      {p.imagen && <figure className="metricas-imagen"><img src={p.imagen} alt={p.tituloEnlace || 'Imagen de la publicación'} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} />{p.tituloEnlace && <figcaption>{p.tituloEnlace}</figcaption>}</figure>}
      </div><div className="metricas-panel"><dl className="metricas-numeros">{CAMPOS.map(([campo, nombre]) => <div key={campo}><dt>{nombre}</dt><dd>{p.metricas?.[campo] == null ? <small>No disponible</small> : formato.format(p.metricas[campo])}</dd></div>)}</dl>
      <div className="card-pad metricas-pie"><p className="hint">Última consulta: {fecha(p.actualizado)}</p><div className="metricas-acciones"><a className="btn btn-sm" href={p.enlace} target="_blank" rel="noreferrer">Ver en X ↗</a><button className="btn btn-sm" disabled={!!ocupado} onClick={() => actualizar(p)}>{ocupado === p.id ? 'Actualizando…' : 'Actualizar'}</button><button className="btn btn-sm" disabled={!!ocupado} onClick={() => { guardar(posts.filter(item => item.id !== p.id)); setAviso('Enlace quitado de tu lista.') }}>Quitar de la lista</button></div></div>
    </div></article>)}</div>}
    <p className="hint metricas-fuente">Fuente: <a href="https://github.com/FxEmbed/FxEmbed" target="_blank" rel="noreferrer">FxEmbed</a>, servicio independiente de X. Los datos pueden tener demora. Las estadísticas privadas, como clics en enlaces, no se obtienen desde un enlace público.</p>
  </div>
}
