import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const VAPID_PUBLIC_KEY = 'BDp9Sq67nJB5XbFILuKp7Wsq_gp9-suVyRpVftnbg2-nbMQpl_sW9o0W4oOuTey2h4ga2m7OrC-FIxdUxo8pMzo'

function clavePublicaComoBytes(base64Url) {
  const relleno = '='.repeat((4 - base64Url.length % 4) % 4)
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const cruda = atob(base64)
  return Uint8Array.from([...cruda].map(c => c.charCodeAt(0)))
}

export default function ResumenDiario({ ownerId }) {
  const [suscripcion, setSuscripcion] = useState(null)
  const [hora, setHora] = useState('08:00')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const soportado = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  useEffect(() => {
    if (!soportado) { setCargando(false); return }
    let vivo = true
    supabase.from('push_subscriptions').select('id,hora_local').eq('owner_id', ownerId).eq('activo', true).maybeSingle()
      .then(({ data }) => { if (!vivo) return; setSuscripcion(data || null); if (data?.hora_local) setHora(data.hora_local.slice(0, 5)); setCargando(false) })
      .catch(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [ownerId, soportado])

  async function activar() {
    if (ocupado) return
    setOcupado(true); setError('')
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') { setError('No diste permiso de notificaciones. Activalo desde la configuración del navegador y volvé a intentar.'); return }
      const registro = await navigator.serviceWorker.ready
      let push = await registro.pushManager.getSubscription()
      if (!push) push = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clavePublicaComoBytes(VAPID_PUBLIC_KEY) })
      const json = push.toJSON()
      const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
      const { data, error } = await supabase.from('push_subscriptions')
        .upsert({ owner_id: ownerId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, hora_local: hora, zona_horaria: zona, activo: true }, { onConflict: 'endpoint' })
        .select('id,hora_local').single()
      if (error) throw error
      setSuscripcion(data)
    } catch (e) { setError('No se pudo activar: ' + (e.message || 'error desconocido')) }
    finally { setOcupado(false) }
  }

  async function guardarHora() {
    if (!suscripcion || ocupado) return
    setOcupado(true); setError('')
    try {
      const { error } = await supabase.from('push_subscriptions').update({ hora_local: hora }).eq('id', suscripcion.id)
      if (error) throw error
      setSuscripcion(s => ({ ...s, hora_local: hora }))
    } catch (e) { setError('No se pudo guardar la hora: ' + e.message) }
    finally { setOcupado(false) }
  }

  async function desactivar() {
    if (!suscripcion || ocupado) return
    setOcupado(true); setError('')
    try {
      const registro = await navigator.serviceWorker.ready
      const push = await registro.pushManager.getSubscription()
      if (push) await push.unsubscribe()
      const { error } = await supabase.from('push_subscriptions').delete().eq('id', suscripcion.id)
      if (error) throw error
      setSuscripcion(null)
    } catch (e) { setError('No se pudo desactivar: ' + e.message) }
    finally { setOcupado(false) }
  }

  if (!soportado || cargando) return null

  return (
    <div className="card card-pad" style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, marginBottom: 10 }}>Resumen diario por notificación</h3>
      {!suscripcion ? (
        <>
          <p className="hint" style={{ marginBottom: 10 }}>Te mando una notificación a la hora que elijas con tu resumen del día. Al abrirla, la app te lo lee en voz alta.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="time" aria-label="Hora del resumen" value={hora} onChange={e => setHora(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={activar}>{ocupado ? 'Activando…' : 'Activar'}</button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge badge-green">Activo</span>
          <input type="time" aria-label="Hora del resumen" value={hora} onChange={e => setHora(e.target.value)} />
          <button className="btn btn-sm" disabled={ocupado || hora === suscripcion.hora_local?.slice(0, 5)} onClick={guardarHora}>Guardar hora</button>
          <button className="btn btn-sm btn-danger" disabled={ocupado} onClick={desactivar}>Desactivar</button>
        </div>
      )}
      {error && <p className="feedback-error" role="alert">{error}</p>}
    </div>
  )
}
