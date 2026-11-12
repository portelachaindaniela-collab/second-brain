import { useCallback, useEffect, useRef, useState } from 'react'
import { EQUIPOS } from '../oficina.mjs'
import { PLAZO_REUNION_S, MAX_ASISTENTES, MAX_OFICINA, asientosEspera, variante } from '../oficinaPlano.mjs'

// La reunión de la Oficina: convocar (qué áreas y dónde), la llegada (2 minutos), y la reunión en sí, como una
// videollamada: en la sala todos juntos (ronda de informes y después conversación abierta) o en la oficina de
// Daniela por turnos (pasan de a uno). Los informes salen de los datos de cada agente; lo que responden en la
// conversación lo arma la IA con sus datos (oficina-chat), sin poder cambiar nada.
const nombreCorto = n => String(n).split(' (')[0]
const conversa = a => !a.sinCharla // Administración y Sistemas no tienen IA: escuchan
const AREAS = ['trabajadores', 'up', 'pdg', 'admin', 'sistemas']
export const ESPERA_TURNOS = asientosEspera().length

// ---------- Convocar ----------
// preseleccion: ids de los que vienen de entrada (por ejemplo, el equipo que pidió mostrar un proyecto terminado).
export function ConvocarReunion({ agentes, alConvocar, cerrar, preseleccion = null }) {
  // Se elige agente por agente, en una lista desplegable por área. De entrada vienen todos los que no están pausados,
  // menos Administración y Sistemas (no conversan), que vienen solo si los marcás.
  const disponibles = agentes.filter(a => a.estado !== 'pausado')
  const [elegidos, setElegidos] = useState(() => new Set(preseleccion ? disponibles.filter(a => preseleccion.includes(a.id)).map(a => a.id)
    : disponibles.filter(a => a.equipo !== 'admin' && a.equipo !== 'sistemas').map(a => a.id)))
  const [modo, setModo] = useState(() => (preseleccion && preseleccion.length <= MAX_OFICINA ? 'oficina' : 'sala'))
  const vienen = disponibles.filter(a => elegidos.has(a.id))
  const tope = modo === 'turnos' ? ESPERA_TURNOS : modo === 'oficina' ? MAX_OFICINA : MAX_ASISTENTES
  const alternar = id => setElegidos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const alternarArea = (ids, todos) => setElegidos(s => { const n = new Set(s); for (const id of ids) { if (todos) n.delete(id); else n.add(id) } return n })
  useEffect(() => {
    const alTeclear = ev => { if (ev.key === 'Escape') cerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [cerrar])
  return <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && cerrar()}>
    <div className="modal reunion-convocar" role="dialog" aria-modal="true" aria-labelledby="reunion-titulo">
      <div className="modal-head">
        <h3 id="reunion-titulo">Convocar a una reunión</h3>
        <button type="button" className="close-x" onClick={cerrar} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <fieldset className="reunion-grupo">
          <legend>¿A quiénes llamás? Abrí cada área para elegir agente por agente.</legend>
          {AREAS.map(e => {
            const del = agentes.filter(a => a.equipo === e)
            if (!del.length) return null
            const activos = del.filter(a => a.estado !== 'pausado').map(a => a.id)
            const marcados = activos.filter(id => elegidos.has(id)).length
            const todos = activos.length > 0 && marcados === activos.length
            return <details key={e} className="reunion-area">
              <summary>
                <input type="checkbox" aria-label={`Todo ${EQUIPOS[e].nombre}`} checked={todos} disabled={!activos.length}
                  ref={el => { if (el) el.indeterminate = marcados > 0 && !todos }}
                  onClick={ev => ev.stopPropagation()} onChange={() => alternarArea(activos, todos)} />
                <strong>{EQUIPOS[e].nombre}</strong>
                <span className="tenue">{marcados} de {del.length}</span>
              </summary>
              <ul>{del.map(a => <li key={a.id}>
                <label className="reunion-opcion">
                  <input type="checkbox" checked={elegidos.has(a.id)} disabled={a.estado === 'pausado'} onChange={() => alternar(a.id)} />
                  <span>{nombreCorto(a.nombre)}{a.estado === 'pausado' && <span className="tenue"> · pausado, no puede venir</span>}</span>
                </label>
              </li>)}</ul>
            </details>
          })}
        </fieldset>
        <fieldset className="reunion-grupo">
          <legend>¿Dónde?</legend>
          <label className="reunion-opcion">
            <input type="radio" name="reunion-modo" checked={modo === 'sala'} onChange={() => setModo('sala')} />
            <span><strong>Sala de reuniones, todos juntos</strong><span className="tenue"> · los ves por pantalla, como en una videollamada, y conversás con todos</span></span>
          </label>
          <label className="reunion-opcion">
            <input type="radio" name="reunion-modo" checked={modo === 'oficina'} onChange={() => setModo('oficina')} />
            <span><strong>En mi oficina, todos juntos (hasta {MAX_OFICINA})</strong><span className="tenue"> · se sientan con vos en tu mesa de reuniones</span></span>
          </label>
          <label className="reunion-opcion">
            <input type="radio" name="reunion-modo" checked={modo === 'turnos'} onChange={() => setModo('turnos')} />
            <span><strong>En mi oficina, por turnos</strong><span className="tenue"> · esperan en el living y pasan de a uno</span></span>
          </label>
        </fieldset>
        <p className="tenue">Tienen {PLAZO_REUNION_S / 60} minutos para llegar. Cuando están todos, vienen con su información más actualizada.
          {vienen.length > tope ? ` Entran ${tope}: el resto queda para otra reunión.` : ''}</p>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={!vienen.length} onClick={() => alConvocar(vienen.slice(0, tope).map(a => a.id), modo)}>
          Convocar{vienen.length ? ` a ${Math.min(vienen.length, tope)}` : ''}
        </button>
      </div>
    </div>
  </div>
}

// ---------- Llegada ----------
export function AvisoLlegada({ reunion, agentes, llegadas, ahora, empezar, cancelar }) {
  const pasado = Math.max(0, (ahora - reunion.inicio) / 1000)
  const quedan = Math.max(0, Math.ceil(PLAZO_REUNION_S - pasado))
  const llegaron = reunion.asistentes.filter(id => llegadas && llegadas[id] != null && llegadas[id] <= pasado)
  const lugar = reunion.modo === 'turnos' ? 'el living de espera' : reunion.modo === 'oficina' ? 'tu oficina' : 'la sala de reuniones'
  return <div className="reunion-aviso" role="status" aria-live="polite">
    <p><strong>Reunión convocada</strong> · van a {lugar} · {Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, '0')} para llegar</p>
    <p className="tenue">Llegaron {llegaron.length} de {reunion.asistentes.length}</p>
    <ul>
      {reunion.asistentes.map(id => {
        const a = agentes.find(x => x.id === id)
        const ya = llegaron.includes(id)
        return <li key={id} className={ya ? 'llego' : ''}>{ya ? '✓' : '…'} {nombreCorto(a?.nombre ?? id)}</li>
      })}
    </ul>
    <div className="reunion-aviso-botones">
      <button type="button" className="btn btn-sm btn-primary" onClick={empezar}>Empezar ya</button>
      <button type="button" className="btn btn-sm" onClick={cancelar}>Cancelar</button>
    </div>
  </div>
}

