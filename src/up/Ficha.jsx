import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const GRUPOS = ['ReporTV', 'San Luis FC', 'AFA', 'DeporTV', 'Colegiales', 'Proyectos']

// Fase 1: lectura de la ficha importada. Editar y "Agregar dato" llegan en la fase 3.
export default function Ficha() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('up_ficha_datos').select('id,grupo,dato,fuente,orden').order('orden')
      .then(({ data, error }) => {
        if (error) { setError('No se pudo cargar la ficha: ' + error.message); return }
        setDatos(data || [])
      })
  }, [])

  if (error) return <p role="alert" className="feedback-error">{error}</p>
  if (!datos) return <p className="empty-state">Cargando…</p>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ficha de datos</h1>
          <div className="page-sub">Única fuente de hechos y números · {datos.length} datos</div>
        </div>
      </div>
      {GRUPOS.map(g => {
        const items = datos.filter(d => d.grupo === g)
        return (
          <div key={g} className="card up-ficha-grupo">
            <h2>{g}</h2>
            {items.length === 0 ? <p className="empty-state">Sin datos.</p> : items.map(d => (
              <div key={d.id} className="list-item">
                <div style={{ minWidth: 0 }}>{d.dato}</div>
                {d.fuente && <div className="list-side">{d.fuente}</div>}
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
