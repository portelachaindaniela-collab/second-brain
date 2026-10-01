import { useCallback, useEffect, useState } from 'react'
import { supabase, hora, fechaCorta } from '../supabase.js'
import ResumenDiario from './ResumenDiario.jsx'
import { unirRepetidos, diasDelEvento } from '../eventosUnicos.mjs'
import { CabeceraPantalla, Bloques, Bloque, Pie } from '../estructura.jsx'
import { mailsImportantes, resumenDiarioLinea } from '../hoyCifras.mjs'
import { AGENTES_MARIA, avisosDeMaria, tareasEstancadasIds, haceCuantoConsolidado } from '../avisos.mjs'

function inicioDia() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function finDia() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

const PUSH_SOPORTADO = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// Lo que consolida María (sitios, tareas quietas, Google), en texto claro. Lo que está bien va en una sola línea.
function Avisos({ avisos, enOrden, cargando }) {
  return <>
    {!cargando && avisos.length === 0 && enOrden.length === 0 && <p className="empty-state">María todavía no consolidó nada.</p>}
    {avisos.length > 0 && <ul className="avisos-lista">
      {avisos.map(a => <li key={a.texto} className={`aviso-${a.nivel}`}>
        <span className="aviso-punto" aria-hidden="true" />
        <div>
          <p className="aviso-texto">{a.texto}</p>
          {a.detalles.map(d => <p key={d} className="aviso-detalle">{d}</p>)}
        </div>
      </li>)}
    </ul>}
    {enOrden.length > 0 && <p className="avisos-en-orden">En orden: {enOrden.join(' · ')}</p>}
  </>
}

