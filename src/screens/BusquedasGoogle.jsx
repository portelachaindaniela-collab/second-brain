import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, abrirEnlaceOAuth } from '../supabase.js'
import { CabeceraPantalla, Pie } from '../estructura.jsx'
import { rangos, ultimoDia, resumen, comparar, serie, cambios, formatoNumero, rutaDePagina, sumarDias } from '../busquedasGoogle.mjs'
import './BusquedasGoogle.css'

// Búsquedas en Google: la copia de Search Console de los sitios de Daniela (función search-console, cada 6 horas).

const PERIODOS = [{ dias: 7, etiqueta: '7 días' }, { dias: 28, etiqueta: '28 días' }, { dias: 90, etiqueta: '3 meses' }]
const pct = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 })
const dec = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const fechaCorta = s => new Date(`${s}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '')

async function llamar(body) {
  const { data, error } = await supabase.functions.invoke('search-console', { body })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) return { ...r, error: r?.error || 'No se pudo hablar con Search Console.' }
  return r
}

function Variacion({ valor, tipo }) {
  if (valor == null) return <span className="bg-var">—</span>
  const sube = valor > 0.0005, baja = valor < -0.0005
  const texto = !sube && !baja ? 'igual'
    : tipo === 'posicion' ? (sube ? `mejoró ${dec.format(valor)}` : `empeoró ${dec.format(-valor)}`)
    : tipo === 'ctr' ? `${sube ? '+' : '−'}${dec.format(Math.abs(valor) * 100)} pts` : `${Math.round(Math.abs(valor) * 100)}%`
  return <span className={`bg-var${sube ? ' sube' : baja ? ' baja' : ''}`}>{sube ? '▲ ' : baja ? '▼ ' : ''}{texto}</span>
}

function Grafico({ puntos }) {
  if (!puntos.length) return null
  const W = 640, H = 150, P = 8
  const maxC = Math.max(1, ...puntos.map(p => p.clics)), maxI = Math.max(1, ...puntos.map(p => p.impresiones))
  const x = i => P + (puntos.length === 1 ? 0 : (i * (W - 2 * P)) / (puntos.length - 1))
  const linea = (campo, max) => puntos.map((p, i) => `${x(i).toFixed(1)},${(H - P - (p[campo] / max) * (H - 2 * P)).toFixed(1)}`).join(' ')
  return <div className="bg-grafico">
    <div className="bg-leyenda"><span className="clics">Clics · máx. {formatoNumero(maxC)}/día</span><span className="impresiones">Impresiones · máx. {formatoNumero(maxI)}/día</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Clics e impresiones por día del ${fechaCorta(puntos[0].fecha)} al ${fechaCorta(puntos.at(-1).fecha)}`}>
      <line x1="0" y1={H - P} x2={W} y2={H - P} className="eje" />
      <polyline points={linea('impresiones', maxI)} className="impresiones" />
      <polyline points={linea('clics', maxC)} className="clics" />
    </svg>
    <div className="bg-fechas"><span>{fechaCorta(puntos[0].fecha)}</span><span>{fechaCorta(puntos.at(-1).fecha)}</span></div>
  </div>
}

function Tabla({ titulo, filas, nombre, etiqueta = c => c }) {
  return <section className="bg-tabla">
    <h2>{titulo}</h2>
    {!filas.length ? <p className="bg-vacio">Todavía no hay datos.</p> : <table>
      <thead><tr><th>{nombre}</th><th>Clics</th><th>Impr.</th><th>Pos.</th></tr></thead>
      <tbody>{filas.map(f => <tr key={f.clave}><td title={f.clave}>{etiqueta(f.clave)}</td><td>{formatoNumero(f.clics)}</td><td>{formatoNumero(f.impresiones)}</td><td>{f.posicion == null ? '—' : dec.format(f.posicion)}</td></tr>)}</tbody>
    </table>}
  </section>
}

function Aviso({ a, etiquetaPagina }) {
  const nombre = a.tipo === 'pagina' ? etiquetaPagina(a.clave) : `"${a.clave}"`
  return <li className={a.sube ? 'sube' : 'baja'}>
    <span aria-hidden="true">{a.sube ? '▲' : '▼'}</span>
    {a.tipo === 'nueva' && <> Búsqueda nueva: {nombre} ({formatoNumero(a.impresiones)} impresiones)</>}
    {a.tipo === 'posicion' && <> {nombre} pasó de la posición {dec.format(a.de)} a la {dec.format(a.a)}{a.clics ? ` (${a.clics > 0 ? '+' : ''}${a.clics} clics)` : ''}</>}
    {a.tipo === 'pagina' && <> {nombre} perdió {Math.round(a.caida * 100)}% de los clics</>}
  </li>
}

