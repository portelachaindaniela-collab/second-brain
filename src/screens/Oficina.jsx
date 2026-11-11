import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { colorIdentidad } from '../tablero.mjs'
import { aplicarCorrida, haceCuanto, horaAR } from '../trabajadores.mjs'
import { armarOficina, contarEstados, planoSala, iso, puntos, hoyAR, EQUIPOS, ESTADOS } from '../oficina.mjs'
import { CabeceraPantalla, Bloques, Bloque } from '../estructura.jsx'
import './Oficina.css'

// La Oficina: todos los agentes (Trabajadores, UP y PDG) en sus salas. Cada uno en su escritorio; la burbuja dice
// cómo está (trabajando, con un problema, pausado). Tocás uno y ves qué hace, sus tareas, sus herramientas, y podés
// hablarle. Todo se lee de las tablas que ya existen: esta pantalla no escribe nada.
const DIA_MS = 24 * 3600_000
const ULTIMAS = 8
const ORDEN_EQUIPOS = ['trabajadores', 'up', 'pdg']

// ---------- Datos ----------
async function corridasDe(clave, ahora) {
  const base = () => supabase.from('trabajos_corridas').select('*').eq('trabajador', clave).order('iniciado_at', { ascending: false })
  const [ventana, ultimas] = await Promise.all([base().gte('iniciado_at', new Date(ahora - DIA_MS).toISOString()).limit(500), base().limit(ULTIMAS)])
  if (ventana.error || ultimas.error) throw ventana.error || ultimas.error
  return [...ventana.data, ...ultimas.data].reduce((lista, c) => aplicarCorrida(lista, c, 500), [])
}

async function cargarOficina() {
  const ahora = Date.now()
  const hoy = hoyAR(ahora)
  const errores = []
  const leer = async (nombre, consulta, vacio) => {
    const { data, error } = await consulta
    if (error) { errores.push(`${nombre}: ${error.message}`); return vacio }
    return data ?? vacio
  }
  const [trabajadores, salud, upCorridas, chequeo, piezas, pdgAgentes, pdgTrabajos, pdgCuentas] = await Promise.all([
    leer('trabajadores', supabase.from('trabajadores').select('*').order('id'), []),
    leer('salud del sistema', supabase.rpc('salud_sistema'), null),
    leer('corridas de UP', supabase.from('up_corridas').select('estado,error,pasos,iniciado_at').order('iniciado_at', { ascending: false }).limit(15), []),
    leer('Noruega', supabase.from('up_chequeos').select('estado,chequeos,at').order('at', { ascending: false }).limit(1).maybeSingle(), null),
    leer('piezas de UP', supabase.from('up_piezas').select('fecha,estado,texto').in('estado', ['falta_info', 'revision', 'pendiente']).gte('fecha', hoy).limit(500), []),
    leer('agentes de PDG', supabase.from('pdg_agentes').select('clave,nombre,rol,orden'), []),
    leer('trabajos de PDG', supabase.from('pdg_trabajos').select('agente,estado,pedido,created_at,pdg_cuentas(nombre)').order('created_at', { ascending: false }).limit(80), []),
    leer('cuentas de PDG', supabase.from('pdg_cuentas').select('nombre,etapa,proxima_fecha').not('proxima_fecha', 'is', null), []),
  ])
  const corridasPor = {}
  await Promise.all(trabajadores.map(async t => {
    try { corridasPor[t.clave] = await corridasDe(t.clave, ahora) } catch (e) { errores.push(`corridas de ${t.nombre}: ${e.message}`); corridasPor[t.clave] = [] }
  }))
  return {
    trabajadores, corridasPor, salud, upCorridas, chequeo, hoy, errores,
    piezas: piezas.map(p => ({ fecha: p.fecha, estado: p.estado, tiene_texto: Boolean(p.texto) })),
    pdgAgentes, pdgTrabajos: pdgTrabajos.map(t => ({ ...t, cuenta: t.pdg_cuentas })), pdgCuentas,
  }
}

