import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { supabase, abrirEnlaceOAuth } from './supabase.js'
import Hoy from './screens/Hoy.jsx'
import Flujo from './screens/Flujo.jsx'
import ProyectoShell from './screens/proyecto/ProyectoShell.jsx'
import Pantalla from './screens/Pantalla.jsx'
import Mail from './screens/Mail.jsx'
import Metricas from './screens/Metricas.jsx'
import Cursos from './screens/Cursos.jsx'
import Trabajadores from './screens/Trabajadores.jsx'
import Eventos from './screens/Eventos.jsx'
import Login from './Login.jsx'
import BotFlotante from './BotFlotante.jsx'
import MailCalendario from './screens/MailCalendario.jsx'
import VisorArchivo from './screens/VisorArchivo.jsx'
import { TRABAJADOR_GOOGLE, estadoGoogle, debeSincronizarAlAbrir } from './googleEstado.mjs'

const Escritor = lazy(() => import('./screens/Escritor.jsx'))
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
  const [mailCalTab, setMailCalTab] = useState('calendario')
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
  const [errorSync, setErrorSync] = useState('')
  const corridaGoogleVista = useRef(null)
  const [nuevoProyectoAbierto, setNuevoProyectoAbierto] = useState(false)
  const [nuevoProyectoNombre, setNuevoProyectoNombre] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [pantallasVisitadas, setPantallasVisitadas] = useState(() => new Set(['hoy']))

  useEffect(() => { setPantallasVisitadas(prev => prev.has(pantalla) ? prev : new Set(prev).add(pantalla)) }, [pantalla])

  useEffect(() => {
    function leerEnVozAlta(texto) {
      if (!texto || !('speechSynthesis' in window)) return
      const u = new SpeechSynthesisUtterance(texto)
      u.lang = 'es-AR'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    }
    const params = new URLSearchParams(window.location.search)
    const desdeUrl = params.get('resumen')
    if (desdeUrl) {
      leerEnVozAlta(desdeUrl)
      params.delete('resumen')
      const resto = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (resto ? `?${resto}` : ''))
    }
    function alMensaje(e) { if (e.data?.tipo === 'leer-resumen') leerEnVozAlta(e.data.texto) }
    navigator.serviceWorker?.addEventListener('message', alMensaje)
    return () => navigator.serviceWorker?.removeEventListener('message', alMensaje)
  }, [])

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

  // La sincronización periódica la hace el trabajador google_sync en el servidor (cada 15 min). La app no
  // sincroniza en ciclo: toma el estado de sus corridas y refresca las pantallas cuando termina una.
  const aplicarCorridaGoogle = useCallback(c => {
    if (!c || c.estado === 'corriendo') return
    const clave = `${c.id}:${c.estado}`
    if (corridaGoogleVista.current === clave) return
    corridaGoogleVista.current = clave
    const estado = estadoGoogle([c])
    if (estado) setGoogle(estado)
    if (c.estado === 'ok') setRevisionGoogle(r => r + 1)
  }, [])

  const ultimasCorridasGoogle = useCallback(async limite => {
    const { data } = await supabase.from('trabajos_corridas').select('*').eq('trabajador', TRABAJADOR_GOOGLE)
      .order('iniciado_at', { ascending: false }).limit(limite)
    return data || []
  }, [])

  // Disparo puntual (al abrir si está vieja, "Sincronizar ahora", o al terminar de conectar la cuenta), no un ciclo.
  const sincronizarGoogle = useCallback(async origen => {
    setSincronizando(true); setErrorSync('')
    const { data, error } = await supabase.functions.invoke('google-sync', { body: { origen } })
    setSincronizando(false)
    if (error || data?.error) setErrorSync('No se pudo sincronizar Google. Probá nuevamente.')
    // Por si el aviso en vivo no llegó: se lee la corrida recién terminada.
    aplicarCorridaGoogle((await ultimasCorridasGoogle(1))[0])
  }, [aplicarCorridaGoogle, ultimasCorridasGoogle])

  useEffect(() => { cargarProyectos(); cargarPantallas() }, [cargarProyectos, cargarPantallas])

  useEffect(() => {
    if (!session) return
    let vigente = true
    ultimasCorridasGoogle(10).then(corridas => {
      if (!vigente) return
      setGoogle(estadoGoogle(corridas))
      const terminada = corridas.find(c => c.estado !== 'corriendo')
      if (terminada) corridaGoogleVista.current = `${terminada.id}:${terminada.estado}`
      if (debeSincronizarAlAbrir(corridas[0])) sincronizarGoogle('app_arranque')
    })
    return () => { vigente = false }
  }, [session, ultimasCorridasGoogle, sincronizarGoogle])

  useEffect(() => {
    if (!session) return
    const canal = supabase.channel('google-sync-app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos_corridas', filter: `trabajador=eq.${TRABAJADOR_GOOGLE}` }, p => aplicarCorridaGoogle(p.new))
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [session, aplicarCorridaGoogle])

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
    let respuesta = data
    if (error?.context) { try { respuesta = await error.context.json() } catch { /* se muestra el error de conexión */ } }
    if (error || !respuesta?.url) { setErrorGeneral(respuesta?.error || 'No se pudo conectar Google. Probá nuevamente.'); return }
    // Al volver de autorizar en Google (otra ventana en Electron, o la misma pestaña en el
    // navegador) nada le avisaba a la app que ya estaba conectada — quedaba mostrando "Conectar
    // Google" hasta que entrabas a Mail o Calendario y tocabas Sincronizar ahí a mano.
    const revisarAlVolver = () => { window.removeEventListener('focus', revisarAlVolver); sincronizarGoogle('app_manual') }
    window.addEventListener('focus', revisarAlVolver)
    abrirEnlaceOAuth(respuesta.url)
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
          <li><button className={`nav-item${pantalla === 'mailcal' ? ' active' : ''}`} onClick={() => setPantalla('mailcal')}>Mail y Calendario</button></li>
          <li><button className="nav-item" onClick={() => setPantalla('escribir')}>Escribir</button></li>
          <li><button className={`nav-item${pantalla === 'trabajadores' ? ' active' : ''}`} onClick={() => setPantalla('trabajadores')}>Trabajadores</button></li>
          <li><button className={`nav-item${pantalla === 'eventos' ? ' active' : ''}`} onClick={() => setPantalla('eventos')}>Eventos</button></li>
          <li><button className={`nav-item${pantalla === 'metricas' ? ' active' : ''}`} onClick={() => setPantalla('metricas')}>Métricas</button></li>
          <li><button className={`nav-item${pantalla === 'cursos' ? ' active' : ''}`} onClick={() => setPantalla('cursos')}>Cursos</button></li>
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
            <div>Google conectado{google.cuenta ? ` · ${google.cuenta}` : ''}</div>
          ) : google && (
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
            {pantalla === 'mailcal' && 'Mail y Calendario'}
            {pantalla === 'trabajadores' && 'Trabajadores'}
            {pantalla === 'eventos' && 'Eventos'}
            {pantalla === 'metricas' && 'Métricas'}
            {pantalla === 'cursos' && 'Cursos'}
            {pantalla === 'escribir' && 'Escribir'}
            {pantalla === 'proyecto' && (proyectoActual?.name || 'Proyecto')}
            {pantalla === 'pantalla' && (pantallaWebActual?.nombre || 'Pantalla')}
            {pantalla === 'mail' && 'Mail'}
          </div>
          <div className="topbar-spacer" />
        </header>
        <main className="content" style={pantalla === 'pantalla' ? { maxWidth: 'none', display: 'flex', flexDirection: 'column' } : undefined}>
          {errorGeneral && <p role="alert" className="feedback-error">{errorGeneral} <button className="btn btn-sm" onClick={() => setErrorGeneral('')}>Cerrar</button></p>}
          {pantallasVisitadas.has('hoy') && <div hidden={pantalla !== 'hoy'}><Hoy revision={revisionGoogle} ownerId={session.user.id} abrirBandeja={() => { setMailCalTab('mail'); setPantalla('mailcal') }} abrirCalendario={() => { setMailCalTab('calendario'); setPantalla('mailcal') }} proyectos={proyectos} abrirProyecto={abrirProyecto} abrirMail={abrirMail} /></div>}
          {pantallasVisitadas.has('mailcal') && <div hidden={pantalla !== 'mailcal'}><MailCalendario tab={mailCalTab} setTab={setMailCalTab} revision={revisionGoogle} proyectos={proyectos} google={google} conectarGoogle={conectarGoogle} abrirMail={abrirMail}
            sincronizar={() => sincronizarGoogle('app_manual')} sincronizando={sincronizando} errorSync={errorSync} /></div>}
          {pantallasVisitadas.has('flujo') && <div hidden={pantalla !== 'flujo'}><Flujo proyectos={proyectos} pantallasWeb={pantallasWeb} abrirPantalla={abrirPantalla} abrirHtml={() => htmlInput.current?.click()} /></div>}
          {pantallasVisitadas.has('trabajadores') && <div hidden={pantalla !== 'trabajadores'}><Trabajadores /></div>}
          {pantallasVisitadas.has('eventos') && <div hidden={pantalla !== 'eventos'}><Eventos /></div>}
          {pantallasVisitadas.has('metricas') && <div hidden={pantalla !== 'metricas'}><Metricas key={session.user.id} ownerId={session.user.id} /></div>}
          {pantallasVisitadas.has('cursos') && <div hidden={pantalla !== 'cursos'}><Cursos /></div>}
          {pantallasVisitadas.has('escribir') && <div hidden={pantalla !== 'escribir'}><Suspense fallback={<p className="empty-state">Abriendo el editor…</p>}><Escritor key={session.user.id} ownerId={session.user.id} /></Suspense></div>}
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
