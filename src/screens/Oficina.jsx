import { Component, Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { colorIdentidad } from '../tablero.mjs'
import { aplicarCorrida, haceCuanto, horaAR } from '../trabajadores.mjs'
import { armarOficina, contarEstados, hoyAR, tocanPropuestas, eventosOficina, mesOficina, mesVecino, hojasDePedidos, resumenReunion, recomendacion, riesgoDe, EQUIPOS, ESTADOS } from '../oficina.mjs'
import { CabeceraPantalla, Bloques, Bloque } from '../estructura.jsx'
import { ConvocarReunion, AvisoLlegada, VistaSala, VistaTurnos } from './OficinaReunion.jsx'
import { PLAZO_REUNION_S } from '../oficinaPlano.mjs'
import './Oficina.css'

// La oficina en 3D se carga recién al abrir la pantalla (three.js es pesado). Si el equipo no puede mostrar 3D o la
// escena falla, queda un aviso: los agentes igual están en la lista de abajo.
const Oficina3D = lazy(() => import('./Oficina3D.jsx'))
function hayWebGL() {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}
class SiFalla extends Component {
  constructor(props) { super(props); this.state = { fallo: false } }
  static getDerivedStateFromError() { return { fallo: true } }
  render() { return this.state.fallo ? this.props.respaldo : this.props.children }
}

// La Oficina: todos los agentes (Trabajadores, UP y PDG) en sus salas. Cada uno en su escritorio; la burbuja dice
// cómo está (trabajando, con un problema, pausado). Tocás uno y ves qué hace, sus tareas, sus herramientas, y podés
// hablarle. Todo se lee de las tablas que ya existen: esta pantalla no escribe nada.
const DIA_MS = 24 * 3600_000
const ULTIMAS = 8

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
  const [trabajadores, salud, upCorridas, chequeo, piezas, pdgAgentes, pdgTrabajos, pdgCuentas, admin, solicitudes, actas, tareas, conexiones, operador, feminaCorridas, feminaHallazgos] = await Promise.all([
    leer('trabajadores', supabase.from('trabajadores').select('*').order('id'), []),
    leer('salud del sistema', supabase.rpc('salud_sistema'), null),
    leer('corridas de UP', supabase.from('up_corridas').select('estado,error,pasos,iniciado_at').order('iniciado_at', { ascending: false }).limit(15), []),
    leer('Noruega', supabase.from('up_chequeos').select('estado,chequeos,at').order('at', { ascending: false }).limit(1).maybeSingle(), null),
    leer('piezas de UP', supabase.from('up_piezas').select('fecha,estado,texto').in('estado', ['falta_info', 'revision', 'pendiente']).gte('fecha', hoy).limit(500), []),
    leer('agentes de PDG', supabase.from('pdg_agentes').select('clave,nombre,rol,orden'), []),
    leer('trabajos de PDG', supabase.from('pdg_trabajos').select('agente,estado,pedido,created_at,pdg_cuentas(nombre)').order('created_at', { ascending: false }).limit(80), []),
    leer('cuentas de PDG', supabase.from('pdg_cuentas').select('nombre,etapa,proxima_fecha').not('proxima_fecha', 'is', null), []),
    leer('Administración', supabase.rpc('oficina_administracion'), []),
    leer('Sistemas', supabase.from('oficina_solicitudes').select('id,agente,titulo,detalle,estado,nota,creada,decidida,accion,origen').order('creada', { ascending: false }).limit(40), []),
    leer('actas', supabase.from('oficina_actas').select('id,modo,inicio,fin,asistentes,mensajes,resumen,titulo,plan').order('fin', { ascending: false }).limit(15), []),
    leer('tareas', supabase.from('oficina_tareas').select('id,acta_id,tarea,area,responsable,supervisor,vence,estado,presentada').order('vence', { ascending: true, nullsFirst: false }).limit(150), []),
    leer('conexiones', supabase.rpc('oficina_conexiones'), []),
    leer('tareas programadas', supabase.rpc('oficina_operador'), []),
    leer('vueltas de Femina', supabase.from('pdg_femina_corridas').select('estado,iniciada_at,resumen,error').order('iniciada_at', { ascending: false }).limit(8), []),
    leer('lo que encontró Femina', supabase.from('pdg_hallazgos').select('tipo,titulo,estado,created_at').eq('estado', 'nuevo').order('created_at', { ascending: false }).limit(60), []),
  ])
  const corridasPor = {}
  await Promise.all(trabajadores.map(async t => {
    try { corridasPor[t.clave] = await corridasDe(t.clave, ahora) } catch (e) { errores.push(`corridas de ${t.nombre}: ${e.message}`); corridasPor[t.clave] = [] }
  }))
  return {
    trabajadores, corridasPor, salud, upCorridas, chequeo, hoy, errores,
    piezas: piezas.map(p => ({ fecha: p.fecha, estado: p.estado, tiene_texto: Boolean(p.texto) })),
    pdgAgentes, pdgTrabajos: pdgTrabajos.map(t => ({ ...t, cuenta: t.pdg_cuentas })), pdgCuentas, admin, solicitudes, actas, conexiones, operador, tareas,
    femina: { corridas: feminaCorridas, hallazgos: feminaHallazgos },
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
  // La primera vez del día, los equipos traen sus propuestas (entran como pedidos de permiso en Sistemas).
  const propuestasPedidas = useRef(false)
  useEffect(() => {
    if (!datos || propuestasPedidas.current || !tocanPropuestas(datos.solicitudes, Date.now())) return
    propuestasPedidas.current = true
    supabase.functions.invoke('oficina-chat', { body: { propuestas: true } })
      .then(({ data }) => { if (data?.propuestas?.length) recargar() })
      .catch(() => { /* sin propuestas hoy: no frena la oficina */ })
  }, [datos, recargar])
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
    errores={[error, ...(datos?.errores ?? [])].filter(Boolean)} ahora={ahora} hablar={conAviso(hablarConAgente, recargar)}
    hablarReunion={conAviso(hablarEnReunion, recargar)} actualizar={recargar}
    solicitudes={datos?.solicitudes ?? []} actas={datos?.actas ?? []} decidir={async (id, estado, nota, accion) => { await decidirSolicitud(id, estado, nota, accion); await recargar() }}
    tareas={datos?.tareas ?? []} cambiarTarea={async (id, estado) => { await cambiarTarea(id, estado); await recargar() }}
    marcarPresentada={async ids => { await marcarPresentada(ids); await recargar() }}
    guardarActa={async acta => { try { await guardarActa(acta) } finally { await recargar() } }} />
}

// Reunión: una pregunta de Daniela y responden los que tengan algo que decir ({ agente, texto }).
// Sistemas: Daniela aprueba, rechaza o da por hecho un pedido (con una nota opcional).
// Si el pedido trae una acción (por ejemplo, el de Noruega para frenar una pieza), aprobarlo la ejecuta en el servidor.
async function decidirSolicitud(id, estado, nota, accion) {
  if (estado === 'aprobada' && accion) {
    const { data, error } = await supabase.functions.invoke('oficina-sistemas', { body: { solicitud: id } })
    let respuesta = data
    if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error de conexión */ } }
    if (error || !respuesta?.ok) throw new Error(respuesta?.error || 'No se pudo ejecutar el pedido.')
    return
  }
  const { error } = await supabase.from('oficina_solicitudes').update({ estado, nota: nota || null, decidida: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
// Al terminar una reunión, María escribe el acta con el plan (oficina-chat la guarda con las tareas y los pedidos a
// Sistemas). Si la IA no responde, se guarda igual la conversación con un resumen simple.
async function guardarActa({ resumen, nombres, ...acta }) {
  const conversan = acta.asistentes.filter(id => /^(trabajadores|up|pdg):/.test(id))
  if (conversan.length) {
    const { data, error } = await supabase.functions.invoke('oficina-chat', { body: { acta: true, ...acta, asistentes: conversan, nombres } })
    if (!error && data?.id) return
  }
  const { error } = await supabase.from('oficina_actas').insert({ ...acta, resumen, titulo: 'Reunión' })
  if (error) throw new Error(error.message)
}
// Cuando convocás la reunión que pidió un supervisor para mostrar un proyecto terminado, sus tareas quedan presentadas.
async function marcarPresentada(ids) {
  const { error } = await supabase.from('oficina_tareas').update({ presentada: true }).in('id', ids)
  if (error) throw new Error(error.message)
}
async function cambiarTarea(id, estado) {
  const { error } = await supabase.from('oficina_tareas').update({ estado, actualizada: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
// Si en la charla un agente pidió permiso para algo, se avisa en su respuesta y se vuelve a leer.
const avisoPedido = s => ` (Te pedí permiso: «${s.titulo}». Lo aprobás en Sistemas.)`
function conAviso(hablarFn, recargar) {
  return async (...args) => {
    const r = await hablarFn(...args)
    if (!r.solicitudes?.length) return r.valor
    recargar()
    if (typeof r.valor === 'string') return r.valor + r.solicitudes.map(avisoPedido).join('')
    return r.valor.map(x => ({ ...x, texto: x.texto + r.solicitudes.filter(s => s.agente === x.agente).map(avisoPedido).join('') }))
  }
}

// Los de Administración y Sistemas no tienen IA: escuchan pero no hablan.
const conversan = id => !/^(admin|sistemas):/.test(String(id))
async function hablarEnReunion(asistentes, mensajes) {
  const { data, error } = await supabase.functions.invoke('oficina-chat', { body: { reunion: true, asistentes: asistentes.filter(conversan), mensajes } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error de conexión */ } }
  if (error || !respuesta?.respuestas?.length) throw new Error(respuesta?.error || 'Nadie pudo responder. Probá de nuevo.')
  return { valor: respuesta.respuestas, solicitudes: respuesta.solicitudes ?? [] }
}

async function hablarConAgente(agente, mensajes) {
  if (!conversan(agente)) throw new Error('Es una tarea programada: no conversa. Mirá sus corridas en «Tareas».')
  const { data, error } = await supabase.functions.invoke('oficina-chat', { body: { agente, mensajes } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error de conexión */ } }
  if (error || !respuesta?.texto) throw new Error(respuesta?.error || 'No pude hablar con el agente. Probá de nuevo.')
  return { valor: respuesta.texto, solicitudes: respuesta.solicitudes ?? [] }
}

// ---------- Vista ----------
// reloj: de dónde sale la hora para la luz del día (en la app, la actual; se puede cambiar para probar).
export function OficinaVista({ cargando, agentes, pendientes, errores = [], ahora, hablar, hablarReunion, actualizar = async () => {}, reloj: relojLuz = Date.now,
  solicitudes = [], actas = [], tareas = [], decidir = async () => {}, cambiarTarea = async () => {}, marcarPresentada = async () => {}, guardarActa = async () => {} }) {
  const [elegidoId, setElegidoId] = useState(null)
  const [pestana, setPestana] = useState('ahora')
  const [charlas, setCharlas] = useState({})
  const elegido = agentes.find(a => a.id === elegidoId) || null
  const eventos = useMemo(() => eventosOficina({ actas, tareas, solicitudes }), [actas, tareas, solicitudes])
  const cuenta = contarEstados(agentes)
  const abrir = (id, p = 'ahora') => { setElegidoId(id); setPestana(p) }
  const [tres] = useState(hayWebGL)

  // ---------- Reunión ----------
  // reunion: { id, modo: 'sala' | 'oficina' | 'turnos', estado: 'convocada' | 'en_curso' | 'volviendo', asistentes, inicio,
  // empezo, vuelta, turnos: { [id]: { llamado, fin } } }. La escena 3D mueve a los agentes; acá se lleva el estado.
  const [reunion, setReunion] = useState(null)
  const [convocando, setConvocando] = useState(false)
  const [llegadas, setLlegadas] = useState(null)
  const [hablando, setHablando] = useState(null)
  const [reloj, setReloj] = useState(() => Date.now())
  const [lejos, setLejos] = useState(false)
  const [volverDaniela, setVolverDaniela] = useState(0)
  const [escribiendoActa, setEscribiendoActa] = useState(false)
  const activa = Boolean(reunion && reunion.estado !== 'volviendo')
  useEffect(() => {
    if (!activa) return
    const i = setInterval(() => setReloj(Date.now()), 1000)
    return () => clearInterval(i)
  }, [activa])
  const convocar = (asistentes, modo, tema = null) => {
    setConvocando(false)
    setElegidoId(null)
    setLlegadas(null)
    setReunion({ id: Date.now(), modo, estado: 'convocada', asistentes, inicio: Date.now(), turnos: {}, tema })
  }
  // «Responder» un mensaje: abre la charla con ese agente, que arranca con lo que te pidió.
  const responder = x => {
    setCharlas(c => ({ ...c, [x.agente]: [...(c[x.agente] ?? []), { role: 'assistant', content: `Te pedí permiso para «${x.titulo}».${x.detalle ? ` ${x.detalle}` : ''}` }] }))
    abrir(x.agente, 'charla')
  }
  const verCalendario = useCallback(() => document.getElementById('oficina-calendario')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), [])
  const empezar = useCallback(async () => {
    // Antes de empezar se vuelve a leer todo: vienen con su información más actualizada.
    setReunion(r => (r && r.estado === 'convocada' ? { ...r, estado: 'preparando' } : r))
    await actualizar()
    setReunion(r => {
      if (!r || r.estado !== 'preparando') return r
      const turnos = r.modo === 'turnos' ? { [r.asistentes[0]]: { llamado: Date.now() } } : {}
      return { ...r, estado: 'en_curso', empezo: Date.now(), turnos }
    })
  }, [actualizar])
  // Empieza sola cuando llegaron todos o se cumplió el plazo.
  useEffect(() => {
    if (reunion?.estado !== 'convocada' || !llegadas) return
    const pasado = (reloj - reunion.inicio) / 1000
    const todos = reunion.asistentes.every(id => llegadas[id] != null && llegadas[id] <= pasado)
    if (todos || pasado >= PLAZO_REUNION_S) empezar()
  }, [reloj, reunion, llegadas, empezar])
  // Al terminar una reunión que llegó a empezar, se guarda su acta (participantes, conversación y resumen).
  const terminar = mensajes => {
    setHablando(null)
    if (reunion?.estado === 'en_curso' && Array.isArray(mensajes)) {
      const vinieron = reunion.asistentes.map(id => agentes.find(a => a.id === id)).filter(Boolean)
      setEscribiendoActa(true)
      guardarActa({ modo: reunion.modo, inicio: new Date(reunion.empezo ?? reunion.inicio).toISOString(), asistentes: reunion.asistentes, mensajes, resumen: resumenReunion(vinieron, pendientes), nombres: vinieron.map(a => nombreCorto(a.nombre)) })
        .catch(() => { /* el acta es un extra: si no se pudo guardar, la reunión termina igual */ })
        .finally(() => setEscribiendoActa(false))
    }
    setReunion(r => {
      if (!r) return r
      const turnos = { ...r.turnos }
      for (const [id, tu] of Object.entries(turnos)) if (tu.llamado && !tu.fin) turnos[id] = { ...tu, fin: Date.now() }
      return { ...r, estado: 'volviendo', vuelta: Date.now(), turnos }
    })
  }
  const siguiente = () => setReunion(r => {
    if (!r) return r
    const turnos = { ...r.turnos }
    for (const [id, tu] of Object.entries(turnos)) if (tu.llamado && !tu.fin) turnos[id] = { ...tu, fin: Date.now() }
    const prox = r.asistentes.find(id => !turnos[id]?.llamado)
    if (prox) turnos[prox] = { llamado: Date.now() }
    return { ...r, turnos }
  })
  const alPlanificar = useCallback((id, ll) => setReunion(r => { if (r?.id === id) setLlegadas(ll); return r }), [])
  const alVolvieron = useCallback(id => setReunion(r => (r?.id === id ? null : r)), [])
  const enCurso = reunion?.estado === 'en_curso'
  const superpuesto = reunion?.estado === 'convocada' || reunion?.estado === 'preparando'
    ? <AvisoLlegada reunion={reunion} agentes={agentes} llegadas={llegadas} ahora={reloj} empezar={empezar} cancelar={terminar} />
    : enCurso && (reunion.modo === 'sala' || reunion.modo === 'oficina')
      ? <VistaSala reunion={reunion} agentes={agentes} ahora={reloj} hablando={hablando} setHablando={setHablando} hablarReunion={hablarReunion} terminar={terminar} />
      : enCurso && reunion.modo === 'turnos'
        ? <VistaTurnos reunion={reunion} agentes={agentes} ahora={reloj} hablando={hablando} setHablando={setHablando} hablar={hablar} siguiente={siguiente} terminar={terminar} />
        : null
  const sin3D = <p className="oficina-sin-3d">Este equipo no puede mostrar la oficina en 3D. Los agentes están en la lista de abajo.</p>

  return <div className="oficina">
    <CabeceraPantalla sobretitulo="Agentes" titulo="Oficina" cargando={cargando}
      subtitulo={`${agentes.length} agentes: Trabajadores, UP, PDG comercial y Administración. Tocá uno para ver qué hace o hablarle.`}
      cifras={[
        { valor: cuenta.total, etiqueta: 'agentes' },
        { valor: cuenta.trabajando, etiqueta: 'trabajando ahora' },
        { valor: cuenta.error, etiqueta: 'con un problema', nivel: cuenta.error ? 'error' : undefined },
        { valor: pendientes.length, etiqueta: 'te toca', nivel: pendientes.length ? 'aviso' : undefined },
      ]} />
    {errores.map(e => <p key={e} role="alert" className="feedback-error">{e}</p>)}
    <Bloques disposicion="principal">
      <Bloque titulo="La oficina" ancho="completo" accion={!cargando && tres && <button type="button" className="btn btn-sm btn-primary"
        disabled={Boolean(reunion)} onClick={() => setConvocando(true)}>{reunion ? 'Reunión en curso' : 'Convocar reunión'}</button>}>
        {cargando ? <p className="empty-state">Abriendo la oficina…</p> : <>
          {tres
            ? <SiFalla respaldo={sin3D}><Suspense fallback={<p className="oficina-sin-3d">Abriendo la oficina…</p>}>
              <Oficina3D agentes={agentes} elegidoId={elegidoId} abrir={abrir} reunion={reunion} hablando={hablando}
                alPlanificar={alPlanificar} alVolvieron={alVolvieron} volverDaniela={volverDaniela} alMoverDaniela={setLejos}
                pantallaCompleta={enCurso} reloj={relojLuz} calendario={eventos} alTocarPizarron={verCalendario}>{superpuesto}</Oficina3D>
            </Suspense></SiFalla>
            : sin3D}
          {tres && <div className="oficina-ayuda">
            <span>Arrastrá para moverte · botón derecho o ⟲ ⟳ para girar · rueda, + y − para acercar · tocá un agente para ver qué hace · <strong>doble click</strong> en el piso para caminar vos · <strong>🚶</strong> para recorrerla a pie, como en Street View.</span>
            {lejos && <button type="button" className="btn btn-sm" onClick={() => setVolverDaniela(n => n + 1)}>Volver a mi escritorio</button>}
            <SonidoOficina />
          </div>}
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
            {p.reunion ? <button type="button" className="btn btn-sm btn-primary" disabled={Boolean(reunion)} onClick={() => setConvocando(p.reunion)}>Convocar</button>
              : p.agente && agentes.some(a => a.id === p.agente) && <button type="button" className="btn btn-sm" onClick={() => abrir(p.agente)}>Ver agente</button>}
          </li>)}</ul>
          : <p className="tenue">Nada pendiente: los agentes no te necesitan por ahora.</p>}
      </Bloque>
      <Bloque titulo="Trabajando ahora">
        {cargando ? <p className="tenue">Revisando…</p> : <ActividadAhora agentes={agentes} abrir={abrir} />}
      </Bloque>
      {/* Mensajes a todo el ancho: la tabla de pedidos necesita lugar para sus columnas y los botones. */}
      <Bloque titulo={`Mensajes${solicitudes.filter(x => x.estado === 'pendiente').length ? ` · ${solicitudes.filter(x => x.estado === 'pendiente').length} para aprobar` : ''}`} ancho="completo">
        {cargando ? <p className="tenue">Revisando…</p> : <Mensajes solicitudes={solicitudes} agentes={agentes} decidir={decidir} responder={responder} ahora={ahora} />}
      </Bloque>
      <Bloque titulo="Calendario de la oficina" ancho="completo">
        <div id="oficina-calendario">{cargando ? <p className="tenue">Revisando…</p> : <CalendarioOficina eventos={eventos} ahora={ahora} />}</div>
      </Bloque>
      <Bloque titulo="Archivo de la oficina" ancho="completo">
        {cargando ? <p className="tenue">Revisando…</p> : <Archivo actas={actas} tareas={tareas} agentes={agentes} escribiendo={escribiendoActa} cambiarTarea={cambiarTarea} ahora={ahora} />}
      </Bloque>
    </Bloques>
    {convocando && <ConvocarReunion agentes={agentes} preseleccion={convocando.asistentes ?? null} cerrar={() => setConvocando(false)}
      alConvocar={(ids, modo) => {
        if (convocando.tareas) marcarPresentada(convocando.tareas).catch(() => {})
        if (convocando.solicitud) decidir(convocando.solicitud, 'hecha', 'Convocada.').catch(() => {})
        convocar(ids, modo, convocando.tema ? { tema: convocando.tema, detalle: convocando.detalle, pidio: convocando.pidio } : null)
      }} />}
    {elegido && <PanelAgente key={elegido.id} agente={elegido} pestana={pestana} setPestana={setPestana} ahora={ahora} cerrar={() => setElegidoId(null)}
      charla={charlas[elegido.id] ?? []} setCharla={m => setCharlas(c => ({ ...c, [elegido.id]: typeof m === 'function' ? m(c[elegido.id] ?? []) : m }))} hablar={hablar} />}
  </div>
}

const nombreCorto = n => String(n).split(' (')[0]

// Sonido ambiente de oficina (el de cafetería de la app), apagado hasta que lo prendas.
function SonidoOficina() {
  const audio = useRef(null)
  const [activo, setActivo] = useState(false)
  useEffect(() => { const a = audio.current; return () => a?.pause() }, [])
  const alternar = async () => {
    const a = audio.current
    if (!a) return
    if (activo) { a.pause(); setActivo(false); return }
    try { a.volume = 0.25; await a.play(); setActivo(true) } catch { setActivo(false) }
  }
  return <>
    <button type="button" className="btn btn-sm" aria-pressed={activo} onClick={alternar}>{activo ? '🔊 Sonido de oficina' : '🔈 Sonido de oficina'}</button>
    <audio ref={audio} src={`${import.meta.env.BASE_URL}sonidos/coffee.ogg`} loop preload="none" />
  </>
}

// ---------- Sistemas ----------
// Los pedidos que María y Noruega derivan. Ninguno avanza sin vos: lo aprobás, lo rechazás o, cuando ya está hecho,
// lo cerrás. La nota de Sistemas explica qué implica cada uno.
const TEXTO_APROBAR = { programar: 'Aprobar: que Sistemas lo programe', tarea: 'Aprobar', reunion: 'Aprobar y agendarla', cargar_calendario_up: 'Aprobar y cargarlo' }
// Las notas de Sistemas traen el link del pedido en GitHub: que se pueda abrir.
function ConLinks({ texto }) {
  return String(texto).split(/(https:\/\/\S+)/).map((parte, i) => (/^https:\/\//.test(parte)
    ? <a key={i} href={parte} target="_blank" rel="noreferrer">{parte.replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\//, '')}</a>
    : parte))
}
// Los pedidos de los agentes, como un libro de Excel: una hoja por agente (las pestañas de abajo, con cuántos esperan tu
// respuesta) y en cada hoja una tabla con sus pedidos. Tocando una fila se abre con el detalle, la recomendación de la
// Mesa de entrada y lo que hizo Sistemas. Podés aprobar, rechazar o responderle (abre la charla con ese agente).
const ETIQUETA_PEDIDO = { programar: 'Código', tarea: 'Tarea', reunion: 'Reunión', cargar_calendario_up: 'Calendario UP', frenar_pieza: 'Frenar pieza' }
const ESTADO_PEDIDO = { pendiente: 'Espera tu OK', aprobada: 'En marcha', rechazada: 'Rechazado', hecha: 'Hecho' }
function fechaReunion(f) { return new Date(`${f}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }) }
function fechaPedido(iso) { return new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short' }) }
function Mensajes({ solicitudes, agentes, decidir, responder, ahora }) {
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState('')
  const [hoja, setHoja] = useState(null)
  const [abierto, setAbierto] = useState(null) // la fila con el detalle desplegado
  const agente = id => agentes.find(a => a.id === id)
  const nombre = id => nombreCorto(agente(id)?.nombre ?? id)
  const hojas = hojasDePedidos(solicitudes)
  const actual = hojas.find(h => h.agente === hoja) ?? hojas[0]
  const accion = async (x, estado) => {
    setOcupado(x.id); setError('')
    try { await decidir(x.id, estado, x.nota, x.accion) } catch (e) { setError(`No se pudo guardar: ${e.message}`) }
    setOcupado(null)
  }
  if (!hojas.length) return <p className="tenue">Todavía nadie te pidió nada.</p>
  const a = agente(actual.agente)
  const charla = a && !a.sinCharla
  return <>
    <p className="tenue">Lo que te piden los agentes, una hoja por agente. Nada se hace sin tu permiso.</p>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    <div className="oficina-libro">
      <div className="oficina-hoja" role="tabpanel" aria-label={`Pedidos de ${nombre(actual.agente)}`}>
        <table className="oficina-planilla">
          <thead><tr><th className="col-fecha">Fecha</th><th>Pedido</th><th className="col-tipo">Tipo</th><th className="col-estado">Estado</th><th className="col-acc" aria-label="Acciones" /></tr></thead>
          <tbody>{actual.pedidos.map(x => {
            const tipo = x.accion?.tipo
            const largo = x.id === abierto
            const riesgo = riesgoDe(x) === 'alto'
            return <Fragment key={x.id}>
              <tr className={`estado-${x.estado}${largo ? ' abierta' : ''}`} onClick={() => setAbierto(largo ? null : x.id)}>
                <td className="col-fecha">{fechaPedido(x.creada)}</td>
                <td className="col-pedido"><button type="button" className="oficina-celda-boton" aria-expanded={largo} onClick={ev => { ev.stopPropagation(); setAbierto(largo ? null : x.id) }}>
                  {riesgo && <span className="oficina-fila-riesgo" title="Riesgo alto">⚠ </span>}{x.origen === 'propuesta' && <span className="oficina-etiqueta">propuesta</span>}{x.titulo}
                </button></td>
                <td className="col-tipo">{ETIQUETA_PEDIDO[tipo] ?? '—'}</td>
                <td className="col-estado"><span className={`oficina-estado-pedido estado-${x.estado}`}>{ESTADO_PEDIDO[x.estado]}</span></td>
                <td className="col-acc" onClick={ev => ev.stopPropagation()}>{x.estado === 'pendiente' && <span className="oficina-fila-acciones">
                  <button type="button" className="btn btn-sm btn-primary" disabled={ocupado === x.id} title={TEXTO_APROBAR[tipo] ?? 'Aprobar'} aria-label={`${TEXTO_APROBAR[tipo] ?? 'Aprobar'}: ${x.titulo}`} onClick={() => accion(x, 'aprobada')}>✓</button>
                  <button type="button" className="btn btn-sm" disabled={ocupado === x.id} title="Rechazar" aria-label={`Rechazar: ${x.titulo}`} onClick={() => accion(x, 'rechazada')}>✕</button>
                </span>}</td>
              </tr>
              {largo && <tr className="oficina-planilla-detalle"><td colSpan={5}>
                {x.detalle && <p className="oficina-msj-detalle">{x.detalle}</p>}
                {tipo === 'reunion' && <p>📅 {fechaReunion(x.accion.fecha)} · {x.accion.asistentes.map(nombre).join(', ')}</p>}
                {x.estado === 'pendiente' && <p className={`oficina-msj-reco${riesgo ? ' riesgo-alto' : ''}`}>Mesa de entrada: {recomendacion(x)}</p>}
                {x.decidida && <p className="oficina-msj-reco">Vos, {haceCuanto(x.decidida, ahora)}: {x.estado === 'rechazada' ? 'no, por ahora no.' : 'dale, aprobado.'}</p>}
                {x.nota && <p className="oficina-msj-reco">Sistemas: <ConLinks texto={x.nota} /></p>}
                <div className="oficina-sistemas-acciones">
                  {x.estado === 'pendiente' && <>
                    <button type="button" className="btn btn-sm btn-primary" disabled={ocupado === x.id} onClick={() => accion(x, 'aprobada')}>{TEXTO_APROBAR[tipo] ?? (x.accion ? 'Aprobar y hacerlo' : 'Aprobar')}</button>
                    <button type="button" className="btn btn-sm" disabled={ocupado === x.id} onClick={() => accion(x, 'rechazada')}>Rechazar</button>
                  </>}
                  {charla && x.estado !== 'hecha' && x.estado !== 'rechazada' && <button type="button" className="btn btn-sm" onClick={() => responder(x)}>Responder</button>}
                  {x.estado === 'aprobada' && tipo !== 'reunion' && <button type="button" className="btn btn-sm" disabled={ocupado === x.id} onClick={() => accion(x, 'hecha')}>Marcar hecho</button>}
                </div>
              </td></tr>}
            </Fragment>
          })}</tbody>
        </table>
      </div>
      <div className="oficina-pestanas" role="tablist" aria-label="Hojas por agente">
        {hojas.map(h => <button key={h.agente} type="button" role="tab" aria-selected={h.agente === actual.agente} className={h.agente === actual.agente ? 'activa' : ''}
          onClick={() => { setHoja(h.agente); setAbierto(null) }}>
          {nombre(h.agente)}{h.pendientes > 0 && <span className="oficina-pestana-num" aria-label={`${h.pendientes} esperan tu respuesta`}>{h.pendientes}</span>}
        </button>)}
      </div>
    </div>
  </>
}

// ---------- Calendario ----------
// El calendario interno de la oficina: reuniones que se hicieron, las agendadas, las que esperan tu OK y las fechas
// límite de las tareas. Es lo mismo que muestran los pizarrones de la oficina 3D.
const TIPO_EVENTO = { reunion: 'Reunión', agendada: 'Reunión agendada', propuesta: 'Reunión por aprobar', vence: 'Vence', hecha: 'Hecha' }
function CalendarioOficina({ eventos, ahora }) {
  const hoy = hoyAR(ahora)
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [dia, setDia] = useState(hoy)
  const grilla = mesOficina(mes, eventos, hoy)
  const delDia = eventos.filter(e => e.fecha === dia)
  return <div className="oficina-cal">
    <div className="oficina-cal-cabeza">
      <button type="button" className="btn btn-sm" aria-label="Mes anterior" onClick={() => setMes(m => mesVecino(m, -1))}>‹</button>
      <strong>{grilla.nombre}</strong>
      <button type="button" className="btn btn-sm" aria-label="Mes siguiente" onClick={() => setMes(m => mesVecino(m, 1))}>›</button>
      {mes !== hoy.slice(0, 7) && <button type="button" className="btn btn-sm" onClick={() => { setMes(hoy.slice(0, 7)); setDia(hoy) }}>Hoy</button>}
      <span className="oficina-cal-leyenda">{['reunion', 'agendada', 'propuesta', 'vence'].map(t => <span key={t}><i className={`tipo-${t}`} />{TIPO_EVENTO[t]}</span>)}</span>
    </div>
    <div className="oficina-cal-grilla" role="grid" aria-label={grilla.nombre}>
      {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(d => <span key={d} className="oficina-cal-dsem" role="columnheader">{d}</span>)}
      {grilla.semanas.flat().map((c, i) => c
        ? <button key={c.fecha} type="button" role="gridcell" aria-selected={c.fecha === dia} className={`oficina-cal-dia${c.hoy ? ' es-hoy' : ''}${c.pasado ? ' pasado' : ''}${c.fecha === dia ? ' elegido' : ''}`} onClick={() => setDia(c.fecha)}>
          <span className="oficina-cal-num">{c.dia}</span>
          {c.eventos.slice(0, 3).map(e => <span key={e.id} className={`oficina-cal-ev tipo-${e.tipo}`}>{e.texto}</span>)}
          {c.eventos.length > 3 && <span className="oficina-cal-mas">+{c.eventos.length - 3}</span>}
        </button>
        : <span key={`v${i}`} className="oficina-cal-vacio" />)}
    </div>
    <div className="oficina-cal-detalle">
      <strong>{new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })}</strong>
      {delDia.length ? <ul>{delDia.map(e => <li key={e.id}><i className={`tipo-${e.tipo}`} />{TIPO_EVENTO[e.tipo]}: {e.texto}</li>)}</ul> : <p className="tenue">Nada ese día.</p>}
    </div>
  </div>
}

// ---------- Actas ----------
// El Archivo: las actas de las reuniones (el plan que escribió María) y las tareas que salieron, a cargo del supervisor
// de cada área, con su fecha límite. Las tareas se marcan a mano: empezada o hecha.
const ESTADO_TAREA = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha' }
function fechaCorta(f) { return f ? new Date(`${f}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : 'sin fecha' }
function Archivo({ actas, tareas, agentes, escribiendo, cambiarTarea, ahora }) {
  const [abierta, setAbierta] = useState(null)
  const [error, setError] = useState('')
  const quien = id => nombreCorto(agentes.find(a => a.id === id)?.nombre ?? id)
  const hoy = hoyAR(ahora)
  const abiertas = tareas.filter(t => t.estado !== 'hecha')
  const cambiar = async (t, estado) => { setError(''); try { await cambiarTarea(t.id, estado) } catch (e) { setError(`No se pudo guardar: ${e.message}`) } }
  const filaTarea = t => <li key={t.id} className={`estado-${t.estado}${t.estado !== 'hecha' && t.vence && t.vence < hoy ? ' vencida' : ''}`}>
    <span>{t.tarea}</span>
    <span className="tenue">La hace {quien(t.responsable)}{t.supervisor && t.supervisor !== t.responsable ? ` · supervisa ${quien(t.supervisor)}` : ''} · {EQUIPOS[t.area]?.nombre ?? t.area} · vence {fechaCorta(t.vence)} · {ESTADO_TAREA[t.estado]}</span>
    <span className="oficina-tarea-botones">
      {t.estado === 'pendiente' && <button type="button" className="btn btn-sm" onClick={() => cambiar(t, 'en_curso')}>Empezada</button>}
      {t.estado !== 'hecha' && <button type="button" className="btn btn-sm" onClick={() => cambiar(t, 'hecha')}>Hecha</button>}
    </span>
  </li>
  return <>
    {escribiendo && <p className="oficina-archivo-escribiendo" role="status">María está escribiendo el acta de la reunión…</p>}
    {error && <p role="alert" className="feedback-error">{error}</p>}
    {abiertas.length > 0 && <>
      <p className="oficina-archivo-titulo">Tareas en marcha</p>
      <ul className="oficina-tareas-plan">{abiertas.slice(0, 12).map(filaTarea)}</ul>
    </>}
    {!actas.length ? <p className="tenue">Todavía no hubo reuniones. Cada vez que termines una, María deja el acta acá.</p>
      : <ul className="oficina-actas">{actas.map(a => {
        const deEsta = tareas.filter(t => t.acta_id === a.id)
        return <li key={a.id}>
          <button type="button" className="oficina-acta-cabeza" aria-expanded={abierta === a.id} onClick={() => setAbierta(v => (v === a.id ? null : a.id))}>
            <strong>{a.titulo && a.titulo !== 'Reunión' ? a.titulo : { sala: 'Reunión en la sala', oficina: 'Reunión en tu oficina', turnos: 'Turnos en tu oficina' }[a.modo] ?? 'Reunión'}</strong>
            <span className="tenue">{new Date(a.fin).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {a.asistentes.length} participantes{deEsta.length ? ` · ${deEsta.length} tareas` : ''}</span>
          </button>
          {abierta === a.id && <div className="oficina-acta">
            <p>{a.resumen}</p>
            {a.plan?.seguimiento?.length > 0 && <><p className="oficina-archivo-titulo">Lo que venía de antes</p><ul>{a.plan.seguimiento.map((d, i) => <li key={i}>{d}</li>)}</ul></>}
            {a.plan?.decisiones?.length > 0 && <><p className="oficina-archivo-titulo">Decisiones</p><ul>{a.plan.decisiones.map((d, i) => <li key={i}>{d}</li>)}</ul></>}
            {deEsta.length > 0 && <><p className="oficina-archivo-titulo">Tareas</p><ul className="oficina-tareas-plan">{deEsta.map(filaTarea)}</ul></>}
            {a.plan?.calendario?.length > 0 && <p className="tenue">Calendario: {a.plan.calendario.length} días ({fechaCorta(a.plan.calendario[0].fecha)} a {fechaCorta(a.plan.calendario.at(-1).fecha)}). Sistemas lo carga en UP cuando lo aprobás.</p>}
            {a.plan?.sistemas?.length > 0 && <p className="tenue">Para programar (Sistemas, cuando lo aprobás): {a.plan.sistemas.map(x => x.titulo).join('; ')}.</p>}
            <p className="tenue">Vinieron: {a.asistentes.map(quien).join(', ')}.</p>
            {a.mensajes.length > 0 && <details><summary>Conversación</summary><ol>{a.mensajes.map((m, i) => <li key={i}><strong>{m.de}:</strong> {m.texto}</li>)}</ol></details>}
          </div>}
        </li>
      })}</ul>}
  </>
}

function Leyenda() {
  return <ul className="oficina-leyenda" aria-label="Qué significa lo que se ve">
    <li><span className="burbuja-muestra estado-trabajando">…</span>tecleando, pantalla en verde: trabajando</li>
    <li><span className="burbuja-muestra estado-error">!</span>agarrándose la cabeza, pantalla en rojo: con un problema</li>
    <li><span className="burbuja-muestra">☕</span>en la cafetería, el comedor, el ocio o el ping pong: libre, en su descanso</li>
    <li><span className="burbuja-muestra">z</span>durmiendo en un puf: pausado</li>
  </ul>
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
        {PESTANAS.filter(([id]) => id !== 'charla' || !a.sinCharla).map(([id, texto]) => <button key={id} type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'is-activa' : ''} onClick={() => setPestana(id)}>{texto}</button>)}
      </div>
      <div className="oficina-panel-cuerpo" role="tabpanel">
        {pestana === 'ahora' && <>
          <p><span className={`oficina-estado estado-${a.estado}`}>{ESTADOS[a.estado]}</span></p>
          <p className="oficina-ahora">{a.ahora}</p>
          {a.ultima && <p className="tenue">Última actividad: {haceCuanto(new Date(a.ultima).toISOString(), ahora)} ({horaAR(a.ultima)}).</p>}
          {!a.sinCharla && <button type="button" className="btn btn-sm" onClick={() => setPestana('charla')}>Preguntarle algo</button>}
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
