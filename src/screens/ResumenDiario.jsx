import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const VAPID_PUBLIC_KEY = 'BDp9Sq67nJB5XbFILuKp7Wsq_gp9-suVyRpVftnbg2-nbMQpl_sW9o0W4oOuTey2h4ga2m7OrC-FIxdUxo8pMzo'

function clavePublicaComoBytes(base64Url) {
  const relleno = '='.repeat((4 - base64Url.length % 4) % 4)
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const cruda = atob(base64)
  return Uint8Array.from([...cruda].map(c => c.charCodeAt(0)))
}

function ReglasMail({ ownerId }) {
  const [reglas, setReglas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [patron, setPatron] = useState('')
  const [tipo, setTipo] = useState('excluir')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function cargar() {
    const { data } = await supabase.from('mail_reglas').select('id,tipo,patron').eq('owner_id', ownerId).order('created_at')
    setReglas(data || []); setCargando(false)
  }
  useEffect(() => { cargar() }, [ownerId])

  async function agregar(e) {
    e.preventDefault()
    if (!patron.trim() || ocupado) return
    setOcupado(true); setError('')
    const { error } = await supabase.from('mail_reglas').insert({ owner_id: ownerId, tipo, patron: patron.trim().toLowerCase() })
    setOcupado(false)
    if (error) { setError('No se pudo agregar: ' + error.message); return }
    setPatron(''); cargar()
  }

  async function quitar(id) {
    const { error } = await supabase.from('mail_reglas').delete().eq('id', id)
    if (error) { setError('No se pudo quitar: ' + error.message); return }
    cargar()
  }

  if (cargando) return null

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gray-200)' }}>
      <p className="hint" style={{ marginBottom: 8 }}>Qué mails contar en el resumen: "Excluir" los saca de la cuenta (ej. remitentes de avisos que no te importan), "Incluir" los marca como importantes y los nombra por asunto (ej. "entrevista").</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {reglas.map(r => (
          <span key={r.id} className={`badge ${r.tipo === 'excluir' ? 'badge-red' : 'badge-green'}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {r.tipo === 'excluir' ? 'Excluir' : 'Incluir'}: {r.patron}
            <button type="button" onClick={() => quitar(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }} aria-label={`Quitar regla ${r.patron}`}>✕</button>
          </span>
        ))}
        {reglas.length === 0 && <span className="hint">Sin reglas todavía: se cuentan todos los mails sin leer.</span>}
      </div>
      <form onSubmit={agregar} style={{ display: 'flex', gap: 6 }}>
        <select aria-label="Tipo de regla" value={tipo} onChange={e => setTipo(e.target.value)} style={{ width: 'auto' }}>
          <option value="excluir">Excluir</option>
          <option value="incluir">Incluir</option>
        </select>
        <input aria-label="Palabra o remitente" value={patron} onChange={e => setPatron(e.target.value)} placeholder="palabra, remitente o dominio" />
        <button className="btn btn-sm" disabled={ocupado || !patron.trim()}>Agregar</button>
      </form>
      {error && <p className="feedback-error" role="alert">{error}</p>}
    </div>
  )
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
      <ReglasMail ownerId={ownerId} />
    </div>
  )
}
