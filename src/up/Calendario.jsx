import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'

function partesFecha(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(a, m - 1, d)
  return { dia: f.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''), numero: d, mes: f.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') }
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

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!dias) return <p className="up-vacio">Cargando…</p>
  if (dias.length === 0) return <p className="up-vacio">Todavía no hay días cargados.</p>

  const hoy = hoyIso()
  const conInstagram = dias.filter(d => d.redes.includes('instagram')).length
  const semanas = []
  for (const d of dias) {
    if (semanas.at(-1)?.tema !== d.tema_semana) semanas.push({ tema: d.tema_semana, dias: [] })
    semanas.at(-1).dias.push(d)
  }

  return (
    <>
      <div className="up-enc">
        <h2 className="up-titular">Calendario editorial</h2>
        <p className="up-bajada">{dias.length} días de LinkedIn y X, {conInstagram} con Instagram.</p>
      </div>
      {semanas.map(s => (
        <section key={s.tema} className="up-bloque">
          <div className="up-vol">Semana · {s.tema}<span>{s.dias.length} {s.dias.length === 1 ? 'día' : 'días'}</span></div>
          {s.dias.map(d => {
            const f = partesFecha(d.fecha)
            const ig = d.redes.includes('instagram')
            return (
              <div key={d.id} className={`up-dia${d.fecha < hoy ? ' pasado' : ''}${d.fecha === hoy ? ' hoy' : ''}`}>
                <div className="up-dia-fecha">{f.dia}<b>{f.numero}</b>{f.mes}</div>
                <div className="up-dia-texto">
                  <h3>{d.tema_dia}</h3>
                  {d.tema_instagram && <p>Instagram: {d.tema_instagram}{d.fotos_propias ? ' · con tus fotos' : ''}</p>}
                </div>
                <div className="up-dia-redes">
                  <LogoRed red="linkedin" /><LogoRed red="x" /><LogoRed red="instagram" apagado={!ig} />
                  {ig && <span className="up-etiqueta">{d.formato_instagram}</span>}
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </>
  )
}
