import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import {
  PRESETS_FRECUENCIA, describirFrecuencia, frecuenciaValida, duracionLegible, aplicarCorrida, parsearParametros,
  horaAR, fechaAR, haceCuanto, franjaHoras, franjasPorDia, resumenFranja, trabada, contadores24h, sparkline, barraBloques, programaDe,
} from '../trabajadores.mjs'
import { colorIdentidad, alertas as calcularAlertas, RECORRIDOS, REGISTRO, FUENTES, vidaDeTrabajador, enCuanto } from '../tablero.mjs'
import { detalleCorrida } from '../detalleCorrida.mjs'
import { estadoTrabajador, pasaFiltro, coincideBusqueda, contarFiltros, disposicion, FILTROS, DESCRIPCION_FUENTE, DESCRIPCION_DESTINO } from '../orbital.mjs'
import { Actividad, Salud } from './TableroTrabajadores.jsx'
import { SistemaOrbital, IconoTrabajador } from './SistemaOrbital.jsx'
import { CabeceraPantalla, Bloques, Bloque, Pie } from '../estructura.jsx'
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
      {seccion.filas.map((f, i) => {
        // Valores cortos (números, estados, una cuenta) en un renglón a la derecha; los textos largos, debajo de la etiqueta.
        const largo = f.texto && String(f.valor).length > 36
        const pastilla = f.texto && f.estado && COLOR_ESTADO[f.estado]
        return <div key={i} className={[f.sangria && 'is-sangria', f.tenue && 'is-tenue', f.fuerte && 'is-fuerte', largo && 'is-largo'].filter(Boolean).join(' ')}>
          <dt>{f.etiqueta}{f.detalle && <span className="corrida-detalle">{f.detalle}</span>}</dt>
          <dd className={!pastilla && f.estado ? COLOR_ESTADO[f.estado] : undefined}>
            {pastilla ? <span className={`corrida-pastilla ${pastilla}`}>{f.valor}</span> : f.valor}
          </dd>
        </div>
      })}
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

function useAcciones(trabajador, actualizado) {
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

  return { ocupado, aviso, alternarActivo, correrAhora }
}

