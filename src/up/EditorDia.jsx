import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { NOMBRE_RED } from './pipeline.js'

const REDES = ['linkedin', 'x', 'instagram']

// Alta o edición de un día del calendario editorial: la idea entra como un día más y los agentes la toman la mañana
// de esa fecha (o antes, con "Generar ahora").
export default function EditorDia({ dia, fecha, semanas, cerrar, guardado }) {
  const nuevo = !dia
  const [f, setF] = useState(() => ({
    fecha: dia?.fecha ?? fecha,
    tema_semana: dia?.tema_semana ?? semanas.at(-1) ?? '',
    tema_dia: dia?.tema_dia ?? '',
    redes: dia?.redes ?? ['linkedin', 'x'],
    formato_instagram: dia?.formato_instagram && dia.formato_instagram !== 'ninguno' ? dia.formato_instagram : 'carrusel',
    tema_instagram: dia?.tema_instagram ?? '',
    fotos_propias: dia?.fotos_propias ?? false,
  }))
  const [ocupado, setOcupado] = useState(false)
  const ref = useRef(null)
  // En pantallas angostas el formulario queda debajo del calendario: se baja hasta él.
  useEffect(() => { if (window.innerWidth < 1000) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])
  const [aviso, setAviso] = useState('')
  const cambiar = (k, v) => setF(x => ({ ...x, [k]: v }))
  const conInstagram = f.redes.includes('instagram')

  function alternarRed(red) {
    cambiar('redes', f.redes.includes(red) ? f.redes.filter(r => r !== red) : REDES.filter(r => r === red || f.redes.includes(r)))
  }

  async function guardar(e) {
    e.preventDefault()
    if (!f.tema_dia.trim()) { setAviso('Escribí la idea (el tema del día).'); return }
    if (!f.redes.length) { setAviso('Elegí al menos una red.'); return }
    setOcupado(true); setAviso('')
    const fila = {
      fecha: f.fecha,
      tema_semana: f.tema_semana.trim() || 'Sin semana',
      tema_dia: f.tema_dia.trim(),
      redes: f.redes,
      formato_instagram: conInstagram ? f.formato_instagram : 'ninguno',
      tema_instagram: conInstagram && f.tema_instagram.trim() ? f.tema_instagram.trim() : null,
      fotos_propias: conInstagram && f.formato_instagram === 'carrusel' && f.fotos_propias,
    }
    const { data, error } = nuevo
      ? await supabase.from('up_calendario').insert(fila).select('*').single()
      : await supabase.from('up_calendario').update(fila).eq('id', dia.id).select('*').single()
    setOcupado(false)
    if (error) { setAviso(error.code === '23505' ? 'Ya hay una publicación ese día: elegí otra fecha o editá la que está.' : 'No se pudo guardar: ' + error.message); return }
    guardado(data)
  }

  return (
    <form ref={ref} className="up-editor-dia" onSubmit={guardar}>
      <div className="up-vol">{nuevo ? 'Nueva idea' : 'Editar el día'}</div>
      <label className="up-campo-l">Día
        <input className="up-campo" type="date" value={f.fecha} onChange={e => cambiar('fecha', e.target.value)} required />
      </label>
      <label className="up-campo-l">La idea (tema del día)
        <textarea className="up-editor" rows={3} value={f.tema_dia} onChange={e => cambiar('tema_dia', e.target.value)} placeholder="Ej.: Qué aprendí armando un área de comunicación desde cero" autoFocus />
      </label>
      <label className="up-campo-l">Tema de la semana
        <input className="up-campo" list="up-semanas" value={f.tema_semana} onChange={e => cambiar('tema_semana', e.target.value)} />
        <datalist id="up-semanas">{semanas.map(s => <option key={s} value={s} />)}</datalist>
      </label>
      <fieldset className="up-campo-l up-redes-check">
        <legend>Redes</legend>
        {REDES.map(red => <label key={red}><input type="checkbox" checked={f.redes.includes(red)} onChange={() => alternarRed(red)} />{NOMBRE_RED[red]}</label>)}
      </fieldset>
      {conInstagram && (
        <>
          <fieldset className="up-campo-l up-redes-check">
            <legend>Instagram</legend>
            {['carrusel', 'reel'].map(x => <label key={x}><input type="radio" name="formato" checked={f.formato_instagram === x} onChange={() => cambiar('formato_instagram', x)} />{x === 'carrusel' ? 'Carrusel' : 'Reel'}</label>)}
            {f.formato_instagram === 'carrusel' && <label><input type="checkbox" checked={f.fotos_propias} onChange={e => cambiar('fotos_propias', e.target.checked)} />Con mis fotos</label>}
          </fieldset>
          <label className="up-campo-l">Tema de Instagram (si es distinto)
            <input className="up-campo" value={f.tema_instagram} onChange={e => cambiar('tema_instagram', e.target.value)} placeholder="Si lo dejás vacío, usa la idea del día" />
          </label>
        </>
      )}
      <p className="up-nota-chica">Los agentes solo usan datos de la Ficha. Si la idea necesita algo que no está ahí, te lo preguntan antes de escribir.</p>
      {aviso && <p role="alert" className="up-error">{aviso}</p>}
      <div className="up-acciones">
        <button type="button" className="up-btn" disabled={ocupado} onClick={cerrar}>Cancelar</button>
        <button type="submit" className="up-btn up-btn-p" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
