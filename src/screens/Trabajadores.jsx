import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import {
  PRESETS_FRECUENCIA, describirFrecuencia, frecuenciaValida, duracionLegible, aplicarCorrida, parsearParametros,
  horaAR, fechaAR, franjaHoras, franjasPorDia, resumenFranja, trabada, contadores24h, sparkline, barraBloques, programaDe,
} from '../trabajadores.mjs'
import { colorIdentidad, alertas as calcularAlertas } from '../tablero.mjs'
import { detalleCorrida } from '../detalleCorrida.mjs'
import { Actividad, Salud, MapaFlujo } from './TableroTrabajadores.jsx'
import { CabeceraPantalla, Bloques, Bloque } from '../estructura.jsx'
import './Trabajadores.css'

// Todo sale de las tablas `trabajadores` (configuración) y `trabajos_corridas` (corridas):
// sumar un trabajador es sumar una fila y su Edge Function, sin tocar esta pantalla.
const VENTANA_MS = 24 * 3600_000
const ULTIMAS = 24
const MAX_EN_MEMORIA = 500
const TAIL = 40
const PAGINA_DETALLE = 500
const SALUD_CADA_MS = 5 * 60_000
const CLAVE_TAIL_ABIERTO = 'second-brain:trabajadores:tail-abierto'

// Preferencia de este dispositivo; si el navegador no deja guardar, arranca cerrado y listo.
function leerTailAbierto() {
  try { return localStorage.getItem(CLAVE_TAIL_ABIERTO) === '1' } catch { return false }
}
function guardarTailAbierto(abierto) {
  try { localStorage.setItem(CLAVE_TAIL_ABIERTO, abierto ? '1' : '0') } catch { /* sin almacenamiento: no se recuerda */ }
}
const ESTADO_TEXTO = { ok: 'ok', error: 'error', corriendo: 'corriendo', hueco: 'le tocaba correr y no corrió', libre: 'no le tocaba correr' }

function useCorridasEnVivo(canal, alCambiar) {
  useEffect(() => {
    const suscripcion = supabase.channel(canal)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos_corridas' }, p => { if (p.new?.id) alCambiar(p.new) })
      .subscribe()
    return () => { supabase.removeChannel(suscripcion) }
  }, [canal, alCambiar])
}

function useReloj() {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(reloj)
  }, [])
  return ahora
}

async function corridasRecientes(clave, ahora) {
  const base = () => supabase.from('trabajos_corridas').select('*').eq('trabajador', clave).order('iniciado_at', { ascending: false })
  const [ventana, ultimas] = await Promise.all([
    base().gte('iniciado_at', new Date(ahora - VENTANA_MS).toISOString()).limit(MAX_EN_MEMORIA),
    base().limit(ULTIMAS),
  ])
  return [...(ventana.data || []), ...(ultimas.data || [])].reduce((lista, c) => aplicarCorrida(lista, c, MAX_EN_MEMORIA), [])
}

function estadoCara(trabajador, ultima) {
  if (!trabajador.activo || !ultima) return 'pausado'
  return ultima.estado
}

// El color de identidad (antena, borde y base) dice quién es; la cara dice cómo está. Nunca al revés.
function Cara({ estado, color, nombre }) {
  return <svg className={`cara cara-${estado}`} style={{ '--id': colorIdentidad(color) }} viewBox="0 0 48 60" width="48" height="60"
    role="img" aria-label={`Robot${nombre ? ` de ${nombre}` : ''}: ${estado}`}>
    <line x1="24" y1="4" x2="24" y2="13" className="cara-trazo" />
    <circle cx="24" cy="4" r="3.2" className="cara-antena" />
    <rect x="5" y="13" width="38" height="36" rx="8" className="cara-cabeza" />
    {estado === 'ok' && <>
      <circle cx="17" cy="27" r="3.2" className="cara-relleno" />
      <circle cx="31" cy="27" r="3.2" className="cara-relleno" />
      <path d="M16 36 Q24 43 32 36" className="cara-trazo" />
    </>}
    {estado === 'corriendo' && <>
      <rect x="12.5" y="25.5" width="9" height="3.4" rx="1.7" className="cara-relleno" />
      <rect x="26.5" y="25.5" width="9" height="3.4" rx="1.7" className="cara-relleno" />
      {[18, 24, 30].map((x, i) => <circle key={x} cx={x} cy="39" r="1.8" className={`cara-relleno cara-punto cara-punto-${i}`} />)}
    </>}
    {estado === 'error' && <>
      <path d="M14 24 L20 30 M20 24 L14 30 M28 24 L34 30 M34 24 L28 30" className="cara-trazo" />
      <path d="M16 41 Q24 34 32 41" className="cara-trazo" />
    </>}
    {estado === 'pausado' && <path d="M13.5 27 H20.5 M27.5 27 H34.5" className="cara-trazo" />}
    <rect x="19" y="49" width="10" height="4" className="cara-cuello" />
    <rect x="9" y="53" width="30" height="5" rx="2.5" className="cara-base" />
  </svg>
}

