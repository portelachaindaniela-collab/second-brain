import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { aplicarCorrida, haceCuanto, horaAR } from '../trabajadores.mjs'
import { comunicados, TIPOS_COMUNICADO, armarOficina, contarEstados, hoyAR, tocanPropuestas, eventosOficina, mesOficina, mesVecino, hojasDePedidos, primerEncuentro, puedenPararte, TEXTO_MOMENTO, pospuestos, POSPONER_ENCUENTRO_MS, vieneATuOficina, lePedisQueVenga, sumarVisita, escenaDeVisitas, quienGolpea, PRIMER_GOLPE_MS, internaQueToca, resumenReunion, recomendacion, riesgoDe, EQUIPOS, ESTADOS } from '../oficina.mjs'
import { CabeceraPantalla, Bloques, Bloque } from '../estructura.jsx'
import { limpiarMarcas } from '../../supabase/functions/_shared/oficina.mjs'
import { ConvocarReunion, AvisoLlegada, VistaSala, VistaTurnos } from './OficinaReunion.jsx'
import { PLAZO_REUNION_S, MAX_OFICINA } from '../oficina2d/reunion.mjs'
import './Oficina.css'

import Oficina2D from './Oficina2D.jsx'
import { muestra } from '../oficina2d/escena.mjs'
import { person } from '../oficina2d/dibujo.mjs'
import { figuraDe } from '../oficina2d/elenco.mjs'

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
  const [trabajadores, salud, upCorridas, chequeo, piezas, pdgAgentes, pdgTrabajos, pdgCuentas, admin, solicitudes, actas, tareas, conexiones, operador, feminaCorridas, feminaHallazgos, reuniones, momentos, general] = await Promise.all([
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
    leer('tareas', supabase.from('oficina_tareas').select('id,acta_id,tarea,area,responsable,supervisor,vence,estado,presentada,actualizada').order('vence', { ascending: true, nullsFirst: false }).limit(150), []),
    leer('conexiones', supabase.rpc('oficina_conexiones'), []),
    leer('tareas programadas', supabase.rpc('oficina_operador'), []),
    leer('vueltas de Femina', supabase.from('pdg_femina_corridas').select('estado,iniciada_at,resumen,error').order('iniciada_at', { ascending: false }).limit(8), []),
    leer('lo que encontró Femina', supabase.from('pdg_hallazgos').select('tipo,titulo,estado,created_at').eq('estado', 'nuevo').order('created_at', { ascending: false }).limit(60), []),
    leer('reuniones internas', supabase.from('oficina_reuniones').select('id,convoca,asistentes,tema,detalle,fecha,estado,acta_id').order('fecha', { ascending: false }).limit(60), []),
    leer('chats entre compañeros', supabase.from('oficina_momentos').select('id,agentes,tipo,lugar,resumen,fecha,hora,charla').eq('tipo', 'chat').gte('fecha', new Date(ahora - 7 * DIA_MS).toISOString().slice(0, 10)).order('fecha', { ascending: false }).limit(60), []),
    leer('chat de la oficina', supabase.from('oficina_chat_general').select('id,autor,texto,tipo,creado').order('creado', { ascending: false }).order('id', { ascending: false }).limit(200), []),
  ])
  const corridasPor = {}
  await Promise.all(trabajadores.map(async t => {
    try { corridasPor[t.clave] = await corridasDe(t.clave, ahora) } catch (e) { errores.push(`corridas de ${t.nombre}: ${e.message}`); corridasPor[t.clave] = [] }
  }))
  return {
    trabajadores, corridasPor, salud, upCorridas, chequeo, hoy, errores,
    piezas: piezas.map(p => ({ fecha: p.fecha, estado: p.estado, tiene_texto: Boolean(p.texto) })),
    pdgAgentes, pdgTrabajos: pdgTrabajos.map(t => ({ ...t, cuenta: t.pdg_cuentas })), pdgCuentas, admin, solicitudes, actas, conexiones, operador, tareas,
    femina: { corridas: feminaCorridas, hallazgos: feminaHallazgos }, reuniones, momentos, general: [...general].reverse(),
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
    momentos={datos?.momentos ?? []}
    general={datos?.general ?? []} escribirGeneral={async texto => { try { return await escribirEnGeneral(texto) } finally { await recargar() } }}
    solicitudes={datos?.solicitudes ?? []} actas={datos?.actas ?? []} reuniones={datos?.reuniones ?? []} decidir={async (id, estado, nota, accion) => { await decidirSolicitud(id, estado, nota, accion); await recargar() }}
    tareas={datos?.tareas ?? []} cambiarTarea={async (id, estado) => { await cambiarTarea(id, estado); await recargar() }}
    marcarPresentada={async ids => { await marcarPresentada(ids); await recargar() }}
    guardarActa={async acta => { try { await guardarActa(acta) } finally { await recargar() } }}
    publicarComunicado={async texto => { await publicarComunicadoEnBase(texto); await recargar() }} />
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
const avisoInterna = r => ` (Agendé una reunión interna en la sala: «${r.tema}», el ${new Date(`${r.fecha}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long' })}.)`
function conAviso(hablarFn, recargar) {
  return async (...args) => {
    const r = await hablarFn(...args)
    const internas = r.internas ?? []
    if ((r.pareja !== undefined && r.pareja !== null) || r.grupo?.length) recargar()
    if (!r.solicitudes?.length && !internas.length) return r.valor
    recargar()
    const avisos = id => [...r.solicitudes.filter(s => !id || s.agente === id).map(avisoPedido), ...internas.filter(x => !id || x.convoca === id).map(avisoInterna)].join('')
    if (typeof r.valor === 'string') return r.valor + avisos(null)
    return r.valor.map(x => ({ ...x, texto: x.texto + avisos(x.agente) }))
  }
}

// Los de Administración y Sistemas no tienen IA: escuchan pero no hablan.
const conversan = id => !/^(admin|sistemas):/.test(String(id))
async function hablarEnReunion(asistentes, mensajes) {
  const { data, error } = await supabase.functions.invoke('oficina-chat', { body: { reunion: true, asistentes: asistentes.filter(conversan), mensajes } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error de conexión */ } }
  if (error || !respuesta?.respuestas?.length) throw new Error(respuesta?.error || 'Nadie pudo responder. Probá de nuevo.')
  return { valor: respuesta.respuestas, solicitudes: respuesta.solicitudes ?? [], internas: respuesta.internas ?? [] }
}

async function hablarConAgente(agente, mensajes, lugar = 'charla') {
  if (!conversan(agente)) throw new Error('Es una tarea programada: no conversa. Mirá sus corridas en «Tareas».')
  const { data, error } = await supabase.functions.invoke('oficina-chat', { body: { agente, mensajes, lugar } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error de conexión */ } }
  if (error || !respuesta?.texto) throw new Error(respuesta?.error || 'No pude hablar con el agente. Probá de nuevo.')
  return { valor: respuesta.texto, solicitudes: respuesta.solicitudes ?? [], internas: respuesta.internas ?? [], grupo: respuesta.grupo ?? [] }
}
// ---------- Vista ----------
// reloj: de dónde sale la hora para la luz del día (en la app, la actual; se puede cambiar para probar).
export function OficinaVista({ cargando, agentes, pendientes, errores = [], ahora, hablar, hablarReunion, actualizar = async () => {},
  solicitudes = [], actas = [], tareas = [], reuniones = [], decidir = async () => {}, cambiarTarea = async () => {}, marcarPresentada = async () => {}, guardarActa = async () => {},
  momentos = [], general = [], escribirGeneral = async () => {}, correrInterna = correrReunionInterna, anotarEncuentro = anotarEncuentroEnBase, contestarEncuentro = contestarEncuentroEnBase,
  leerConversacion = leerConversacionDeBase, anotarEnConversacion = anotarEnConversacionDeBase, publicarComunicado = async () => {} }) {
  const [elegidoId, setElegidoId] = useState(null)
  const [pestana, setPestana] = useState('ahora')
  const [charlas, setCharlas] = useState({})
  const elegido = agentes.find(a => a.id === elegidoId) || null
  // Fuera de la oficina: mientras estás afuera nadie te golpea la puerta ni te para en el pasillo, y los chats quedan en
  // pausa. Queda así hasta que tocás «Volví a la oficina».
  const [afuera, setAfuera] = useState(() => { try { return localStorage.getItem(CLAVE_FUERA) === '1' } catch { return false } })
  const cambiarFuera = v => { setAfuera(v); try { localStorage.setItem(CLAVE_FUERA, v ? '1' : '0') } catch { /* vale para esta visita */ } }
  // Visitas: si en la charla un agente dice que va a tu oficina (o lo llamás), camina hasta tu mesa y se queda un rato.
  // Pueden venir varios a la vez: cada uno se sienta en una silla libre y se va cuando termina lo suyo.
  const [visitas, setVisitas] = useState([]) // [{ agente, desde, desdePuerta, hasta }]
  const venir = useCallback((id, desdePuerta = false) => setVisitas(vs => sumarVisita(vs, id, desdePuerta)), [])
  useEffect(() => {
    if (!visitas.length) return
    const prox = Math.min(...visitas.map(v => v.hasta))
    const t = setTimeout(() => setVisitas(vs => vs.filter(v => v.hasta > Date.now())), Math.max(0, prox - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [visitas])
  const deVisita = id => visitas.some(v => v.agente === id)

  // Chats: podés hablar con varios a la vez, cada uno en su ventana (abajo, como un chat).
  const [chats, setChats] = useState([]) // [{ id, min }]
  const cargarConversacion = useCallback(id => {
    leerConversacion(id).then(h => setCharlas(c => ({ ...c, [id]: [...h, ...(c[id] ?? []).filter(m => m.local)] })))
      .catch(() => { /* queda lo de esta sesión */ })
  }, [leerConversacion])
  const abrirChat = id => {
    if (id !== 'general' && !chats.some(c => c.id === id)) cargarConversacion(id)
    setChats(cs => (cs.some(c => c.id === id) ? cs.map(c => (c.id === id ? { ...c, min: false } : c)) : [...cs, { id, min: false }].slice(-MAX_CHATS)))
  }
  // Si alguno quedó con un malentendido con vos en el chat de la oficina, te escribe por privado: se abre su chat.
  const escribirYAclarar = async texto => {
    const r = await escribirGeneral(texto)
    for (const x of r?.aclarar ?? []) if (agentes.some(a => a.id === x.agente)) { cargarConversacion(x.agente); abrirChat(x.agente) }
  }
  const eventos = useMemo(() => eventosOficina({ actas, tareas, solicitudes, reuniones }), [actas, tareas, solicitudes, reuniones])
  // Encuentros a pie: el agente cercano que tiene algo para vos te lo dice. Lo que dejás para después vuelve en un rato.
  // (Los encuentros a pie eran de la oficina 3D, donde caminabas: en 2D nadie se cruza, así que la lista queda vacía.)
  const [cercanos] = useState([])
  const [despues, setDespues] = useState(() => new Map())
  // Lo que ya contestaste (en el pasillo o en tu puerta) no te lo vuelven a plantear: queda en su charla y en Mensajes.
  const [contestados] = useState(() => leerGuardados(CLAVE_CONTESTADOS))
  const [ultimosEncuentros, setUltimosEncuentros] = useState(() => new Map())
  const encuentro = primerEncuentro(puedenPararte(cercanos, ultimosEncuentros, ahora), { solicitudes, pendientes }, new Set([...pospuestos(despues, ahora), ...contestados]))
  // El aviso del pasillo queda fijo hasta que lo contestes, aunque el agente o vos se alejen.
  const [fijo, setFijo] = useState(null)
  const sigue = x => !x?.pedido || solicitudes.some(s => s.id === x.pedido.id && s.estado === 'pendiente')
  const cuenta = contarEstados(agentes)
  // Al tocar un agente se abre su panel con el chat primero (los que no conversan, en «Ahora»). abrir(id, 'charla') abre
  // en cambio su ventana de chat (desde el pasillo, la puerta o Mensajes).
  const abrir = (id, p = null) => {
    if (p === 'charla') { abrirChat(id); return }
    setElegidoId(id)
    const conversa = !agentes.find(a => a.id === id)?.sinCharla
    if (conversa && !charlas[id]) cargarConversacion(id)
    setPestana(p ?? (conversa ? 'charla' : 'ahora'))
  }

  // ---------- Reunión ----------
  // reunion: { id, modo: 'sala' | 'oficina' | 'turnos', estado: 'convocada' | 'en_curso' | 'volviendo', asistentes, inicio,
  // empezo, vuelta, turnos: { [id]: { llamado, fin } } }. La escena 2D muestra a los agentes; acá se lleva el estado.
  const [reunion, setReunion] = useState(null)
  const [convocando, setConvocando] = useState(false)
  const [llegadas, setLlegadas] = useState(null)
  const [hablando, setHablando] = useState(null)
  const [reloj, setReloj] = useState(() => Date.now())
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
    setVisitas([])
    setReunion({ id: Date.now(), modo, estado: 'convocada', asistentes, inicio: Date.now(), turnos: {}, tema })
  }
  // Una reunión que pidió un agente y te vino a buscar: arranca enseguida, como pactada. Si entran en tu mesa, es en tu
  // oficina (vas caminando a tu mesa de reuniones y ellos llegan); si son más, en la sala. Abre el que la pidió, con el tema.
  const arrancarReunionPedida = r => {
    const ids = r.asistentes.filter(id => agentes.some(a => a.id === id && a.estado !== 'pausado'))
    if (!ids.length) return
    if (r.solicitud) decidir(r.solicitud, 'hecha', 'Convocada.').catch(() => {})
    convocar(ids, ids.length <= MAX_OFICINA ? 'oficina' : 'sala', { tema: r.tema, detalle: r.detalle, pidio: r.pidio })
  }
  // «Responder» un mensaje: abre la charla con ese agente, que arranca con lo que te pidió.
  const responder = x => {
    setCharlas(c => ({ ...c, [x.agente]: [...(c[x.agente] ?? []), { role: 'assistant', content: `Te pedí permiso para «${x.titulo}».${x.detalle ? ` ${x.detalle}` : ''}`, local: true }] }))
    abrir(x.agente, 'charla')
  }
  // Lo de abajo de la escena va en hojas, como un Excel: una sola a la vista (sin un scroll larguísimo).
  const [hojaOficina, setHojaOficina] = useState('tetoca')
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
  // ---------- Reunión interna ----------
  // Cuando toca una reunión interna (los agentes entre ellos), los convocados caminan a la sala, la IA escribe la charla
  // y se va mostrando quién habla; al final María deja el acta en el Archivo y cada uno vuelve a su lugar.
  // interna: { id, reunionId, propia, modo: 'sala', estado: 'convocada' | 'volviendo', inicio, vuelta, asistentes, tema,
  //   convoca, fase: 'llegando' | 'charlando' | 'lista' | 'error', mensajes, vistos, error }
  const [interna, setInterna] = useState(null)
  const internasIntentadas = useRef(new Set())
  useEffect(() => {
    if (cargando || reunion || interna) return
    const r = internaQueToca(reuniones, hoyAR(Date.now()))
    if (!r || internasIntentadas.current.has(r.id)) return
    internasIntentadas.current.add(r.id)
    const asistentes = r.asistentes.filter(id => agentes.some(a => a.id === id && a.estado !== 'pausado'))
    if (asistentes.length < 2) return
    setInterna({ id: `interna-${r.id}`, reunionId: r.id, propia: true, modo: 'sala', estado: 'convocada', inicio: Date.now(), asistentes, tema: r.tema, convoca: r.convoca, fase: 'llegando', mensajes: [], vistos: 0 })
    correrInterna(r.id)
      .then(res => setInterna(x => (x?.reunionId === r.id ? { ...x, mensajes: res.mensajes ?? [], acta: res.acta } : x)))
      .catch(e => setInterna(x => (x?.reunionId === r.id ? { ...x, fase: 'error', error: e.message } : x)))
  }, [cargando, reunion, interna, reuniones, agentes, correrInterna])
  // Les da tiempo a llegar a la sala y después muestra la charla de a una intervención.
  useEffect(() => {
    if (!interna || interna.estado === 'volviendo') return
    const i = setInterval(() => setInterna(x => {
      if (!x || x.estado === 'volviendo') return x
      const ya = Date.now() - x.inicio
      if (x.fase === 'error') return ya > 15000 ? { ...x, estado: 'volviendo', vuelta: Date.now() } : x
      if (!x.mensajes.length || ya < LLEGAR_INTERNA_MS) return x
      if (x.vistos < x.mensajes.length) return { ...x, fase: 'charlando', vistos: x.vistos + 1 }
      return { ...x, fase: 'lista', estado: 'volviendo', vuelta: Date.now() }
    }), 4500)
    return () => clearInterval(i)
  }, [interna?.id, interna?.estado]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (interna?.estado !== 'volviendo') return
    if (interna.fase === 'lista') actualizar()
    // Si la escena no avisa que volvieron, se cierra sola.
    const id = interna.id
    const t = setTimeout(() => setInterna(x => (x?.id === id ? null : x)), 90000)
    return () => clearTimeout(t)
  }, [interna?.id, interna?.estado]) // eslint-disable-line react-hooks/exhaustive-deps
  const alTerminoInterna = useCallback(id => setInterna(x => (x?.id === id ? null : x)), [])
  // El cartel de la reunión interna queda hasta que lo cerrás (aunque los agentes ya hayan vuelto). Si una reunión ya
  // falló antes, el reintento no te avisa de nuevo: solo vas a ver el cartel si esta vez sale.
  const [cartel, setCartel] = useState(null)
  const cerrados = useRef(new Set())
  useEffect(() => {
    if (!interna || cerrados.current.has(interna.id)) return
    const fallidas = leerGuardados(CLAVE_INTERNAS_FALLIDAS)
    if (fallidas.has(String(interna.reunionId)) && (interna.fase === 'llegando' || interna.fase === 'error')) return
    if (interna.fase === 'error') { fallidas.add(String(interna.reunionId)); guardarGuardados(CLAVE_INTERNAS_FALLIDAS, fallidas) }
    setCartel(interna)
  }, [interna])
  const hablaInterna = interna?.fase === 'charlando' ? interna.mensajes[interna.vistos - 1]?.agente ?? null : null

  const alPlanificar = useCallback((id, ll) => setReunion(r => { if (r?.id === id) setLlegadas(ll); return r }), [])
  const alVolvieron = useCallback(id => setReunion(r => (r?.id === id ? null : r)), [])
  const enCurso = reunion?.estado === 'en_curso'
  const superpuesto = reunion?.estado === 'convocada' || reunion?.estado === 'preparando'
    ? <AvisoLlegada reunion={reunion} agentes={agentes} llegadas={llegadas} ahora={reloj} empezar={empezar} cancelar={terminar} />
    : enCurso && (reunion.modo === 'sala' || reunion.modo === 'oficina')
      ? <VistaSala reunion={reunion} agentes={agentes} ahora={reloj} hablando={hablando} setHablando={setHablando} hablarReunion={hablarReunion} terminar={terminar}
        cambiarAsistentes={ids => setReunion(r => (r ? { ...r, asistentes: ids } : r))} />
      : enCurso && reunion.modo === 'turnos'
        ? <VistaTurnos reunion={reunion} agentes={agentes} ahora={reloj} hablando={hablando} setHablando={setHablando} hablar={hablar} siguiente={siguiente} terminar={terminar} />
        : null
  // Golpear la puerta: un agente con algo pendiente camina hasta tu puerta; cuando llega, te pregunta si tenés un minuto.
  // Decidís ahí (como en el pasillo), le decís que pase (entra y abre la charla) o que ahora no (vuelve en un rato).
  const [golpe, setGolpe] = useState(null)
  const golpeados = useRef(new Set())
  const ultimoGolpe = useRef(0)
  const abierta = useRef(0)
  useEffect(() => { abierta.current = Date.now() }, [])
  useEffect(() => {
    if (afuera || golpe || visitas.length || reunion || interna || Date.now() - abierta.current < PRIMER_GOLPE_MS) return
    const fuera = new Set([...pospuestos(despues, ahora), ...golpeados.current, ...contestados, ...(fijo ? [fijo.clave] : [])])
    const quien = quienGolpea(agentes.filter(a => !a.sinCharla).map(a => a.id), { solicitudes, pendientes }, fuera, ultimoGolpe.current, Date.now())
    if (!quien) return
    ultimoGolpe.current = Date.now()
    golpeados.current.add(quien.clave)
    setGolpe({ ...quien, golpe: Date.now(), llego: false, texto: `Toc, toc. ${quien.texto}` })
  }, [ahora, afuera, golpe, visitas.length, reunion, interna, despues, agentes, solicitudes, pendientes, fijo, contestados])
  // Si la escena no avisa que llegó, el aviso aparece igual al rato.
  useEffect(() => {
    if (!golpe || golpe.llego) return
    const t = setTimeout(() => setGolpe(g => (g && g.golpe === golpe.golpe ? { ...g, llego: true } : g)), 45_000)
    return () => clearTimeout(t)
  }, [golpe])
  // Si lo decidiste por otro lado (en la charla o en Mensajes), el aviso se cierra; si no, queda hasta que contestes.
  useEffect(() => {
    if (fijo && !sigue(fijo)) setFijo(null)
    else if (!fijo && encuentro && !golpe) setFijo(encuentro)
    if (golpe && !sigue(golpe)) setGolpe(null)
  }, [fijo, encuentro?.clave, golpe, solicitudes]) // eslint-disable-line react-hooks/exhaustive-deps
  const alLlegoVisita = useCallback(origen => { setGolpe(g => (g && g.golpe === origen ? { ...g, llego: true } : g)) }, [])
  // Si un agente dijo que viene (o lo llamaste), esa visita va primero: el que golpeaba la puerta espera.
  const visitaEscena = escenaDeVisitas(visitas) ?? (golpe ? { id: golpe.golpe, agente: golpe.id, destino: 'puerta' } : null)
  // Lo que te dicen en el pasillo (o en tu puerta) queda guardado con lo que contestás: después, en la charla, el agente lo sabe.
  const enPuerta = !superpuesto && !visitas.length && golpe?.llego && !elegido ? golpe : null
  const visto = afuera ? null : enPuerta ?? (!superpuesto && fijo && sigue(fijo) && !elegido && !golpe ? fijo : null)
  const anotados = useRef({})
  useEffect(() => {
    if (!visto || anotados.current[visto.clave]) return
    anotados.current[visto.clave] = anotarEncuentro(visto.id, visto.texto).catch(() => null)
  }, [visto, anotarEncuentro])
  const contestar = async (e, respuesta) => {
    contestados.add(e.clave)
    guardarGuardados(CLAVE_CONTESTADOS, contestados)
    setUltimosEncuentros(m => new Map(m).set(e.id, Date.now()))
    if (e === fijo) setFijo(null)
    const anotado = await anotados.current[e.clave]
    delete anotados.current[e.clave]
    if (anotado) contestarEncuentro(e.id, respuesta).catch(() => { /* la charla sigue igual */ })
  }

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
      <Bloque titulo="La oficina" ancho="completo" accion={!cargando && <span className="oficina-acciones">
        <button type="button" className="btn btn-sm" onClick={() => abrirChat('general')}>💬 Chat de la oficina</button>
        <button type="button" className={`btn btn-sm${afuera ? ' btn-primary' : ''}`} onClick={() => cambiarFuera(!afuera)}>{afuera ? 'Volví a la oficina' : '🚪 Me voy de la oficina'}</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={Boolean(reunion)} onClick={() => setConvocando(true)}>{reunion ? 'Reunión en curso' : 'Convocar reunión'}</button>
      </span>}>
        {cargando ? <p className="empty-state">Abriendo la oficina…</p> : <>
          <Oficina2D agentes={agentes} elegidoId={elegidoId} abrir={abrir} reunion={reunion} hablando={hablando ?? hablaInterna}
                reunionInterna={interna} alTerminoInterna={alTerminoInterna} visita={visitaEscena} alLlegoVisita={alLlegoVisita}
                alPlanificar={alPlanificar} alVolvieron={alVolvieron} pantallaCompleta={enCurso} conDani={!afuera}
                visitantes={[...visitas.map(v => v.agente), ...(golpe ? [golpe.id] : [])]}>
                {!superpuesto && cartel && <AvisoInterna interna={cartel} agentes={agentes} cerrar={() => { cerrados.current.add(cartel.id); setCartel(null) }} />}
                {superpuesto ?? (visto && <Encuentro key={`${visto.clave}${visto === enPuerta ? '-puerta' : ''}`} encuentro={visto} agente={agentes.find(a => a.id === visto.id)} decidir={decidir}
                  puerta={visto === enPuerta} responder={responder} convocar={reunion ? null : arrancarReunionPedida}
                  contestar={r => { contestar(visto, r); if (visto === enPuerta && r !== 'hablemos') setGolpe(null) }}
                  hablar={id => { if (visto === enPuerta) { setGolpe(null); venir(id, true) } else setFijo(null); abrir(id, 'charla') }}
                  seguime={id => { if (visto === enPuerta) setGolpe(null); venir(id, visto === enPuerta); abrir(id, 'charla') }}
                  despues={() => { setDespues(d => new Map(d).set(visto.clave, Date.now() + POSPONER_ENCUENTRO_MS)); if (visto === enPuerta) setGolpe(null) }} />)}
              </Oficina2D>
          <div className="oficina-ayuda">
            <span>Arrastrá para moverte · rueda, dos dedos o + y − para acercar · ⌂ vuelve al inicio · tocá un agente para ver qué está haciendo.</span>
            <SonidoOficina />
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
      <Bloque titulo="Lo de la oficina" ancho="completo">
        <div id="oficina-hojas">{cargando ? <p className="tenue">Revisando…</p> : <LibroOficina hoja={hojaOficina} setHoja={setHojaOficina} hojas={[
          { id: 'tetoca', titulo: 'Te toca', num: pendientes.length, contenido: pendientes.length
            ? <ul className="oficina-tetoca">{pendientes.map(p => <li key={p.texto} className={`nivel-${p.nivel}`}>
              <span className="oficina-tetoca-texto">{p.texto}</span>
              <span className="oficina-tetoca-donde">{p.donde}</span>
              {p.reunion ? <button type="button" className="btn btn-sm btn-primary" disabled={Boolean(reunion)} onClick={() => setConvocando(p.reunion)}>Convocar</button>
                : p.agente && agentes.some(a => a.id === p.agente) && <button type="button" className="btn btn-sm" onClick={() => abrir(p.agente)}>Ver agente</button>}
            </li>)}</ul>
            : <p className="tenue">Nada pendiente: los agentes no te necesitan por ahora.</p> },
          { id: 'general', titulo: 'Chat de la oficina', contenido: <ChatGeneral mensajes={general} agentes={agentes} escribir={escribirYAclarar} /> },
          { id: 'comunicados', titulo: 'Comunicados', contenido: <Comunicados lista={comunicados({ general, solicitudes, actas, tareas, agentes }, ahora)} publicar={publicarComunicado} /> },
          { id: 'ahora', titulo: 'Trabajando ahora', contenido: <ActividadAhora agentes={agentes} abrir={abrir} /> },
          { id: 'mensajes', titulo: 'Mensajes', num: solicitudes.filter(x => x.estado === 'pendiente').length, contenido: <Mensajes solicitudes={solicitudes} agentes={agentes} decidir={decidir} responder={responder} ahora={ahora} /> },
          { id: 'calendario', titulo: 'Calendario', contenido: <CalendarioOficina eventos={eventos} ahora={ahora} /> },
          { id: 'chats', titulo: 'Chats entre compañeros', contenido: <ChatsCompaneros momentos={momentos} agentes={agentes} /> },
          { id: 'archivo', titulo: 'Archivo', contenido: <Archivo actas={actas} tareas={tareas} agentes={agentes} escribiendo={escribiendoActa} cambiarTarea={cambiarTarea} ahora={ahora} /> },
        ]} />}</div>
      </Bloque>
    </Bloques>
    {convocando && <ConvocarReunion agentes={agentes} preseleccion={convocando.asistentes ?? null} cerrar={() => setConvocando(false)}
      alConvocar={(ids, modo) => {
        if (convocando.tareas) marcarPresentada(convocando.tareas).catch(() => {})
        if (convocando.solicitud) decidir(convocando.solicitud, 'hecha', 'Convocada.').catch(() => {})
        convocar(ids, modo, convocando.tema ? { tema: convocando.tema, detalle: convocando.detalle, pidio: convocando.pidio } : null)
      }} />}
    {elegido && <PanelAgente key={elegido.id} agente={elegido} pestana={pestana} setPestana={setPestana} ahora={ahora} cerrar={() => setElegidoId(null)}
      venir={venir} deVisita={deVisita(elegido.id)} abrirChat={abrirChat} charla={charlas[elegido.id] ?? []} hablar={hablar} fuera={afuera}
      pedidos={solicitudes.filter(x => x.agente === elegido.id && x.estado === 'pendiente')} decidir={decidir} anotar={anotarEnConversacion}
      setCharla={m => setCharlas(c => ({ ...c, [elegido.id]: typeof m === 'function' ? m(c[elegido.id] ?? []) : m }))} />}
    {chats.length > 0 && <div className={`oficina-chats${elegido ? ' con-panel' : ''}`}>
      {chats.map(ch => {
        if (ch.id === 'general') return <VentanaChat key="general" titulo="Chat de la oficina" min={ch.min}
          minimizar={() => setChats(cs => cs.map(c => (c.id === 'general' ? { ...c, min: !c.min } : c)))}
          cerrar={() => setChats(cs => cs.filter(c => c.id !== 'general'))}>
          <ChatGeneral mensajes={general} agentes={agentes} escribir={escribirYAclarar} />
        </VentanaChat>
        const a = agentes.find(x => x.id === ch.id)
        if (!a) return null
        return <VentanaChat key={ch.id} agente={a} min={ch.min}
          minimizar={() => setChats(cs => cs.map(c => (c.id === ch.id ? { ...c, min: !c.min } : c)))}
          cerrar={() => setChats(cs => cs.filter(c => c.id !== ch.id))}>
          <Charla agente={a} mensajes={charlas[a.id] ?? []} setMensajes={m => setCharlas(c => ({ ...c, [a.id]: typeof m === 'function' ? m(c[a.id] ?? []) : m }))}
            hablar={hablar} venir={venir} deVisita={deVisita(a.id)} pedidos={solicitudes.filter(x => x.agente === a.id && x.estado === 'pendiente')} decidir={decidir} anotar={anotarEnConversacion} fuera={afuera} />
        </VentanaChat>
      })}
    </div>}
  </div>
}

// Cuántos chats abiertos a la vez (el más viejo se cierra al abrir otro).
const MAX_CHATS = 4
// Una ventana de chat, abajo como en un mensajero: se minimiza tocando el nombre y se cierra con ×.
function VentanaChat({ agente = null, titulo = null, min, minimizar, cerrar, children }) {
  const nombre = titulo ?? agente.nombre
  return <section className={`oficina-chat${min ? ' is-min' : ''}`} aria-label={titulo ?? `Chat con ${nombre}`}>
    <header className="oficina-chat-cabeza">
      <button type="button" className="oficina-chat-nombre" onClick={minimizar} aria-expanded={!min} title={min ? 'Abrir' : 'Minimizar'}>
        {agente ? <Avatar agente={agente} /> : <span aria-hidden="true">💬</span>}<span>{titulo ?? nombreCorto(nombre)}</span>
      </button>
      <button type="button" className="oficina-chat-cerrar" onClick={cerrar} aria-label={`Cerrar ${titulo ?? `el chat con ${nombre}`}`}>×</button>
    </header>
    {!min && <div className="oficina-chat-cuerpo">{children}</div>}
  </section>
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
      <div className="oficina-pestanas" role="tablist" aria-label="Hojas por agente">
        {hojas.map(h => <button key={h.agente} type="button" role="tab" aria-selected={h.agente === actual.agente} className={h.agente === actual.agente ? 'activa' : ''}
          onClick={() => { setHoja(h.agente); setAbierto(null) }}>
          {nombre(h.agente)}{h.pendientes > 0 && <span className="oficina-pestana-num" aria-label={`${h.pendientes} esperan tu respuesta`}>{h.pendientes}</span>}
        </button>)}
      </div>
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
    </div>
  </>
}

// Lo que ya te mostraron y contestaste se recuerda en este equipo (si el navegador no deja guardar, vale para esta visita).
const CLAVE_CONTESTADOS = 'oficina-avisos-contestados'
const CLAVE_INTERNAS_FALLIDAS = 'oficina-internas-fallidas'
const CLAVE_FUERA = 'oficina-fuera'
function leerGuardados(clave) {
  try { return new Set(JSON.parse(localStorage.getItem(clave) || '[]')) } catch { return new Set() }
}
function guardarGuardados(clave, conjunto) {
  try { localStorage.setItem(clave, JSON.stringify([...conjunto].slice(-500))) } catch { /* sin almacenamiento: vale para esta visita */ }
}
// El cartel de una reunión interna: quiénes están, de qué hablan y lo último que se dijo (con la charla entera a mano).
const LLEGAR_INTERNA_MS = 20000
function AvisoInterna({ interna, agentes, cerrar }) {
  const [verTodo, setVerTodo] = useState(false)
  const nombre = id => nombreCorto(agentes.find(a => a.id === id)?.nombre ?? id)
  const dichos = interna.mensajes.slice(0, interna.vistos)
  const estado = interna.fase === 'error' ? `No se pudo hacer la reunión: ${interna.error}. Se vuelve a intentar sola la próxima vez que abras la Oficina; si sale, te aviso.`
    : interna.fase === 'lista' ? 'Terminaron. María dejó el acta en el Archivo y lo que decidieron te llega como pedidos.'
      : dichos.length ? null : 'Van llegando a la sala…'
  return <div className="reunion-aviso o3-interna" role="status" aria-live="polite">
    <p><strong>Reunión interna</strong> · «{interna.tema}» · la convocó {nombre(interna.convoca)}</p>
    <p className="tenue">{interna.asistentes.map(nombre).join(', ')}</p>
    {estado && <p>{estado}</p>}
    {(verTodo ? dichos : dichos.slice(-2)).map((m, i) => <p key={i} className="o3-interna-linea"><strong>{nombre(m.agente)}:</strong> {m.texto}</p>)}
    <div className="o3-encuentro-botones">
      {dichos.length > 2 && <button type="button" className="btn btn-sm" onClick={() => setVerTodo(v => !v)}>{verTodo ? 'Ver menos' : 'Ver toda la charla'}</button>}
      <button type="button" className="btn btn-sm" onClick={cerrar}>Cerrar</button>
    </div>
  </div>
}
// La conversación de cada agente con vos queda guardada (oficina_conversacion): el chat y las reuniones las guarda
// oficina-chat; lo del pasillo, esta pantalla (lo que te dijo y lo que le contestaste).
const CONTESTO = { ahora_no: 'Ahora no.', hablemos: 'Hablemos.', seguime: 'Seguime a mi oficina.', aprobada: 'Dale, aprobado.', rechazada: 'No.' }
async function anotarEncuentroEnBase(agente, texto) {
  const { error } = await supabase.from('oficina_conversacion').insert({ agente, de: 'agente', texto: String(texto).slice(0, 4000), lugar: 'pasillo' })
  if (error) throw error
  return true
}
async function contestarEncuentroEnBase(agente, respuesta) {
  const { error } = await supabase.from('oficina_conversacion').insert({ agente, de: 'daniela', texto: CONTESTO[respuesta] ?? respuesta, lugar: 'pasillo' })
  if (error) throw error
}
async function anotarEnConversacionDeBase(agente, texto) {
  const { error } = await supabase.from('oficina_conversacion').insert({ agente, de: 'daniela', texto: String(texto).slice(0, 4000), lugar: 'charla' })
  if (error) throw error
}
async function leerConversacionDeBase(agente) {
  const { data, error } = await supabase.from('oficina_conversacion').select('de,texto,lugar,creado').eq('agente', agente).order('creado', { ascending: false }).order('id', { ascending: false }).limit(60)
  if (error) throw error
  return (data || []).reverse().map(f => ({ role: f.de === 'daniela' ? 'user' : 'assistant', content: limpiarMarcas(f.texto), lugar: f.lugar, creado: f.creado })).filter(m => m.content)
}

async function correrReunionInterna(id) {
  const { data, error } = await supabase.functions.invoke('oficina-chat', { body: { reunion_interna: id } })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error de conexión */ } }
  if (error || !r?.mensajes) throw new Error(r?.error || 'no respondió')
  return r
}

// Lo que te dice un agente cuando pasás caminando cerca: su pedido (con aprobar o rechazar ahí mismo) o un aviso.
// Femina, María o Noruega entraron a tu oficina por su cuenta: lo que te dicen al llegar.
function Encuentro({ encuentro, agente, decidir, hablar, seguime, despues, contestar, convocar = null, puerta = false }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const x = encuentro.pedido
  const charla = agente && !agente.sinCharla
  const decidirlo = async estado => {
    setOcupado(true); setError('')
    try { await decidir(x.id, estado, x.nota, x.accion); contestar(estado) } catch (e) { setError(e.message); setOcupado(false) }
  }
  return <div className="o3-encuentro" role="dialog" aria-label={`${agente ? nombreCorto(agente.nombre) : encuentro.id} ${puerta ? 'golpea tu puerta' : 'te habla'}`}>
    <div className="o3-encuentro-quien">{agente && <Avatar agente={agente} />}<strong>{agente ? nombreCorto(agente.nombre) : encuentro.id}</strong>{puerta && <span className="tenue"> · en la puerta de tu oficina</span>}</div>
    <p>{encuentro.texto}</p>
    {x && riesgoDe(x) === 'alto' && <p className="o3-encuentro-riesgo">Mesa de entrada: {recomendacion(x)}</p>}
    {error && <p role="alert" className="o3-encuentro-riesgo">No se pudo guardar: {error}</p>}
    <div className="o3-encuentro-botones">
      {x && <>
        <button type="button" className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => decidirlo('aprobada')}>{TEXTO_APROBAR[x.accion?.tipo] ?? 'Dale, aprobado'}</button>
        <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => decidirlo('rechazada')}>No</button>
      </>}
      {encuentro.reunion && convocar && <button type="button" className="btn btn-sm btn-primary" onClick={() => { contestar('reunion'); convocar(encuentro.reunion) }}>{encuentro.reunion.asistentes.length <= MAX_OFICINA ? 'Vamos a mi mesa' : 'Vamos a la sala'}</button>}
      {charla && <button type="button" className="btn btn-sm" onClick={() => { contestar('hablemos'); hablar(encuentro.id) }}>{puerta ? 'Pasá' : 'Hablemos'}</button>}
      {charla && !puerta && seguime && <button type="button" className="btn btn-sm" onClick={() => { contestar('seguime'); seguime(encuentro.id) }}>Seguime a mi oficina</button>}
      <button type="button" className="btn btn-sm" onClick={() => { contestar('ahora_no'); despues() }}>Ahora no</button>
    </div>
  </div>
}