export default function Hoy({ proyectos, revision, ownerId, abrirProyecto, abrirMail, abrirBandeja, abrirCalendario }) {
  const [eventos, setEventos] = useState([])
  const [tareas, setTareas] = useState([])
  const [tareasTotal, setTareasTotal] = useState(0)
  const [mails, setMails] = useState([])
  const [reportes, setReportes] = useState([])
  const [proyectoDeTarea, setProyectoDeTarea] = useState({})
  const [ahora, setAhora] = useState(() => Date.now())
  const [reglas, setReglas] = useState([])
  const [suscripcion, setSuscripcion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    async function cargar() {
      setCargando(true)
      const [ev, ta, ma, ag] = await Promise.all([
        supabase.from('calendar_events').select('id,title,starts_at,ends_at,project_id,all_day')
          .gte('starts_at', new Date(inicioDia().getTime() - 86400000).toISOString()).lte('starts_at', finDia().toISOString())
          .order('starts_at', { ascending: true }),
        supabase.from('tasks').select('id,title,project_id,status', { count: 'exact' }).eq('done', false).order('touched_at', { ascending: true }).limit(20),
        supabase.from('emails').select('id,gmail_id,subject,from_name,from_addr,received_at,is_unread').eq('is_unread', true).order('received_at', { ascending: false }).limit(200),
        supabase.from('process_reports').select('id,agente,estado,resumen,detalle,iniciado_at').in('agente', AGENTES_MARIA).order('iniciado_at', { ascending: false }).limit(15),
      ])
      if (!vivo) return
      const fallos = [ev, ta, ma, ag].filter(r => r.error)
      if (fallos.length) setError('No se pudo cargar parte del resumen. Entrá a Mail o Calendario para reintentar.')
      const hoy = inicioDia().toLocaleDateString('sv-SE')
      setEventos(unirRepetidos(ev.data || []).filter(e => { const [desde, hasta] = diasDelEvento(e); return desde <= hoy && hoy <= hasta }))
      setTareas(ta.data || [])
      setTareasTotal(ta.count ?? (ta.data || []).length)
      setMails(ma.data || [])
      setReportes(ag.data || [])
      // María guarda las tareas quietas sin proyecto: se busca de qué proyecto es cada una.
      const ids = tareasEstancadasIds(ag.data)
      const { data: deProyecto } = ids.length ? await supabase.from('tasks').select('id,project_id').in('id', ids) : { data: [] }
      if (!vivo) return
      setProyectoDeTarea(Object.fromEntries((deProyecto || []).map(t => [t.id, t.project_id])))
      setAhora(Date.now())
      setCargando(false)
    }
    cargar()
    return () => { vivo = false }
  }, [revision])

  // Lo que muestra la línea del pie (y las reglas que definen qué mail es importante).
  const cargarConfiguracion = useCallback(async () => {
    const [re, su] = await Promise.all([
      supabase.from('mail_reglas').select('tipo,patron').eq('owner_id', ownerId),
      PUSH_SOPORTADO
        ? supabase.from('push_subscriptions').select('id,hora_local').eq('owner_id', ownerId).eq('activo', true).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setReglas(re.data || [])
    setSuscripcion(su.data || null)
  }, [ownerId])
  useEffect(() => { cargarConfiguracion() }, [cargarConfiguracion])

  // Para que "consolidado hace X min" no quede viejo con la pantalla abierta.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(reloj)
  }, [])

  function colorDe(projectId) {
    return proyectos.find(p => p.id === projectId)?.color || '#71717a'
  }
  function nombreDe(projectId) {
    return proyectos.find(p => p.id === projectId)?.name || 'Sin proyecto'
  }

  const hoyTexto = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const importantes = mailsImportantes(mails, reglas)
  const { avisos, enOrden, consolidado_at } = avisosDeMaria(reportes, { proyectoDeTarea, proyectos, ahora })
  const cifras = [
    { valor: eventos.length, etiqueta: 'eventos hoy' },
    { valor: tareasTotal, etiqueta: 'tareas pendientes' },
    { valor: importantes.length, etiqueta: 'mails importantes', nivel: importantes.length ? 'aviso' : undefined },
    { valor: avisos.length, etiqueta: 'avisos', nivel: avisos.some(a => a.nivel === 'error') ? 'error' : avisos.length ? 'aviso' : undefined },
  ]

  return (
    <div>
      <CabeceraPantalla sobretitulo="Resumen del día" titulo={hoyTexto[0].toUpperCase() + hoyTexto.slice(1)} cifras={cifras} cargando={cargando} />

      {error && <p className="feedback-error" role="alert">{error}</p>}
      <Bloques>
        <Bloque titulo="Avisos" ancho="completo" accion={consolidado_at && <span className="bloque-nota">{haceCuantoConsolidado(consolidado_at, ahora)}</span>}>
          <Avisos avisos={avisos} enOrden={enOrden} cargando={cargando} />
        </Bloque>

        <Bloque titulo="Calendario · hoy" accion={<button className="btn btn-sm" onClick={abrirCalendario}>Ver calendario</button>}>
          {!cargando && eventos.length === 0 && <p className="empty-state">Sin eventos para hoy.</p>}
          {eventos.slice(0, 3).map(e => (
            <button className="task-item mail-row" key={e.id} onClick={abrirCalendario}>
              <span className="task-dot" style={{ background: colorDe(e.project_id) }} />
              <div className="task-main">
                <div className="task-title">{e.title}</div>
                <div className="task-sub">{hora(e.starts_at)}{e.ends_at ? ` – ${hora(e.ends_at)}` : ''} · {nombreDe(e.project_id)}</div>
              </div>
            </button>
          ))}
        </Bloque>

        <Bloque titulo="Mail · sin leer" accion={<button className="btn btn-sm" onClick={abrirBandeja}>Ver todos los mails</button>}>
          {!cargando && mails.length === 0 && <p className="empty-state">Todo leído.</p>}
          {mails.slice(0, 4).map(m => (
            <button className="list-item mail-row" key={m.id} disabled={!m.gmail_id} onClick={() => abrirMail(m.gmail_id)}>
              <span className="list-main">{m.from_name || '(desconocido)'} — {m.subject || '(sin asunto)'}</span>
              <span className="list-side">{fechaCorta(m.received_at)}</span>
            </button>
          ))}
        </Bloque>

        <Bloque titulo="Tareas pendientes" ancho="completo">
          {!cargando && tareas.length === 0 && <p className="empty-state">No hay tareas abiertas.</p>}
          {tareas.slice(0, 8).map(t => (
            <div className="task-item clickable" key={t.id} onClick={() => t.project_id && abrirProyecto(t.project_id)} style={{ cursor: t.project_id ? 'pointer' : 'default' }}>
              <span className="task-dot" style={{ background: colorDe(t.project_id) }} />
              <div className="task-main">
                <div className="task-title">{t.title}</div>
                <div className="task-sub">{nombreDe(t.project_id)}</div>
              </div>
            </div>
          ))}
        </Bloque>

      </Bloques>

      <Pie titulo="Resumen diario" resumen={resumenDiarioLinea({ soportado: PUSH_SOPORTADO, suscripcion, reglas })}>
        <ResumenDiario ownerId={ownerId} alCambiar={cargarConfiguracion} />
      </Pie>
    </div>
  )
}
