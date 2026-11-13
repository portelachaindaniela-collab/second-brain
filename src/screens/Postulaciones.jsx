import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, abrirEnlaceOAuth } from '../supabase.js'
import { CabeceraPantalla, Pie } from '../estructura.jsx'
import { ACCIONES, DIAS_SEGUIMIENTO, TRAMOS, agrupar, porTramo, tramoDe, coincide, nombreCv, esLink, esMail } from '../postulaciones.mjs'
import { PERIODOS, prepararFilas, porGrupoPuesto, enviadasPorPeriodo } from '../busquedaLaboral.mjs'
import './Postulaciones.css'

// Postulaciones: la planilla de Google Sheets de Daniela, resumida en números y barras. La planilla sigue siendo
// el lugar de carga; desde acá solo se cambia el Estado de una fila (función postulaciones).
// Poco texto: cada postulación es una línea (puesto, empresa, días o CV). El resto se ve al abrirla.

async function llamar(body) {
  const { data, error } = await supabase.functions.invoke('postulaciones', { body })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) return { ...r, error: r?.error || 'No se pudo hablar con Google Sheets.' }
  return r
}

const VISIBLES = 8

function Contacto({ valor }) {
  if (!valor) return null
  if (esLink(valor)) return <a href={valor} target="_blank" rel="noreferrer">{valor.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a>
  if (esMail(valor)) { const mail = valor.split(/[\s(]/)[0]; return <span><a href={`mailto:${mail}`}>{mail}</a>{valor.slice(mail.length)}</span> }
  return <span>{valor}</span>
}

// Una postulación = una línea. A la derecha va un solo dato: los días que lleva esperando, o el CV si falta mandarla.
function Fila({ p, abrir, dato }) {
  const lento = p.dias != null && p.dias >= DIAS_SEGUIMIENTO
  return <li>
    <button className="postu-fila" onClick={() => abrir(p)}>
      <span className="postu-fila-texto"><strong>{p.puesto || p.link || '(sin puesto)'}</strong>{p.empresa && <span>{p.empresa}</span>}</span>
      {dato === 'dias' && <span className={`postu-fila-dato${lento ? ' lento' : ''}`}>{p.dias == null ? '—' : `${p.dias} d`}</span>}
      {dato === 'cv' && p.cv && <span className="postu-fila-cv">{nombreCv(p.cv)}</span>}
    </button>
  </li>
}

function Lista({ filas, abrir, dato, vacio }) {
  const [todas, setTodas] = useState(false)
  if (!filas.length) return <p className="postu-vacio">{vacio}</p>
  const vistas = todas ? filas : filas.slice(0, VISIBLES)
  return <>
    <ul className="postu-lista">{vistas.map(p => <Fila key={p.fila} p={p} abrir={abrir} dato={dato} />)}</ul>
    {filas.length > VISIBLES && <button className="postu-mas" onClick={() => setTodas(t => !t)}>{todas ? 'Ver menos' : `Ver las ${filas.length}`}</button>}
  </>
}

// Barra única: de todo lo enviado, cuánto espera, cuánto respondió y cuánto rechazaron.
function Resultado({ g }) {
  const partes = [
    { clave: 'esperando', titulo: 'Esperando', n: g.esperando.length },
    { clave: 'respondieron', titulo: 'Respondieron', n: g.respondieron.length },
    { clave: 'rechazadas', titulo: 'Rechazadas', n: g.rechazadas.length },
  ]
  const total = partes.reduce((s, x) => s + x.n, 0)
  if (!total) return null
  return <div className="postu-resultado">
    <p className="postu-grafico-titulo">De {total} enviadas</p>
    <div className="postu-barra" role="img" aria-label={partes.map(x => `${x.titulo}: ${x.n}`).join(', ')}>
      {partes.filter(x => x.n).map(x => <span key={x.clave} className={`seg ${x.clave}`} style={{ flexGrow: x.n }} />)}
    </div>
    <ul className="postu-leyenda">
      {partes.map(x => <li key={x.clave}><strong>{x.n}</strong><span><span className={`postu-marca ${x.clave}`} />{x.titulo}</span></li>)}
    </ul>
  </div>
}

// Columnas por antigüedad de lo que espera. Tocar una filtra la lista de abajo.
function Antiguedad({ esperando, tramo, setTramo }) {
  const cuenta = porTramo(esperando)
  const max = Math.max(1, ...Object.values(cuenta))
  return <div className="postu-antiguedad">
    <p className="postu-grafico-titulo">Hace cuánto esperan</p>
    <div className="postu-columnas-graf" role="group" aria-label="Esperando por antigüedad">
      {TRAMOS.map(t => <button key={t.clave} className={`postu-col${tramo === t.clave ? ' activa' : ''}${t.clave === 'viejas' ? ' vieja' : ''}`}
        aria-pressed={tramo === t.clave} onClick={() => setTramo(tramo === t.clave ? '' : t.clave)}>
        <span className="postu-col-n">{cuenta[t.clave]}</span>
        <span className="postu-col-barra"><span style={{ height: `${(cuenta[t.clave] / max) * 100}%` }} /></span>
        <span className="postu-col-titulo">{t.titulo}</span>
      </button>)}
    </div>
  </div>
}

// Enviadas en el tiempo: columnas apiladas (rechazadas abajo, sin decisión arriba) por día, semana o mes.
function EnElTiempo({ filas }) {
  const [periodo, setPeriodo] = useState('mes')
  const { columnas } = useMemo(() => enviadasPorPeriodo(filas, periodo), [filas, periodo])
  const max = Math.max(1, ...columnas.map(c => c.rechazadas + c.sinDecision))
  const paso = Math.max(1, Math.ceil(columnas.length / 8))
  return <div className="postu-card">
    <div className="postu-card-cabecera">
      <p className="postu-grafico-titulo">Enviadas en el tiempo</p>
      <div className="postu-periodos" role="tablist" aria-label="Período">
        {PERIODOS.map(([v, t]) => <button key={v} role="tab" aria-selected={periodo === v} className={periodo === v ? 'activo' : ''} onClick={() => setPeriodo(v)}>{t}</button>)}
      </div>
    </div>
    {columnas.length ? <div className="postu-tiempo" role="img" aria-label={columnas.map(c => `${c.etiqueta.join(' ')}: ${c.rechazadas + c.sinDecision}`).join(', ')}>
      {columnas.map((c, i) => { const n = c.rechazadas + c.sinDecision; return <div key={c.clave} className="postu-tiempo-col" title={`${c.etiqueta.join(' ')}: ${n} (${c.rechazadas} rechazadas)`}>
        <span className="postu-tiempo-n">{n || ''}</span>
        <span className="postu-tiempo-barra">
          <span className="seg esperando" style={{ height: `${(c.sinDecision / max) * 100}%` }} />
          <span className="seg rechazadas" style={{ height: `${(c.rechazadas / max) * 100}%` }} />
        </span>
        <span className="postu-tiempo-etiqueta">{(columnas.length - 1 - i) % paso ? '' : c.etiqueta[0]}</span>
      </div> })}
    </div> : <p className="postu-vacio">Todavía no hay enviadas con fecha.</p>}
    {columnas.length > 0 && <ul className="postu-tiempo-leyenda">
      <li><i className="seg esperando" />Esperando</li>
      <li><i className="seg rechazadas" />Rechazadas</li>
    </ul>}
  </div>
}

// Enviadas por tipo de puesto: una barra por grupo, partida en rechazadas y sin decisión.
function PorPuesto({ filas }) {
  const grupos = useMemo(() => porGrupoPuesto(filas), [filas])
  const max = Math.max(1, ...grupos.map(g => g.enviadas))
  return <div className="postu-card">
    <p className="postu-grafico-titulo">Por tipo de puesto</p>
    {grupos.length ? <ul className="postu-puestos">
      {grupos.map(g => <li key={g.grupo} title={`${g.enviadas} enviadas, ${g.rechazadas} rechazadas`}>
        <span className="postu-puesto-nombre">{g.grupo}</span>
        <span className="postu-puesto-barra" style={{ width: `${(g.enviadas / max) * 100}%` }}>
          <span className="seg rechazadas" style={{ flexGrow: g.rechazadas }} /><span className="seg esperando" style={{ flexGrow: g.sinDecision }} />
        </span>
        <strong>{g.enviadas}</strong>
      </li>)}
    </ul> : <p className="postu-vacio">Todavía no hay enviadas.</p>}
  </div>
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
  const [tramo, setTramo] = useState('')
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
  const g = useMemo(() => agrupar(filas), [filas])
  const preparadas = useMemo(() => prepararFilas(filas), [filas])
  const filtrar = lista => lista.filter(p => coincide(p, busqueda))
  // Para hacer: primero las verdes.
  const hacer = filtrar(g.hacer)
  const esperando = filtrar(g.esperando).filter(p => !tramo || tramoDe(p.dias) === tramo)
  const respondieron = filtrar(g.respondieron)
  const cerradas = filtrar([...g.rechazadas, ...g.cerradas]).sort((a, b) => b.fila - a.fila)
  const listo = estado?.conectado && estado?.elegida && datos
  const tituloTramo = TRAMOS.find(t => t.clave === tramo)?.titulo

  return <div className="postu">
    <CabeceraPantalla sobretitulo="Búsqueda laboral" titulo="Postulaciones" cargando={cargando && !datos}
      cifras={listo ? [
        { valor: g.hacer.length, etiqueta: 'para hacer', nivel: g.hacer.length ? 'aviso' : undefined },
        { valor: g.esperando.length, etiqueta: 'esperando' },
        { valor: g.respondieron.length, etiqueta: 'respondieron' },
      ] : []} />

    {error && <p role="alert" className="feedback-error">{error} <button className="btn btn-sm" onClick={cargar}>Reintentar</button></p>}
    {cargando && !datos && !error && <p className="empty-state">Leyendo tu planilla…</p>}
    {!cargando && estado && !estado.error && !(estado.conectado && estado.elegida) && <Conexion estado={estado} recargar={cargar} />}

    {listo && <>
      <section className="postu-graficos">
        <Resultado g={g} />
        <Antiguedad esperando={g.esperando} tramo={tramo} setTramo={setTramo} />
        <EnElTiempo filas={preparadas} />
        <PorPuesto filas={preparadas} />
      </section>

      <div className="postu-grilla">
        <section className="postu-bloque">
          <h2>Para hacer <span>{hacer.length}</span></h2>
          <Lista filas={hacer} abrir={setAbierta} dato="cv" vacio="Nada pendiente." />
          {respondieron.length > 0 && <>
            <h2 className="postu-sub-h">Respondieron <span>{respondieron.length}</span></h2>
            <Lista filas={respondieron} abrir={setAbierta} vacio="" />
          </>}
        </section>

        <section className="postu-bloque">
          <h2>Esperando{tituloTramo && <> · {tituloTramo.toLowerCase()} <button className="postu-quitar" onClick={() => setTramo('')}>quitar filtro</button></>} <span>{esperando.length}</span></h2>
          <Lista key={tramo} filas={esperando} abrir={setAbierta} dato="dias" vacio="Nada en este tramo." />
        </section>
      </div>

      <div className="postu-buscar">
        <input aria-label="Buscar puesto o empresa" placeholder="Buscar puesto o empresa" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <section className="postu-cerradas">
        <button className="postu-cerradas-cabecera" aria-expanded={verCerradas} onClick={() => setVerCerradas(v => !v)}>
          <span><strong>Rechazadas y cerradas</strong> · {cerradas.length}</span><span className="btn btn-sm">{verCerradas ? 'Ocultar' : 'Ver'}</span>
        </button>
        {verCerradas && <div className="postu-cerradas-cuerpo"><Lista filas={cerradas} abrir={setAbierta} vacio="Nada acá." /></div>}
      </section>
    </>}

    {datos && <Pie titulo="Planilla" resumen={`${datos.titulo} · ${filas.length} filas`}
      boton={cargando ? 'Leyendo…' : 'Recargar'} onBoton={cargar} ocupado={cargando} />}
    {datos?.url && <p className="postu-nota"><a href={datos.url} target="_blank" rel="noreferrer">Abrir la planilla en Google Sheets</a></p>}

    {abierta && <Detalle key={abierta.fila} p={abierta} cerrar={() => setAbierta(null)} cambiar={cambiar} />}
  </div>
}
