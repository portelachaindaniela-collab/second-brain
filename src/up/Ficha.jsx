import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const GRUPOS = ['ReporTV', 'San Luis FC', 'AFA', 'DeporTV', 'Colegiales', 'Proyectos']
// Los datos que describen el puesto van como bajada del grupo; el resto son los hechos.
const CONTEXTO = /^(Organización|Puesto|Período):\s*/
const CAMPOS = 'id,grupo,dato,fuente,orden'

// Un dato de la ficha: se lee como lista y, al tocar Editar, se cambia en el lugar.
function Dato({ dato, guardar, borrar }) {
  const [editando, setEditando] = useState(!dato.id)
  const [texto, setTexto] = useState(dato.dato)
  const [fuente, setFuente] = useState(dato.fuente || '')
  const [ocupado, setOcupado] = useState(false)

  function cancelar() {
    if (!dato.id) { borrar(dato); return }
    setTexto(dato.dato); setFuente(dato.fuente || ''); setEditando(false)
  }

  async function confirmar() {
    setOcupado(true)
    const ok = await guardar(dato, { dato: texto.trim(), fuente: fuente.trim() || null })
    setOcupado(false)
    if (ok && dato.id) setEditando(false)
  }

  if (!editando) {
    return (
      <li className="up-dato">
        <div>{dato.dato}{dato.fuente && <small>{dato.fuente}</small>}</div>
        <button className="up-link" onClick={() => setEditando(true)}>Editar</button>
      </li>
    )
  }
  return (
    <li className="up-dato editando">
      <textarea className="up-editor" rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="El dato, tal como se puede publicar" aria-label="Dato" autoFocus />
      <input className="up-campo" value={fuente} onChange={e => setFuente(e.target.value)} placeholder="Fuente (opcional)" aria-label="Fuente" />
      <div className="up-acciones">
        {dato.id && <button className="up-btn up-btn-borrar" disabled={ocupado} onClick={() => borrar(dato)}>Borrar</button>}
        <button className="up-btn" disabled={ocupado} onClick={cancelar}>Cancelar</button>
        <button className="up-btn up-btn-p" disabled={ocupado || !texto.trim()} onClick={confirmar}>Guardar</button>
      </div>
    </li>
  )
}

export default function Ficha() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.from('up_ficha_datos').select(CAMPOS).order('orden')
      .then(({ data, error }) => {
        if (error) { setError('No se pudo cargar la ficha: ' + error.message); return }
        setDatos(data || [])
      })
  }, [])

  // Un dato nuevo vive solo en pantalla (sin id) hasta que se guarda.
  function agregar(grupo) {
    const orden = Math.max(0, ...datos.filter(d => d.grupo === grupo).map(d => d.orden)) + 1
    setDatos(ds => [...ds, { id: null, clave: crypto.randomUUID(), grupo, dato: '', fuente: '', orden }])
  }

  async function guardar(dato, cambios) {
    setAviso('')
    const consulta = dato.id
      ? supabase.from('up_ficha_datos').update(cambios).eq('id', dato.id)
      : supabase.from('up_ficha_datos').insert({ grupo: dato.grupo, orden: dato.orden, ...cambios })
    const { data, error } = await consulta.select(CAMPOS).single()
    if (error) { setAviso('No se pudo guardar el dato: ' + error.message); return false }
    setDatos(ds => ds.map(d => (d === dato ? data : d)))
    return true
  }

  async function borrar(dato) {
    setAviso('')
    if (dato.id) {
      if (!window.confirm('¿Borrar este dato de la ficha? Los agentes no lo van a poder usar más.')) return
      const { error } = await supabase.from('up_ficha_datos').delete().eq('id', dato.id)
      if (error) { setAviso('No se pudo borrar el dato: ' + error.message); return }
    }
    setDatos(ds => ds.filter(d => d !== dato))
  }

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo">Ficha de datos · {datos.filter(d => d.id).length} datos</div>
        <h2 className="up-titular-1">La única fuente de hechos y números</h2>
        <p className="up-bajada">Si un dato no está acá, UP te lo pregunta antes de escribirlo. Lo que cambies acá vale desde el próximo borrador.</p>
        {aviso && <p role="alert" className="up-error">{aviso}</p>}
      </div>
      <div className="up-ficha">
        {GRUPOS.map(g => {
          const items = datos.filter(d => d.grupo === g)
          const contexto = items.filter(d => d.id && CONTEXTO.test(d.dato))
          const hechos = items.filter(d => !d.id || !CONTEXTO.test(d.dato))
          return (
            <section key={g} className="up-bloque">
              <div className="up-vol">{hechos.filter(d => d.id).length} {hechos.filter(d => d.id).length === 1 ? 'dato' : 'datos'}<button className="up-link" onClick={() => agregar(g)}>+ Agregar dato</button></div>
              <h3 className="up-titular-2">{g}</h3>
              {contexto.length > 0 && (
                <ul className="up-datos up-datos-contexto">
                  {contexto.map(d => <Dato key={d.id} dato={d} guardar={guardar} borrar={borrar} />)}
                </ul>
              )}
              {hechos.length === 0 ? <p className="up-vacio">Sin datos.</p> : (
                <ul className="up-datos">
                  {hechos.map(d => <Dato key={d.id || d.clave} dato={d} guardar={guardar} borrar={borrar} />)}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
