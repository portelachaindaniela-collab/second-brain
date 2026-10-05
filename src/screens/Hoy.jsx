import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import ResumenDiario from './ResumenDiario.jsx'
import { unirRepetidos, diasDelEvento } from '../eventosUnicos.mjs'
import { CabeceraPantalla, Bloques, Bloque, Pie } from '../estructura.jsx'
import { mailsImportantes, resumenDiarioLinea } from '../hoyCifras.mjs'
import { AGENTES_MARIA, avisosDeMaria, tareasEstancadasIds, haceCuantoConsolidado } from '../avisos.mjs'
import { inicioDelDia, porDia, sitiosRevisados, contarTemas, corridasPorHora } from '../hoyGraficos.mjs'
import { Linea } from './Panorama.jsx'
import { TuDia, ProximosDias, Sitios, MailSinLeer, Tareas, NichoHoy, TrabajadoresHoy, ProximosEventos } from './HoyGraficos.jsx'
import './Panorama.css'

const DIA_MS = 86_400_000

function inicioDia() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function finDia(masDias = 0) {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return new Date(d.getTime() + masDias * DIA_MS)
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
  const [semana, setSemana] = useState([])
  const [noticias, setNoticias] = useState([])
  const [corridas, setCorridas] = useState([])
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
      const hace24 = new Date(Date.now() - DIA_MS).toISOString()
      const [ev, ta, ma, ag, no, co] = await Promise.all([
        supabase.from('calendar_events').select('id,title,starts_at,ends_at,project_id,all_day')
          .gte('starts_at', new Date(inicioDia().getTime() - 86400000).toISOString()).lte('starts_at', finDia(6).toISOString())
          .order('starts_at', { ascending: true }),
        supabase.from('tasks').select('id,title,project_id,status', { count: 'exact' }).eq('done', false).order('touched_at', { ascending: true }).limit(300),
        supabase.from('emails').select('id,gmail_id,subject,from_name,from_addr,received_at,is_unread').eq('is_unread', true).order('received_at', { ascending: false }).limit(200),
        supabase.from('process_reports').select('id,agente,estado,resumen,detalle,iniciado_at').in('agente', AGENTES_MARIA).order('iniciado_at', { ascending: false }).limit(15),
        supabase.from('noticias').select('temas').gte('created_at', hace24).limit(1000),
        supabase.from('trabajos_corridas').select('trabajador,estado,iniciado_at').gte('iniciado_at', hace24).limit(2000),
      ])
      if (!vivo) return
      const fallos = [ev, ta, ma, ag].filter(r => r.error)
      if (fallos.length) setError('No se pudo cargar parte del resumen. Entrá a Mail o Calendario para reintentar.')
      const hoy = inicioDia().toLocaleDateString('sv-SE')
      const unidos = unirRepetidos(ev.data || [])
      setEventos(unidos.filter(e => { const [desde, hasta] = diasDelEvento(e); return desde <= hoy && hoy <= hasta }))
      setSemana(unidos.filter(e => diasDelEvento(e)[0] > hoy))
      setNoticias(no.data || [])
      setCorridas(co.data || [])
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

  const hoyTexto = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const importantes = mailsImportantes(mails, reglas)
  const { avisos, enOrden, consolidado_at } = avisosDeMaria(reportes, { proyectoDeTarea, proyectos, ahora })
  const hoyMs = inicioDelDia(ahora)
  const diasQueVienen = porDia([...eventos, ...semana], e => e.starts_at, hoyMs, 7)
  diasQueVienen[0].n = eventos.length
  const mailsPorDia = porDia(mails, m => m.received_at, hoyMs - 6 * DIA_MS, 7)
  const quietas = tareasEstancadasIds(reportes).length
  const horas = corridasPorHora(corridas, ahora)
  const cifras = [
    { valor: eventos.length, etiqueta: 'eventos hoy', grafico: <Linea valores={diasQueVienen.map(d => d.n)} color="var(--accent)" ancho={96} alto={18} relleno /> },
    { valor: tareasTotal, etiqueta: 'tareas pendientes', nivel: quietas ? 'aviso' : undefined },
    { valor: mails.length, etiqueta: 'mails sin leer', nivel: importantes.length ? 'aviso' : undefined, grafico: <Linea valores={mailsPorDia.map(d => d.n)} color="var(--id-azul)" ancho={96} alto={18} relleno /> },
    { valor: avisos.length, etiqueta: 'avisos', nivel: avisos.some(a => a.nivel === 'error') ? 'error' : avisos.length ? 'aviso' : undefined },
  ]

  return (
    <div>
      <CabeceraPantalla sobretitulo="Resumen del día" titulo={hoyTexto[0].toUpperCase() + hoyTexto.slice(1)} cifras={cifras} cargando={cargando} />

      {error && <p className="feedback-error" role="alert">{error}</p>}
      {(avisos.length > 0 || (!cargando && enOrden.length === 0)) && <Bloques>
        <Bloque titulo="Avisos" ancho="completo" accion={consolidado_at && <span className="bloque-nota">{haceCuantoConsolidado(consolidado_at, ahora)}</span>}>
          <Avisos avisos={avisos} enOrden={enOrden} cargando={cargando} />
        </Bloque>
      </Bloques>}

      <Bloques disposicion="principal">
        <Bloque titulo="Tu día" accion={<button className="btn btn-sm" onClick={abrirCalendario}>Ver calendario</button>}>
          <TuDia eventos={eventos} ahora={ahora} colorDe={colorDe} abrir={abrirCalendario} />
        </Bloque>
        <Bloque titulo="Próximos 7 días" accion={<span className="bloque-nota">eventos por día</span>}>
          <ProximosDias dias={diasQueVienen} />
        </Bloque>
      </Bloques>

      <Bloques disposicion="tres">
        <Bloque titulo="Sitios" accion={consolidado_at && <span className="bloque-nota">{haceCuantoConsolidado(consolidado_at, ahora)}</span>}>
          <Sitios sitios={sitiosRevisados(reportes)} enOrden={avisos.length ? [] : enOrden.filter(e => !/sitio/i.test(e))} />
        </Bloque>
        <Bloque titulo="Mail sin leer" accion={<button className="btn btn-sm" onClick={abrirBandeja}>Ver todos</button>}>
          <MailSinLeer mails={mails} dias={mailsPorDia} importantes={importantes} abrirMail={abrirMail} />
        </Bloque>
        <Bloque titulo="Tareas">
          <Tareas tareas={tareas} total={tareasTotal} proyectos={proyectos} abrirProyecto={abrirProyecto} quietas={quietas} />
        </Bloque>
        <Bloque titulo="Mi nicho · 24 h" accion={<span className="bloque-nota">{noticias.length.toLocaleString('es-AR')} notas</span>}>
          <NichoHoy temas={contarTemas(noticias)} />
        </Bloque>
        <Bloque titulo="Trabajadores · 24 h">
          <TrabajadoresHoy horas={horas} />
        </Bloque>
        <Bloque titulo="Próximos eventos" accion={<button className="btn btn-sm" onClick={abrirCalendario}>Calendario</button>}>
          <ProximosEventos eventos={semana} colorDe={colorDe} abrir={abrirCalendario} />
        </Bloque>
      </Bloques>

      <Pie titulo="Resumen diario" resumen={resumenDiarioLinea({ soportado: PUSH_SOPORTADO, suscripcion, reglas })}>
        <ResumenDiario ownerId={ownerId} alCambiar={cargarConfiguracion} />
      </Pie>
    </div>
  )
}
