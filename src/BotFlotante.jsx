import { useEffect, useRef } from 'react'
import { supabase } from './supabase.js'
import Mascota from './Mascota.jsx'
import './BotFlotante.css'

const SUGERENCIAS = ['¿Cómo viene mi día?', '¿Qué tareas tengo vencidas?', 'Agendame un café el jueves a las 17', 'Resumime los mails sin leer', '¿Funciona todo en Trabajadores?']

// BS67: el asistente de Second Brain (Edge Function bs67-chat). Conversa, lee la app, busca en internet y propone
// cambios; los cambios solo se hacen si Daniela toca Confirmar.
async function llamar(body) {
  const { data, error } = await supabase.functions.invoke('bs67-chat', { body })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) throw new Error(r?.error || 'No se pudo consultar a BS67. Probá de nuevo en un momento.')
  return r
}

// Texto con saltos de línea y links que se pueden tocar.
function Texto({ texto }) {
  const partes = texto.split(/(https?:\/\/[^\s)]+)/g)
  return partes.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p))
}

const NOMBRE_HERRAMIENTA = {
  resumen_del_dia: 'tu día', ver_proyectos: 'proyectos', ver_tareas: 'tareas', ver_agenda: 'agenda', ver_mails: 'mails', buscar_docs: 'docs',
  leer_doc: 'un doc', ver_cursos: 'cursos', ver_archivos: 'archivos', ver_eventos_para_ir: 'eventos', ver_noticias: 'Mi nicho',
  estado_trabajadores: 'trabajadores', ver_up: 'UP', buscar_web: 'internet', leer_link: 'un link',
}

