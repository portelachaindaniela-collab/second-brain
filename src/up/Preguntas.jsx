import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { fechaLarga } from './fechas.js'
import { correrPipeline, NOMBRE_RED } from './pipeline.js'

// Una pregunta del investigador: vale para todas las piezas de ese día.
function Pregunta({ grupo, alResolver }) {
  const [respuesta, setRespuesta] = useState(grupo.respuesta || '')
  const [ocupada, setOcupada] = useState('')
  const [aviso, setAviso] = useState('')
  const ids = grupo.piezas.map(p => p.id)

  async function generar() {
    setOcupada('generar'); setAviso('')
    const { error } = await supabase.from('up_piezas').update({ respuesta: respuesta.trim() }).in('id', ids)
    if (error) { setOcupada(''); setAviso('No se pudo guardar la respuesta: ' + error.message); return }
    const mensaje = await correrPipeline(grupo.fecha)
    setOcupada('')
    setAviso(mensaje)
    if (!mensaje) alResolver()
  }

  async function saltear() {
    setOcupada('saltear'); setAviso('')
    const { error } = await supabase.from('up_calendario').update({ salteado: true }).eq('id', grupo.calendarioId)
    if (error) { setOcupada(''); setAviso('No se pudo saltear el día: ' + error.message); return }
    // Las piezas de ese día que no llegaron a aprobarse dejan de existir: el día no se publica.
    const { error: e } = await supabase.from('up_piezas').delete().eq('fecha', grupo.fecha).not('estado', 'in', '(aprobado,publicado)')
    setOcupada('')
    if (e) { setAviso('Se salteó el día, pero no se pudieron borrar sus borradores: ' + e.message); return }
    alResolver()
  }

  return (
    <article className="up-pregunta-bloque">
      <div className="up-vol">{fechaLarga(grupo.fecha)}<span>{grupo.piezas.map(p => NOMBRE_RED[p.red]).join(', ')}</span></div>
      {grupo.tema && <h3 className="up-titular-3">{grupo.tema}</h3>}
      <p className="up-pregunta-texto">{grupo.pregunta}</p>
      <textarea className="up-editor" rows={4} value={respuesta} onChange={e => setRespuesta(e.target.value)} placeholder="Tu respuesta. Lo que escribas acá se usa como dato, igual que la ficha." aria-label={`Respuesta para el ${fechaLarga(grupo.fecha)}`} />
      {aviso && <p role="alert" className="up-error">{aviso}</p>}
      <div className="up-acciones">
        <button className="up-btn" disabled={!!ocupada} onClick={saltear}>{ocupada === 'saltear' ? 'Salteando…' : 'Saltear este día'}</button>
        <button className="up-btn up-btn-p" disabled={!!ocupada || !respuesta.trim()} onClick={generar}>{ocupada === 'generar' ? 'Generando…' : 'Generar borrador'}</button>
      </div>
    </article>
  )
}

export default function Preguntas({ alCambiar }) {
  const [grupos, setGrupos] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('up_piezas')
      .select('id,fecha,red,pregunta,respuesta,calendario_id,up_calendario(tema_dia)')
      .eq('estado', 'falta_info').order('fecha')
    if (error) { setError('No se pudieron cargar las preguntas: ' + error.message); return }
    const porFecha = new Map()
    for (const p of data || []) {
      if (!porFecha.has(p.fecha)) porFecha.set(p.fecha, { fecha: p.fecha, calendarioId: p.calendario_id, tema: p.up_calendario?.tema_dia, pregunta: p.pregunta, respuesta: p.respuesta, piezas: [] })
      porFecha.get(p.fecha).piezas.push(p)
    }
    setGrupos([...porFecha.values()])
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!grupos) return <p className="up-vacio">Cargando…</p>

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo">Necesito que me cuentes · {grupos.length} {grupos.length === 1 ? 'día' : 'días'}</div>
        <h2 className="up-titular-1">{grupos.length ? 'Lo que el investigador no encontró en la ficha' : 'No hay preguntas pendientes'}</h2>
        {grupos.length > 0 && <p className="up-bajada">Respondé y UP escribe el borrador con tu respuesta, o salteá el día si no querés publicar.</p>}
      </div>
      <div className="up-preguntas">
        {grupos.map(g => <Pregunta key={g.fecha} grupo={g} alResolver={() => { cargar(); alCambiar?.() }} />)}
      </div>
    </>
  )
}
