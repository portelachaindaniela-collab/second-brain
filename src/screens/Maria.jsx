import { useCallback, useEffect, useState } from 'react'
import { supabase, fechaHora } from '../supabase.js'
import FlujoAgentes, { AGENTES_INFO } from './FlujoAgentes.jsx'

const NIVEL_BADGE = { ok: 'badge-green', aviso: 'badge-amber', error: 'badge-red' }
const NOMBRE_AGENTE = Object.fromEntries(AGENTES_INFO.map(a => [a.key, `${a.nombre} · ${a.tarea}`]))

function resumenTareas(tareas) {
  const abiertas = tareas.filter(t => !t.done && t.status !== 'listo')
  if (!abiertas.length) return 'No hay tareas abiertas.'
  const enCurso = abiertas.filter(t => t.status === 'en_curso')
  const elegidas = (enCurso.length ? enCurso : abiertas).slice(0, 8)
  return `Tenés ${abiertas.length} tareas abiertas y ${enCurso.length} en curso.\n\n` + elegidas.map(t => '• ' + t.title).join('\n')
}

export default function Maria() {
  const [agentes, setAgentes] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [comando, setComando] = useState('')
  const [salida, setSalida] = useState('')
  const [consultando, setConsultando] = useState(false)

  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase.from('process_reports').select('id,agente,estado,resumen,iniciado_at').order('iniciado_at', { ascending: false }).limit(30)
    setHistorial(data || [])
  }, [])

  const chequear = useCallback(async () => {
    setCargando(true); setError('')
    const { data, error } = await supabase.functions.invoke('agentes-orquestador', { body: {} })
    setCargando(false)
    if (error) {
      let detail = 'María todavía no está conectada.'
      try { const body = await error.context?.json(); if (body?.error) detail = body.error } catch { /* noop */ }
      setError(detail)
      return
    }
    setAgentes(data.agentes || [])
    cargarHistorial()
  }, [cargarHistorial])

  useEffect(() => { chequear() }, [chequear])

  async function ejecutarComando(texto) {
    const q = texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    setConsultando(true)
    if (/^(mis )?tareas$/.test(q)) {
      const { data } = await supabase.from('tasks').select('id,title,status,done').order('created_at', { ascending: false }).limit(200)
      setSalida(resumenTareas(data || []))
    } else if (/^(mis )?proyectos$/.test(q)) {
      const { data } = await supabase.from('projects').select('name,status').order('created_at')
      setSalida((data || []).length ? data.map(p => `• ${p.name} — ${p.status}`).join('\n') : 'Todavía no hay proyectos.')
    } else if (/^(revisar sitios|chequear sitios|maria)$/.test(q)) {
      await chequear()
      setSalida('Chequeo actualizado arriba.')
    } else {
      setSalida('Por ahora entiendo: «mis tareas», «mis proyectos» y «revisar sitios».')
    }
    setConsultando(false)
  }

  const monitorSitios = agentes?.find(a => a.agente === 'monitor_sitios')
  const sitios = monitorSitios?.datos?.sitios || []
  const scraper = sitios.find(s => s.nombre.includes('scraper') || s.nombre.includes('Radar'))
  const scraperCheck = scraper?.chequeos?.find(c => c.tipo === 'corrida del scraper')

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>María</h1>
          <p className="page-sub">Supervisa tres scripts: sitios, tareas estancadas y estado de sincronización.</p>
        </div>
        <button className="btn btn-primary" onClick={chequear} disabled={cargando}>{cargando ? 'Chequeando…' : 'Recargar'}</button>
      </div>

      {error && <div className="card card-pad empty-state">{error}</div>}

      <FlujoAgentes agentes={agentes} />

      {scraperCheck && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, marginBottom: 8 }}>Scraper de Radar Laboral</h3>
          <span className={`badge ${NIVEL_BADGE[scraperCheck.nivel] || 'badge-gray'}`}>{scraperCheck.nivel}</span>
          <p style={{ marginTop: 8, fontSize: 13 }}>{scraperCheck.detalle}</p>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, marginBottom: 10 }}>Pedile algo al bot</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-sm" onClick={() => ejecutarComando('mis tareas')} disabled={consultando}>Mis tareas</button>
          <button className="btn btn-sm" onClick={() => ejecutarComando('mis proyectos')} disabled={consultando}>Mis proyectos</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={comando} onChange={e => setComando(e.target.value)} placeholder="mis tareas · mis proyectos · revisar sitios"
            onKeyDown={e => e.key === 'Enter' && ejecutarComando(comando)} />
          <button className="btn btn-primary" onClick={() => ejecutarComando(comando)} disabled={consultando}>Consultar</button>
        </div>
        {salida && <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 12 }}>{salida}</p>}
        <p className="hint" style={{ marginTop: 10 }}>Sin IA ni consumo de créditos. Conversación libre y loop de agentes: pendientes de activar.</p>
      </div>

      {sitios.map(sitio => (
        <details className="card card-pad" key={sitio.nombre} style={{ marginBottom: 10 }} open={sitio.nivel !== 'ok'}>
          <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{sitio.nombre}</span>
            <span className={`badge ${NIVEL_BADGE[sitio.nivel] || 'badge-gray'}`}>{sitio.nivel}</span>
          </summary>
          <div style={{ marginTop: 10 }}>
            {sitio.chequeos.map((c, i) => (
              <div className="list-item" key={i}>
                <span className="list-main">{c.tipo}: {c.detalle}</span>
              </div>
            ))}
          </div>
        </details>
      ))}

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13, marginBottom: 10 }}>Reportes de procesos</h3>
        {historial.length === 0 && <p className="empty-state">Sin corridas registradas todavía.</p>}
        {historial.map(h => (
          <div className="list-item" key={h.id}>
            <span className="list-main">
              <span className={`badge ${NIVEL_BADGE[h.estado] || 'badge-gray'}`} style={{ marginRight: 8 }}>{h.estado}</span>
              {NOMBRE_AGENTE[h.agente] || h.agente} — {h.resumen}
            </span>
            <span className="list-side">{fechaHora(h.iniciado_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
