import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase.js'
import Hoy from './screens/Hoy.jsx'
import Flujo from './screens/Flujo.jsx'
import ProyectoShell from './screens/proyecto/ProyectoShell.jsx'
import Pantalla from './screens/Pantalla.jsx'
import Mail from './screens/Mail.jsx'
import Maria from './screens/Maria.jsx'
import Login from './Login.jsx'

const GRUPOS = [
  { key: 'redes', label: 'Redes' },
  { key: 'proyectos', label: 'Mis páginas' },
  { key: 'herramientas', label: 'Herramientas' },
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [pantalla, setPantalla] = useState('hoy')
  const [proyectoId, setProyectoId] = useState(null)
  const [pantallaWebId, setPantallaWebId] = useState(null)
  const [mailId, setMailId] = useState(null)
  const [proyectos, setProyectos] = useState([])
  const [pantallasWeb, setPantallasWeb] = useState([])
  const [gruposAbiertos, setGruposAbiertos] = useState({ redes: true, proyectos: true, herramientas: false })
  const [google, setGoogle] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [nuevoProyectoAbierto, setNuevoProyectoAbierto] = useState(false)
  const [nuevoProyectoNombre, setNuevoProyectoNombre] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const cargarProyectos = useCallback(async () => {
    if (!session) return
    const { data } = await supabase.from('projects').select('id,name,status,color').order('created_at')
    setProyectos(data || [])
  }, [session])

  const cargarPantallas = useCallback(async () => {
    if (!session) return
    const { data } = await supabase.from('pantallas').select('id,nombre,url,grupo,orden').eq('activo', true).order('orden')
    setPantallasWeb(data || [])
  }, [session])

  const sincronizarGoogle = useCallback(async () => {
    if (!session) return
    setSincronizando(true)
    const { data, error } = await supabase.functions.invoke('google-sync', { body: {} })
    setSincronizando(false)
    if (error) { setGoogle({ conectado: false }); return }
    setGoogle(data)
  }, [session])

  useEffect(() => { cargarProyectos(); cargarPantallas(); sincronizarGoogle() }, [cargarProyectos, cargarPantallas, sincronizarGoogle])

  if (session === undefined) return null
  if (!session) return <Login />

  function abrirProyecto(id) {
    setProyectoId(id)
    setPantalla('proyecto')
  }
  function abrirPantalla(id) {
    setPantallaWebId(id)
    setPantalla('pantalla')
  }
  function abrirMail(id) {
    setMailId(id)
    setPantalla('mail')
  }

  async function crearProyecto() {
    if (!nuevoProyectoNombre.trim()) return
    await supabase.from('projects').insert({ name: nuevoProyectoNombre.trim(), status: 'activo' })
    setNuevoProyectoNombre('')
    setNuevoProyectoAbierto(false)
    cargarProyectos()
  }

  async function conectarGoogle() {
    const { data, error } = await supabase.functions.invoke('google-auth', { body: {} })
    if (error || !data?.url) return
    window.open(data.url, '_blank')
  }

  const proyectoActual = proyectos.find(p => p.id === proyectoId) || null
  const pantallaWebActual = pantallasWeb.find(p => p.id === pantallaWebId) || null

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">SB</div>
          <div className="brand-text">
            <strong>Second brain</strong>
            <span>{session.user.email}</span>
          </div>
        </div>
        <div className="nav-group-label">General</div>
        <ul className="nav-list">
          <li><button className={`nav-item${pantalla === 'hoy' ? ' active' : ''}`} onClick={() => setPantalla('hoy')}>Hoy</button></li>
          <li><button className={`nav-item${pantalla === 'flujo' ? ' active' : ''}`} onClick={() => setPantalla('flujo')}>Flujo</button></li>
          <li><button className={`nav-item${pantalla === 'maria' ? ' active' : ''}`} onClick={() => setPantalla('maria')}>María</button></li>
        </ul>

        <div className="nav-group-label">Proyectos</div>
        <ul className="nav-list">
          {proyectos.map(p => (
            <li key={p.id}>
              <button className={`nav-item${pantalla === 'proyecto' && proyectoId === p.id ? ' active' : ''}`} onClick={() => abrirProyecto(p.id)}>
                {p.name}
              </button>
            </li>
          ))}
          <li><button className="nav-item" onClick={() => setNuevoProyectoAbierto(true)}>+ Nuevo</button></li>
        </ul>

        {GRUPOS.map(g => {
          const items = pantallasWeb.filter(p => p.grupo === g.key)
          if (items.length === 0) return null
          return (
            <div key={g.key}>
              <button className="nav-group-label" style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                onClick={() => setGruposAbiertos(s => ({ ...s, [g.key]: !s[g.key] }))}>
                {gruposAbiertos[g.key] ? '▾' : '▸'} {g.label}
              </button>
              {gruposAbiertos[g.key] && (
                <ul className="nav-list">
                  {items.map(p => (
                    <li key={p.id}>
                      <button className={`nav-item${pantalla === 'pantalla' && pantallaWebId === p.id ? ' active' : ''}`} onClick={() => abrirPantalla(p.id)}>
                        {p.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}

        <div className="sidebar-footer">
          {google?.conectado ? (
            <>
              <div>Google conectado{google.cuenta ? ` · ${google.cuenta}` : ''}</div>
              <button className="nav-item" onClick={sincronizarGoogle} style={{ textDecoration: 'underline', padding: '4px 0' }}>
                {sincronizando ? 'Actualizando…' : 'Actualizar ahora'}
              </button>
            </>
          ) : (
            <>
              <button className="nav-item" onClick={conectarGoogle} style={{ padding: '4px 0' }}>Conectar Google</button>
              {google?.reconectar && <div style={{ marginTop: 4 }}>Hace falta reconectar.</div>}
            </>
          )}
          <button className="nav-item" onClick={() => supabase.auth.signOut()} style={{ marginTop: 8, padding: '4px 0' }}>Salir</button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-title">
            {pantalla === 'hoy' && 'Hoy'}
            {pantalla === 'flujo' && 'Flujo'}
            {pantalla === 'maria' && 'María'}
            {pantalla === 'proyecto' && (proyectoActual?.name || 'Proyecto')}
            {pantalla === 'pantalla' && (pantallaWebActual?.nombre || 'Pantalla')}
            {pantalla === 'mail' && 'Mail'}
          </div>
          <div className="topbar-spacer" />
        </header>
        <main className="content" style={pantalla === 'pantalla' ? { maxWidth: 'none', display: 'flex', flexDirection: 'column' } : undefined}>
          {pantalla === 'hoy' && <Hoy proyectos={proyectos} abrirProyecto={abrirProyecto} abrirMail={abrirMail} abrirMaria={() => setPantalla('maria')} />}
          {pantalla === 'flujo' && <Flujo proyectos={proyectos} />}
          {pantalla === 'maria' && <Maria />}
          {pantalla === 'proyecto' && proyectoActual && <ProyectoShell proyecto={proyectoActual} recargarProyectos={cargarProyectos} />}
          {pantalla === 'pantalla' && pantallaWebActual && <Pantalla pantalla={pantallaWebActual} />}
          {pantalla === 'mail' && mailId && <Mail gmailId={mailId} volver={() => setPantalla('hoy')} />}
        </main>
      </div>

      {nuevoProyectoAbierto && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setNuevoProyectoAbierto(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Nuevo proyecto</h3>
              <button className="close-x" onClick={() => setNuevoProyectoAbierto(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Nombre</label>
                <input value={nuevoProyectoNombre} autoFocus onChange={e => setNuevoProyectoNombre(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && crearProyecto()} placeholder="Nombre del proyecto" />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setNuevoProyectoAbierto(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={crearProyecto}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