// Las hojas de la oficina, como en un Excel: una a la vista y las pestañas abajo (con lo que espera respuesta).
function LibroOficina({ hojas, hoja, setHoja }) {
  const actual = hojas.find(h => h.id === hoja) ?? hojas[0]
  return <div className="oficina-libro oficina-libro-principal">
    <div className="oficina-pestanas" role="tablist" aria-label="Hojas de la oficina">
      {hojas.map(h => <button key={h.id} type="button" role="tab" aria-selected={h.id === actual.id} className={h.id === actual.id ? 'activa' : ''} onClick={() => setHoja(h.id)}>
        {h.titulo}{h.num > 0 && <span className="oficina-pestana-num" aria-label={`${h.num} esperan tu respuesta`}>{h.num}</span>}
      </button>)}
    </div>
    <div className="oficina-hoja-principal" role="tabpanel" aria-label={actual.titulo}>{actual.contenido}</div>
  </div>
}

// Comunicados oficiales: lo que decidís o anunciás vos, lo que sale de las reuniones y los avisos de los agentes.
// Lo que publicás acá queda también en el chat de la oficina, así lo saben todos.
async function publicarComunicadoEnBase(texto) {
  const { error } = await supabase.from('oficina_chat_general').insert({ autor: 'daniela', texto, tipo: 'comunicado' })
  if (error) throw new Error(error.message)
}
function Comunicados({ lista, publicar }) {
  const [filtro, setFiltro] = useState('')
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('')
  const enviar = async e => {
    e.preventDefault()
    const t = texto.trim()
    if (!t || estado === 'enviando') return
    setEstado('enviando')
    try { await publicar(t); setTexto(''); setEstado('') } catch (err) { setEstado(`No se pudo publicar: ${err.message}`) }
  }
  const vistos = filtro ? lista.filter(x => x.tipo === filtro) : lista
  return <div className="oficina-comunicados">
    <form className="oficina-charla-form" onSubmit={enviar}>
      <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribí un comunicado oficial para toda la oficina…" aria-label="Comunicado oficial" disabled={estado === 'enviando'} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={estado === 'enviando' || !texto.trim()}>Publicar</button>
    </form>
    {estado && estado !== 'enviando' && <p role="alert" className="feedback-error">{estado}</p>}
    <div className="oficina-comunicados-filtros" role="group" aria-label="Qué comunicados ver">
      {[['', 'Todos'], ...Object.entries(TIPOS_COMUNICADO)].map(([v, t]) => <button key={v} type="button" className={`btn btn-sm${filtro === v ? ' btn-primary' : ''}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}</button>)}
    </div>
    {vistos.length
      ? <ul className="oficina-comunicados-lista">{vistos.map(x => <li key={x.id} className={`tipo-${x.tipo}${x.problema ? ' es-problema' : ''}`}>
        <p className="oficina-comunicado-cabeza"><strong>{x.titulo}</strong> <span className="tenue">· {TIPOS_COMUNICADO[x.tipo]} · {haceCuanto(x.fecha)}</span></p>
        {x.texto && <p>{x.texto}</p>}
      </li>)}</ul>
      : <p className="tenue">Todavía no hay comunicados{filtro ? ' de este tipo' : ''}.</p>}
  </div>
}

// El chat de toda la oficina, de trabajo: lo que escribís vos y las respuestas de los agentes.
async function escribirEnGeneral(texto) {
  const { data, error } = await supabase.functions.invoke('oficina-chat', { body: { general: texto } })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error de conexión */ } }
  if (error || r?.error) throw new Error(r?.error || 'No se pudo enviar. Probá de nuevo.')
  return r
}
function ChatGeneral({ mensajes, agentes, escribir }) {
  const [texto, setTexto] = useState('')
  const [esperando, setEsperando] = useState(false)
  const [error, setError] = useState('')
  const fin = useRef(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [mensajes.length, esperando])
  const agente = id => agentes.find(a => a.id === id)
  const enviar = async e => {
    e?.preventDefault?.()
    const t = texto.trim()
    if (!t || esperando) return
    setTexto(''); setError(''); setEsperando(true)
    try { await escribir(t) } catch (err) { setError(`No contestó nadie: ${err.message}`) }
    setEsperando(false)
  }
  return <div className="oficina-general">
    <div className="oficina-general-mensajes" aria-live="polite">
      {!mensajes.length && <p className="tenue">Escribile a toda la oficina: contestan todos, cada uno desde su área.</p>}
      {mensajes.map(m => {
        const a = m.autor === 'daniela' ? null : agente(m.autor)
        return <div key={m.id} className={`oficina-general-msj${m.autor === 'daniela' ? ' de-vos' : ''}${m.tipo === 'noticia' ? ' es-noticia' : ''}`}>
          {a ? <Avatar agente={a} /> : m.autor !== 'daniela' && <span className="oficina-avatar" />}
          <div>
            <p className="oficina-general-quien">{m.autor === 'daniela' ? 'Vos' : nombreCorto(a?.nombre ?? m.autor)} <span className="tenue">· {haceCuanto(m.creado)}</span></p>
            <p>{m.texto}</p>
          </div>
        </div>
      })}
      {esperando && <p className="tenue">Están escribiendo…</p>}
      <span ref={fin} />
    </div>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    <form className="oficina-charla-form" onSubmit={enviar}>
      <textarea rows={2} value={texto} disabled={esperando} placeholder="Escribile a toda la oficina…" aria-label="Mensaje para toda la oficina"
        onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={esperando || !texto.trim()}>Enviar</button>
    </form>
  </div>
}

// Los chats de trabajo entre compañeros (cuando aclaran algo entre ellos): quiénes, de qué y lo que se dijeron.
function ChatsCompaneros({ momentos, agentes }) {
  const nombre = id => nombreCorto(agentes.find(a => a.id === id)?.nombre ?? id)
  if (!momentos.length) return <p className="tenue">Todavía no hubo chats entre compañeros. Cuando dos agentes tienen que aclarar algo de trabajo, se escriben y lo leés acá.</p>
  return <ul className="oficina-vida-lista">{momentos.slice(0, 12).map(m => <li key={m.id}>
    <span className="tenue">{new Date(`${m.fecha}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric' })}{m.hora ? ` ${m.hora}` : ''}</span>
    <strong>{m.agentes.map(nombre).join(', ')}</strong> {TEXTO_MOMENTO[m.tipo] ?? m.tipo}. <span className="tenue">{m.resumen}</span>
    {m.charla?.length > 0 && <details className="oficina-momento-charla">
      <summary>Leer el chat</summary>
      {m.charla.map((x, i) => <p key={i}><strong>{nombre(x.agente)}:</strong> {x.texto}</p>)}
    </details>}
  </li>)}</ul>
}

// ---------- Calendario ----------
// El calendario interno de la oficina: reuniones que se hicieron, las agendadas, las que esperan tu OK y las fechas
// límite de las tareas.
const TIPO_EVENTO = { reunion: 'Reunión', agendada: 'Reunión agendada', interna: 'Reunión interna', propuesta: 'Reunión por aprobar', vence: 'Vence', hecha: 'Hecha' }
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
      <span className="oficina-cal-leyenda">{['reunion', 'agendada', 'interna', 'propuesta', 'vence'].map(t => <span key={t}><i className={`tipo-${t}`} />{TIPO_EVENTO[t]}</span>)}</span>
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
            <strong>{a.titulo && a.titulo !== 'Reunión' ? a.titulo : { sala: 'Reunión en la sala', oficina: 'Reunión en tu oficina', turnos: 'Turnos en tu oficina', interna: 'Reunión interna' }[a.modo] ?? 'Reunión'}</strong>{a.modo === 'interna' && <span className="tenue"> · entre ellos, sin vos</span>}
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

// La leyenda: cada estado con su dibujo (el mismo de la escena) y dónde está ese agente.
const LEYENDA = [
  ['work', 'Trabajando', 'en su escritorio, pantalla en verde'],
  ['problem', 'Con un problema', 'manos en la cabeza, pantalla en rojo'],
  ['break', 'En descanso', 'de pie en el café, con una taza'],
  ['sleep', 'Pausado', 'en el sillón de descanso'],
]
function Leyenda() {
  return <ul className="oficina-leyenda" aria-label="Qué significa lo que se ve">
    {LEYENDA.map(([pose, titulo, texto]) => {
      const m = muestra(pose)
      return <li key={pose}>
        <svg className="oficina-leyenda-dibujo" viewBox={m.vista} aria-hidden="true" dangerouslySetInnerHTML={{ __html: m.svg }} />
        <span><strong>{titulo}</strong><span className="tenue">{texto}</span></span>
      </li>
    })}
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


// La carita del agente: la cabeza y los hombros de su personaje de la escena (la misma persona en toda la pantalla).
function Avatar({ agente }) {
  const svg = useMemo(() => person(figuraDe(agente.id), 'stand'), [agente.id])
  return <svg className={`oficina-avatar estado-${agente.estado}`} viewBox="-32 -206 64 64" width="24" height="24" aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: svg }} />
}

