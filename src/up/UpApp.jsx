import { useState } from 'react'
import { supabase } from '../supabase.js'
import Hoy from './Hoy.jsx'
import Calendario from './Calendario.jsx'
import Ficha from './Ficha.jsx'

const PANTALLAS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'ficha', label: 'Ficha de datos' },
]

function fechaConAnio() {
  const t = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function UpApp({ email, volver }) {
  const [pantalla, setPantalla] = useState('hoy')

  return (
    <div className="up">
      <div className="up-pag">
        <div className="up-tope">
          <button onClick={volver}>‹ Inicio</button>
          <span className="up-sp" />
          <span className="up-tope-email">{email}</span>
          <button onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
        <header className="up-cab">
          <div className="up-cab-izq">{fechaConAnio()}</div>
          <h1>UP</h1>
          <div className="up-cab-lema">Publicaciones de LinkedIn, X e Instagram</div>
        </header>
        <nav className="up-secc">
          {PANTALLAS.map(p => (
            <button key={p.id} className={pantalla === p.id ? 'on' : ''} onClick={() => setPantalla(p.id)}>{p.label}</button>
          ))}
        </nav>
        <main className="up-cuerpo">
          {pantalla === 'hoy' && <Hoy abrirCalendario={() => setPantalla('calendario')} />}
          {pantalla === 'calendario' && <Calendario />}
          {pantalla === 'ficha' && <Ficha />}
        </main>
      </div>
    </div>
  )
}
