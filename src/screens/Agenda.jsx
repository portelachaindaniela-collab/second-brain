import { useEffect, useState } from 'react'
import { supabase, fechaHora } from '../supabase.js'
import EditorEvento from './EditorEvento.jsx'
import { fechaEvento } from '../eventoFecha.js'
import { unirRepetidos } from '../eventosUnicos.mjs'
import { importarEventosComunidad, textoImportacion } from '../comunidadImportar.js'
import { inicioSemana, moverSemana, tituloSemana, diasDeSemana } from '../semana.mjs'

const DIA_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

const hora24 = iso => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function horaEnSemana({ evento, continua }) {
  if (evento.all_day) return 'Todo el día'
  if (continua) return 'sigue'
  const fin = evento.ends_at && evento.ends_at !== evento.starts_at && new Date(evento.ends_at).toDateString() === new Date(evento.starts_at).toDateString() ? '–' + hora24(evento.ends_at) : ''
  return hora24(evento.starts_at) + fin
}

// enBloque: va dentro de un Bloque de Mail y Calendario, sin cabecera propia (la importación de Comunidad
// vive en el pie de esa pantalla).
// La vista semanal es la de trabajo (se ve cuánto espacio libre hay); la mensual queda para ubicarse.
export default function Agenda({ proyectos, revision, enBloque = false }) {
  const [vista, setVista] = useState('semana')
  const [semana, setSemana] = useState(() => inicioSemana())
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [eventos, setEventos] = useState([])
  const [seleccion, setSeleccion] = useState(null)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)
  const [version, setVersion] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [importando, setImportando] = useState(false)
  const [resultadoImport, setResultadoImport] = useState(null)
  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    const columnas = 'id,title,description,starts_at,ends_at,location,project_id,all_day,google_event_id,calendar_id'
    // Semana: se trae desde dos semanas antes para no perder eventos de varios días que empezaron antes del lunes.
    const [desde, hasta] = vista === 'semana'
      ? [moverSemana(semana, -2), new Date(moverSemana(semana, 1).getTime() + 86400000)]
      : [new Date(Date.UTC(mes.getFullYear(), mes.getMonth(), 1)-86400000), new Date(Date.UTC(mes.getFullYear(), mes.getMonth()+1, 2))]
    supabase.from('calendar_events').select(columnas).gte('starts_at', desde.toISOString()).lt('starts_at', hasta.toISOString()).order('starts_at').then(({ data, error }) => { if (!vivo) return; if (error) setError('No se pudo cargar el calendario: ' + error.message); else { const unicos = unirRepetidos(data || []); setEventos(vista === 'semana' ? unicos : unicos.filter(e => fechaEvento(e).getMonth() === mes.getMonth() && fechaEvento(e).getFullYear() === mes.getFullYear())) } setCargando(false) }).catch(() => { if (vivo) { setError('No se pudo conectar. Probá nuevamente.'); setCargando(false) } })
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
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const inicio = (mes.getDay() + 6) % 7
  function mover(n) {
    if (vista === 'semana') setSemana(moverSemana(semana, n))
    else { setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1)); setSeleccion(null) }
  }
  function irAHoy() {
    const hoy = new Date()
    setSemana(inicioSemana(hoy)); setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); setSeleccion(hoy.getDate())
  }
  function cambiarVista(v) {
    if (v === vista) return
    if (v === 'mes') { setMes(new Date(semana.getFullYear(), semana.getMonth(), 1)); setSeleccion(null) }
    else { const hoy = new Date(); setSemana(inicioSemana(mes.getMonth() === hoy.getMonth() && mes.getFullYear() === hoy.getFullYear() ? hoy : mes)) }
    setEventos([]); setVista(v)
  }
  const diasSemana = vista === 'semana' ? diasDeSemana(semana, eventos) : []
  const enLaSemana = new Set(diasSemana.flatMap(d => d.items.map(i => i.evento.id))).size
  const libres = diasSemana.filter(d => !d.items.length).length
  const hoyTexto = new Date().toDateString()
  const visibles = seleccion ? eventos.filter(e => fechaEvento(e).getDate() === seleccion) : eventos
  return <div>
    {!enBloque && <div className="page-head"><h1>Calendario</h1><div style={{ display:'flex', gap:8 }}><button className="btn btn-primary" onClick={() => setEditando({})}>+ Nuevo evento</button><button className="btn" disabled={importando} onClick={importarComunidad}>{importando ? 'Importando…' : 'Importar de Comunidad'}</button></div></div>}
    <div className="calendar-toolbar">
      <button className="btn btn-sm" onClick={() => mover(-1)} aria-label={vista === 'semana' ? 'Semana anterior' : 'Mes anterior'}>←</button>
      <strong>{vista === 'semana' ? tituloSemana(semana) : mes.toLocaleDateString('es-AR', { month:'long', year:'numeric' })}</strong>
      <button className="btn btn-sm" onClick={() => mover(1)} aria-label={vista === 'semana' ? 'Semana siguiente' : 'Mes siguiente'}>→</button>
      <button className="btn btn-sm" onClick={irAHoy}>Hoy</button>
      {vista === 'semana' && !cargando && <span className="semana-resumen">{enLaSemana} {enLaSemana === 1 ? 'evento' : 'eventos'} · {libres} {libres === 1 ? 'día libre' : 'días libres'}</span>}
      <div className="vista-toggle" style={{ marginLeft: 'auto' }}>
        <button className={vista === 'semana' ? 'active' : ''} aria-pressed={vista === 'semana'} onClick={() => cambiarVista('semana')}>Semana</button>
        <button className={vista === 'mes' ? 'active' : ''} aria-pressed={vista === 'mes'} onClick={() => cambiarVista('mes')}>Mes</button>
      </div>
      {enBloque && <button className="btn btn-sm btn-primary" onClick={() => setEditando({})}>+ Nuevo evento</button>}
    </div>
    {error && <p role="alert" className="feedback-error">{error}</p>}
    {resultadoImport && <p role={resultadoImport.error ? 'alert' : undefined} className={resultadoImport.error ? 'feedback-error' : 'feedback-ok'}>{textoImportacion(resultadoImport)}</p>}
    {vista === 'semana' ? <div className={`${enBloque ? '' : 'card '}semana`}>
      {diasSemana.map(d => <div key={d.clave} className={`semana-dia${d.items.length ? '' : ' libre'}${d.fecha.toDateString() === hoyTexto ? ' hoy' : ''}`}>
        <div className="semana-fecha"><span>{DIA_CORTO[d.fecha.getDay()]}</span><strong>{d.fecha.getDate()}</strong></div>
        <div className="semana-eventos">
          {cargando ? null : d.items.length ? d.items.map(item => <button key={item.evento.id} className="semana-evento" onClick={() => setEditando(item.evento)}>
            <span className="semana-hora">{horaEnSemana(item)}</span>
            <span className="semana-titulo">{item.evento.title || '(sin título)'}{item.evento.location && <small>{item.evento.location}</small>}</span>
          </button>) : <span className="semana-libre">Libre</span>}
        </div>
      </div>)}
    </div> : <>
      <div className={`${enBloque ? '' : 'card '}calendar-grid`}>
        {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => <span className="calendar-weekday" key={d}>{d}</span>)}
        {Array.from({ length:inicio }, (_, i) => <span key={'empty' + i} />)}
        {Array.from({ length:dias }, (_, i) => { const dia = i + 1; const items = eventos.filter(e => fechaEvento(e).getDate() === dia); return <button className={`calendar-day${seleccion === dia ? ' selected' : ''}`} key={dia} onClick={() => setSeleccion(dia)} aria-label={`${dia}, ${items.length} eventos`} aria-pressed={seleccion === dia}><span>{dia}</span>{items.slice(0, 2).map(e => <small key={e.id} className="calendar-titulo">{e.title}</small>)}{items.length > 2 && <small className="calendar-mas">+{items.length - 2}</small>}</button> })}
      </div>
      <div className="page-head" style={{ marginTop:18 }}><h2 style={{ fontSize:14 }}>{seleccion ? `Eventos del día ${seleccion}` : 'Eventos del mes'}</h2>{seleccion && <button className="btn btn-sm" onClick={() => setSeleccion(null)}>Ver todo el mes</button>}</div>
      <div className={enBloque ? 'bloque-scroll' : 'card'}>{cargando ? <p className="empty-state">Cargando…</p> : !visibles.length ? <p className="empty-state">Sin eventos en este período.</p> : visibles.map(e => <details className="calendar-event" key={e.id}><summary>{e.title || '(sin título)'} <span>{e.all_day ? fechaEvento(e).toLocaleDateString('es-AR')+' · Todo el día' : fechaHora(e.starts_at)}</span></summary><p>{fechaHora(e.starts_at)}{e.ends_at ? ' — ' + fechaHora(e.ends_at) : ''}</p>{e.location && <p>{e.location}</p>}<p>{proyectos.find(p => p.id === e.project_id)?.name || 'Sin proyecto'}</p><button className="btn btn-sm" style={{ marginTop:10 }} onClick={() => setEditando(e)}>Editar evento</button></details>)}</div>
    </>}
    {editando && <EditorEvento evento={editando} cerrar={() => setEditando(null)}
      guardado={e => { const fecha = fechaEvento(e); setSemana(inicioSemana(fecha)); setMes(new Date(fecha.getFullYear(), fecha.getMonth(), 1)); setSeleccion(fecha.getDate()); setVersion(v => v + 1) }}
      eliminado={id => { setEventos(prev => prev.filter(item => item.id !== id)); setVersion(v => v + 1) }} />}
  </div>
}