function textoBloque(b) {
  const rango = `${horaAR(b.inicio)}–${horaAR(b.inicio + 3600_000)}`
  if (!b.corrida) return `${rango} · ${ESTADO_TEXTO[b.estado]}`
  const c = b.corrida
  return [rango, ESTADO_TEXTO[b.estado], c.cantidad_resultados != null ? `${c.cantidad_resultados} resultados` : null,
    c.duracion_ms != null ? duracionLegible(c.duracion_ms) : null, b.cantidad > 1 ? `${b.cantidad} corridas en la hora` : null].filter(Boolean).join(' · ')
}

function Franja({ bloques, abrirCorrida }) {
  return <div className="franja">
    {bloques.map(b => b.corrida
      ? <button key={b.inicio} type="button" className={`franja-bloque bloque-${b.estado}`} title={textoBloque(b)} aria-label={textoBloque(b)} onClick={() => abrirCorrida(b.corrida)} />
      : <span key={b.inicio} className={`franja-bloque bloque-${b.estado}`} title={textoBloque(b)} aria-label={textoBloque(b)} />)}
  </div>
}

function textoResumen(r) {
  return `${r.ok} ok · ${r.error} err · ${r.huecos} hueco${r.huecos === 1 ? '' : 's'}${r.corriendo ? ` · ${r.corriendo} corriendo` : ''}`
}

function EditarTrabajador({ trabajador, cerrar, guardado }) {
  const esPreset = PRESETS_FRECUENCIA.some(p => p.valor === trabajador.frecuencia)
  const [opcion, setOpcion] = useState(esPreset ? trabajador.frecuencia : 'personalizada')
  const [personalizada, setPersonalizada] = useState(trabajador.frecuencia)
  const [parametros, setParametros] = useState(JSON.stringify(trabajador.parametros ?? {}, null, 2))
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const frecuencia = opcion === 'personalizada' ? personalizada.trim() : opcion

  async function guardar() {
    setMensaje('')
    if (!frecuenciaValida(frecuencia)) { setMensaje('La frecuencia personalizada tiene que tener 5 partes, como "0 11 * * *".'); return }
    let params
    try { params = parsearParametros(parametros) } catch (e) { setMensaje(e.message); return }
    setGuardando(true)
    const { data, error } = await supabase.from('trabajadores').update({ frecuencia, parametros: params }).eq('id', trabajador.id).select().single()
    setGuardando(false)
    if (error) { setMensaje('No se pudo guardar: ' + error.message); return }
    guardado(data)
  }

  return <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && !guardando && cerrar()}>
    <div className="modal consola-modal">
      <div className="modal-head">
        <h3>editar {trabajador.nombre}</h3>
        <button className="close-x" disabled={guardando} onClick={cerrar}>✕</button>
      </div>
      <div className="modal-body">
        <div className="field"><label>cada cuánto corre</label>
          <select value={opcion} disabled={guardando} onChange={e => setOpcion(e.target.value)}>
            {PRESETS_FRECUENCIA.map(p => <option key={p.valor} value={p.valor}>{p.label}</option>)}
            <option value="personalizada">Personalizada…</option>
          </select>
          {opcion === 'personalizada' && <>
            <input style={{ marginTop: 8 }} value={personalizada} disabled={guardando} onChange={e => setPersonalizada(e.target.value)} placeholder="minuto hora día mes día-semana" />
            <p className="hint">Formato cron, en hora UTC (Argentina + 3). Se lee como: {describirFrecuencia(personalizada)}</p>
          </>}
        </div>
        <div className="field"><label>parámetros (JSON)</label>
          <textarea className="consola-parametros" rows={10} value={parametros} disabled={guardando} spellCheck={false} onChange={e => setParametros(e.target.value)} />
        </div>
        {mensaje && <p className="feedback-error" role="alert">{mensaje}</p>}
      </div>
      <div className="modal-foot">
        <button className="consola-boton" disabled={guardando} onClick={cerrar}>[cancelar]</button>
        <button className="consola-boton consola-boton-fuerte" disabled={guardando} onClick={guardar}>{guardando ? '[guardando…]' : '[guardar]'}</button>
      </div>
    </div>
  </div>
}

