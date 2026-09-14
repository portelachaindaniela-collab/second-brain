import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import Mascota from './Mascota.jsx'
import './BotFlotante.css'

const SUGERENCIAS = ['¿Qué tengo hoy?', '¿Qué tengo pendiente?', '¿Qué proyectos tengo?']
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

async function responder(mensaje, historial, pantalla, proyectoId) {
  const { data, error } = await supabase.functions.invoke('bs67-chat', { body: { mensaje, historial, pantalla, proyecto_id: proyectoId } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* se muestra el error de conexión */ } }
  if (error || respuesta?.error) throw new Error(respuesta?.error || 'No se pudo consultar a BS67. Probá de nuevo en un momento.')
  return respuesta?.respuesta || 'No obtuve una respuesta. Probá reformular la consulta.'
}

// BS67 puede proponer eventos de calendario dentro de un bloque ```eventos con un array JSON —
// nunca los guarda él mismo. Acá se separa ese bloque del texto que se le muestra a Daniela.
function extraerEventosPropuestos(texto) {
  const match = texto.match(/```eventos\s*([\s\S]*?)```/i)
  if (!match) return { textoLimpio: texto, eventos: null }
  const textoLimpio = (texto.slice(0, match.index) + texto.slice(match.index + match[0].length)).trim()
  try {
    const datos = JSON.parse(match[1])
    if (!Array.isArray(datos)) return { textoLimpio, eventos: null }
    const eventos = datos
      .filter(e => e && typeof e.title === 'string' && typeof e.starts_at === 'string' && typeof e.ends_at === 'string')
      .map(e => ({
        title: String(e.title).slice(0, 500),
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        all_day: !!e.all_day,
        location: e.location ? String(e.location).slice(0, 10000) : null,
        description: e.description ? String(e.description).slice(0, 10000) : null,
      }))
    return { textoLimpio, eventos: eventos.length ? eventos : null }
  } catch { return { textoLimpio, eventos: null } }
}

function fechasParaGuardar(e) {
  if (!e.all_day) return { starts_at: new Date(e.starts_at).toISOString(), ends_at: new Date(e.ends_at).toISOString() }
  const fin = new Date(e.ends_at.slice(0, 10) + 'T12:00:00Z')
  fin.setUTCDate(fin.getUTCDate() + 1)
  return { starts_at: e.starts_at.slice(0, 10), ends_at: fin.toISOString().slice(0, 10) }
}

function EventosPropuestos({ eventos, proyectoId, onResultado }) {
  const [estado, setEstado] = useState('pendiente') // pendiente | guardando | listo
  const [resultado, setResultado] = useState(null)

  async function confirmar() {
    setEstado('guardando')
    let creados = 0, fallidos = 0
    for (const e of eventos) {
      try {
        const { starts_at, ends_at } = fechasParaGuardar(e)
        const { data, error } = await supabase.functions.invoke('google-calendar-edit', {
          body: { accion: 'crear', title: e.title, location: e.location, description: e.description, all_day: e.all_day, starts_at, ends_at, time_zone: ZONA_HORARIA, project_id: proyectoId || null },
        })
        let respuesta = data
        if (error?.context) { try { respuesta = await error.context.json() } catch { /* se cuenta como fallido */ } }
        if (error || respuesta?.error) fallidos++; else creados++
      } catch { fallidos++ }
    }
    setEstado('listo')
    setResultado({ creados, fallidos })
    onResultado?.({ creados, fallidos })
  }

  return (
    <div className="bot-eventos">
      {eventos.map((e, i) => (
        <div className="bot-evento-item" key={i}>
          <strong>{e.title}</strong>
          <span>{e.all_day ? e.starts_at.slice(0, 10) : new Date(e.starts_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA_HORARIA })}{e.location ? ` · ${e.location}` : ''}</span>
        </div>
      ))}
      {estado === 'pendiente' && (
        <div className="bot-eventos-acciones">
          <button type="button" className="btn btn-sm btn-primary" onClick={confirmar}>Confirmar y guardar</button>
        </div>
      )}
      {estado === 'guardando' && <p className="bot-eventos-estado">Guardando…</p>}
      {estado === 'listo' && (
        <p className="bot-eventos-estado">
          {resultado.creados} guardado{resultado.creados === 1 ? '' : 's'}{resultado.fallidos ? `, ${resultado.fallidos} fallaron` : ''}.
        </p>
      )}
    </div>
  )
}

