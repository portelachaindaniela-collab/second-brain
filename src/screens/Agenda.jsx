import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import EditorEvento from './EditorEvento.jsx'
import { fechaEvento } from '../eventoFecha.js'
import { unirRepetidos } from '../eventosUnicos.mjs'
import { importarEventosComunidad, textoImportacion } from '../comunidadImportar.js'
import { inicioSemana, moverSemana, tituloSemana, diasDeSemana } from '../semana.mjs'
import { calendarioDe, leyendaCalendarios, prepararCalendarios } from '../calendarioMes.mjs'
import { Bloques, Bloque } from '../estructura.jsx'

const DIA_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

const hora24 = iso => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function horaEnSemana({ evento, continua }) {
  if (evento.all_day) return 'Todo el día'
  if (continua) return 'sigue'
  const fin = evento.ends_at && evento.ends_at !== evento.starts_at && new Date(evento.ends_at).toDateString() === new Date(evento.starts_at).toDateString() ? '–' + hora24(evento.ends_at) : ''
  return hora24(evento.starts_at) + fin
}

// Clase y color del calendario de un evento: el color real de Google va en --tipo; sin él queda el de la clase.
function pintar(calendario, clase) {
  return { className: `${clase} tipo-${calendario.tipo}`, style: calendario.color ? { '--tipo': calendario.color } : undefined }
}

const mismoMes = (a, b) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()