export default function Oficina() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ahora, setAhora] = useState(() => Date.now())
  const espera = useRef(null)

  const recargar = useCallback(async () => {
    try { setDatos(await cargarOficina()); setError('') } catch (e) { setError(`No se pudo cargar la oficina: ${e.message}`) }
    setAhora(Date.now())
  }, [])

  useEffect(() => { recargar() }, [recargar])
  // Una corrida que empieza o termina mueve a su agente: se vuelve a leer (agrupando los cambios seguidos).
  useEffect(() => {
    const programar = () => { clearTimeout(espera.current); espera.current = setTimeout(recargar, 1500) }
    const canal = supabase.channel('oficina')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos_corridas' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'up_corridas' }, programar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'up_chequeos' }, programar)
      .subscribe()
    const minuto = setInterval(() => setAhora(Date.now()), 60_000)
    return () => { clearTimeout(espera.current); clearInterval(minuto); supabase.removeChannel(canal) }
  }, [recargar])

  const oficina = useMemo(() => (datos ? armarOficina(datos, ahora) : null), [datos, ahora])
  return <OficinaVista cargando={!datos} agentes={oficina?.agentes ?? []} pendientes={oficina?.pendientes ?? []}
    errores={[error, ...(datos?.errores ?? [])].filter(Boolean)} ahora={ahora} hablar={hablarConAgente} />
}

async function hablarConAgente(agente, mensajes) {
  const { data, error } = await supabase.functions.invoke('oficina-chat', { body: { agente, mensajes } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error de conexión */ } }
  if (error || !respuesta?.texto) throw new Error(respuesta?.error || 'No pude hablar con el agente. Probá de nuevo.')
  return respuesta.texto
}

// ---------- Vista ----------
export function OficinaVista({ cargando, agentes, pendientes, errores = [], ahora, hablar }) {
  const [elegidoId, setElegidoId] = useState(null)
  const [pestana, setPestana] = useState('ahora')
  const [charlas, setCharlas] = useState({})
  const elegido = agentes.find(a => a.id === elegidoId) || null
  const cuenta = contarEstados(agentes)
  const porEquipo = ORDEN_EQUIPOS.map(e => ({ equipo: e, agentes: agentes.filter(a => a.equipo === e) })).filter(s => s.agentes.length)
  const abrir = (id, p = 'ahora') => { setElegidoId(id); setPestana(p) }
  const angosta = useAngosta()

  return <div className="oficina">
    <CabeceraPantalla sobretitulo="Agentes" titulo="Oficina" cargando={cargando}
      subtitulo={`${agentes.length} agentes en ${porEquipo.length} salas: Trabajadores, UP y PDG.`}
      cifras={[
        { valor: cuenta.total, etiqueta: 'agentes' },
        { valor: cuenta.trabajando, etiqueta: 'trabajando ahora' },
        { valor: cuenta.error, etiqueta: 'con un problema', nivel: cuenta.error ? 'error' : undefined },
        { valor: pendientes.length, etiqueta: 'te toca', nivel: pendientes.length ? 'aviso' : undefined },
      ]} />
    {errores.map(e => <p key={e} role="alert" className="feedback-error">{e}</p>)}
    <Bloques disposicion="principal">
      <Bloque titulo="Las salas" ancho="completo">
        {cargando ? <p className="empty-state">Abriendo la oficina…</p> : <>
          <div className="oficina-salas">
            {porEquipo.map(s => <Sala key={s.equipo} equipo={s.equipo} agentes={s.agentes} elegidoId={elegidoId} abrir={abrir}
              porFila={s.equipo === 'trabajadores' && !angosta ? 5 : 3} />)}
          </div>
          <Leyenda />
          <nav className="oficina-plantel" aria-label="Todos los agentes">
            {agentes.map(a => <button key={a.id} type="button" className={`oficina-ficha estado-${a.estado}${a.id === elegidoId ? ' is-elegido' : ''}`} onClick={() => abrir(a.id)}
              aria-label={`${a.nombre}: ${ESTADOS[a.estado]}`}>
              <Avatar agente={a} /><span>{nombreCorto(a.nombre)}</span>
            </button>)}
          </nav>
        </>}
      </Bloque>
      <Bloque titulo={`Te toca${pendientes.length ? ` · ${pendientes.length}` : ''}`}>
        {cargando ? <p className="tenue">Revisando…</p> : pendientes.length
          ? <ul className="oficina-tetoca">{pendientes.map(p => <li key={p.texto} className={`nivel-${p.nivel}`}>
            <span className="oficina-tetoca-texto">{p.texto}</span>
            <span className="oficina-tetoca-donde">{p.donde}</span>
            {p.agente && agentes.some(a => a.id === p.agente) && <button type="button" className="btn btn-sm" onClick={() => abrir(p.agente)}>Ver agente</button>}
          </li>)}</ul>
          : <p className="tenue">Nada pendiente: los agentes no te necesitan por ahora.</p>}
      </Bloque>
      <Bloque titulo="Trabajando ahora">
        {cargando ? <p className="tenue">Revisando…</p> : <ActividadAhora agentes={agentes} abrir={abrir} />}
      </Bloque>
    </Bloques>
    {elegido && <PanelAgente key={elegido.id} agente={elegido} pestana={pestana} setPestana={setPestana} ahora={ahora} cerrar={() => setElegidoId(null)}
      charla={charlas[elegido.id] ?? []} setCharla={m => setCharlas(c => ({ ...c, [elegido.id]: typeof m === 'function' ? m(c[elegido.id] ?? []) : m }))} hablar={hablar} />}
  </div>
}