// ---------- La reunión ----------
// Cola de lo que dicen: cada mensaje se muestra y el agente "habla" un rato (o lo que dure su voz, si está activada).
function useCharla(setHablando, voz, agentes) {
  const [mensajes, setMensajes] = useState([])
  const [cola, setCola] = useState([])
  const actual = useRef(null)
  const timer = useRef(0)
  // El temporizador vive en una ref: si llegan mensajes nuevos mientras alguien habla, no se corta su turno.
  useEffect(() => {
    if (actual.current || !cola.length) return
    const m = cola[0]
    actual.current = m
    setMensajes(l => [...l, m])
    setHablando(m.de === 'yo' ? null : m.de)
    let listo = false
    const fin = () => {
      if (listo) return
      listo = true
      actual.current = null
      setHablando(null)
      setCola(c => c.slice(1))
    }
    if (voz && m.de !== 'yo' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(m.texto)
      u.lang = 'es-AR'
      const v = variante(m.de)
      u.pitch = 0.8 + v.colorPelo * 0.12
      u.rate = 1.0 + v.piel * 0.05
      u.onend = fin
      u.onerror = fin
      window.speechSynthesis.speak(u)
      timer.current = setTimeout(fin, 40_000)
    } else timer.current = setTimeout(fin, m.de === 'yo' ? 50 : Math.min(9000, Math.max(2500, m.texto.length * 45)))
  }, [cola, voz, setHablando])
  useEffect(() => () => { clearTimeout(timer.current); if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])
  // Cuando habla Daniela, se calla el que estaba hablando y se descarta lo que seguía en fila: la conversación sigue
  // por lo que ella dijo, como en una reunión de verdad.
  const callar = useCallback(() => {
    clearTimeout(timer.current)
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    actual.current = null
    setHablando(null)
    setCola([])
  }, [setHablando])
  // urgente: lo que dice Daniela (y lo que le responden) pasa adelante de la ronda, como cuando alguien interrumpe:
  // queda después del que está hablando y de lo urgente que ya estaba en fila, antes del resto.
  const decir = useCallback((lista, urgente = false) => setCola(c => {
    const nuevos = lista.map(m => ({ ...m, urgente }))
    if (!urgente || !c.length) return [...c, ...nuevos]
    let k = 1
    while (k < c.length && c[k].urgente) k++
    return [...c.slice(0, k), ...nuevos, ...c.slice(k)]
  }), [])
  const ocupado = cola.length > 0
  return { mensajes, decir, callar, ocupado, nombre: id => (id === 'yo' ? 'Vos' : nombreCorto(agentes.find(a => a.id === id)?.nombre ?? id)) }
}

