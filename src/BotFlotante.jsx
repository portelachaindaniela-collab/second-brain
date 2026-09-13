import { useEffect, useRef } from 'react'
import { supabase } from './supabase.js'
import Mascota from './Mascota.jsx'
import './BotFlotante.css'

const SUGERENCIAS = ['¿Qué tengo hoy?', '¿Qué tengo pendiente?', '¿Qué proyectos tengo?']

async function responder(mensaje, historial, pantalla, proyectoId) {
  const { data, error } = await supabase.functions.invoke('bs67-chat', { body: { mensaje, historial, pantalla, proyecto_id: proyectoId } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* se muestra el error de conexión */ } }
  if (error || respuesta?.error) throw new Error(respuesta?.error || 'No se pudo consultar a BS67. Probá de nuevo en un momento.')
  return respuesta?.respuesta || 'No obtuve una respuesta. Probá reformular la consulta.'
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
      if (activo.current) setMensajes(prev => [...prev, { rol: 'bot', texto: respuesta }])
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
        {mensajes.map((m, i) => <p className={`bot-message ${m.rol === 'user' ? 'bot-message-user' : ''}`} key={i}><span className="bot-speaker">{m.rol === 'user' ? 'Vos' : 'BS67'}: </span>{m.texto}</p>)}
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
