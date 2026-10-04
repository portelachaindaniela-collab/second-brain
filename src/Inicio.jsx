import { useState } from 'react'
import { supabase } from './supabase.js'

// Pantalla de inicio de Second Brain: después del login se elige en qué app entrar.
const APPS = [
  { id: 'bs67', marca: 'BS67', nombre: 'BS67', detalle: 'Hoy, flujo, mail y calendario, trabajadores, eventos, métricas y proyectos.' },
  { id: 'up', marca: 'UP', nombre: 'UP', detalle: 'Publicaciones en LinkedIn, X e Instagram desde el calendario editorial.' },
]

// Cambiar la contraseña ya con la sesión abierta (por ejemplo, después de entrar con el enlace por mail).
function CambiarContrasena({ cerrar }) {
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [aviso, setAviso] = useState('')
  const [listo, setListo] = useState(false)
  const [busy, setBusy] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (nueva.length < 6) { setAviso('Tiene que tener al menos 6 caracteres.'); return }
    if (nueva !== repetida) { setAviso('Las dos contraseñas no coinciden.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: nueva })
    setBusy(false)
    if (error) { setAviso('No se pudo cambiar la contraseña: ' + error.message); return }
    setListo(true)
  }

  if (listo) {
    return (
      <div className="inicio-clave">
        <p style={{ fontSize: 14, marginBottom: 10 }}>Listo, la próxima vez entrás con la contraseña nueva.</p>
        <button type="button" className="login-alt" onClick={cerrar}>Cerrar</button>
      </div>
    )
  }
  return (
    <form className="inicio-clave" onSubmit={guardar}>
      <div className="field">
        <input type="password" value={nueva} placeholder="Contraseña nueva" autoComplete="new-password" onChange={e => { setNueva(e.target.value); setAviso('') }} autoFocus />
      </div>
      <div className="field">
        <input type="password" value={repetida} placeholder="Repetila" autoComplete="new-password" onChange={e => { setRepetida(e.target.value); setAviso('') }} />
      </div>
      {aviso && <p style={{ color: 'var(--red-600)', fontSize: 12.5, marginBottom: 10 }}>{aviso}</p>}
      <button className="login-mock-btn" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      <button type="button" className="login-alt" onClick={cerrar}>Cancelar</button>
    </form>
  )
}

export default function Inicio({ email, elegir, salir }) {
  const [cambiando, setCambiando] = useState(false)
  return (
    <div className="login-screen">
      <div className="inicio">
        <h1>Second brain</h1>
        <div className="sub">{email}</div>
        <div className="inicio-apps">
          {APPS.map(a => (
            <button key={a.id} className="inicio-app card" onClick={() => elegir(a.id)}>
              <span className="brand-mark">{a.marca}</span>
              <strong>{a.nombre}</strong>
              <span>{a.detalle}</span>
            </button>
          ))}
        </div>
        {cambiando
          ? <CambiarContrasena cerrar={() => setCambiando(false)} />
          : (
            <div className="inicio-pie">
              <button type="button" className="login-alt" onClick={() => setCambiando(true)}>Cambiar contraseña</button>
              <button type="button" className="login-alt" onClick={salir}>Salir</button>
            </div>
          )}
      </div>
    </div>
  )
}