export default function BusquedasGoogle() {
  const [estado, setEstado] = useState(null)
  const [sitios, setSitios] = useState([])
  const [dias, setDias] = useState([])
  const [elegido, setElegido] = useState('todos')
  const [periodo, setPeriodo] = useState(28)
  const [tops, setTops] = useState({ busquedas: [], paginas: [], avisos: [] })
  const [cargando, setCargando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [error, setError] = useState('')
  const [nota, setNota] = useState('')
  const primeraCopia = useRef(false)

  const cargarBase = useCallback(async () => {
    const desde = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10)
    const [s, d] = await Promise.all([
      supabase.from('search_console_sitios').select('site_url,nombre,sincronizado_at,ultimo_error').order('nombre'),
      supabase.from('search_console_dias').select('site_url,fecha,clics,impresiones,posicion').gte('fecha', desde).order('fecha').limit(5000),
    ])
    if (s.error || d.error) { setError((s.error || d.error).message); return [] }
    setSitios(s.data || []); setDias(d.data || [])
    return s.data || []
  }, [])

  const sincronizar = useCallback(async () => {
    setSincronizando(true); setNota('')
    const r = await llamar({ accion: 'sincronizar' })
    setSincronizando(false)
    if (r.error) { setNota(r.error); if (r.conectar) setEstado(e => ({ ...e, conectado: false })) }
    else setNota(r.sitios?.some(x => x.error) ? r.sitios.filter(x => x.error).map(x => `${x.sitio}: ${x.error}`).join(' · ') : 'Copiado.')
    await cargarBase()
  }, [cargarBase])

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const e = await llamar({ accion: 'estado' })
    setEstado(e)
    if (e.error) setError(e.error)
    else if (e.conectado) {
      const s = await cargarBase()
      // Recién conectado: la primera copia se hace al entrar, sin esperar al cron.
      if (!primeraCopia.current && !s.some(x => x.sincronizado_at)) { primeraCopia.current = true; await sincronizar() }
    }
    setCargando(false)
  }, [cargarBase, sincronizar])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    if (!estado || estado.conectado) return
    const alVolver = () => cargar()
    window.addEventListener('focus', alVolver)
    return () => window.removeEventListener('focus', alVolver)
  }, [estado, cargar])

  const urls = useMemo(() => elegido === 'todos' ? sitios.map(s => s.site_url) : [elegido], [elegido, sitios])
  const filas = useMemo(() => dias.filter(d => urls.includes(d.site_url)), [dias, urls])
  const hasta = ultimoDia(filas) || ultimoDia(dias)
  const r = hasta ? rangos(hasta, periodo) : null

  useEffect(() => {
    if (!hasta || !urls.length) return
    let vivo = true
    const { actual } = rangos(hasta, periodo)
    const semana = rangos(hasta, 7)
    const top = (rango, tipo, limite) => supabase.rpc('search_console_top', { p_sitios: urls, p_desde: rango.desde, p_hasta: rango.hasta, p_tipo: tipo, p_limite: limite }).then(x => x.data || [])
    Promise.all([top(actual, 'busqueda', 10), top(actual, 'pagina', 10), top(semana.actual, 'busqueda', 300), top(semana.anterior, 'busqueda', 300), top(semana.actual, 'pagina', 300), top(semana.anterior, 'pagina', 300)])
      .then(([busquedas, paginas, b1, b0, p1, p0]) => { if (vivo) setTops({ busquedas, paginas, avisos: cambios({ busquedas: b1, busquedasAntes: b0, paginas: p1, paginasAntes: p0 }) }) })
    return () => { vivo = false }
  }, [hasta, periodo, urls])

  async function conectar() {
    const x = await llamar({ accion: 'conectar' })
    if (x.error) setError(x.error); else abrirEnlaceOAuth(x.url)
  }

  // Con varios sitios juntos, cada página dice de qué sitio es (si no, los dos inicios se ven iguales).
  const etiquetaPagina = url => {
    const ruta = rutaDePagina(url)
    if (urls.length < 2) return ruta
    const sitio = sitios.find(x => url.startsWith(x.site_url.replace(/\/$/, '')))
    return sitio ? `${sitio.nombre} · ${ruta}` : ruta
  }
  const actual = r ? resumen(filas, r.actual) : null
  const variacion = r ? comparar(actual, resumen(filas, r.anterior)) : null
  const ultimaCopia = sitios.map(s => s.sincronizado_at).filter(Boolean).sort().at(-1)
  const errores = sitios.filter(s => s.ultimo_error)

  return <div className="busquedas-google">
    <CabeceraPantalla sobretitulo="Métricas · Search Console" titulo="Búsquedas en Google" cargando={cargando} />
    {error && <p role="alert" className="feedback-error">{error} <button className="btn btn-sm" onClick={cargar}>Reintentar</button></p>}

    {estado && !estado.error && !estado.conectado && <div className="bg-conexion">
      {!estado.google ? <p>Primero conectá Google desde el menú (Conectar Google).</p> : <>
        <p>Para traer los clics, impresiones y búsquedas de tus sitios, Google tiene que darle permiso a Second brain para leer tu Search Console. Es solo lectura y se hace una sola vez.</p>
        <div className="bg-acciones"><button className="btn btn-primary" onClick={conectar}>Conectar Search Console</button><button className="btn" onClick={cargar}>Ya lo autoricé</button></div>
      </>}
    </div>}

    {estado?.conectado && <>
      <div className="bg-barra">
        <div className="bg-chips" role="group" aria-label="Sitio">
          {sitios.map(s => <button key={s.site_url} className={elegido === s.site_url ? 'activo' : ''} aria-pressed={elegido === s.site_url} onClick={() => setElegido(s.site_url)}>{s.nombre}</button>)}
          {sitios.length > 1 && <button className={elegido === 'todos' ? 'activo' : ''} aria-pressed={elegido === 'todos'} onClick={() => setElegido('todos')}>Todos juntos</button>}
        </div>
        <div className="bg-chips" role="group" aria-label="Período">
          {PERIODOS.map(p => <button key={p.dias} className={periodo === p.dias ? 'activo' : ''} aria-pressed={periodo === p.dias} onClick={() => setPeriodo(p.dias)}>{p.etiqueta}</button>)}
        </div>
      </div>

      {sincronizando && !dias.length && <p className="empty-state">Trayendo los últimos 90 días de Search Console…</p>}
      {!sincronizando && !hasta && !cargando && <p className="empty-state">Search Console todavía no tiene datos de estos sitios. Si los diste de alta hace poco, Google tarda unos días en empezar a mostrar números.</p>}

      {r && actual && <>
        <p className="bg-periodo">Del {fechaCorta(r.actual.desde)} al {fechaCorta(r.actual.hasta)} · comparado con los {periodo} días anteriores</p>
        <dl className="bg-cifras">
          <div><dt>Clics</dt><dd>{formatoNumero(actual.clics)}</dd><Variacion valor={variacion.clics} /></div>
          <div><dt>Impresiones</dt><dd>{formatoNumero(actual.impresiones)}</dd><Variacion valor={variacion.impresiones} /></div>
          <div><dt>CTR</dt><dd>{pct.format(actual.ctr)}</dd><Variacion valor={variacion.ctr} tipo="ctr" /></div>
          <div><dt>Posición prom.</dt><dd>{actual.posicion == null ? '—' : dec.format(actual.posicion)}</dd><Variacion valor={variacion.posicion} tipo="posicion" /></div>
        </dl>
        <Grafico puntos={serie(filas, r.actual)} />
        {tops.avisos.length > 0 && <section className="bg-cambios">
          <h2>Lo que cambió esta semana</h2>
          <ul>{tops.avisos.map(a => <Aviso key={`${a.tipo}-${a.clave}`} a={a} etiquetaPagina={etiquetaPagina} />)}</ul>
          <p className="bg-nota">Del {fechaCorta(sumarDias(hasta, -6))} al {fechaCorta(hasta)}, comparado con la semana anterior.</p>
        </section>}
        <div className="bg-tablas">
          <Tabla titulo="Búsquedas principales" filas={tops.busquedas} nombre="Búsqueda" />
          <Tabla titulo="Páginas principales" filas={tops.paginas} nombre="Página" etiqueta={etiquetaPagina} />
        </div>
      </>}

      <Pie titulo="Search Console" resumen={`${hasta ? `datos hasta el ${fechaCorta(hasta)} (Google tarda 2 o 3 días)` : 'sin datos todavía'}${ultimaCopia ? ` · copiado ${new Date(ultimaCopia).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`}
        boton={sincronizando ? 'Copiando…' : 'Copiar ahora'} onBoton={sincronizar} ocupado={sincronizando}
        nota={nota || (errores.length ? errores.map(s => `${s.nombre}: ${s.ultimo_error}`).join(' · ') : '')} />
    </>}
  </div>
}