// ---------- Panel del agente ----------
const PESTANAS = [['charla', 'Chat'], ['ahora', 'Ahora'], ['que', 'Qué hace'], ['tareas', 'Tareas'], ['herramientas', 'Herramientas'], ['opciones', 'Opciones']]

function PanelAgente({ agente: a, pestana, setPestana, ahora, cerrar, charla = [], setCharla, hablar, pedidos = [], decidir, fuera = false, venir, deVisita = false, abrirChat, anotar }) {
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
        {PESTANAS.filter(([id]) => !a.sinCharla || (id !== 'charla' && id !== 'opciones')).map(([id, texto]) => <button key={id} type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'is-activa' : ''} onClick={() => setPestana(id)}>{texto}</button>)}
      </div>
      <div className="oficina-panel-cuerpo" role="tabpanel">
        {pestana === 'ahora' && <>
          <p><span className={`oficina-estado estado-${a.estado}`}>{ESTADOS[a.estado]}</span></p>
          <p className="oficina-ahora">{a.ahora}</p>
          {a.ultima && <p className="tenue">Última actividad: {haceCuanto(new Date(a.ultima).toISOString(), ahora)} ({horaAR(a.ultima)}).</p>}
        </>}
        {pestana === 'charla' && !a.sinCharla && <Charla agente={a} mensajes={charla} setMensajes={setCharla} hablar={hablar} venir={venir} deVisita={deVisita} pedidos={pedidos} decidir={decidir} anotar={anotar} fuera={fuera} />}
        {pestana === 'opciones' && !a.sinCharla && <>
          <button type="button" className="btn btn-sm" onClick={() => { abrirChat?.(a.id); cerrar() }}>Abrir el chat en una ventana</button>
          {!a.sinCharla && venir && <button type="button" className="btn btn-sm" disabled={deVisita} onClick={() => {
            venir(a.id)
            setCharla(m => [...m, { role: 'user', content: 'Vení a mi oficina.' }])
            anotar?.(a.id, 'Vení a mi oficina.').catch(() => { /* igual va */ })
            abrirChat?.(a.id)
            cerrar()
          }}>{deVisita ? 'Está en tu oficina' : 'Llamar a mi oficina'}</button>}
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
      </div>
    </aside>
  </>
}