// Micrófono: dictado del navegador si lo tiene (en algunos equipos no está; entonces se escribe).
function useMicrofono(alTexto) {
  const [escuchando, setEscuchando] = useState(false)
  const reconocedor = useRef(null)
  const Clase = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const alternar = () => {
    if (!Clase) return
    if (escuchando) { reconocedor.current?.stop(); return }
    const r = new Clase()
    r.lang = 'es-AR'
    r.interimResults = false
    r.onresult = e => alTexto(Array.from(e.results).map(x => x[0].transcript).join(' '))
    r.onend = () => setEscuchando(false)
    r.onerror = () => setEscuchando(false)
    reconocedor.current = r
    setEscuchando(true)
    r.start()
  }
  return { disponible: Boolean(Clase), escuchando, alternar }
}

function Conversacion({ charla, enviar, esperando, placeholder, mic }) {
  const [texto, setTexto] = useState('')
  const fin = useRef(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }) }, [charla.mensajes.length, esperando])
  const mandar = t => { const q = t.trim(); if (!q || esperando) return; setTexto(''); enviar(q) }
  const microfono = useMicrofono(t => mandar(t))
  return <>
    <div className="reunion-mensajes" aria-live="polite">
      {charla.mensajes.map((m, i) => <p key={i} className={`reunion-mensaje${m.de === 'yo' ? ' de-yo' : ''}`}><strong>{charla.nombre(m.de)}:</strong> {m.texto}</p>)}
      {esperando && <p className="reunion-mensaje tenue">Pensando qué responder…</p>}
      <span ref={fin} />
    </div>
    <form className="reunion-escribir" onSubmit={e => { e.preventDefault(); mandar(texto) }}>
      {mic && microfono.disponible && <button type="button" className={`btn btn-sm${microfono.escuchando ? ' btn-primary' : ''}`} onClick={microfono.alternar}
        aria-pressed={microfono.escuchando} title="Hablar por micrófono">{microfono.escuchando ? '● Escuchando' : '🎤'}</button>}
      <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={placeholder} aria-label="Tu mensaje" disabled={esperando} />
      <button type="submit" className="btn btn-sm btn-primary" disabled={esperando || !texto.trim()}>Decir</button>
    </form>
  </>
}

function Tiempo({ desde, ahora }) {
  const s = Math.max(0, Math.floor((ahora - desde) / 1000))
  return <span>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
}

