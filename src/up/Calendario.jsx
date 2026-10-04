import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso, partesFecha, fechaLarga } from './fechas.js'

function Redes({ dia }) {
  const ig = dia.redes.includes('instagram')
  return (
    <div className="up-dia-redes">
      <LogoRed red="linkedin" /><LogoRed red="x" /><LogoRed red="instagram" apagado={!ig} />
      {ig && <span className="up-etiqueta">{dia.formato_instagram}</span>}
    </div>
  )
}

function Dia({ dia }) {
  const f = partesFecha(dia.fecha)
  return (
    <div className="up-dia">
      <div className="up-dia-fecha">{f.dia}<b>{f.numero}</b>{f.mes}</div>
      <div className="up-dia-texto">
        <h3>{dia.tema_dia}</h3>
        {dia.tema_instagram && <p>Instagram: {dia.tema_instagram}{dia.fotos_propias ? ' · con tus fotos' : ''}</p>}
      </div>
      <Redes dia={dia} />
    </div>
  )
}

function porSemana(dias) {
  const semanas = []
  for (const d of dias) {
    if (semanas.at(-1)?.tema !== d.tema_semana) semanas.push({ tema: d.tema_semana, dias: [] })
    semanas.at(-1).dias.push(d)
  }
  return semanas
}

// Jerarquía: el próximo día manda; después el resto de su semana; después las semanas que vienen; lo pasado, al final y en chico.
// La grilla mensual con color por estado llega en la fase 3.
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
  const pasados = dias.filter(d => d.fecha < hoy)
  const vienen = dias.filter(d => d.fecha >= hoy)
  const [lider, ...resto] = vienen
  const mismaSemana = lider ? resto.filter(d => d.tema_semana === lider.tema_semana) : []
  const despues = lider ? resto.filter(d => d.tema_semana !== lider.tema_semana) : []
  const conInstagram = dias.filter(d => d.redes.includes('instagram')).length

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo">Calendario editorial · {dias.length} días · {conInstagram} con Instagram</div>
      </div>

      {lider && (
        <section className="up-lider">
          <div className="up-lider-principal">
            <div className="up-vol">{lider.fecha === hoy ? 'Hoy' : 'Próxima publicación'}<span>{fechaLarga(lider.fecha)} · Semana «{lider.tema_semana}»</span></div>
            <h2 className="up-titular-1">{lider.tema_dia}</h2>
            {lider.tema_instagram && <p className="up-bajada">En Instagram: {lider.tema_instagram}{lider.fotos_propias ? ', con tus fotos' : ''}.</p>}
            <Redes dia={lider} />
          </div>
          {mismaSemana.length > 0 && (
            <div className="up-lider-semana">
              <div className="up-vol">Resto de la semana</div>
              {mismaSemana.map(d => {
                const f = partesFecha(d.fecha)
                return (
                  <div key={d.id} className="up-breve">
                    <div className="up-breve-fecha">{f.dia}<b>{f.numero}</b></div>
                    <div><h4>{d.tema_dia}</h4><Redes dia={d} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {porSemana(despues).map(s => (
        <section key={s.tema} className="up-bloque">
          <div className="up-vol up-vol-grande">Semana «{s.tema}»<span>{s.dias.length} {s.dias.length === 1 ? 'día' : 'días'}</span></div>
          {s.dias.map(d => <Dia key={d.id} dia={d} />)}
        </section>
      ))}

      {pasados.length > 0 && (
        <section className="up-bloque up-pasados">
          <div className="up-vol">Ya pasaron<span>{pasados.length} {pasados.length === 1 ? 'día' : 'días'}</span></div>
          {pasados.map(d => {
            const f = partesFecha(d.fecha)
            return <div key={d.id} className="up-pasado"><span>{f.dia} {f.numero} {f.mes}</span>{d.tema_dia}</div>
          })}
        </section>
      )}
    </>
  )
}
