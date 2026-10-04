import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

function fechaDia(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function hoyIso() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

// Fase 1: lista del calendario importado. La grilla mensual con color por estado llega en la fase 3.
export default function Calendario() {
  const [dias, setDias] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('up_calendario').select('id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias').order('fecha')
      .then(({ data, error }) => {
        if (error) { setError('No se pudo cargar el calendario: ' + error.message); return }
        setDias(data || [])
      })
  }, [])

  if (error) return <p role="alert" className="feedback-error">{error}</p>
  if (!dias) return <p className="empty-state">Cargando…</p>
  if (dias.length === 0) return <p className="empty-state">Todavía no hay días cargados.</p>

  const hoy = hoyIso()
  const conInstagram = dias.filter(d => d.redes.includes('instagram')).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Calendario</h1>
          <div className="page-sub">{dias.length} días · {conInstagram} con Instagram</div>
        </div>
      </div>
      <div className="card">
        {dias.map((d, i) => (
          <div key={d.id}>
            {d.tema_semana !== dias[i - 1]?.tema_semana && <div className="up-semana">{d.tema_semana}</div>}
            <div className={`up-dia${d.fecha < hoy ? ' pasado' : ''}`}>
              <div className="up-dia-fecha">{fechaDia(d.fecha)}</div>
              <div>
                <div>{d.tema_dia}</div>
                {d.tema_instagram && <div className="up-dia-ig">Instagram: {d.tema_instagram}{d.fotos_propias ? ' · fotos tuyas' : ''}</div>}
              </div>
              <div>{d.redes.includes('instagram') && <span className="badge badge-amber">{d.formato_instagram}</span>}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
