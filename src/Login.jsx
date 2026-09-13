import { useState } from 'react'
import { supabase } from './supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError('No pudimos entrar. Revisá el mail y la contraseña.')
  }

  async function mandarEnlace() {
    if (!email.trim()) { setError('Escribí tu mail primero.'); return }
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email })
    setBusy(false)
    if (error) { setError('No se pudo mandar el enlace.'); return }
    setLinkSent(true)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Second brain</h1>
        <div className="sub">Tus proyectos, tu agenda y tus archivos en un solo lugar.</div>
        {linkSent ? (
          <p style={{ fontSize: 14 }}>Te mandé un enlace a {email}.</p>
        ) : (
          <form onSubmit={entrar}>
            <div className="field">
              <input type="email" value={email} placeholder="tu@mail.com" autoComplete="username" onChange={e => { setEmail(e.target.value); setError('') }} />
            </div>
            <div className="field">
              <input type="password" value={password} placeholder="Contraseña" autoComplete="current-password" onChange={e => { setPassword(e.target.value); setError('') }} />
            </div>
            {error && <p style={{ color: 'var(--red-600)', fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
            <button className="login-mock-btn" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
            <button type="button" className="login-alt" onClick={mandarEnlace}>No entro: mandame un enlace por mail</button>
          </form>
        )}
      </div>
    </div>
  )
}