const COLOR_ESTADO = { ok: 'txt-ok', aviso: 'txt-corriendo', error: 'txt-error', corriendo: 'txt-corriendo' }

function SeccionCorrida({ seccion }) {
  return <section className="corrida-seccion">
    <h4>{seccion.titulo}</h4>
    {seccion.filas && <dl className="corrida-filas">
      {seccion.filas.map((f, i) => <div key={i} className={[f.sangria && 'is-sangria', f.tenue && 'is-tenue', f.fuerte && 'is-fuerte'].filter(Boolean).join(' ')}>
        <dt>{f.etiqueta}{f.detalle && <span className="corrida-detalle">{f.detalle}</span>}</dt>
        <dd className={[f.texto && 'is-texto', f.estado && COLOR_ESTADO[f.estado]].filter(Boolean).join(' ')}>{f.valor}</dd>
      </div>)}
    </dl>}
    {seccion.items && <ul className="corrida-items">
      {seccion.items.map((it, i) => <li key={i} className={[!it.dia && 'sin-dia', it.tenue && 'tenue', it.nivel && COLOR_ESTADO[it.nivel]].filter(Boolean).join(' ')}>
        {it.dia && <span className="corrida-dia">{it.dia}</span>}<span>{it.texto}</span>
      </li>)}
    </ul>}
  </section>
}

function CorridaModal({ corrida, nombre, ahora, cerrar }) {
  const duracion = corrida.estado === 'corriendo' ? ahora - Date.parse(corrida.iniciado_at) : corrida.duracion_ms
  const inicio = Date.parse(corrida.iniciado_at)
  const dia = fechaAR(inicio)
  const { resumen, secciones } = detalleCorrida(corrida.trabajador, corrida)
  return <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && cerrar()}>
    <div className="modal consola-modal corrida-modal" role="dialog" aria-label={`${nombre}, corrida ${corrida.id}`}>
      <div className="modal-head">
        <h3>{nombre} <span className="tenue">· corrida #{corrida.id}</span></h3>
        <button className="close-x" onClick={cerrar} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="corrida-cabecera">
          <span className={COLOR_ESTADO[corrida.estado]}>{ESTADO_TEXTO[corrida.estado] || corrida.estado}</span>
          {' · '}{dia.slice(8, 10)}/{dia.slice(5, 7)} {horaAR(inicio, true)}
          {' · '}{duracionLegible(duracion) || '—'}
          {corrida.cantidad_resultados != null && <> · {corrida.cantidad_resultados} {corrida.cantidad_resultados === 1 ? 'resultado' : 'resultados'}</>}
        </p>
        {corrida.error && <p className="corrida-error txt-error">{corrida.error}</p>}
        {resumen && <p className="corrida-resumen">{resumen}</p>}
        {secciones.map(sec => <SeccionCorrida key={sec.titulo} seccion={sec} />)}
        {corrida.payload && <details className="corrida-crudo">
          <summary>datos crudos</summary>
          <pre>{JSON.stringify(corrida.payload, null, 2)}</pre>
        </details>}
      </div>
    </div>
  </div>
}