export default function BotFlotante({ abierto, setAbierto, texto, setTexto, mensajes, setMensajes, consultando, setConsultando, pantalla, proyectoId, alCambiar }) {
  const boton = useRef(null)
  const entrada = useRef(null)
  const final = useRef(null)
  const activo = useRef(true)
  const enviando = useRef(false)
  useEffect(() => { activo.current = true; return () => { activo.current = false } }, [])
  useEffect(() => { if (abierto) entrada.current?.focus() }, [abierto])
  useEffect(() => { if (abierto) final.current?.scrollIntoView({ block: 'nearest' }) }, [abierto, mensajes, consultando])
  function cerrar() { setAbierto(false); boton.current?.focus() }

  async function ocupado(tarea) {
    if (enviando.current) return
    enviando.current = true; setConsultando(true)
    try { await tarea() } catch (error) {
      if (activo.current) setMensajes(prev => [...prev, { rol: 'error', texto: error.message || 'No pude completar la consulta. Probá de nuevo en un momento.' }])
    } finally {
      enviando.current = false
      if (activo.current) { setConsultando(false); entrada.current?.focus() }
    }
  }

  function enviar(valor) {
    const consulta = valor.trim()
    if (!consulta || enviando.current) return
    const historial = mensajes.filter(m => m.rol === 'user' || m.rol === 'bot').slice(-20).map(m => ({ rol: m.rol, texto: m.propuesta ? `${m.texto}\n(Propuse: ${m.propuesta.descripcion} — ${m.decision === 'confirmada' ? 'Daniela confirmó' : m.decision === 'cancelada' ? 'Daniela canceló' : 'sin respuesta'})` : m.texto }))
    setTexto('')
    setMensajes(prev => [...prev, { rol: 'user', texto: consulta }])
    ocupado(async () => {
      const r = await llamar({ mensaje: consulta, historial, pantalla, proyecto_id: proyectoId })
      if (activo.current) setMensajes(prev => [...prev, { rol: 'bot', texto: r.respuesta || '', propuesta: r.propuesta || null, herramientas: r.herramientas || [] }])
    })
  }

  function decidir(i, confirmar) {
    const p = mensajes[i].propuesta
    setMensajes(prev => prev.map((m, j) => (j === i ? { ...m, decision: confirmar ? 'confirmando' : 'cancelada' } : m)))
    if (!confirmar) { setMensajes(prev => [...prev, { rol: 'bot', texto: 'Listo, no hice nada.' }]); return }
    ocupado(async () => {
      try {
        const r = await llamar({ ejecutar: { nombre: p.nombre, args: p.args } })
        if (!activo.current) return
        setMensajes(prev => [...prev.map((m, j) => (j === i ? { ...m, decision: 'confirmada' } : m)), { rol: 'bot', texto: r.respuesta }])
        alCambiar?.()
      } catch (error) {
        setMensajes(prev => prev.map((m, j) => (j === i ? { ...m, decision: undefined } : m)))
        throw error
      }
    })
  }

  return <div className="bot-floating" onKeyDown={e => { if (e.key === 'Escape' && abierto) { e.stopPropagation(); cerrar() } }}>
    {abierto && <section className="bot-conversation" id="maria-conversation" role="dialog" aria-labelledby="maria-chat-title">
      <header>
        <div><strong id="maria-chat-title">BS67</strong><small>Tu asistente de Second Brain</small></div>
        {mensajes.length > 0 && <button type="button" className="bot-nueva" onClick={() => setMensajes([])} disabled={consultando}>Nueva charla</button>}
        <button type="button" onClick={cerrar} aria-label="Cerrar conversación">×</button>
      </header>
      <div className="bot-messages" role="log" aria-label="Conversación con BS67" aria-live="polite" aria-relevant="additions text">
        <p className="bot-message">¡Hola! Soy BS67. Puedo contarte cómo viene tu día, buscar en tus tareas, mails, docs y agenda, buscar en internet, y también crear o cambiar tareas, proyectos, docs, eventos y cursos (siempre con tu OK).</p>
        {mensajes.map((m, i) => (
          <div key={i}>
            {m.texto && <p className={`bot-message${m.rol === 'user' ? ' bot-message-user' : ''}${m.rol === 'error' ? ' bot-message-error' : ''}`}><span className="bot-speaker">{m.rol === 'user' ? 'Vos' : 'BS67'}: </span><Texto texto={m.texto} /></p>}
            {m.herramientas?.length > 0 && <p className="bot-uso">miró: {[...new Set(m.herramientas.map(h => NOMBRE_HERRAMIENTA[h] || h))].join(' · ')}</p>}
            {m.propuesta && (
              <div className="bot-propuesta">
                <span className="bot-propuesta-k">Necesito tu OK</span>
                <p>{m.propuesta.descripcion}</p>
                {!m.decision && <div className="bot-propuesta-acciones">
                  <button type="button" className="btn btn-sm" disabled={consultando} onClick={() => decidir(i, false)}>Cancelar</button>
                  <button type="button" className="btn btn-sm btn-primary" disabled={consultando} onClick={() => decidir(i, true)}>Confirmar</button>
                </div>}
                {m.decision && <p className="bot-uso">{{ confirmando: 'haciéndolo…', confirmada: 'confirmado', cancelada: 'cancelado' }[m.decision]}</p>}
              </div>
            )}
          </div>
        ))}
        {consultando && <p className="bot-pending" role="status">Pensando…</p>}
        <div ref={final} />
      </div>
      {mensajes.length === 0 && <div className="bot-shortcuts">{SUGERENCIAS.map(t => <button type="button" key={t} disabled={consultando} onClick={() => enviar(t)}>{t}</button>)}</div>}
      <form onSubmit={e => { e.preventDefault(); enviar(texto) }}>
        <textarea ref={entrada} rows={2} aria-label="Mensaje para BS67" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribile a BS67 o pegá un link…" maxLength={8000}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto) } }} />
        <button type="submit" disabled={consultando || !texto.trim()} aria-label="Enviar mensaje">↑</button>
      </form>
    </section>}
    <button className={`bot-launcher${abierto ? ' is-open' : ''}`} ref={boton} type="button" aria-label={abierto ? 'Cerrar conversación con BS67' : 'Conversar con BS67'} aria-expanded={abierto} aria-controls="maria-conversation" title="Conversar con BS67" onClick={() => abierto ? cerrar() : setAbierto(true)}><Mascota /></button>
  </div>
}