// La vista mensual va primero: se ve todo el mes de una, con hora y nombre de cada evento en su día.
// La semanal queda para ver el espacio libre. Debajo del calendario: el detalle del día elegido y, si la
// pantalla lo pasa en `debajo`, otro bloque al lado (la bandeja en Mail y Calendario).
// enBloque: va dentro de Mail y Calendario, sin cabecera propia (la importación de Comunidad vive en su pie).
export default function Agenda({ proyectos, revision, enBloque = false, debajo }) {
  const [vista, setVista] = useState('mes')
  const [semana, setSemana] = useState(() => inicioSemana())
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [eventos, setEventos] = useState([])
  const [seleccion, setSeleccion] = useState(() => new Date().getDate())
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)
  const [version, setVersion] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [importando, setImportando] = useState(false)
  const [resultadoImport, setResultadoImport] = useState(null)
  const [calendarios, setCalendarios] = useState(() => new Map())
  useEffect(() => {
    let vivo = true
    // Nombre y color de cada calendario de Google. Si falla o está vacía, se pinta por grupos como antes.
    supabase.from('calendarios').select('calendar_id,nombre,color').then(({ data }) => {
      if (vivo && data) setCalendarios(prepararCalendarios(data))
    }).catch(() => {})
    return () => { vivo = false }
  }, [revision])
  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    const columnas = 'id,title,description,starts_at,ends_at,location,project_id,all_day,google_event_id,calendar_id'
    // Semana: se trae desde dos semanas antes para no perder eventos de varios días que empezaron antes del lunes.
    const [desde, hasta] = vista === 'semana'
      ? [moverSemana(semana, -2), new Date(moverSemana(semana, 1).getTime() + 86400000)]
      : [new Date(Date.UTC(mes.getFullYear(), mes.getMonth(), 1)-86400000), new Date(Date.UTC(mes.getFullYear(), mes.getMonth()+1, 2))]
    supabase.from('calendar_events').select(columnas).gte('starts_at', desde.toISOString()).lt('starts_at', hasta.toISOString()).order('starts_at').then(({ data, error }) => { if (!vivo) return; if (error) setError('No se pudo cargar el calendario: ' + error.message); else { const unicos = unirRepetidos(data || []); setEventos(vista === 'semana' ? unicos : unicos.filter(e => mismoMes(fechaEvento(e), mes))) } setCargando(false) }).catch(() => { if (vivo) { setError('No se pudo conectar. Probá nuevamente.'); setCargando(false) } })
    return () => { vivo = false }
  }, [vista, semana, mes, revision, version])
  async function importarComunidad() {
    if (importando) return
    setImportando(true); setResultadoImport(null)
    try {
      const resultado = await importarEventosComunidad()
      setResultadoImport(resultado)
      if (resultado.creados) setVersion(v => v + 1)
    } catch (error) { setResultadoImport({ error: error.message || 'No se pudo importar los eventos de Comunidad.' }) }
    finally { setImportando(false) }
  }
  const hoy = new Date()
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const inicio = (mes.getDay() + 6) % 7
  function mover(n) {
    if (vista === 'semana') setSemana(moverSemana(semana, n))
    else { const nuevo = new Date(mes.getFullYear(), mes.getMonth() + n, 1); setMes(nuevo); setSeleccion(mismoMes(nuevo, hoy) ? hoy.getDate() : null) }
  }
  function irAHoy() {
    setSemana(inicioSemana(hoy)); setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); setSeleccion(hoy.getDate())
  }
  function cambiarVista(v) {
    if (v === vista) return
    if (v === 'mes') { const nuevo = new Date(semana.getFullYear(), semana.getMonth(), 1); setMes(nuevo); setSeleccion(mismoMes(nuevo, hoy) ? hoy.getDate() : null) }
    else setSemana(inicioSemana(mismoMes(mes, hoy) ? hoy : mes))
    setEventos([]); setVista(v)
  }
  const diasSemana = vista === 'semana' ? diasDeSemana(semana, eventos) : []
  const enLaSemana = new Set(diasSemana.flatMap(d => d.items.map(i => i.evento.id))).size
  const libres = diasSemana.filter(d => !d.items.length).length
  const hoyTexto = hoy.toDateString()
  const esMesActual = mismoMes(mes, hoy)
  const mesPasado = mes < new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const visibles = seleccion ? eventos.filter(e => fechaEvento(e).getDate() === seleccion) : eventos
  const fechaSeleccion = seleccion && new Date(mes.getFullYear(), mes.getMonth(), seleccion)
  const tituloDetalle = !seleccion ? 'Todo el mes'
    : `${fechaSeleccion.toDateString() === hoyTexto ? 'Hoy, ' : ''}${fechaSeleccion.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}`

  const barra = <div className="calendar-toolbar">
    <button className="btn btn-sm" onClick={() => mover(-1)} aria-label={vista === 'semana' ? 'Semana anterior' : 'Mes anterior'}>←</button>
    <strong className="calendar-periodo">{vista === 'semana' ? tituloSemana(semana) : mes.toLocaleDateString('es-AR', { month:'long' }).replace(/^./, l => l.toUpperCase()) + ' ' + mes.getFullYear()}</strong>
    <button className="btn btn-sm" onClick={() => mover(1)} aria-label={vista === 'semana' ? 'Semana siguiente' : 'Mes siguiente'}>→</button>
    <button className="btn btn-sm" onClick={irAHoy}>Hoy</button>
    {vista === 'semana' && !cargando && <span className="semana-resumen">{enLaSemana} {enLaSemana === 1 ? 'evento' : 'eventos'} · {libres} {libres === 1 ? 'día libre' : 'días libres'}</span>}
    <div className="vista-toggle" style={{ marginLeft: 'auto' }}>
      <button className={vista === 'mes' ? 'active' : ''} aria-pressed={vista === 'mes'} onClick={() => cambiarVista('mes')}>Mes</button>
      <button className={vista === 'semana' ? 'active' : ''} aria-pressed={vista === 'semana'} onClick={() => cambiarVista('semana')}>Semana</button>
    </div>
    {enBloque && <button className="btn btn-sm btn-primary" onClick={() => setEditando({})}>+ Nuevo evento</button>}
  </div>

  const vistaSemana = <div className="semana">
    {diasSemana.map(d => <div key={d.clave} className={`semana-dia${d.items.length ? '' : ' libre'}${d.fecha.toDateString() === hoyTexto ? ' hoy' : ''}`}>
      <div className="semana-fecha"><span>{DIA_CORTO[d.fecha.getDay()]}</span><strong>{d.fecha.getDate()}</strong></div>
      <div className="semana-eventos">
        {cargando ? null : d.items.length ? d.items.map(item => <button key={item.evento.id} {...pintar(calendarioDe(item.evento, calendarios), 'semana-evento')} title={calendarioDe(item.evento, calendarios).nombre} onClick={() => setEditando(item.evento)}>
          <span className="semana-hora">{horaEnSemana(item)}</span>
          <span className="semana-titulo">{item.evento.title || '(sin título)'}{item.evento.location && <small>{item.evento.location}</small>}</span>
        </button>) : <span className="semana-libre">Libre</span>}
      </div>
    </div>)}
  </div>

  const vistaMes = <>
    <div className="calendar-grid">
      {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => <span className="calendar-weekday" key={d}>{d}</span>)}
      {Array.from({ length:inicio }, (_, i) => <span key={'empty' + i} />)}
      {Array.from({ length:dias }, (_, i) => {
        const dia = i + 1
        const items = eventos.filter(e => fechaEvento(e).getDate() === dia)
        const esHoy = esMesActual && dia === hoy.getDate()
        const pasado = mesPasado || (esMesActual && dia < hoy.getDate())
        const finde = [0, 6].includes(new Date(mes.getFullYear(), mes.getMonth(), dia).getDay())
        return <button key={dia} className={`calendar-day${seleccion === dia ? ' selected' : ''}${esHoy ? ' hoy' : ''}${pasado ? ' pasado' : ''}${finde ? ' finde' : ''}`}
          onClick={() => setSeleccion(dia)} aria-label={`${dia}${esHoy ? ', hoy' : ''}, ${items.length} eventos`} aria-pressed={seleccion === dia}>
          <span className="calendar-numero">{dia}{esHoy && <em> · hoy</em>}</span>
          {items.slice(0, 3).map(e => <small key={e.id} {...pintar(calendarioDe(e, calendarios), 'calendar-titulo')}>{!e.all_day && <b>{hora24(e.starts_at)}</b>}{e.title || '(sin título)'}</small>)}
          {items.length > 3 && <small className="calendar-mas">+{items.length - 3} más</small>}
        </button>
      })}
    </div>
    <div className="calendar-leyenda">{leyendaCalendarios(calendarios, eventos).map(c => <span key={c.clave} {...pintar(c, '')}>{c.nombre}</span>)}</div>
  </>

  const detalle = <Bloque titulo={<span className="calendar-detalle-titulo">{tituloDetalle}</span>} accion={seleccion && <button className="btn btn-sm" onClick={() => setSeleccion(null)}>Ver todo el mes</button>}>
    <div className="bloque-scroll">{cargando ? <p className="empty-state">Cargando…</p> : !visibles.length ? <p className="empty-state">{seleccion ? 'Día libre.' : 'Sin eventos en este mes.'}</p>
      : visibles.map(e => <button key={e.id} {...pintar(calendarioDe(e, calendarios), 'calendar-detalle-evento')} onClick={() => setEditando(e)}>
        <span className="semana-hora">{e.all_day ? 'Todo el día' : hora24(e.starts_at) + (e.ends_at && e.ends_at !== e.starts_at ? '–' + hora24(e.ends_at) : '')}{!seleccion && <small>{fechaEvento(e).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }).replace('.', '')}</small>}</span>
        <span className="calendar-detalle-texto">{e.title || '(sin título)'}
          <small>{[calendarioDe(e, calendarios).nombre, e.location, proyectos.find(p => p.id === e.project_id)?.name].filter(Boolean).join(' · ')}</small></span>
      </button>)}</div>
  </Bloque>

  return <div>
    {!enBloque && <div className="page-head"><h1>Calendario</h1><div style={{ display:'flex', gap:8 }}><button className="btn btn-primary" onClick={() => setEditando({})}>+ Nuevo evento</button><button className="btn" disabled={importando} onClick={importarComunidad}>{importando ? 'Importando…' : 'Importar de Comunidad'}</button></div></div>}
    {resultadoImport && <p role={resultadoImport.error ? 'alert' : undefined} className={resultadoImport.error ? 'feedback-error' : 'feedback-ok'}>{textoImportacion(resultadoImport)}</p>}
    <Bloques>
      <Bloque titulo="Calendario" ancho="completo">
        {barra}
        {error && <p role="alert" className="feedback-error">{error}</p>}
        {vista === 'semana' ? vistaSemana : vistaMes}
      </Bloque>
      {vista === 'mes' && detalle}
      {debajo?.(vista === 'mes' ? undefined : 'completo')}
    </Bloques>
    {editando && <EditorEvento evento={editando} cerrar={() => setEditando(null)}
      guardado={e => { const fecha = fechaEvento(e); setSemana(inicioSemana(fecha)); setMes(new Date(fecha.getFullYear(), fecha.getMonth(), 1)); setSeleccion(fecha.getDate()); setVersion(v => v + 1) }}
      eliminado={id => { setEventos(prev => prev.filter(item => item.id !== id)); setVersion(v => v + 1) }} />}
  </div>
}