// Reunión en la sala: ronda de informes y después conversación abierta con todos.
export function VistaSala({ reunion, agentes, ahora, hablando, setHablando, hablarReunion, terminar }) {
  const [voz, setVoz] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const [error, setError] = useState('')
  const asistentes = reunion.asistentes.map(id => agentes.find(a => a.id === id)).filter(Boolean)
  const charla = useCharla(setHablando, voz, agentes)
  const saludo = useRef(false)
  // Nadie recita su tarea al empezar: saluda quien hace de anfitrión (María si vino) y se espera lo que plantee Daniela.
  useEffect(() => {
    if (saludo.current || !asistentes.length) return
    saludo.current = true
    const anfitrion = asistentes.find(a => a.id === 'trabajadores:maria') ?? asistentes.find(a => conversa(a)) ?? asistentes[0]
    charla.decir([{ de: anfitrion.id, texto: `Hola, Daniela. Ya estamos ${asistentes.length === 1 ? 'acá' : `los ${asistentes.length}`}. ¿De qué querés que hablemos?` }])
  })
  const enviar = async texto => {
    setError('')
    const historial = [...charla.mensajes, { de: 'yo', texto }]
    charla.callar()
    charla.decir([{ de: 'yo', texto }], true)
    setEsperando(true)
    try {
      const mensajes = historial.slice(-16).map(m => (m.de === 'yo' ? { role: 'user', content: m.texto } : { role: 'assistant', content: `${charla.nombre(m.de)}: ${m.texto}` }))
      const respuestas = await hablarReunion(reunion.asistentes, mensajes)
      charla.decir(respuestas.map(r => ({ de: r.agente, texto: r.texto })), true)
    } catch (e) { setError(e.message) }
    setEsperando(false)
  }
  const ultimo = charla.mensajes.at(-1)
  return <>
    <header className="reunion-barra">
      <strong>{reunion.modo === 'oficina' ? 'Reunión en tu oficina' : 'Reunión en la sala'}</strong>
      <span className="tenue">{asistentes.length} participantes · <Tiempo desde={reunion.empezo ?? reunion.inicio} ahora={ahora} /></span>
      <label className="reunion-voz"><input type="checkbox" checked={voz} onChange={e => setVoz(e.target.checked)} /> Escucharlos</label>
    </header>
    <aside className="reunion-gente" aria-label="Participantes">
      <p className="reunion-gente-titulo">Participantes</p>
      <ul>{asistentes.map(a => <li key={a.id} className={hablando === a.id ? 'habla' : ''}>
        <span className="reunion-punto" />{nombreCorto(a.nombre)} <span className="tenue">· {EQUIPOS[a.equipo].nombre}</span>
      </li>)}</ul>
    </aside>
    <section className="reunion-sub">
      {ultimo && <p className="reunion-subtitulo"><strong>{charla.nombre(ultimo.de)}:</strong> {ultimo.texto}</p>}
      <Conversacion charla={charla} enviar={enviar} esperando={esperando} mic
        placeholder="Planteales un tema, preguntá algo o nombrá a alguien (por ejemplo: «Ópera, ¿qué pasó?»)" />
      <button type="button" className="btn btn-sm reunion-novedades" disabled={esperando} onClick={() => enviar('Antes de seguir: ¿qué novedades hay? Cuéntenme solo lo importante y si necesitan algo de mí.')}>Pedir novedades</button>
      {error && <p role="alert" className="feedback-error">{error}</p>}
    </section>
    <footer className="reunion-controles">
      <span className="tenue">Conversan en contexto, con sus datos reales; desde la reunión nadie cambia nada.</span>
      <button type="button" className="btn reunion-salir" onClick={() => terminar(charla.mensajes.map(m => ({ de: charla.nombre(m.de), texto: m.texto })))}>Terminar reunión</button>
    </footer>
  </>
}