function BarraAcciones({ trabajador, actualizado, abrirDetalle }) {
  const [editando, setEditando] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState(null)

  async function alternarActivo() {
    setOcupado('activo'); setAviso(null)
    const { data, error } = await supabase.from('trabajadores').update({ activo: !trabajador.activo }).eq('id', trabajador.id).select().single()
    setOcupado('')
    if (error) { setAviso({ error: true, texto: 'no se pudo cambiar: ' + error.message }); return }
    actualizado(data)
  }

  async function correrAhora() {
    setOcupado('correr'); setAviso(null)
    const { data, error } = await supabase.functions.invoke(trabajador.funcion, { body: { origen: 'panel' } })
    let respuesta = data
    if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error genérico */ } }
    setOcupado('')
    if (respuesta?.omitido) setAviso({ texto: respuesta.omitido })
    else if (error && !respuesta?.estado) setAviso({ error: true, texto: respuesta?.error || 'no se pudo disparar el trabajador.' })
  }

  return <>
    <div className="consola-acciones">
      <button className="consola-boton" disabled={!!ocupado} onClick={alternarActivo}>{ocupado === 'activo' ? '[…]' : trabajador.activo ? '[pausar]' : '[activar]'}</button>
      <button className="consola-boton" disabled={!!ocupado} onClick={correrAhora}>{ocupado === 'correr' ? '[disparando…]' : '[correr]'}</button>
      <button className="consola-boton" disabled={!!ocupado} onClick={() => setEditando(true)}>[editar]</button>
      {abrirDetalle && <button className="consola-boton" onClick={abrirDetalle}>[detalle]</button>}
      {aviso && <span className={aviso.error ? 'txt-error' : 'tenue'} role="status">{aviso.texto}</span>}
    </div>
    {editando && <EditarTrabajador trabajador={trabajador} cerrar={() => setEditando(false)} guardado={t => { setEditando(false); actualizado(t) }} />}
  </>
}

function FilaTrabajador({ trabajador, corridas, ahora, actualizado, abrirDetalle, abrirCorrida, tarjeta = false }) {
  const ultima = corridas[0]
  const terminadas = corridas.filter(c => c.estado !== 'corriendo')
  const ultimaTerminada = terminadas[0]
  const ultimas24 = terminadas.slice(0, ULTIMAS).reverse()
  const filas = ultimas24.map(c => c.cantidad_resultados)
  const numeros = filas.filter(Number.isFinite)
  const maxDuracion = Math.max(0, ...ultimas24.map(c => c.duracion_ms).filter(Number.isFinite))
  const bloques = franjaHoras(corridas, ahora, programaDe(trabajador))
  const cara = estadoCara(trabajador, ultima)
  const estado = !trabajador.activo ? 'pausado' : ultima ? (trabada(ultima, ahora, trabajador.minutos_trabado) ? 'trabado' : ESTADO_TEXTO[ultima.estado]) : 'sin corridas'

  return <section className={`consola-fila${tarjeta ? ' consola-tarjeta' : ''}${ultima?.estado === 'corriendo' ? ' is-corriendo' : ''}`}>
    <Cara estado={cara} color={trabajador.color} nombre={trabajador.nombre} />
    <div className="consola-fila-cuerpo">
      <div className="consola-titulo">
        <strong>{trabajador.nombre}</strong>
        <span className="tenue">{trabajador.tipo} · {trabajador.frecuencia} · <span className={`txt-${cara === 'pausado' ? 'vacio' : ultima?.estado}`}>{estado}</span>
          {ultima?.estado === 'corriendo' && <span className="consola-sinsalto"> {duracionLegible(ahora - Date.parse(ultima.iniciado_at))}</span>}</span>
      </div>
      <Franja bloques={bloques} abrirCorrida={abrirCorrida} />
      <div className="consola-eje tenue"><span>-24h</span><span>{textoResumen(resumenFranja(bloques))}</span><span>now</span></div>
      <div className="consola-linea">
        <span className="consola-etiqueta">rows</span>
        <span className="consola-graf">{sparkline(filas) || '—'}</span>
        {numeros.length > 0 && <span className="tenue">{ultimaTerminada?.cantidad_resultados ?? '—'} (min {Math.min(...numeros)} / max {Math.max(...numeros)})</span>}
      </div>
      {ultimaTerminada?.estado === 'error'
        ? <div className="consola-linea"><span className="consola-etiqueta txt-error">err</span><span className="txt-error consola-error">{ultimaTerminada.error || 'sin mensaje'}</span></div>
        : <div className="consola-linea">
          <span className="consola-etiqueta">ms</span>
          <span className="consola-graf">{barraBloques(ultimaTerminada?.duracion_ms, maxDuracion)}</span>
          {ultimaTerminada?.duracion_ms != null && <span className="tenue">{duracionLegible(ultimaTerminada.duracion_ms)} / max {duracionLegible(maxDuracion)}</span>}
        </div>}
      <BarraAcciones trabajador={trabajador} actualizado={actualizado} abrirDetalle={abrirDetalle} />
    </div>
  </section>
}