const nombreCorto = n => String(n).split(' (')[0]

// Pantalla angosta (celular): las salas van de 3 puestos por fila para que no queden diminutas.
const CONSULTA_ANGOSTA = '(max-width: 780px)'
function useAngosta() {
  const [angosta, setAngosta] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(CONSULTA_ANGOSTA).matches))
  useEffect(() => {
    const mq = window.matchMedia?.(CONSULTA_ANGOSTA)
    if (!mq) return
    const cambio = () => setAngosta(mq.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])
  return angosta
}

function ActividadAhora({ agentes, abrir }) {
  const activos = agentes.filter(a => a.estado === 'trabajando' || a.estado === 'error')
  if (!activos.length) return <p className="tenue">Nadie está trabajando en este momento; todos esperan su próximo turno.</p>
  return <ul className="oficina-activos">{activos.map(a => <li key={a.id}>
    <button type="button" onClick={() => abrir(a.id)}>
      <Avatar agente={a} />
      <span><strong>{a.nombre}</strong><span className={`oficina-estado estado-${a.estado}`}>{ESTADOS[a.estado]}</span><span className="tenue">{a.ahora}</span></span>
    </button>
  </li>)}</ul>
}

function Leyenda() {
  return <ul className="oficina-leyenda" aria-label="Qué significa cada burbuja">
    <li><span className="burbuja-muestra estado-trabajando">…</span>trabajando</li>
    <li><span className="burbuja-muestra estado-error">!</span>con un problema</li>
    <li><span className="burbuja-muestra estado-pausado">z</span>pausado</li>
    <li><span className="burbuja-muestra estado-libre" />libre, espera su turno</li>
  </ul>
}

// Color de la ropa: el de identidad para los trabajadores (el mismo de sus gráficos); el de su sala para los demás.
function colorRopa(a) {
  return a.color ? colorIdentidad(a.color) : `var(--oficina-ropa-${a.equipo})`
}

function Avatar({ agente }) {
  return <svg className={`oficina-avatar estado-${agente.estado}`} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path d="M4 23 C4 16 20 16 20 23 Z" style={{ fill: colorRopa(agente) }} />
    <circle cx="12" cy="9" r="5.2" className="oficina-piel" />
    <path d="M6.8 8.4 C7 3.6 17 3.6 17.2 8.4 C15 6.6 9 6.6 6.8 8.4 Z" className="oficina-pelo" />
  </svg>
}

// ---------- Sala isométrica ----------
const PARED = 1.5
const ESCRITORIO = { ancho: 1.5, fondo: 0.75, alto: 0.72 }

// Caja isométrica: tapa, frente (lado y máximo) y costado (lado x máximo). clase: prefijo de los tres colores.
function Caja({ x0, y0, x1, y1, z0 = 0, z1, clase }) {
  return <g className={clase}>
    <polygon className="of-cara-frente" points={puntos([iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)])} />
    <polygon className="of-cara-costado" points={puntos([iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)])} />
    <polygon className="of-cara-tapa" points={puntos([iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)])} />
  </g>
}

