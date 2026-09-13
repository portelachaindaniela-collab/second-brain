import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, abrirEnlaceOAuth } from './supabase.js'
import Hoy from './screens/Hoy.jsx'
import Flujo from './screens/Flujo.jsx'
import ProyectoShell from './screens/proyecto/ProyectoShell.jsx'
import Pantalla from './screens/Pantalla.jsx'
import Mail from './screens/Mail.jsx'
import Maria from './screens/Maria.jsx'
import Metricas from './screens/Metricas.jsx'
import Login from './Login.jsx'
import BotFlotante from './BotFlotante.jsx'
import Bandeja from './screens/Bandeja.jsx'
import Agenda from './screens/Agenda.jsx'
import VisorArchivo from './screens/VisorArchivo.jsx'

const GRUPOS = []

export default function App() {
  const [session, setSession] = useState(undefined)
  const [botAbierto, setBotAbierto] = useState(false)
  const [botTexto, setBotTexto] = useState('')
  const [botMensajes, setBotMensajes] = useState([])
  const [botConsultando, setBotConsultando] = useState(false)
  const [pantalla, setPantalla] = useState('hoy')
  const [proyectoId, setProyectoId] = useState(null)
  const [hojaProyecto, setHojaProyecto] = useState('resumen')
  const [pantallaWebId, setPantallaWebId] = useState(null)
  const [pantallaOrigen, setPantallaOrigen] = useState('hoy')
  const [mailId, setMailId] = useState(null)
  const [mailOrigen, setMailOrigen] = useState('hoy')
  const [htmlLocal, setHtmlLocal] = useState(null)
  const htmlInput = useRef(null)
  const creandoRef = useRef(false)
  const [creando, setCreando] = useState(false)
  const [errorProyecto, setErrorProyecto] = useState('')
  const [errorGeneral, setErrorGeneral] = useState('')
  const [revisionGoogle, setRevisionGoogle] = useState(0)
  const [proyectos, setProyectos] = useState([])
  const [cargandoProyectos, setCargandoProyectos] = useState(true)
  const [pantallasWeb, setPantallasWeb] = useState([])
  const [gruposAbiertos, setGruposAbiertos] = useState({ proyectos: true })
  const [google, setGoogle] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [nuevoProyectoAbierto, setNuevoProyectoAbierto] = useState(false)
  const [nuevoProyectoNombre, setNuevoProyectoNombre] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) { setBotMensajes([]); setBotTexto(''); setBotAbierto(false); setBotConsultando(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const cargarProyectos = useCallback(async () => {
    if (!session) return
    const { data, error } = await supabase.from('projects').select('id,name,status,color,summary').order('created_at')
    setCargandoProyectos(false)
    if (error) { setErrorGeneral('No se pudieron cargar los proyectos: ' + error.message); return }
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
    if (error || data?.error) { setErrorGeneral('No se pudo sincronizar Google. Probá nuevamente.'); return }
    setGoogle(data)
    setRevisionGoogle(r => r + 1)
  }, [session])

  useEffect(() => { cargarProyectos(); cargarPantallas(); sincronizarGoogle() }, [cargarProyectos, cargarPantallas, sincronizarGoogle])

  if (session === undefined) return null
  if (!session) return <Login />

  function abrirProyecto(id) {
    setHojaProyecto('resumen')
    setProyectoId(id)
    setPantalla('proyecto')
  }
  function abrirPantalla(id) {
    setPantallaOrigen(pantalla)
    setPantallaWebId(id)
    setPantalla('pantalla')
  }
  function abrirMail(id) {
    setMailOrigen(pantalla)
    setMailId(id)
    setPantalla('mail')
  }

  async function crearProyecto() {
    const nombre = nuevoProyectoNombre.trim()
    if (!nombre || creandoRef.current) return
    creandoRef.current = true; setCreando(true); setErrorProyecto('')
    try {
      const { data, error } = await supabase.from('projects').insert({ name: nombre, slug: (nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyecto') + '-' + crypto.randomUUID().slice(0, 8) }).select('id,name,status,color,summary').single()
      if (error) throw error
      setProyectos(prev => [...prev, data])
      setNuevoProyectoNombre(''); setNuevoProyectoAbierto(false)
      abrirProyecto(data.id)
    } catch (error) { setErrorProyecto('No se pudo crear el proyecto: ' + error.message) }
    finally { creandoRef.current = false; setCreando(false) }
  }

  async function conectarGoogle() {
    const { data, error } = await supabase.functions.invoke('google-auth', { body: {} })
    if (error || !data?.url) { setErrorGeneral('No se pudo conectar Google. Probá nuevamente.'); return }
    // Al volver de autorizar en Google (otra ventana en Electron, o la misma pestaña en el
    // navegador) nada le avisaba a la app que ya estaba conectada — quedaba mostrando "Conectar
    // Google" hasta que entrabas a Mail o Calendario y tocabas Sincronizar ahí a mano.
    const revisarAlVolver = () => { window.removeEventListener('focus', revisarAlVolver); sincronizarGoogle() }
    window.addEventListener('focus', revisarAlVolver)
    abrirEnlaceOAuth(data.url)
  }

  const proyectoActual = proyectos.find(p => p.id === proyectoId) || null
  const pantallaWebActual = pantallasWeb.find(p => p.id === pantallaWebId) || null

  return (
    <div className="app-shell">
      {menuAbierto && <div className="sidebar-backdrop" onClick={() => setMenuAbierto(false)} />}
      <aside className={`sidebar${menuAbierto ? ' open' : ''}`} onClick={() => setMenuAbierto(false)}>
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
          <li><button className={`nav-item${pantalla === 'bandeja' ? ' active' : ''}`} onClick={() => setPantalla('bandeja')}>Mail</button></li>
          <li><button className={`nav-item${pantalla === 'agenda' ? ' active' : ''}`} onClick={() => setPantalla('agenda')}>Calendario</button></li>
          <li><button className="nav-item" onClick={() => htmlInput.current?.click()}>Abrir HTML</button></li>
          <li><button className={`nav-item${pantalla === 'maria' ? ' active' : ''}`} onClick={() => setPantalla('maria')}>María</button></li>
          <li><button className={`nav-item${pantalla === 'metricas' ? ' active' : ''}`} onClick={() => setPantalla('metricas')}>Métricas</button></li>
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
          <li><button className="nav-item" disabled={cargandoProyectos} onClick={() => { setErrorProyecto(''); setNuevoProyectoAbierto(true) }}>+ Nuevo</button></li>
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
          <button className="menu-toggle" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}>☰</button>
          <div className="topbar-title">
            {pantalla === 'hoy' && 'Hoy'}
            {pantalla === 'flujo' && 'Flujo'}
            {pantalla === 'bandeja' && 'Mail'}
            {pantalla === 'agenda' && 'Calendario'}
            {pantalla === 'maria' && 'María'}
            {pantalla === 'metricas' && 'Métricas'}
            {pantalla === 'proyecto' && (proyectoActual?.name || 'Proyecto')}
            {pantalla === 'pantalla' && (pantallaWebActual?.nombre || 'Pantalla')}
            {pantalla === 'mail' && 'Mail'}
          </div>
          <div className="topbar-spacer" />
        </header>
        <main className="content" style={pantalla === 'pantalla' ? { maxWidth: 'none', display: 'flex', flexDirection: 'column' } : undefined}>
          {errorGeneral && <p role="alert" className="feedback-error">{errorGeneral} <button className="btn btn-sm" onClick={() => setErrorGeneral('')}>Cerrar</button></p>}
          {pantalla === 'hoy' && <Hoy key={revisionGoogle} abrirBandeja={() => setPantalla('bandeja')} abrirCalendario={() => setPantalla('agenda')} proyectos={proyectos} abrirProyecto={abrirProyecto} abrirMail={abrirMail} abrirMaria={() => setPantalla('maria')} />}
          {pantalla === 'bandeja' && <Bandeja revision={revisionGoogle} abrirMail={abrirMail} sincronizar={sincronizarGoogle} sincronizando={sincronizando} />}
          {pantalla === 'agenda' && <Agenda revision={revisionGoogle} proyectos={proyectos} sincronizar={sincronizarGoogle} sincronizando={sincronizando} />}
          {pantalla === 'flujo' && <Flujo proyectos={proyectos} pantallasWeb={pantallasWeb} abrirPantalla={abrirPantalla} />}
          {pantalla === 'maria' && <Maria />}
          {pantalla === 'metricas' && <Metricas />}
          {pantalla === 'proyecto' && proyectoActual && <ProyectoShell hoja={hojaProyecto} setHoja={setHojaProyecto} key={proyectoActual.id} abrirMail={abrirMail} proyecto={proyectoActual} recargarProyectos={cargarProyectos} />}
          {pantalla === 'pantalla' && pantallaWebActual && <Pantalla pantalla={pantallaWebActual} volver={() => setPantalla(pantallaOrigen)} />}
          {pantalla === 'mail' && mailId && <Mail gmailId={mailId} volver={() => setPantalla(mailOrigen)} />}
        </main>
      </div>

      <input ref={htmlInput} type="file" accept=".html,.htm,text/html" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) setHtmlLocal({ name: file.name, file }) }} />
      {htmlLocal && <VisorArchivo archivo={htmlLocal} cerrar={() => setHtmlLocal(null)} />}
      <BotFlotante key={session.user.id} abierto={botAbierto} setAbierto={setBotAbierto}
        texto={botTexto} setTexto={setBotTexto} mensajes={botMensajes} setMensajes={setBotMensajes}
        consultando={botConsultando} setConsultando={setBotConsultando}
        pantalla={pantalla} proyectoId={pantalla === 'proyecto' ? proyectoId : null} />

      {nuevoProyectoAbierto && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && !creando && setNuevoProyectoAbierto(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Nuevo proyecto</h3>
              <button className="close-x" disabled={creando} onClick={() => setNuevoProyectoAbierto(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Nombre</label>
                <input aria-label="Nombre del proyecto" disabled={creando} value={nuevoProyectoNombre} autoFocus onChange={e => setNuevoProyectoNombre(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && crearProyecto()} placeholder="Nombre del proyecto" />
              </div>
            </div>
            {errorProyecto && <p role="alert" className="feedback-error">{errorProyecto}</p>}
            <div className="modal-foot">
              <button className="btn" disabled={creando} onClick={() => setNuevoProyectoAbierto(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={creando || !nuevoProyectoNombre.trim()} onClick={crearProyecto}>{creando ? 'Creando…' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