function LineaTail({ corrida, nombre, ahora, abrir }) {
  const detalle = corrida.estado === 'error' ? corrida.error
    : corrida.estado === 'corriendo' ? `lleva ${duracionLegible(ahora - Date.parse(corrida.iniciado_at))}`
      : [corrida.cantidad_resultados != null && `${corrida.cantidad_resultados} rows`, corrida.duracion_ms != null && duracionLegible(corrida.duracion_ms)].filter(Boolean).join(' · ')
  const inicio = Date.parse(corrida.iniciado_at)
  const dia = fechaAR(inicio)
  return <button type="button" className="tail-linea" onClick={abrir}>
    <span className="tenue">{dia !== fechaAR(ahora) && `${dia.slice(8, 10)}/${dia.slice(5, 7)} `}{horaAR(inicio, true)}</span>
    <span className={`tail-punto bloque-${corrida.estado}`} aria-hidden="true" />
    <span className="tail-nombre">{nombre}</span>
    <span className={`txt-${corrida.estado}`}>{ESTADO_TEXTO[corrida.estado] || corrida.estado}</span>
    <span className={`tail-detalle ${corrida.estado === 'error' ? 'txt-error' : 'tenue'}`}>{detalle}</span>
  </button>
}

function Reloj({ ahora, volver, recargar }) {
  return <span className="consola-reloj">
    {volver && <><button className="consola-boton" onClick={volver}>[← volver]</button>{' '}</>}
    {horaAR(ahora, true)} <span className="tenue">ART</span>
    {recargar && <>{' '}<button className="consola-boton" onClick={recargar}>[recargar]</button></>}
  </span>
}