function Sala({ equipo, agentes, elegidoId, abrir, porFila }) {
  const plano = planoSala(agentes.length, porFila)
  const { ancho: W, fondo: D } = plano
  const esquinas = [iso(0, 0, PARED), iso(W, 0, PARED), iso(W, D), iso(0, D), iso(0, 0)]
  const minX = Math.min(...esquinas.map(p => p.x)) - 8
  const maxX = Math.max(...esquinas.map(p => p.x)) + 8
  const minY = Math.min(...esquinas.map(p => p.y)) - 34
  const maxY = Math.max(...esquinas.map(p => p.y)) + 10
  const trabajando = agentes.filter(a => a.estado === 'trabajando').length
  const ubicados = agentes.map((a, i) => ({ a, ...plano.puestos[i] })).sort((p, q) => p.x + p.y - (q.x + q.y))
  return <figure className={`oficina-sala sala-${equipo}`}>
    <figcaption><strong>{EQUIPOS[equipo].nombre}</strong> <span className="tenue">· {agentes.length} agentes{trabajando ? ` · ${trabajando} trabajando` : ''}</span></figcaption>
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="group" aria-label={`Sala ${EQUIPOS[equipo].nombre}: ${EQUIPOS[equipo].descripcion}`}>
      <polygon className="sala-pared-fondo" points={puntos([iso(0, 0), iso(W, 0), iso(W, 0, PARED), iso(0, 0, PARED)])} />
      <polygon className="sala-pared-lado" points={puntos([iso(0, 0), iso(0, D), iso(0, D, PARED), iso(0, 0, PARED)])} />
      <polygon className="sala-piso" points={puntos([iso(0, 0), iso(W, 0), iso(W, D), iso(0, D)])} />
      {Array.from({ length: Math.floor(W) }, (_, i) => <line key={`x${i}`} className="sala-junta" x1={iso(i + 1, 0).x} y1={iso(i + 1, 0).y} x2={iso(i + 1, D).x} y2={iso(i + 1, D).y} />)}
      {Array.from({ length: Math.floor(D) }, (_, i) => <line key={`y${i}`} className="sala-junta" x1={iso(0, i + 1).x} y1={iso(0, i + 1).y} x2={iso(W, i + 1).x} y2={iso(W, i + 1).y} />)}
      <Ventana W={W} />
      {/* De atrás hacia adelante (x + y), para que lo de adelante tape a lo de atrás. */}
      {ubicados.map(({ a, x, y }) => <Puesto key={a.id} agente={a} x={x} y={y} elegido={a.id === elegidoId} abrir={abrir} />)}
      {/* Nombres y burbujas encima de todo: ningún escritorio los tapa. */}
      <g className="sala-rotulos" aria-hidden="true">
        {ubicados.map(({ a, x, y }) => <Rotulo key={a.id} agente={a} x={x} y={y} />)}
      </g>
    </svg>
  </figure>
}

// Una ventana en la pared del fondo: solo para que la sala se lea como sala.
function Ventana({ W }) {
  const x0 = W / 2 - 0.9, x1 = W / 2 + 0.9
  return <polygon className="sala-ventana" points={puntos([iso(x0, 0, 0.55), iso(x1, 0, 0.55), iso(x1, 0, 1.25), iso(x0, 0, 1.25)])} />
}

