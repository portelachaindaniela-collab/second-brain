import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, abrirEnlaceOAuth } from '../supabase.js'
import { CabeceraPantalla, Pie } from '../estructura.jsx'
import { GRUPOS, ACCIONES, DIAS_SEGUIMIENTO, agrupar, faltaEnviar, semaforoDe, coincide, nombreCv, grupoDe, esLink, esMail } from '../postulaciones.mjs'
import './Postulaciones.css'

// Postulaciones: la planilla de Google Sheets de Daniela ordenada por lo que hay que hacer. La planilla sigue siendo
// el lugar de carga; desde acá solo se cambia el Estado de una fila (función postulaciones).

async function llamar(body) {
  const { data, error } = await supabase.functions.invoke('postulaciones', { body })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) return { ...r, error: r?.error || 'No se pudo hablar con Google Sheets.' }
  return r
}

const SEMAFOROS = ['verde', 'amarillo', 'rojo', 'negro']

function Contacto({ valor }) {
  if (!valor) return null
  if (esLink(valor)) return <a href={valor} target="_blank" rel="noreferrer">{valor.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a>
  if (esMail(valor)) { const mail = valor.split(/[\s(]/)[0]; return <span><a href={`mailto:${mail}`}>{mail}</a>{valor.slice(mail.length)}</span> }
  return <span>{valor}</span>
}

function Tarjeta({ p, abrir, destacada }) {
  const color = semaforoDe(p.semaforo)
  const lento = p.dias != null && p.dias >= DIAS_SEGUIMIENTO && grupoDe(p.estado) === 'esperando'
  return <button className={`postu-tarjeta${destacada ? ' destacada' : ''}`} onClick={() => abrir(p)}>
    <span className="postu-titulo">{color && <span className={`postu-punto ${color}`} aria-label={`semáforo ${color}`} />}{p.puesto || '(sin puesto)'}</span>
    <span className="postu-sub">{[p.empresa, p.zona].filter(Boolean).join(' · ') || p.link}</span>
    {grupoDe(p.estado) === 'esperando'
      ? <span className={lento ? 'postu-dias lento' : 'postu-dias'}>{p.dias == null ? 'Sin fecha' : p.dias === 0 ? 'Hoy' : `${p.dias} ${p.dias === 1 ? 'día' : 'días'}`}{lento && ' sin respuesta · ¿seguimiento?'}</span>
      : <span className="postu-estado">{p.estado || 'Sin estado'}</span>}
    {(p.cv || p.fuente) && <span className="postu-chips">{p.cv && <span className="postu-chip">CV {nombreCv(p.cv)}</span>}{p.fuente && <span className="postu-chip">{p.fuente}</span>}</span>}
  </button>
}

function Detalle({ p, cerrar, cambiar }) {
  const [texto, setTexto] = useState(p.estado)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  async function guardar(estado) {
    if (!estado.trim()) { setError('Escribí un estado.'); return }
    setOcupado(true); setError('')
    const r = await cambiar(p, estado.trim())
    setOcupado(false)
    if (r.error) setError(r.error); else cerrar()
  }
  return <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && !ocupado && cerrar()}>
    <div className="modal" role="dialog" aria-label={p.puesto}>
      <div className="modal-head"><h3>{p.puesto || '(sin puesto)'}</h3><button className="btn btn-sm" onClick={cerrar} disabled={ocupado}>Cerrar</button></div>
      <div className="modal-body postu-detalle">
        <dl>
          {[['Empresa', p.empresa], ['Zona / modalidad', p.zona], ['Fecha', p.fecha], ['Fuente', p.fuente], ['CV a usar', p.cv], ['Semáforo', p.semaforo]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          {p.link && <div><dt>Link o contacto</dt><dd><Contacto valor={p.link} /></dd></div>}
          {p.porque && <div className="ancho"><dt>Por qué</dt><dd>{p.porque}</dd></div>}
        </dl>
        <div className="postu-cambiar">
          <p className="postu-estado-actual">Estado: <strong>{p.estado || 'sin estado'}</strong></p>
          <div className="postu-acciones">{ACCIONES.map(a => <button key={a.clave} className={a.clave === 'postulada' ? 'btn btn-primary' : 'btn'} disabled={ocupado} onClick={() => guardar(a.texto(new Date()))}>{a.etiqueta}</button>)}</div>
          <label className="field"><span>U otro estado</span>
            <span className="postu-otro"><input value={texto} onChange={e => { setTexto(e.target.value); setError('') }} placeholder="Entrevista el jueves 23/10" /><button className="btn" disabled={ocupado || texto === p.estado} onClick={() => guardar(texto)}>{ocupado ? 'Guardando…' : 'Guardar'}</button></span>
          </label>
          {error && <p role="alert" className="feedback-error">{error}</p>}
          <p className="postu-nota">Se escribe en la columna Estado de tu planilla.</p>
        </div>
      </div>
    </div>
  </div>
}

function Conexion({ estado, recargar }) {
  const [hoja, setHoja] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function conectar() {
    setOcupado(true); setMensaje('')
    const r = await llamar({ accion: 'conectar' })
    setOcupado(false)
    if (r.error) setMensaje(r.error); else abrirEnlaceOAuth(r.url)
  }
  async function elegir() {
    setOcupado(true); setMensaje('')
    const r = await llamar({ accion: 'elegir', hoja })
    setOcupado(false)
    if (r.error) setMensaje(r.error); else recargar()
  }
  return <div className="postu-conexion">
    {!estado.google ? <p>Primero conectá Google desde el menú (Conectar Google).</p>
      : !estado.conectado ? <>
        <p>Para leer tu planilla y cambiar el estado desde acá, Google tiene que darle permiso a Second brain para usar tus hojas de cálculo. Se hace una sola vez.</p>
        <div className="postu-acciones"><button className="btn btn-primary" disabled={ocupado} onClick={conectar}>Conectar planilla</button><button className="btn" onClick={recargar}>Ya lo autoricé</button></div>
      </> : <>
        <p>Pegá el link de tu planilla de postulaciones.</p>
        <span className="postu-otro"><input value={hoja} onChange={e => setHoja(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" /><button className="btn btn-primary" disabled={ocupado || !hoja.trim()} onClick={elegir}>Usar esta planilla</button></span>
      </>}
    {mensaje && <p role="alert" className="feedback-error">{mensaje}</p>}
  </div>
}

export default function Postulaciones() {
  const [estado, setEstado] = useState(null)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [semaforo, setSemaforo] = useState('')
  const [cv, setCv] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [verCerradas, setVerCerradas] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const e = await llamar({ accion: 'estado' })
    setEstado(e)
    if (!e.error && e.conectado && e.elegida) {
      const r = await llamar({ accion: 'leer' })
      if (r.error) setError(r.error); else setDatos(r)
    } else if (e.error) setError(e.error)
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  // Al volver de autorizar en el navegador, se vuelve a mirar el permiso.
  useEffect(() => {
    if (!estado || (estado.conectado && estado.elegida)) return
    const alVolver = () => cargar()
    window.addEventListener('focus', alVolver)
    return () => window.removeEventListener('focus', alVolver)
  }, [estado, cargar])

  async function cambiar(p, nuevo) {
    const r = await llamar({ accion: 'cambiar', fila: p.fila, puesto: p.puesto, empresa: p.empresa, estado: nuevo })
    if (r.error) { if (r.recargar) cargar(); return r }
    setDatos(d => ({ ...d, filas: d.filas.map(f => f.fila === p.fila ? { ...f, estado: nuevo } : f) }))
    return r
  }

  const filas = useMemo(() => datos?.filas || [], [datos])
  const cvs = useMemo(() => [...new Set(filas.filter(p => grupoDe(p.estado) !== 'cerradas').map(p => nombreCv(p.cv)).filter(Boolean))].sort(), [filas])
  const visibles = filas.filter(p => coincide(p, busqueda) && (!semaforo || semaforoDe(p.semaforo) === semaforo) && (!cv || nombreCv(p.cv) === cv))
  const grupos = agrupar(visibles)
  const todas = agrupar(filas)
  const pendientes = faltaEnviar(filas)
  const listo = estado?.conectado && estado?.elegida && datos

  return <div>
    <CabeceraPantalla sobretitulo="Búsqueda laboral" titulo="Postulaciones" cargando={cargando && !datos}
      cifras={listo ? [
        { valor: todas.hacer.length, etiqueta: 'para hacer', nivel: todas.hacer.length ? 'aviso' : undefined },
        { valor: todas.esperando.length, etiqueta: 'esperando' },
        { valor: todas.respondieron.length, etiqueta: 'respondieron' },
      ] : []} />

    {error && <p role="alert" className="feedback-error">{error} <button className="btn btn-sm" onClick={cargar}>Reintentar</button></p>}
    {cargando && !datos && !error && <p className="empty-state">Leyendo tu planilla…</p>}
    {!cargando && estado && !estado.error && !(estado.conectado && estado.elegida) && <Conexion estado={estado} recargar={cargar} />}

    {listo && <>
      {pendientes.length > 0 && <section className="postu-falta">
        <h2>Lo que falta enviar · empezá por acá</h2>
        <div className="postu-falta-lista">{pendientes.slice(0, 6).map(p => <Tarjeta key={p.fila} p={p} abrir={setAbierta} destacada />)}</div>
        {pendientes.length > 6 && <p className="postu-nota">Y {pendientes.length - 6} más en Para hacer.</p>}
      </section>}

      <div className="postu-filtros">
        <input aria-label="Buscar puesto o empresa" placeholder="Buscar puesto o empresa" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="postu-chips-filtro semaforos" role="group" aria-label="Semáforo">
          <button className={!semaforo ? 'activo' : ''} onClick={() => setSemaforo('')}>Todos</button>
          {SEMAFOROS.map(s => <button key={s} className={semaforo === s ? 'activo' : ''} aria-pressed={semaforo === s} onClick={() => setSemaforo(semaforo === s ? '' : s)}><span className={`postu-punto ${s}`} />{s}</button>)}
        </div>
        {cvs.length > 1 && <div className="postu-chips-filtro" role="group" aria-label="CV">
          {cvs.map(c => <button key={c} className={cv === c ? 'activo' : ''} aria-pressed={cv === c} onClick={() => setCv(cv === c ? '' : c)}>CV {c}</button>)}
        </div>}
      </div>

      <div className="postu-columnas">
        {GRUPOS.filter(g => g.clave !== 'cerradas').map(g => <section key={g.clave} className="postu-columna">
          <h2>{g.titulo}<span>{grupos[g.clave].length}</span></h2>
          {grupos[g.clave].length ? grupos[g.clave].map(p => <Tarjeta key={p.fila} p={p} abrir={setAbierta} />) : <p className="postu-vacio">Nada acá.</p>}
        </section>)}
      </div>

      <section className="postu-cerradas">
        <button className="postu-cerradas-cabecera" aria-expanded={verCerradas} onClick={() => setVerCerradas(v => !v)}>
          <span><strong>Descartadas y cerradas</strong> · {grupos.cerradas.length}</span><span className="btn btn-sm">{verCerradas ? 'Ocultar' : 'Ver'}</span>
        </button>
        {verCerradas && <div className="postu-cerradas-lista">{grupos.cerradas.map(p => <Tarjeta key={p.fila} p={p} abrir={setAbierta} />)}</div>}
      </section>
    </>}

    {datos && <Pie titulo="Planilla" resumen={`${datos.titulo}${datos.pestana ? ` · pestaña ${datos.pestana}` : ''} · ${filas.length} postulaciones`}
      boton={cargando ? 'Leyendo…' : 'Recargar'} onBoton={cargar} ocupado={cargando} />}
    {datos?.url && <p className="postu-nota"><a href={datos.url} target="_blank" rel="noreferrer">Abrir la planilla en Google Sheets</a></p>}

    {abierta && <Detalle key={abierta.fila} p={abierta} cerrar={() => setAbierta(null)} cambiar={cambiar} />}
  </div>
}