function DetalleTrabajador({ trabajador, volver, actualizado, ahora }) {
  const [corridas, setCorridas] = useState([])
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)

  const cargar = useCallback(async desde => {
    setCargando(true)
    const { data, error } = await supabase.from('trabajos_corridas').select('*').eq('trabajador', trabajador.clave)
      .order('iniciado_at', { ascending: false }).range(desde, desde + PAGINA_DETALLE - 1)
    setCargando(false)
    if (error) { setError('no se pudo cargar el historial: ' + error.message); return }
    setCorridas(prev => desde === 0 ? data : [...prev, ...data])
    setHayMas(data.length === PAGINA_DETALLE)
  }, [trabajador.clave])
  useEffect(() => { cargar(0) }, [cargar])

  const alCambiar = useCallback(fila => { if (fila.trabajador === trabajador.clave) setCorridas(prev => aplicarCorrida(prev, fila)) }, [trabajador.clave])
  useCorridasEnVivo(`trabajos-corridas-${trabajador.clave}`, alCambiar)

  // Sin más páginas por cargar, los días arrancan en el alta del trabajador; si no, en la corrida más vieja cargada.
  const dias = franjasPorDia(corridas, ahora, programaDe(trabajador), hayMas ? null : Date.parse(trabajador.created_at))
  const total = resumenFranja(dias.flatMap(d => d.bloques))
  const errores = corridas.filter(c => c.estado === 'error').length
  return <div className="consola">
    <CabeceraPantalla sobretitulo="Trabajadores" titulo={trabajador.nombre} subtitulo={<Reloj ahora={ahora} volver={volver} />} cargando={cargando && !corridas.length}
      cifras={[
        { valor: `${corridas.length}${hayMas ? '+' : ''}`, etiqueta: 'corridas' },
        { valor: corridas.filter(c => c.estado === 'ok').length, etiqueta: 'ok' },
        { valor: errores, etiqueta: 'error', nivel: errores ? 'error' : undefined },
        { valor: dias.length, etiqueta: 'días' },
      ]} />
    {error && <p className="txt-error">{error}</p>}
    <Bloques>
      <Bloque titulo="Estado" ancho="completo">
        <FilaTrabajador trabajador={trabajador} corridas={corridas} ahora={ahora} actualizado={actualizado} abrirCorrida={setAbierta} />
      </Bloque>
      <Bloque titulo="Historial por día" ancho="completo" accion={<span className="bloque-nota">00h → 23h · {textoResumen(total)}</span>}>
        <div className="consola-dias">
          {dias.map(d => <div className="consola-dia" key={d.dia}>
            <span className="tenue">{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</span>
            <Franja bloques={d.bloques} abrirCorrida={setAbierta} />
            <span className="tenue consola-dia-resumen">{textoResumen(resumenFranja(d.bloques))}</span>
          </div>)}
          {!cargando && dias.length === 0 && <p className="tenue">todavía no corrió.</p>}
        </div>
      </Bloque>
      <Bloque titulo="Corridas" ancho="completo">
        <div className="tail">
          {corridas.map(c => <LineaTail key={c.id} corrida={c} nombre={trabajador.nombre} ahora={ahora} abrir={() => setAbierta(c)} />)}
        </div>
        {cargando && <p className="tenue">cargando…</p>}
        {hayMas && !cargando && <button className="consola-boton" onClick={() => cargar(corridas.length)}>[cargar más]</button>}
      </Bloque>
    </Bloques>
    {abierta && <CorridaModal corrida={abierta} nombre={trabajador.nombre} ahora={ahora} cerrar={() => setAbierta(null)} />}
  </div>
}