function Puesto({ agente: a, x, y, elegido, abrir }) {
  const e = ESCRITORIO
  const d = { x0: x - e.ancho / 2, x1: x + e.ancho / 2, y0: y - e.fondo / 2, y1: y + e.fondo / 2 }
  const cabeza = iso(x, y - 0.75, 1.45)
  const cuerpo = iso(x, y - 0.75, 0.7)
  const presente = a.estado !== 'pausado'
  const etiqueta = `${a.nombre}: ${ESTADOS[a.estado]}. ${a.ahora}`
  const teclear = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(a.id) } }
  return <g className={`puesto estado-${a.estado}${elegido ? ' is-elegido' : ''}`} role="button" tabIndex={0} aria-label={etiqueta} onClick={() => abrir(a.id)} onKeyDown={teclear}>
    <title>{etiqueta}</title>
    <ellipse className="puesto-alfombra" cx={iso(x, y).x} cy={iso(x, y).y} rx="44" ry="25" />
    {/* La silla siempre está; la persona, solo si no está pausada. */}
    <Caja clase="of-silla" x0={x - 0.32} x1={x + 0.32} y0={y - 1.05} y1={y - 0.5} z1={0.42} />
    {presente && <g className="of-persona">
      <path d={`M${cuerpo.x - 11} ${cuerpo.y + 6} C${cuerpo.x - 11} ${cuerpo.y - 14} ${cuerpo.x + 11} ${cuerpo.y - 14} ${cuerpo.x + 11} ${cuerpo.y + 6} Z`} style={{ fill: colorRopa(a) }} />
      <circle cx={cabeza.x} cy={cabeza.y} r="8.5" className="oficina-piel" />
      <path d={`M${cabeza.x - 8.7} ${cabeza.y - 1} C${cabeza.x - 8} ${cabeza.y - 12} ${cabeza.x + 8} ${cabeza.y - 12} ${cabeza.x + 8.7} ${cabeza.y - 1} C${cabeza.x + 5} ${cabeza.y - 5} ${cabeza.x - 5} ${cabeza.y - 5} ${cabeza.x - 8.7} ${cabeza.y - 1} Z`} className="oficina-pelo" />
    </g>}
    <Caja clase="of-escritorio" x0={d.x0} x1={d.x1} y0={d.y0} y1={d.y1} z1={e.alto} />
    {/* Monitor de espaldas a nosotros: se enciende cuando el agente trabaja. */}
    <Caja clase="of-monitor" x0={x - 0.42} x1={x + 0.42} y0={y - 0.12} y1={y - 0.04} z0={e.alto + 0.06} z1={e.alto + 0.62} />
    <Caja clase="of-monitor-pie" x0={x - 0.08} x1={x + 0.08} y0={y - 0.1} y1={y - 0.04} z0={e.alto} z1={e.alto + 0.08} />
  </g>
}

// El nombre debajo del escritorio y, si hay algo que decir, la burbuja sobre la cabeza.
function Rotulo({ agente: a, x, y }) {
  const cabeza = iso(x, y - 0.75, 1.45)
  const pie = iso(x + 0.45, y + 0.85)
  const nombre = nombreCorto(a.nombre)
  const texto = nombre.length > 18 ? `${nombre.slice(0, 17)}…` : nombre
  const ancho = texto.length * 5.6 + 12
  return <g className={`rotulo estado-${a.estado}`}>
    <rect className="rotulo-fondo" x={pie.x - ancho / 2} y={pie.y - 9} width={ancho} height="14" rx="7" />
    <text className="puesto-nombre" x={pie.x} y={pie.y + 1.5} textAnchor="middle">{texto}</text>
    {BURBUJA[a.estado] !== undefined && <Burbuja estado={a.estado} x={cabeza.x + 13} y={cabeza.y - 22} />}
  </g>
}

// Solo estos estados llevan burbuja: libre y nuevo no dicen nada (el nuevo se ve apagado).
const BURBUJA = { trabajando: null, error: '!', pausado: 'z' }
function Burbuja({ estado, x, y }) {
  const signo = BURBUJA[estado]
  return <g className={`burbuja estado-${estado}`} transform={`translate(${x} ${y})`}>
    <rect x="-13" y="-10" width="26" height="18" rx="9" />
    <path d="M-6 7 L-9 13 L-1 8 Z" />
    {estado === 'trabajando'
      ? [-6, 0, 6].map((dx, i) => <circle key={dx} cx={dx} cy="-1" r="2" className={`burbuja-punto punto-${i}`} />)
      : <text x="0" y="3.5" textAnchor="middle">{signo}</text>}
  </g>
}

// ---------- Panel del agente ----------
const PESTANAS = [['ahora', 'Ahora'], ['que', 'Qué hace'], ['tareas', 'Tareas'], ['herramientas', 'Herramientas'], ['charla', 'Conversación']]

