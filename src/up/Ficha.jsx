import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const GRUPOS = ['ReporTV', 'San Luis FC', 'AFA', 'DeporTV', 'Colegiales', 'Proyectos']
// Los datos que describen el puesto van como bajada del grupo; el resto son los hechos.
const CONTEXTO = /^(Organización|Puesto|Período):\s*/

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

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo">Ficha de datos · {datos.length} datos</div>
        <h2 className="up-titular-1">La única fuente de hechos y números</h2>
        <p className="up-bajada">Si un dato no está acá, UP te lo pregunta antes de escribirlo.</p>
      </div>
      <div className="up-ficha">
        {GRUPOS.map(g => {
          const items = datos.filter(d => d.grupo === g)
          const contexto = items.filter(d => CONTEXTO.test(d.dato)).map(d => d.dato.replace(CONTEXTO, ''))
          const hechos = items.filter(d => !CONTEXTO.test(d.dato))
          return (
            <section key={g} className="up-bloque">
              <div className="up-vol">{hechos.length} {hechos.length === 1 ? 'dato' : 'datos'}</div>
              <h3 className="up-titular-2">{g}</h3>
              {contexto.length > 0 && <p className="up-ficha-contexto">{contexto.join(' · ')}</p>}
              {hechos.length === 0 ? <p className="up-vacio">Sin datos.</p> : (
                <ul className="up-datos">
                  {hechos.map(d => <li key={d.id}>{d.dato}{d.fuente && <small>{d.fuente}</small>}</li>)}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
