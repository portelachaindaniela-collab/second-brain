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

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>

  return (
    <>
      <div className="up-enc">
        <h2 className="up-titular">Ficha de datos</h2>
        <p className="up-bajada">La única fuente de hechos y números. Si un dato no está acá, UP te lo pregunta antes de escribirlo.</p>
      </div>
      <div className="up-ficha">
        {GRUPOS.map(g => {
          const items = datos.filter(d => d.grupo === g)
          return (
            <section key={g} className="up-bloque">
              <div className="up-vol">{g}<span>{items.length} {items.length === 1 ? 'dato' : 'datos'}</span></div>
              {items.length === 0 ? <p className="up-vacio">Sin datos.</p> : (
                <ul className="up-datos">
                  {items.map(d => <li key={d.id}>{d.dato}{d.fuente && <small>{d.fuente}</small>}</li>)}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