export default function Trabajadores() {
  const [trabajadores, setTrabajadores] = useState([])
  const [corridasPor, setCorridasPor] = useState({})
  const [tail, setTail] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [salud, setSalud] = useState({ datos: null, ms: null, error: '' })
  const [tailAbierto, setTailAbierto] = useState(leerTailAbierto)
  const ahora = useReloj()

  const cargarSalud = useCallback(async () => {
    const inicio = performance.now()
    const { data, error } = await supabase.rpc('salud_sistema')
    setSalud(error ? { datos: null, ms: null, error: error.message } : { datos: data, ms: Math.round(performance.now() - inicio), error: '' })
  }, [])
  useEffect(() => {
    cargarSalud()
    const reloj = setInterval(cargarSalud, SALUD_CADA_MS)
    return () => clearInterval(reloj)
  }, [cargarSalud])

  const cargar = useCallback(async () => {
    setError('')
    const momento = Date.now()
    const [{ data, error }, ultimas] = await Promise.all([
      supabase.from('trabajadores').select('*').order('nombre'),
      supabase.from('trabajos_corridas').select('*').order('iniciado_at', { ascending: false }).limit(TAIL),
    ])
    if (error) { setCargando(false); setError('no se pudieron cargar los trabajadores: ' + error.message); return }
    const historiales = await Promise.all((data || []).map(async t => [t.clave, await corridasRecientes(t.clave, momento)]))
    setTrabajadores(data || [])
    setCorridasPor(Object.fromEntries(historiales))
    setTail(ultimas.data || [])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const alCambiar = useCallback(fila => {
    setCorridasPor(prev => ({ ...prev, [fila.trabajador]: aplicarCorrida(prev[fila.trabajador] || [], fila, MAX_EN_MEMORIA) }))
    setTail(prev => aplicarCorrida(prev, fila, TAIL))
  }, [])
  useCorridasEnVivo('trabajos-corridas-panel', alCambiar)

  const actualizado = useCallback(t => setTrabajadores(prev => prev.map(x => x.id === t.id ? t : x)), [])

  const detalle = trabajadores.find(t => t.clave === seleccionado)
  if (detalle) return <DetalleTrabajador trabajador={detalle} volver={() => setSeleccionado(null)} actualizado={actualizado} ahora={ahora} />

  const nombres = Object.fromEntries(trabajadores.map(t => [t.clave, t.nombre]))
  const c = contadores24h(trabajadores, corridasPor, ahora)
  const pendientes = calcularAlertas({ trabajadores, corridasPor, ahora, salud: salud.datos })
  const recargar = () => { cargar(); cargarSalud() }
  return <div className="consola">
    <CabeceraPantalla sobretitulo="Sistema" titulo="Trabajadores" subtitulo={<Reloj ahora={ahora} recargar={recargar} />} cargando={cargando}
      cifras={[
        { valor: c.trabajadores, etiqueta: 'trabajadores' },
        { valor: c.ok, etiqueta: 'ok 24h' },
        { valor: c.error, etiqueta: 'error', nivel: c.error ? 'error' : undefined },
        { valor: c.huecos, etiqueta: 'huecos', nivel: c.huecos ? 'aviso' : undefined },
      ]} />

    {error && <p className="txt-error">{error}</p>}
    {cargando && <p className="tenue">cargando…</p>}
    <Bloques>
      <Bloque titulo="Trabajadores" ancho="completo" accion={c.trabados > 0 && <span className="bloque-nota txt-corriendo">{c.trabados} trabado{c.trabados === 1 ? '' : 's'}</span>}>
        {!cargando && !error && trabajadores.length === 0 && <p className="tenue">no hay trabajadores configurados.</p>}
        <div className="tablero-grilla">
          {trabajadores.map(t => <FilaTrabajador key={t.id} tarjeta trabajador={t} corridas={corridasPor[t.clave] || []} ahora={ahora}
            actualizado={actualizado} abrirDetalle={() => setSeleccionado(t.clave)} abrirCorrida={setAbierta} />)}
        </div>
      </Bloque>
      <Bloque titulo="Actividad 24h">
        <Actividad trabajadores={trabajadores} corridasPor={corridasPor} ahora={ahora} />
      </Bloque>
      <Bloque titulo="Salud del sistema">
        <Salud salud={salud} alertas={pendientes} />
      </Bloque>
      {trabajadores.length > 0 && <Bloque titulo="Mapa de flujo" ancho="completo">
        <MapaFlujo trabajadores={trabajadores} corridasPor={corridasPor} ahora={ahora} />
      </Bloque>}
      <Bloque titulo="Tail en vivo" ancho="completo">
        <details className="tail-desplegable" open={tailAbierto} onToggle={e => { setTailAbierto(e.currentTarget.open); guardarTailAbierto(e.currentTarget.open) }}>
          <summary className="consola-subtitulo">
            {tail.length} corridas
            {!tailAbierto && tail[0] && <span className="tail-ultima tenue"> · última {horaAR(Date.parse(tail[0].iniciado_at), true)} {nombres[tail[0].trabajador] || tail[0].trabajador} <span className={`txt-${tail[0].estado}`}>{ESTADO_TEXTO[tail[0].estado] || tail[0].estado}</span></span>}
          </summary>
          <div className="tail" aria-live="polite">
            {tail.map(cr => <LineaTail key={cr.id} corrida={cr} nombre={nombres[cr.trabajador] || cr.trabajador} ahora={ahora} abrir={() => setAbierta(cr)} />)}
            {!cargando && tail.length === 0 && <p className="tenue">sin corridas todavía.</p>}
          </div>
        </details>
      </Bloque>
    </Bloques>
    {abierta && <CorridaModal corrida={abierta} nombre={trabajadores.find(t => t.clave === abierta.trabajador)?.nombre || abierta.trabajador} ahora={ahora} cerrar={() => setAbierta(null)} />}
  </div>
}
