import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso, partesFecha, fechaLarga } from './fechas.js'

const ESTADOS = { pendiente: 'Pendiente', falta_info: 'Falta info', revision: 'En revisión', aprobado: 'Aprobado', publicado: 'Publicado', error: 'Error' }
const NOMBRE_RED = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' }

// Una pieza del día. Mientras el pipeline de agentes no exista (fase 2) no hay borradores: se muestra el lugar vacío.
function Pieza({ red, pieza, principal, titulo }) {
  const parrafos = (pieza?.texto || '').split(/\n{2,}/).filter(Boolean)
  return (
    <article className={principal ? 'up-nota up-nota-principal' : 'up-nota'}>
      <div className="up-vol"><LogoRed red={red} />{NOMBRE_RED[red]}{pieza && <span className={`up-estado e-${pieza.estado}`}>{ESTADOS[pieza.estado]}</span>}</div>
      {titulo && <h2 className="up-titular-1">{titulo}</h2>}
      {parrafos.length > 0
        ? <div className={principal ? 'up-cuerpo-nota capital' : 'up-cuerpo-nota'}>{parrafos.map((p, i) => <p key={i}>{p}</p>)}</div>
        : <p className="up-vacio">Todavía no hay borrador para {NOMBRE_RED[red]}. Los agentes lo escriben cada mañana.</p>}
    </article>
  )
}

export default function Hoy({ abrirCalendario }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const hoy = hoyIso()
    Promise.all([
      supabase.from('up_calendario').select('id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias').order('fecha'),
      supabase.from('up_piezas').select('id,fecha,red,texto,estado,pregunta').or(`fecha.eq.${hoy},estado.eq.falta_info`),
    ]).then(([cal, pie]) => {
      if (cal.error || pie.error) { setError('No se pudo cargar el día: ' + (cal.error || pie.error).message); return }
      setDatos({ dias: cal.data || [], piezas: pie.data || [] })
    })
  }, [])

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>

  const hoy = hoyIso()
  const dia = datos.dias.find(d => d.fecha === hoy)
  const proximos = datos.dias.filter(d => d.fecha > hoy).slice(0, 4)
  const piezasHoy = datos.piezas.filter(p => p.fecha === hoy)
  const preguntas = datos.piezas.filter(p => p.estado === 'falta_info' && p.pregunta)
  const pasados = datos.dias.filter(d => d.fecha <= hoy).length
  const pieza = red => piezasHoy.find(p => p.red === red)

  return (
    <div className="up-portada">
      <div className="up-portada-principal">
        {dia ? (
          <>
            <div className="up-antetitulo">{fechaLarga(hoy)} · Semana «{dia.tema_semana}»</div>
            <div className="up-portada-notas">
              <Pieza red="linkedin" principal titulo={dia.tema_dia} pieza={pieza('linkedin')} />
              <div className="up-portada-segunda">
                <Pieza red="x" pieza={pieza('x')} />
                {dia.redes.includes('instagram') && (
                  <article className="up-nota">
                    <div className="up-vol"><LogoRed red="instagram" />Instagram · {dia.formato_instagram}</div>
                    <h3 className="up-titular-3">{dia.tema_instagram}</h3>
                    {!pieza('instagram') && <p className="up-vacio">Las placas se diseñan en la fase 4.</p>}
                  </article>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="up-enc">
            <div className="up-antetitulo">{fechaLarga(hoy)}</div>
            <h2 className="up-titular-1">Hoy no hay publicación en el calendario</h2>
            {proximos[0] && <p className="up-bajada">La próxima es el {fechaLarga(proximos[0].fecha).toLowerCase()}: {proximos[0].tema_dia}.</p>}
          </div>
        )}
      </div>

      <aside className="up-portada-lateral">
        <section className="up-recuadro">
          <div className="up-vol">Necesito que me cuentes</div>
          {preguntas.length === 0
            ? <p className="up-vacio">No hay preguntas pendientes.</p>
            : preguntas.map(p => <p key={p.id} className="up-pregunta"><b>{fechaLarga(p.fecha)}.</b> {p.pregunta}</p>)}
        </section>
        <section className="up-recuadro">
          <div className="up-vol">Avance del calendario</div>
          <div className="up-cifra">{pasados}<span>de {datos.dias.length} días ya pasaron</span></div>
          <div className="up-barra"><i style={{ width: `${datos.dias.length ? Math.round(pasados * 100 / datos.dias.length) : 0}%` }} /></div>
        </section>
        <section className="up-recuadro">
          <div className="up-vol">Próximos días<button className="up-link" onClick={abrirCalendario}>Calendario</button></div>
          {proximos.length === 0 ? <p className="up-vacio">No hay más días cargados.</p> : proximos.map(d => {
            const f = partesFecha(d.fecha)
            return (
              <div key={d.id} className="up-breve">
                <div className="up-breve-fecha">{f.dia}<b>{f.numero}</b></div>
                <div>
                  <h4>{d.tema_dia}</h4>
                  <div className="up-breve-redes"><LogoRed red="linkedin" /><LogoRed red="x" /><LogoRed red="instagram" apagado={!d.redes.includes('instagram')} /></div>
                </div>
              </div>
            )
          })}
        </section>
      </aside>
    </div>
  )
}