// Reunión en la oficina de Daniela por turnos: el que está adentro saluda y conversa con vos; después pasa el siguiente.
export function VistaTurnos({ reunion, agentes, ahora, hablando, setHablando, hablar, siguiente, terminar }) {
  const [voz, setVoz] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const [error, setError] = useState('')
  const asistentes = reunion.asistentes.map(id => agentes.find(a => a.id === id)).filter(Boolean)
  const actualId = reunion.asistentes.find(id => reunion.turnos?.[id]?.llamado && !reunion.turnos[id].fin)
  const actual = agentes.find(a => a.id === actualId)
  const charla = useCharla(setHablando, voz, agentes)
  const informados = useRef(new Set())
  const charlaDe = useRef({})
  // Al entrar (unos segundos después de que lo llamás, lo que tarda en llegar a la silla) saluda y espera tu tema.
  const ultimoActual = useRef({ actual })
  useEffect(() => { ultimoActual.current = { actual } })
  const decir = charla.decir
  useEffect(() => {
    if (!actualId || informados.current.has(actualId)) return
    const llamado = reunion.turnos[actualId].llamado
    const timer = setTimeout(() => {
      const { actual: a } = ultimoActual.current
      if (!a || a.id !== actualId) return
      informados.current.add(actualId)
      decir([{ de: actualId, texto: a.estado === 'error' ? 'Hola, Daniela. Acá estoy. Tengo algo que está fallando; si querés lo vemos, o contame qué necesitás.' : 'Hola, Daniela. Acá estoy, ¿qué necesitás?' }])
    }, Math.max(0, 6000 - (Date.now() - llamado)))
    return () => clearTimeout(timer)
  }, [actualId, reunion.turnos, decir])
  const enviar = async texto => {
    if (!actual) return
    setError('')
    const previo = charlaDe.current[actual.id] ?? []
    const historial = [...previo, { role: 'user', content: texto }]
    charla.decir([{ de: 'yo', texto }], true)
    setEsperando(true)
    try {
      const respuesta = await hablar(actual.id, historial)
      charlaDe.current[actual.id] = [...historial, { role: 'assistant', content: respuesta }]
      charla.decir([{ de: actual.id, texto: respuesta }], true)
    } catch (e) { setError(e.message) }
    setEsperando(false)
  }
  const estadoTurno = id => {
    const tu = reunion.turnos?.[id]
    if (tu?.fin) return 'atendido'
    if (tu?.llamado) return 'en tu oficina'
    return 'esperando'
  }
  const quedan = reunion.asistentes.filter(id => !reunion.turnos?.[id]?.llamado).length
  const ultimo = charla.mensajes.at(-1)
  return <>
    <header className="reunion-barra">
      <strong>Turnos en tu oficina</strong>
      <span className="tenue">{actual ? `Con ${nombreCorto(actual.nombre)}` : 'Nadie adentro'} · {quedan} esperando · <Tiempo desde={reunion.empezo ?? reunion.inicio} ahora={ahora} /></span>
      <label className="reunion-voz"><input type="checkbox" checked={voz} onChange={e => setVoz(e.target.checked)} /> Escucharlos</label>
    </header>
    <aside className="reunion-gente" aria-label="Turnos">
      <p className="reunion-gente-titulo">Turnos</p>
      <ol>{asistentes.map(a => <li key={a.id} className={`${hablando === a.id ? 'habla' : ''} turno-${estadoTurno(a.id).replace(/ /g, '-')}`}>
        <span className="reunion-punto" />{nombreCorto(a.nombre)} <span className="tenue">· {estadoTurno(a.id)}</span>
      </li>)}</ol>
    </aside>
    <section className="reunion-sub">
      {ultimo && <p className="reunion-subtitulo"><strong>{charla.nombre(ultimo.de)}:</strong> {ultimo.texto}</p>}
      {actual
        ? <Conversacion charla={charla} enviar={enviar} esperando={esperando} mic placeholder={`Hablale a ${nombreCorto(actual.nombre)}…`} />
        : <p className="tenue">{quedan ? 'Llamá al siguiente cuando quieras.' : 'Ya pasaron todos.'}</p>}
      {error && <p role="alert" className="feedback-error">{error}</p>}
    </section>
    <footer className="reunion-controles">
      <button type="button" className="btn btn-primary" disabled={!quedan} onClick={siguiente}>{actual ? 'Gracias, que pase el siguiente' : 'Que pase el siguiente'}</button>
      <button type="button" className="btn reunion-salir" onClick={() => terminar(charla.mensajes.map(m => ({ de: charla.nombre(m.de), texto: m.texto })))}>Terminar reunión</button>
    </footer>
  </>
}
