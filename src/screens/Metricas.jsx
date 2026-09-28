import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { consultarPublicacion, normalizarPublicacion } from '../metricasPublicas.mjs'
import './Metricas.css'

const EJEMPLO = 'https://x.com/danielachain/status/2095695909770113318'
const CAMPOS = [['vistas', 'Visualizaciones'], ['likes', 'Me gusta'], ['reposts', 'Reposts'], ['respuestas', 'Respuestas'], ['citas', 'Citas'], ['guardados', 'Guardados']]
const formato = new Intl.NumberFormat('es-AR')
const fecha = valor => valor ? new Date(valor).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : ''

function desdeFila(fila) {
  return {
    dbId: fila.id, id: fila.post_id, enlace: fila.enlace, texto: fila.texto,
    autor: fila.autor, usuario: fila.usuario, avatar: fila.avatar, imagen: fila.imagen,
    tituloEnlace: fila.titulo_enlace, publicado: fila.publicado, actualizado: fila.actualizado,
    metricas: fila.metricas || {},
  }
}

function haciaFila(ownerId, p) {
  return {
    owner_id: ownerId, plataforma: 'x', post_id: p.id, enlace: p.enlace, texto: p.texto,
    autor: p.autor, usuario: p.usuario, avatar: p.avatar, imagen: p.imagen,
    titulo_enlace: p.tituloEnlace, publicado: p.publicado, actualizado: p.actualizado, metricas: p.metricas,
  }
}

