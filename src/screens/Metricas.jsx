import { useCallback, useEffect, useState } from 'react'
import { supabase, abrirEnlaceOAuth, fechaCorta } from '../supabase.js'

function metricasDe(post) {
  const porClave = {}
  for (const m of post.social_metrics || []) {
    if (!porClave[m.key] || m.captured_at > porClave[m.key].captured_at) porClave[m.key] = m
  }
  return porClave
}

export default function Metricas() {
  const [cuenta, setCuenta] = useState(null)
  const [posts, setPosts] = useState([])
  const [cargando, setCargando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data: cuentaSocial } = await supabase.from('social_accounts').select('id,provider,handle').eq('provider', 'instagram').maybeSingle()
    setCuenta(cuentaSocial || null)
    if (cuentaSocial) {
      const { data } = await supabase.from('social_posts').select('id,body,link,media,published_at,social_metrics(key,value,captured_at)').eq('social_account_id', cuentaSocial.id).order('published_at', { ascending: false }).limit(30)
      setPosts(data || [])
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function conectar() {
    setError('')
    try {
      const { data, error } = await supabase.functions.invoke('meta-auth', { body: {} })
      let respuesta = data
      if (error?.context) { try { respuesta = await error.context.json() } catch { /* se muestra el error de conexión */ } }
      if (error || !respuesta?.url) throw new Error(respuesta?.error || 'No se pudo abrir la autorización de Instagram.')
      const revisarAlVolver = () => { window.removeEventListener('focus', revisarAlVolver); cargar() }
      window.addEventListener('focus', revisarAlVolver)
      abrirEnlaceOAuth(respuesta.url)
    } catch (e) { setError(e.message) }
  }

  async function sincronizar() {
    setSincronizando(true); setError('')
    try {
      const { data, error } = await supabase.functions.invoke('meta-sync', { body: {} })
      let respuesta = data
      if (error?.context) { try { respuesta = await error.context.json() } catch { /* se muestra el error de conexión */ } }
      if (error || respuesta?.error) throw new Error(respuesta?.error || 'No se pudo sincronizar Instagram.')
      await cargar()
    } catch (e) { setError(e.message) }
    finally { setSincronizando(false) }
  }

  return (
    <div>
      <div className="page-head"><h1>Métricas</h1></div>

      {error && <p role="alert" className="feedback-error">{error}</p>}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-heading">
          <h3>Instagram</h3>
          {cuenta
            ? <button className="btn btn-sm" disabled={sincronizando} onClick={sincronizar}>{sincronizando ? 'Sincronizando…' : 'Actualizar'}</button>
            : <button className="btn btn-primary btn-sm" onClick={conectar}>Conectar Instagram</button>}
        </div>
        {cargando ? <p className="empty-state">Cargando…</p> : cuenta
          ? <p className="hint">Conectada como @{cuenta.handle || cuenta.id}. {posts.length === 0 && 'Tocá "Actualizar" para traer tus publicaciones.'}</p>
          : <p className="empty-state">Conectá tu cuenta de Instagram Business/Creator para ver tus publicaciones y sus métricas acá.</p>}
      </div>

      {cuenta && posts.length > 0 && (
        <div className="grid grid-3">
          {posts.map(p => {
            const m = metricasDe(p)
            return (
              <a key={p.id} href={p.link || '#'} target="_blank" rel="noreferrer" className="card" style={{ overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}>
                {p.media?.[0] && <img src={p.media[0]} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />}
                <div className="card-pad">
                  <p style={{ fontSize: 12.5, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.body || '(sin descripción)'}</p>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--gray-500)' }}>
                    <span>♥ {m.likes?.value ?? 0}</span>
                    <span>💬 {m.comments?.value ?? 0}</span>
                    <span style={{ marginLeft: 'auto' }}>{fechaCorta(p.published_at)}</span>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13, marginBottom: 8 }}>X y LinkedIn</h3>
        <p className="empty-state">Todavía no conectados — X necesita un plan pago de API y LinkedIn requiere aplicar a un acceso especial. Se suman acá cuando estén listos.</p>
      </div>
    </div>
  )
}
