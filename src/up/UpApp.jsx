import { useState } from 'react'
import { supabase } from '../supabase.js'
import Calendario from './Calendario.jsx'
import Ficha from './Ficha.jsx'

const PANTALLAS = [
  { id: 'calendario', label: 'Calendario' },
  { id: 'ficha', label: 'Ficha de datos' },
]

export default function UpApp({ email, volver }) {
  const [pantalla, setPantalla] = useState('calendario')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const actual = PANTALLAS.find(p => p.id === pantalla)

  return (
    <div className="app-shell">
      {menuAbierto && <div className="sidebar-backdrop" onClick={() => setMenuAbierto(false)} />}
      <aside className={`sidebar${menuAbierto ? ' open' : ''}`} onClick={() => setMenuAbierto(false)}>
        <div className="sidebar-brand">
          <div className="brand-mark">UP</div>
          <div className="brand-text">
            <strong>UP</strong>
            <span>{email}</span>
          </div>
        </div>
        <div className="nav-group-label">Publicaciones</div>
        <ul className="nav-list">
          {PANTALLAS.map(p => (
            <li key={p.id}><button className={`nav-item${pantalla === p.id ? ' active' : ''}`} onClick={() => setPantalla(p.id)}>{p.label}</button></li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={volver} style={{ padding: '4px 0' }}>← Inicio</button>
          <button className="nav-item" onClick={() => supabase.auth.signOut()} style={{ marginTop: 8, padding: '4px 0' }}>Salir</button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="menu-toggle" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}>☰</button>
          <div className="topbar-title">{actual.label}</div>
          <div className="topbar-spacer" />
        </header>
        <main className="content">
          {pantalla === 'calendario' && <Calendario />}
          {pantalla === 'ficha' && <Ficha />}
        </main>
      </div>
    </div>
  )
}