function BarraAcciones({ trabajador, actualizado, abrirDetalle }) {
  const [editando, setEditando] = useState(false)
  const { ocupado, aviso, alternarActivo, correrAhora } = useAcciones(trabajador, actualizado)
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


const fechaCorta = ms => new Date(ms).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')
const ETIQUETA_ESTADO = { ok: 'Activo', corriendo: 'Corriendo', trabado: 'Trabado', error: 'Con error', pausado: 'Pausado', sin_corridas: 'Sin corridas' }

function fraseEstado(estado, corridas, ahora) {
  if (estado === 'ok') return 'Funcionando correctamente.'
  if (estado === 'corriendo') return `Corriendo hace ${duracionLegible(ahora - Date.parse(corridas[0].iniciado_at))}.`
  if (estado === 'trabado') return 'Lleva demasiado corriendo: parece trabado.'
  if (estado === 'error') return `La última corrida falló: ${corridas.find(c => c.estado !== 'corriendo')?.error || 'sin mensaje'}`
  if (estado === 'pausado') return 'Pausado: no corre hasta que lo actives.'
  return 'Todavía no corrió.'
}

// Entradas y salidas de un trabajador, con cuándo las tocó por última vez (su última corrida terminada).
function puntas(trabajador, vida, ahora) {
  const r = RECORRIDOS[trabajador.clave] ?? { fuentes: [], destinos: [] }
  const cuando = vida.ultimaFin ? haceCuanto(new Date(vida.ultimaFin).toISOString(), ahora) : null
  return {
    entradas: r.fuentes.map(f => ({ id: f, nombre: FUENTES[f] ?? f, descripcion: DESCRIPCION_FUENTE[f] ?? '', cuando: cuando ? `leído ${cuando}` : 'sin lecturas' })),
    salidas: [...r.destinos, REGISTRO].map(d => ({ id: d, nombre: d, descripcion: DESCRIPCION_DESTINO[d] ?? '', cuando: cuando ? `escrito ${cuando}` : 'sin escrituras' })),
  }
}

function ListaPuntas({ items, conDescripcion }) {
  return <ul className="panel-puntas">{items.map(x => <li key={x.id}>
    <span><strong>{x.nombre}</strong>{conDescripcion && x.descripcion && <span className="tenue"> · {x.descripcion}</span>}</span>
    <span className="tenue">{x.cuando}</span>
  </li>)}</ul>
}

const PESTANAS = [['resumen', 'Resumen'], ['entradas', 'Entradas'], ['salidas', 'Salidas'], ['historial', 'Historial']]

function PanelTrabajador({ trabajador, corridas, ahora, actualizado, abrirCorrida, verHistorial, cerrar }) {
  const [pestana, setPestana] = useState('resumen')
  const [menu, setMenu] = useState(false)
  const [editando, setEditando] = useState(false)
  const { ocupado, aviso, alternarActivo, correrAhora } = useAcciones(trabajador, actualizado)
  const estado = estadoTrabajador(trabajador, corridas, ahora)
  const vida = vidaDeTrabajador(trabajador, corridas, ahora)
  const { entradas, salidas } = puntas(trabajador, vida, ahora)
  const bloques = franjaHoras(corridas, ahora, programaDe(trabajador))

  return <div className="panel-trabajador" style={{ '--id': colorIdentidad(trabajador.color) }}>
    <div className="panel-cabecera">
      <svg viewBox="-16 -16 32 32" width="34" height="34" aria-hidden="true"><circle r="15" className="panel-icono-fondo" /><IconoTrabajador clave={trabajador.clave} /></svg>
      <div className="panel-titulo">
        <strong>{trabajador.nombre}</strong>
        <span className={`panel-estado estado-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>
      </div>
      <div className="panel-menu">
        <button className="panel-boton-menu" aria-label="Más acciones" aria-expanded={menu} onClick={() => setMenu(m => !m)}>⋯</button>
        {menu && <div className="panel-menu-lista" role="menu" onClick={() => setMenu(false)}>
          <button role="menuitem" disabled={!!ocupado} onClick={alternarActivo}>{trabajador.activo ? 'Pausar' : 'Activar'}</button>
          <button role="menuitem" onClick={() => setEditando(true)}>Editar configuración</button>
          <button role="menuitem" onClick={verHistorial}>Historial completo</button>
          <button role="menuitem" onClick={cerrar}>Cerrar panel</button>
        </div>}
      </div>
    </div>
    {trabajador.descripcion && <p className="panel-descripcion" title={trabajador.descripcion}>{trabajador.descripcion}</p>}

    <div className="panel-pestanas" role="tablist">
      {PESTANAS.map(([id, etiqueta]) => <button key={id} role="tab" aria-selected={pestana === id} className={pestana === id ? 'is-activa' : undefined} onClick={() => setPestana(id)}>{etiqueta}</button>)}
    </div>

    <div className="panel-contenido" role="tabpanel">
      {pestana === 'resumen' && <>
        <dl className="panel-datos">
          <div><dt>Última ejecución</dt><dd>{vida.ultimaFin ? <span><strong>{haceCuanto(new Date(vida.ultimaFin).toISOString(), ahora)}</strong><span className="tenue"> · {fechaCorta(vida.ultimaFin)}</span></span> : '—'}</dd></div>
          <div><dt>Próxima ejecución</dt><dd>{vida.proxima ? <span><strong>{enCuanto(vida.proxima, ahora)}</strong><span className="tenue"> · {fechaCorta(vida.proxima)}</span></span> : <strong>{trabajador.activo ? '—' : 'pausado'}</strong>}</dd></div>
          <div><dt>Estado</dt><dd><span><strong className={`panel-estado-texto estado-${estado}`}>{ETIQUETA_ESTADO[estado]}</strong><span className="tenue"> · {fraseEstado(estado, corridas, ahora)}</span></span></dd></div>
        </dl>
        <p className="panel-subtitulo">Entradas ({entradas.length})</p>
        <ListaPuntas items={entradas} />
        <p className="panel-subtitulo">Salidas ({salidas.length})</p>
        <ListaPuntas items={salidas} />
      </>}
      {pestana === 'entradas' && <ListaPuntas items={entradas} conDescripcion />}
      {pestana === 'salidas' && <ListaPuntas items={salidas} conDescripcion />}
      {pestana === 'historial' && <>
        <Franja bloques={bloques} abrirCorrida={abrirCorrida} />
        <div className="consola-eje tenue"><span>-24h</span><span>{textoResumen(resumenFranja(bloques))}</span><span>now</span></div>
        <div className="tail panel-historial">
          {corridas.slice(0, 6).map(c => <LineaTail key={c.id} corrida={c} nombre={trabajador.nombre} ahora={ahora} abrir={() => abrirCorrida(c)} />)}
        </div>
        <button className="consola-boton" onClick={verHistorial}>[historial completo]</button>
      </>}
    </div>

    <div className="panel-pie">
      <button className="btn btn-primary" disabled={!!ocupado || !trabajador.activo} onClick={correrAhora}>{ocupado === 'correr' ? 'Disparando…' : 'Ejecutar ahora'}</button>
      {aviso && <span className={aviso.error ? 'txt-error' : 'tenue'} role="status">{aviso.texto}</span>}
    </div>
    {editando && <EditarTrabajador trabajador={trabajador} cerrar={() => setEditando(false)} guardado={t => { setEditando(false); actualizado(t) }} />}
  </div>
}

const TEXTO_CORRIDA = { ok: 'Ejecución completada', error: 'Falló', corriendo: 'En curso' }

// Actividad reciente: las últimas corridas de todos, en una línea de tiempo horizontal que se actualiza en vivo.
function ActividadReciente({ tail, trabajadores, ahora, abrirCorrida, verTodas, setVerTodas, cargando }) {
  const porClave = Object.fromEntries(trabajadores.map(t => [t.clave, t]))
  const nombre = clave => porClave[clave]?.nombre || clave
  return <>
    <div className="actividad-linea">
      {tail.slice(0, 12).map(c => <button key={c.id} type="button" className={`actividad-tarjeta estado-${c.estado}`} style={{ '--id': colorIdentidad(porClave[c.trabajador]?.color) }} onClick={() => abrirCorrida(c)}>
        <span className="actividad-hora">{horaAR(Date.parse(c.iniciado_at))}</span>
        <span className="actividad-nombre"><i aria-hidden="true" />{nombre(c.trabajador)}</span>
        <span className="actividad-estado">{TEXTO_CORRIDA[c.estado] || c.estado}</span>
        <span className="actividad-cuando">{c.estado === 'corriendo' ? `lleva ${duracionLegible(ahora - Date.parse(c.iniciado_at))}` : haceCuanto(c.finalizado_at || c.iniciado_at, ahora)}</span>
      </button>)}
      {!cargando && tail.length === 0 && <p className="tenue">sin corridas todavía.</p>}
    </div>
    {verTodas && <div className="tail actividad-todas" aria-live="polite">
      {tail.map(cr => <LineaTail key={cr.id} corrida={cr} nombre={nombre(cr.trabajador)} ahora={ahora} abrir={() => abrirCorrida(cr)} />)}
    </div>}
    <button className="consola-boton actividad-ver" onClick={() => setVerTodas(!verTodas)}>{verTodas ? '[ver menos]' : '[ver todas]'}</button>
  </>
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
  const [elegido, setElegido] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const bloqueSistema = useRef(null)
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

  const c = contadores24h(trabajadores, corridasPor, ahora)
  const pendientes = calcularAlertas({ trabajadores, corridasPor, ahora, salud: salud.datos })
  const recargar = () => { cargar(); cargarSalud() }
  const estados = Object.fromEntries(trabajadores.map(t => [t.clave, estadoTrabajador(t, corridasPor[t.clave] || [], ahora)]))
  const cuenta = contarFiltros(Object.values(estados))
  const lectura = disposicion(trabajadores)
  const filtrados = trabajadores.filter(t => pasaFiltro(estados[t.clave], filtro) && coincideBusqueda(t.clave, busqueda, lectura))
  const elegidoT = trabajadores.find(t => t.clave === elegido)
  const resumenFiltros = [FILTROS.find(f => f.id === filtro)?.etiqueta.toLowerCase(), busqueda.trim() && `que coincidan con "${busqueda.trim()}"`].filter(Boolean).join(' · ')

  return <div className="consola">
    <CabeceraPantalla sobretitulo="Sistema" titulo="Trabajadores" cargando={cargando}
      subtitulo={<>Automatiza, conecta y da vida a tus ideas. · <Reloj ahora={ahora} recargar={recargar} /></>}
      cifras={[
        { valor: cuenta.todos, etiqueta: 'trabajadores' },
        { valor: cuenta.activos, etiqueta: 'activos' },
        { valor: cuenta.pausados, etiqueta: 'pausados' },
        { valor: cuenta.errores, etiqueta: 'con errores', nivel: cuenta.errores ? 'error' : undefined },
      ]} />

    {error && <p className="txt-error">{error}</p>}
    {cargando && <p className="tenue">cargando…</p>}
    <div ref={bloqueSistema}>
      <Bloques>
        <Bloque titulo="Sistema" ancho="completo" accion={<span className="bloque-nota">{elegidoT ? 'tocá el fondo para volver a ver todo' : 'tocá un trabajador para ver su detalle'} · {c.ok} corridas ok en 24 h{c.trabados > 0 && <span className="txt-corriendo"> · {c.trabados} trabado{c.trabados === 1 ? '' : 's'}</span>}</span>}>
          {!cargando && !error && trabajadores.length === 0 && <p className="tenue">no hay trabajadores configurados.</p>}
          {trabajadores.length > 0 && <div className={`sistema-cuerpo${elegidoT ? ' con-panel' : ''}`}>
            <SistemaOrbital trabajadores={trabajadores} corridasPor={corridasPor} ahora={ahora} elegido={elegido} onElegir={setElegido} filtro={filtro} busqueda={busqueda} />
            {elegidoT && <aside className="sistema-panel" aria-label={`Detalle de ${elegidoT.nombre}`}>
              <PanelTrabajador key={elegidoT.clave} trabajador={elegidoT} corridas={corridasPor[elegidoT.clave] || []} ahora={ahora} actualizado={actualizado}
                abrirCorrida={setAbierta} verHistorial={() => setSeleccionado(elegidoT.clave)} cerrar={() => setElegido(null)} />
            </aside>}
          </div>}
        </Bloque>
      </Bloques>
    </div>

    <Bloques>
      <Bloque titulo="Trabajadores" ancho="completo" accion={filtrados.length < trabajadores.length && <span className="bloque-nota">{filtrados.length} de {trabajadores.length}</span>}>
        {!cargando && filtrados.length === 0 && trabajadores.length > 0 && <p className="tenue">ningún trabajador coincide con el filtro.</p>}
        <div className="tablero-grilla">
          {filtrados.map(t => <FilaTrabajador key={t.id} tarjeta trabajador={t} corridas={corridasPor[t.clave] || []} ahora={ahora}
            actualizado={actualizado} abrirDetalle={() => setSeleccionado(t.clave)} abrirCorrida={setAbierta} />)}
        </div>
      </Bloque>
      <Bloque titulo="Actividad 24h">
        <Actividad trabajadores={trabajadores} corridasPor={corridasPor} ahora={ahora} />
      </Bloque>
      <Bloque titulo="Salud del sistema">
        <Salud salud={salud} alertas={pendientes} />
      </Bloque>
      <Bloque titulo="Actividad reciente" ancho="completo" accion={<span className="actividad-vivo">en tiempo real</span>}>
        <ActividadReciente tail={tail} trabajadores={trabajadores} ahora={ahora} abrirCorrida={setAbierta} cargando={cargando}
          verTodas={tailAbierto} setVerTodas={v => { setTailAbierto(v); guardarTailAbierto(v) }} />
      </Bloque>
    </Bloques>

    <Pie titulo="Filtros" resumen={`mostrando ${resumenFiltros}`} boton="Filtrar">
      <div className="filtros-trabajadores">
        <div className="vista-toggle">
          {FILTROS.map(f => <button key={f.id} className={filtro === f.id ? 'active' : ''} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.etiqueta} {cuenta[f.id]}</button>)}
        </div>
        <input type="search" aria-label="Buscar trabajador, fuente o destino" placeholder="Buscar trabajador, fuente o destino…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>
    </Pie>
    {abierta && <CorridaModal corrida={abierta} nombre={trabajadores.find(t => t.clave === abierta.trabajador)?.nombre || abierta.trabajador} ahora={ahora} cerrar={() => setAbierta(null)} />}
  </div>
}
