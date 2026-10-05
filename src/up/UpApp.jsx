import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import Hoy from './Hoy.jsx'
import Preguntas from './Preguntas.jsx'
import Revisor from './Revisor.jsx'
import Calendario from './Calendario.jsx'
import Ficha from './Ficha.jsx'
import Agentes from './Agentes.jsx'
import Redes from './Redes.jsx'
import Asistente from './Asistente.jsx'

const PANTALLAS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'preguntas', label: 'Necesito que me cuentes', cuenta: 'falta_info' },
  { id: 'revisor', label: 'Revisor', cuenta: 'revision' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'ficha', label: 'Ficha de datos' },
  { id: 'redes', label: 'Redes' },
  { id: 'agentes', label: 'Agentes' },
]

function fechaConAnio() {
  const t = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function UpApp({ email, volver }) {
  const [pantalla, setPantalla] = useState(() => (new URLSearchParams(window.location.search).has('up_redes') ? 'redes' : 'hoy'))
  const [cuentas, setCuentas] = useState({})
  const [foco, setFoco] = useState(null) // { fecha, red } que abre la mesa de trabajo en Redes

  // Cuántos días esperan una respuesta y cuántas piezas quedaron en revisión, para el menú.
  const contar = useCallback(async () => {
    const { data } = await supabase.from('up_piezas').select('fecha,estado').in('estado', ['falta_info', 'revision'])
    setCuentas({
      falta_info: new Set((data || []).filter(p => p.estado === 'falta_info').map(p => p.fecha)).size,
      revision: (data || []).filter(p => p.estado === 'revision').length,
    })
  }, [])

  useEffect(() => { contar() }, [contar])

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
            <button key={p.id} className={pantalla === p.id ? 'on' : ''} onClick={() => { setFoco(null); setPantalla(p.id) }}>
              {p.label}{p.cuenta && cuentas[p.cuenta] > 0 && <span className="up-cuenta">{cuentas[p.cuenta]}</span>}
            </button>
          ))}
        </nav>
        <main className="up-cuerpo">
          {pantalla === 'hoy' && <Hoy abrirCalendario={() => setPantalla('calendario')} abrirPreguntas={() => setPantalla('preguntas')} alCambiar={contar} />}
          {pantalla === 'preguntas' && <Preguntas alCambiar={contar} />}
          {pantalla === 'revisor' && <Revisor alCambiar={contar} />}
          {pantalla === 'calendario' && <Calendario abrirEdicion={(fecha, red) => { setFoco({ fecha, red }); setPantalla('redes') }} />}
          {pantalla === 'ficha' && <Ficha />}
          {pantalla === 'redes' && <Redes foco={foco} />}
          {pantalla === 'agentes' && <Agentes />}
        </main>
      </div>
      <Asistente />
    </div>
  )
}
