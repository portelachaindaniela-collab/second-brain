import { useEffect, useState } from 'react'
import { supabase, fechaCorta } from '../../supabase.js'

export default function Metricas({ proyecto }) {
  const [metricas, setMetricas] = useState([])
  const [key, setKey] = useState('')
  const [valor, setValor] = useState('')
  const [unidad, setUnidad] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    const { data } = await supabase.from('metrics').select('id,key,value,unit,captured_at').eq('project_id', proyecto.id).order('captured_at', { ascending: false }).limit(50)
    setMetricas(data || [])
  }
  useEffect(() => { cargar() }, [proyecto.id])

  async function agregar() {
    if (!key.trim() || valor === '' || guardando) return
    if (!Number.isFinite(Number(valor))) { setError('Ingresá un número válido.'); return }
    setGuardando(true); setError('')
    try {
    const { error } = await supabase.from('metrics').insert({ project_id: proyecto.id, key: key.trim(), value: Number(valor), unit: unidad.trim() || null })
    if (error) throw error
    setKey(''); setValor(''); setUnidad('')
    cargar()
    } catch (error) { setError('No se pudo guardar: ' + error.message) }
    finally { setGuardando(false) }
  }

  const porClave = {}
  for (const m of metricas) { (porClave[m.key] ||= []).push(m) }

  return (
    <div>
      <h1 style={{ fontSize: 15, marginBottom: 16 }}>Métricas</h1>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, marginBottom: 10 }}>Cargar valor</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Nombre (ej: seguidores)" value={key} onChange={e => setKey(e.target.value)} />
          <input placeholder="Valor" type="number" value={valor} onChange={e => setValor(e.target.value)} style={{ maxWidth: 120 }} />
          <input placeholder="Unidad (opcional)" value={unidad} onChange={e => setUnidad(e.target.value)} style={{ maxWidth: 120 }} />
          <button className="btn btn-primary" disabled={guardando || !key.trim() || valor === ''} onClick={agregar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>

      {error && <p className="feedback-error" role="alert">{error}</p>}
      {Object.keys(porClave).length === 0 && <p className="empty-state">Todavía no cargaste métricas para este proyecto.</p>}
      {Object.entries(porClave).map(([k, serie]) => {
        const max = Math.max(...serie.map(s => Number(s.value)), 1)
        return (
          <div className="card card-pad" key={k} style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>{k}</h3>
            {serie.slice(0, 12).reverse().map(s => (
              <div className="bar-row" key={s.id}>
                <span className="bar-label">{fechaCorta(s.captured_at)}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(Number(s.value) / max) * 100}%` }} /></div>
                <span className="bar-value">{s.value}{s.unit ? ` ${s.unit}` : ''}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
