import { useCallback, useEffect, useState } from 'react'
import { supabase, fechaHora } from '../supabase.js'
import FlujoAgentes, { AGENTES_INFO } from './FlujoAgentes.jsx'

const NIVEL_BADGE = { ok: 'badge-green', aviso: 'badge-amber', error: 'badge-red' }
const NOMBRE_AGENTE = Object.fromEntries(AGENTES_INFO.map(a => [a.key, `${a.nombre} · ${a.tarea}`]))

export default function Maria() {
  const [agentes, setAgentes] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

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

  const monitorSitios = agentes?.find(a => a.agente === 'monitor_sitios')
  const sitios = monitorSitios?.datos?.sitios || []
  const scraper = sitios.find(s => s.nombre.includes('scraper') || s.nombre.includes('Radar'))
  const scraperCheck = scraper?.chequeos?.find(c => c.tipo === 'corrida del scraper')

  return (
    <div className="maria-page">
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
        <details className="card maria-section">
          <summary>Scraper de Radar Laboral</summary>
          <span className={`badge ${NIVEL_BADGE[scraperCheck.nivel] || 'badge-gray'}`}>{scraperCheck.nivel}</span>
          <p style={{ marginTop: 8, fontSize: 13 }}>{scraperCheck.detalle}</p>
        </details>
      )}

      {sitios.map(sitio => (
        <details className="card maria-section" key={sitio.nombre}>
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

      <details className="card maria-section">
        <summary>Reportes de procesos <span className="maria-count">{historial.length}</span></summary>
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
      </details>
    </div>
  )
}
