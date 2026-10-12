import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import Mascota from '../Mascota.jsx'
import '../BotFlotante.css'

// BS67 dentro de UP: el mismo bot de Second Brain, conectado al agente de IA (Edge Function up-asistente). Conversa, busca en internet, lee links y
// opera UP; las acciones que cambian algo llegan como propuesta y solo se ejecutan si la dueña toca Confirmar.
const CLAVE = 'up-asistente-conversacion'
const SUGERENCIAS = ['¿Qué tengo pendiente?', '¿Qué se publica esta semana?', '¿Qué planes de trabajo tengo?', 'Pasá la idea del jueves al viernes', 'Buscá ideas de posts sobre comunicación deportiva']

function leerGuardada() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || [] } catch { return [] }
}

// Texto con saltos de línea y links que se pueden tocar.
function Texto({ texto }) {
  const partes = texto.split(/(https?:\/\/[^\s)]+)/g)
  return <p className="up-chat-texto">{partes.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p))}</p>
}

async function llamar(body) {
  const { data, error } = await supabase.functions.invoke('up-asistente', { body })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) return { error: r?.error || 'El asistente no respondió. Probá de nuevo.' }
  return r
}

export default function Asistente({ alCambiar }) {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState(leerGuardada)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const fin = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(CLAVE, JSON.stringify(mensajes.slice(-40))) } catch { /* sin almacenamiento: la conversación dura la sesión */ }
    fin.current?.scrollIntoView({ block: 'end' })
  }, [mensajes, abierto])

  async function enviar(t = texto) {
    const pregunta = t.trim()
    if (!pregunta || ocupado) return
    const historia = [...mensajes, { rol: 'usuario', texto: pregunta }]
    setMensajes(historia); setTexto(''); setOcupado(true)
    const r = await llamar({ mensajes: historia.filter(m => m.texto).map(({ rol, texto }) => ({ rol, texto })) })
    setOcupado(false)
    if (r.error) { setMensajes(m => [...m, { rol: 'error', texto: r.error }]); return }
    setMensajes(m => [...m, { rol: 'asistente', texto: r.respuesta || '', propuesta: r.propuesta || null, herramientas: r.herramientas || [] }])
  }

  async function decidir(i, confirmar) {
    const p = mensajes[i].propuesta
    setMensajes(m => m.map((x, j) => (j === i ? { ...x, decision: confirmar ? 'confirmando' : 'cancelada' } : x)))
    if (!confirmar) { setMensajes(m => [...m, { rol: 'asistente', texto: 'Listo, no hice nada.' }]); return }
    setOcupado(true)
    const r = await llamar({ ejecutar: { nombre: p.nombre, args: p.args } })
    setOcupado(false)
    if (!r.error) alCambiar?.()
    setMensajes(m => [...m.map((x, j) => (j === i ? { ...x, decision: 'confirmada' } : x)), r.error ? { rol: 'error', texto: r.error } : { rol: 'asistente', texto: r.respuesta }])
  }

  if (!abierto) return <button className="up-bs67-boton" onClick={() => setAbierto(true)} aria-label="Conversar con BS67" title="Conversar con BS67"><Mascota /><span>BS67</span></button>

  return (
    <aside className="up-chat" aria-label="BS67 en UP">
      <header className="up-chat-cab">
        <span className="up-chat-mascota"><Mascota /></span>
        <div><div className="up-antetitulo">BS67</div><small>Tu bot de Second Brain, acá en UP. Conversa, busca en internet y edita el calendario con tu OK.</small></div>
        {mensajes.length > 0 && <button className="up-link" onClick={() => setMensajes([])}>Nueva charla</button>}
        <button className="up-chat-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">×</button>
      </header>
      <div className="up-chat-cuerpo">
        {mensajes.length === 0 && (
          <div className="up-chat-vacio">
            <p>¡Hola! Soy BS67. Preguntame lo que quieras sobre UP, tus planes de trabajo, tus publicaciones o cualquier tema.</p>
            <div className="up-chat-sugerencias">{SUGERENCIAS.map(s => <button key={s} className="up-btn" onClick={() => enviar(s)}>{s}</button>)}</div>
          </div>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className={`up-chat-msj m-${m.rol}`}>
            {m.texto && <Texto texto={m.texto} />}
            {m.herramientas?.length > 0 && <div className="up-chat-uso">consultó: {[...new Set(m.herramientas)].join(' · ')}</div>}
            {m.propuesta && (
              <div className="up-chat-propuesta">
                <div className="up-mono-k">Necesito tu OK</div>
                <p>{m.propuesta.descripcion}</p>
                {!m.decision && <div className="up-acciones up-acciones-izq"><button className="up-btn" disabled={ocupado} onClick={() => decidir(i, false)}>Cancelar</button><button className="up-btn up-btn-p" disabled={ocupado} onClick={() => decidir(i, true)}>Confirmar</button></div>}
                {m.decision && <div className="up-chat-uso">{{ confirmando: 'haciéndolo…', confirmada: 'confirmado', cancelada: 'cancelado' }[m.decision]}</div>}
              </div>
            )}
          </div>
        ))}
        {ocupado && <div className="up-chat-msj m-asistente"><span className="up-chat-pensando">pensando<i>.</i><i>.</i><i>.</i></span></div>}
        <div ref={fin} />
      </div>
      <form className="up-chat-pie" onSubmit={e => { e.preventDefault(); enviar() }}>
        <textarea className="up-editor" rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribile a BS67 o pegá un link…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} aria-label="Mensaje para BS67" />
        <button type="submit" className="up-btn up-btn-p" disabled={ocupado || !texto.trim()}>Enviar</button>
      </form>
    </aside>
  )
}