function PanelAgente({ agente: a, pestana, setPestana, ahora, cerrar, charla, setCharla, hablar }) {
  const panel = useRef(null)
  // cerrar cambia en cada render: se guarda en una ref para que el efecto corra una sola vez (al abrir el panel)
  // y no le saque el foco al cuadro de la charla cada vez que llega una respuesta.
  const alCerrar = useRef(cerrar)
  useEffect(() => { alCerrar.current = cerrar })
  useEffect(() => {
    panel.current?.focus()
    const alTeclear = e => { if (e.key === 'Escape') alCerrar.current() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])
  return <>
    <div className="oficina-panel-fondo" onClick={cerrar} />
    <aside ref={panel} tabIndex={-1} className="oficina-panel" role="dialog" aria-modal="true" aria-label={`Agente ${a.nombre}`}>
      <header className="oficina-panel-cabeza">
        <Avatar agente={a} />
        <div>
          <h2>{a.nombre}</h2>
          <p className="tenue">{EQUIPOS[a.equipo].nombre} · {a.rol}</p>
        </div>
        <button type="button" className="close-x" onClick={cerrar} aria-label="Cerrar">✕</button>
      </header>
      <div className="oficina-pestanas" role="tablist">
        {PESTANAS.map(([id, texto]) => <button key={id} type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'is-activa' : ''} onClick={() => setPestana(id)}>{texto}</button>)}
      </div>
      <div className="oficina-panel-cuerpo" role="tabpanel">
        {pestana === 'ahora' && <>
          <p><span className={`oficina-estado estado-${a.estado}`}>{ESTADOS[a.estado]}</span></p>
          <p className="oficina-ahora">{a.ahora}</p>
          {a.ultima && <p className="tenue">Última actividad: {haceCuanto(new Date(a.ultima).toISOString(), ahora)} ({horaAR(a.ultima)}).</p>}
          <button type="button" className="btn btn-sm" onClick={() => setPestana('charla')}>Preguntarle algo</button>
        </>}
        {pestana === 'que' && <p className="oficina-descripcion">{a.descripcion || 'Sin descripción cargada.'}</p>}
        {pestana === 'tareas' && (a.tareas.length
          ? <ol className="oficina-tareas">{a.tareas.map((t, i) => <li key={i} className={`nivel-${t.nivel}`}>
            <span className="oficina-tarea-cuando">{t.at ? haceCuanto(new Date(t.at).toISOString(), ahora) : ''}</span>
            <span>{t.texto}</span>
          </li>)}</ol>
          : <p className="tenue">Todavía no hay tareas registradas.</p>)}
        {pestana === 'herramientas' && (a.herramientas.length
          ? <ul className="oficina-herramientas">{a.herramientas.map(h => <li key={h}>{h}</li>)}</ul>
          : <p className="tenue">Sin herramientas declaradas.</p>)}
        {pestana === 'charla' && <Charla agente={a} mensajes={charla} setMensajes={setCharla} hablar={hablar} />}
      </div>
    </aside>
  </>
}

function Charla({ agente, mensajes, setMensajes, hablar }) {
  const [texto, setTexto] = useState('')
  const [esperando, setEsperando] = useState(false)
  const [error, setError] = useState('')
  const fin = useRef(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [mensajes, esperando])

  async function enviar(e) {
    e.preventDefault()
    const pregunta = texto.trim()
    if (!pregunta || esperando) return
    const nuevos = [...mensajes, { role: 'user', content: pregunta }]
    setMensajes(nuevos); setTexto(''); setError(''); setEsperando(true)
    try {
      const respuesta = await hablar(agente.id, nuevos)
      setMensajes(m => [...m, { role: 'assistant', content: respuesta }])
    } catch (err) { setError(err.message) }
    setEsperando(false)
  }

  return <div className="oficina-charla">
    <p className="tenue oficina-charla-nota">Responde con lo que dice su registro. No cambia nada; la charla se borra al cerrar la app.</p>
    <div className="oficina-mensajes" aria-live="polite">
      {!mensajes.length && <p className="tenue">Por ejemplo: «¿qué hiciste hoy?», «¿por qué fallaste?», «¿qué necesitás de mí?»</p>}
      {mensajes.map((m, i) => <p key={i} className={`oficina-mensaje de-${m.role}`}>{m.content}</p>)}
      {esperando && <p className="oficina-mensaje de-assistant tenue">{agente.nombre} está escribiendo…</p>}
      <span ref={fin} />
    </div>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    <form className="oficina-charla-form" onSubmit={enviar}>
      <textarea rows={2} value={texto} disabled={esperando} placeholder={`Escribile a ${agente.nombre}…`} aria-label={`Mensaje para ${agente.nombre}`}
        onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={esperando || !texto.trim()}>Enviar</button>
    </form>
  </div>
}