const LUGAR_MENSAJE = { pasillo: 'En el pasillo', reunion: 'En una reunión' }
// Lo que el agente te pidió y todavía espera tu permiso aparece en la charla: lo decidís ahí, sin ir a Mensajes.
function PedidoEnCharla({ pedido: x, decidir, alDecidir }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const decidirlo = async estado => {
    setOcupado(true); setError('')
    try { await decidir(x.id, estado, x.nota, x.accion); alDecidir(estado) } catch (e) { setError(e.message); setOcupado(false) }
  }
  return <div className="oficina-mensaje de-assistant oficina-pedido-charla">
    <span className="oficina-mensaje-lugar">Te pide permiso</span>
    <strong>{x.titulo}</strong>
    {x.detalle && <span className="oficina-pedido-detalle">{x.detalle}</span>}
    {riesgoDe(x) === 'alto' && <span className="o3-encuentro-riesgo">Mesa de entrada: {recomendacion(x)}</span>}
    {error && <span role="alert" className="feedback-error">No se pudo guardar: {error}</span>}
    <span className="oficina-pedido-botones">
      <button type="button" className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => decidirlo('aprobada')}>{TEXTO_APROBAR[x.accion?.tipo] ?? 'Dale, aprobado'}</button>
      <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => decidirlo('rechazada')}>No</button>
    </span>
  </div>
}
function Charla({ agente, mensajes, setMensajes, hablar, venir, deVisita = false, pedidos = [], decidir, anotar, fuera = false }) {
  const [texto, setTexto] = useState('')
  const [esperando, setEsperando] = useState(false)
  const [error, setError] = useState('')
  // Si estás fuera de la oficina, los chats quedan en pausa hasta que vuelvas.
  const cerrada = fuera
  const fin = useRef(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [mensajes, esperando])

  async function enviar(e, forzado = null) {
    e?.preventDefault?.()
    const pregunta = (forzado ?? texto).trim()
    if (!pregunta || esperando || cerrada) return
    const nuevos = [...mensajes, { role: 'user', content: pregunta }]
    setMensajes(nuevos); if (!forzado) setTexto(''); setError(''); setEsperando(true)
    // Si le pedís que venga a tu oficina, va; si ya está ahí, se queda mientras sigan hablando.
    if (deVisita || lePedisQueVenga(pregunta)) venir?.(agente.id)
    try {
      const respuesta = await hablar(agente.id, nuevos, 'charla')
      setMensajes(m => [...m, { role: 'assistant', content: respuesta }])
      if (vieneATuOficina(respuesta)) venir?.(agente.id)
    } catch (err) { setError(err.message) }
    setEsperando(false)
  }

  return <div className="oficina-charla">
    <p className="tenue oficina-charla-nota">Responde con lo que dice su registro. No cambia nada. Queda guardado todo lo que hablan: acá, en el pasillo y en las reuniones.</p>
    <div className="oficina-mensajes" aria-live="polite">
      {!mensajes.length && <p className="tenue">Por ejemplo: «¿qué hiciste hoy?», «¿por qué fallaste?», «¿qué necesitás de mí?»</p>}
      {mensajes.map((m, i) => <p key={i} className={`oficina-mensaje de-${m.role}`}>
        {LUGAR_MENSAJE[m.lugar] && <span className="oficina-mensaje-lugar">{LUGAR_MENSAJE[m.lugar]}{m.creado ? ` · ${haceCuanto(m.creado)}` : ''}</span>}{m.content}</p>)}
      {pedidos.map(x => <PedidoEnCharla key={x.id} pedido={x} decidir={decidir} alDecidir={estado => {
        const dicho = estado === 'aprobada' ? `Dale, aprobado: «${x.titulo}».` : `No, eso no: «${x.titulo}».`
        setMensajes(m => [...m, { role: 'user', content: dicho }])
        anotar?.(agente.id, dicho).catch(() => { /* la decisión ya quedó guardada en el pedido */ })
      }} />)}
      {esperando && <p className="oficina-mensaje de-assistant tenue">{agente.nombre} está escribiendo…</p>}
      <span ref={fin} />
    </div>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    {cerrada && <p className="tenue">Estás fuera de la oficina: el chat sigue cuando vuelvas.</p>}
    <form className="oficina-charla-form" onSubmit={enviar}>
      <textarea rows={2} value={texto} disabled={esperando || cerrada} placeholder={cerrada ? 'Estás fuera de la oficina' : `Escribile a ${agente.nombre}…`} aria-label={`Mensaje para ${agente.nombre}`}
        onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={esperando || cerrada || !texto.trim()}>Enviar</button>
    </form>
  </div>
}