export default function BotFlotante({ abierto, setAbierto, texto, setTexto, mensajes, setMensajes, consultando, setConsultando, pantalla, proyectoId }) {
  const boton = useRef(null)
  const entrada = useRef(null)
  const final = useRef(null)
  const activo = useRef(true)
  const enviando = useRef(false)
  useEffect(() => { activo.current = true; return () => { activo.current = false } }, [])
  useEffect(() => { if (abierto) entrada.current?.focus() }, [abierto])
  useEffect(() => { if (abierto) final.current?.scrollIntoView({ block: 'nearest' }) }, [abierto, mensajes, consultando])
  function cerrar() { setAbierto(false); boton.current?.focus() }
  async function enviar(valor) {
    const consulta = valor.trim()
    if (!consulta || enviando.current) return
    enviando.current = true
    setTexto(''); setConsultando(true)
    const historialPrevio = mensajes.slice(-12).map(m => ({ rol: m.rol, texto: m.texto }))
    setMensajes(prev => [...prev, { rol: 'user', texto: consulta }])
    try {
      const respuesta = await responder(consulta, historialPrevio, pantalla, proyectoId)
      const { textoLimpio, eventos } = extraerEventosPropuestos(respuesta)
      if (activo.current) setMensajes(prev => [...prev, { rol: 'bot', texto: textoLimpio, eventos }])
    } catch (error) {
      if (activo.current) setMensajes(prev => [...prev, { rol: 'bot', texto: error.message || 'No pude completar la consulta. Probá de nuevo en un momento.' }])
    } finally {
      enviando.current = false
      if (activo.current) { setConsultando(false); entrada.current?.focus() }
    }
  }
  return <div className="bot-floating" onKeyDown={e => { if (e.key === 'Escape' && abierto) { e.stopPropagation(); cerrar() } }}>
    {abierto && <section className="bot-conversation" id="maria-conversation" role="dialog" aria-labelledby="maria-chat-title">
      <header><div><strong id="maria-chat-title">BS67</strong><small>Tu bot de Second brain</small></div><button type="button" onClick={cerrar} aria-label="Cerrar conversación">×</button></header>
      <div className="bot-messages" role="log" aria-label="Conversación con BS67" aria-live="polite" aria-relevant="additions text">
        <p className="bot-message">¡Hola! Contame qué necesitás — puedo hablarte de tus tareas, tus proyectos, tu agenda o tus mails.</p>
        {mensajes.map((m, i) => (
          <div key={i}>
            <p className={`bot-message ${m.rol === 'user' ? 'bot-message-user' : ''}`}><span className="bot-speaker">{m.rol === 'user' ? 'Vos' : 'BS67'}: </span>{m.texto}</p>
            {m.eventos && <EventosPropuestos eventos={m.eventos} proyectoId={proyectoId} />}
          </div>
        ))}
        {consultando && <p className="bot-pending" role="status">Consultando…</p>}
        <div ref={final} />
      </div>
      {mensajes.length === 0 && <div className="bot-shortcuts">{SUGERENCIAS.map(t => <button type="button" key={t} disabled={consultando} onClick={() => enviar(t)}>{t}</button>)}</div>}
      <form onSubmit={e => { e.preventDefault(); enviar(texto) }}>
        <input ref={entrada} aria-label="Mensaje para BS67" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribile a BS67…" maxLength={2000} />
        <button type="submit" disabled={consultando || !texto.trim()} aria-label="Enviar mensaje">↑</button>
      </form>
    </section>}
    <button className={`bot-launcher${abierto ? ' is-open' : ''}`} ref={boton} type="button" aria-label={abierto ? 'Cerrar conversación con BS67' : 'Conversar con BS67'} aria-expanded={abierto} aria-controls="maria-conversation" title="Conversar con BS67" onClick={() => abierto ? cerrar() : setAbierto(true)}><Mascota /></button>
  </div>
}