export default function Metricas({ ownerId }) {
  const [posts, setPosts] = useState([])
  const [cargando, setCargando] = useState(true)
  const [enlace, setEnlace] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const bloqueo = useRef(false)

  async function migrarDesdeNavegador() {
    // Versión anterior: guardaba en localStorage, específico de cada origen (por eso no
    // se veían igual en la app de escritorio y en la web). Se migra una sola vez a la base.
    const clave = `second-brain:publicaciones:${ownerId}`
    let items
    try { items = JSON.parse(localStorage.getItem(clave) || '[]') } catch { return }
    if (!Array.isArray(items) || !items.length) return
    const validos = items.filter(p => { try { return normalizarPublicacion(p.enlace).id === p.id } catch { return false } })
    if (!validos.length) return
    const { error } = await supabase.from('metric_posts').upsert(validos.map(p => haciaFila(ownerId, p)), { onConflict: 'owner_id,plataforma,post_id', ignoreDuplicates: true })
    if (!error) { try { localStorage.removeItem(clave) } catch { /* si no se puede borrar, no repetimos el intento igual */ } }
  }

  async function cargar() {
    const { data, error } = await supabase.from('metric_posts').select('*').eq('owner_id', ownerId).eq('plataforma', 'x').order('created_at', { ascending: false }).limit(100)
    if (error) { setError('No se pudieron cargar tus publicaciones guardadas: ' + error.message); setCargando(false); return }
    if (!data?.length) {
      await migrarDesdeNavegador()
      const otra = await supabase.from('metric_posts').select('*').eq('owner_id', ownerId).eq('plataforma', 'x').order('created_at', { ascending: false }).limit(100)
      setPosts((otra.data || []).map(desdeFila)); setCargando(false); return
    }
    setPosts(data.map(desdeFila))
    setCargando(false)
  }
  useEffect(() => { cargar() }, [ownerId])

  async function agregar(valor = enlace) {
    if (bloqueo.current) return
    setError(''); setAviso('')
    let identificada
    try { identificada = normalizarPublicacion(valor) } catch (e) { setError(e.message); return }
    if (posts.some(p => p.id === identificada.id)) { setAviso('Ya agregaste esta publicación. Podés actualizarla desde su tarjeta.'); return }
    if (posts.length >= 100) { setError('Podés guardar hasta 100 publicaciones. Quitá alguna para agregar otra.'); return }
    bloqueo.current = true; setOcupado('nueva')
    try {
      const nueva = await consultarPublicacion(valor)
      const { data, error } = await supabase.from('metric_posts').insert(haciaFila(ownerId, nueva)).select('*').single()
      if (error) throw error
      setPosts(prev => [desdeFila(data), ...prev]); setEnlace(''); setAviso('Publicación agregada.')
    } catch (e) { setError(e.name === 'TimeoutError' ? 'La consulta tardó demasiado. Volvé a intentar.' : e.message) }
    finally { bloqueo.current = false; setOcupado(null) }
  }

  async function actualizar(post) {
    if (bloqueo.current) return
    bloqueo.current = true; setOcupado(post.id); setError(''); setAviso('')
    try {
      const nueva = await consultarPublicacion(post.enlace)
      const { data, error } = await supabase.from('metric_posts').update(haciaFila(ownerId, nueva)).eq('id', post.dbId).select('*').single()
      if (error) throw error
      setPosts(prev => prev.map(p => p.dbId === post.dbId ? desdeFila(data) : p)); setAviso('Métricas actualizadas.')
    } catch { setError('No se pudo actualizar. Conservamos la última consulta y su fecha. Probá nuevamente en unos minutos.') }
    finally { bloqueo.current = false; setOcupado(null) }
  }

  async function quitar(post) {
    const { error } = await supabase.from('metric_posts').delete().eq('id', post.dbId)
    if (error) { setError('No se pudo quitar: ' + error.message); return }
    setPosts(prev => prev.filter(p => p.dbId !== post.dbId)); setAviso('Enlace quitado de tu lista.')
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
    <div className="metricas-lista-titulo"><h2>Publicaciones guardadas <span>{posts.length}</span></h2><p className="hint">Guardadas en tu cuenta</p></div>
    {cargando ? <p className="empty-state">Cargando…</p> : posts.length === 0 ? <div className="card card-pad metricas-vacio"><div className="metricas-marca">↗</div><h2>De un enlace a sus números</h2><p>Pegá una publicación para ver su contenido y las interacciones disponibles.</p><button className="btn" type="button" disabled={!!ocupado} onClick={() => agregar(EJEMPLO)}>Agregar tu publicación del mapa de fútbol</button></div> : <div className="metricas-tarjetas">{posts.map(p => <article className="card metricas-tarjeta" key={p.dbId}>
      <div className="metricas-contenido"><div className="card-pad"><div className="metricas-autor">{p.avatar && <img src={p.avatar} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} />}<div><strong>{p.autor}</strong><p className="hint">{p.usuario ? `@${p.usuario} · ` : ''}{fecha(p.publicado)}</p></div><span className="metricas-x">𝕏</span></div><p className="metricas-texto">{p.texto}</p></div>
      {p.imagen && <figure className="metricas-imagen"><img src={p.imagen} alt={p.tituloEnlace || 'Imagen de la publicación'} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} />{p.tituloEnlace && <figcaption>{p.tituloEnlace}</figcaption>}</figure>}
      </div><div className="metricas-panel"><dl className="metricas-numeros">{CAMPOS.map(([campo, nombre]) => <div key={campo}><dt>{nombre}</dt><dd>{p.metricas?.[campo] == null ? <small>No disponible</small> : formato.format(p.metricas[campo])}</dd></div>)}</dl>
      <div className="card-pad metricas-pie"><p className="hint">Última consulta: {fecha(p.actualizado)}</p><div className="metricas-acciones"><a className="btn btn-sm" href={p.enlace} target="_blank" rel="noreferrer">Ver en X ↗</a><button className="btn btn-sm" disabled={!!ocupado} onClick={() => actualizar(p)}>{ocupado === p.id ? 'Actualizando…' : 'Actualizar'}</button><button className="btn btn-sm" disabled={!!ocupado} onClick={() => quitar(p)}>Quitar de la lista</button></div></div>
    </div></article>)}</div>}
    <p className="hint metricas-fuente">Fuente: <a href="https://github.com/FxEmbed/FxEmbed" target="_blank" rel="noreferrer">FxEmbed</a>, servicio independiente de X. Los datos pueden tener demora. Las estadísticas privadas, como clics en enlaces, no se obtienen desde un enlace público.</p>
  </div>
}
