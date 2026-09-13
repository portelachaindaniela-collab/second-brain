import { useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { inputFecha, sumarDia } from '../eventoFecha.js'

function defaultInicio() {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.toISOString()
}

export default function EditorEvento({ evento, cerrar, guardado, eliminado, proyectoId }) {
  const esNuevo = !evento?.id
  const inicioBase = evento?.starts_at || defaultInicio()
  const [titulo, setTitulo] = useState(evento?.title || '')
  const [lugar, setLugar] = useState(evento?.location || '')
  const [descripcion, setDescripcion] = useState(evento?.description || '')
  const [todoElDia, setTodoElDia] = useState(!!evento?.all_day)
  const [inicio, setInicio] = useState(inputFecha(inicioBase, !!evento?.all_day))
  const [fin, setFin] = useState(evento?.all_day ? sumarDia(evento.ends_at || sumarDia(evento.starts_at, 1), -1) : inputFecha(evento?.ends_at || new Date(new Date(inicioBase).getTime() + 3600000).toISOString(), false))
  const [error, setError] = useState('')
  const [reconectar, setReconectar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const bloqueo = useRef(false)

  function cambiarTodoElDia(value) {
    setTodoElDia(value)
    setInicio(inicio.slice(0, 10) + (value ? '' : 'T09:00'))
    setFin(fin.slice(0, 10) + (value ? '' : 'T10:00'))
  }

  async function guardar(e) {
    e.preventDefault()
    if (bloqueo.current) return
    setError(''); setReconectar(false)
    let starts_at, ends_at
    try {
      starts_at = todoElDia ? inicio : new Date(inicio).toISOString()
      ends_at = todoElDia ? sumarDia(fin, 1) : new Date(fin).toISOString()
      if (!titulo.trim() || !inicio || !fin || new Date(ends_at) <= new Date(starts_at)) throw new Error('Revisá el título y las fechas: el final debe ser posterior al inicio.')
    } catch (error) { setError(error.message || 'Revisá las fechas.'); return }
    bloqueo.current = true; setOcupado(true)
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const body = esNuevo
        ? { accion: 'crear', title: titulo.trim(), location: lugar, description: descripcion, all_day: todoElDia, starts_at, ends_at, time_zone: timeZone, project_id: proyectoId || null }
        : { id: evento.id, title: titulo.trim(), location: lugar, description: descripcion, all_day: todoElDia, starts_at, ends_at, time_zone: timeZone }
      const { data, error } = await supabase.functions.invoke('google-calendar-edit', { body })
      let respuesta = data
      if (error?.context) { try { respuesta = await error.context.json() } catch { /* se muestra el error de conexión */ } }
      if (error || respuesta?.error) { setReconectar(!!respuesta?.reconectar); throw new Error(respuesta?.error || 'No se pudo guardar el evento. Probá nuevamente.') }
      if (!respuesta?.evento) throw new Error('El servidor no confirmó el guardado.')
      guardado(respuesta.evento, esNuevo); cerrar()
    } catch (error) { setError(error.message) }
    finally { bloqueo.current = false; setOcupado(false) }
  }

  async function eliminar() {
    if (bloqueo.current) return
    bloqueo.current = true; setOcupado(true); setError('')
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-edit', { body: { accion: 'eliminar', id: evento.id } })
      let respuesta = data
      if (error?.context) { try { respuesta = await error.context.json() } catch { /* se muestra el error de conexión */ } }
      if (error || respuesta?.error) { setReconectar(!!respuesta?.reconectar); throw new Error(respuesta?.error || 'No se pudo borrar el evento. Probá nuevamente.') }
      eliminado(evento.id); cerrar()
    } catch (error) { setError(error.message); setConfirmando(false) }
    finally { bloqueo.current = false; setOcupado(false) }
  }

  async function conectar() {
    setOcupado(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-auth', { body: {} })
      if (error || !data?.url) throw new Error('No se pudo abrir la autorización de Google.')
      window.open(data.url, '_blank')
      setError('Completá la autorización en Google. Después volvé acá y tocá Guardar cambios.')
    } catch (error) { setError(error.message) }
    finally { setOcupado(false) }
  }

  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !ocupado) cerrar() }}>
    <form className="modal" role="dialog" aria-modal="true" aria-label={esNuevo ? 'Nuevo evento' : 'Editar evento'} onSubmit={guardar}>
      <div className="modal-head"><h3>{esNuevo ? 'Nuevo evento' : 'Editar evento'}</h3><button type="button" className="close-x" aria-label="Cerrar editor de evento" disabled={ocupado} onClick={cerrar}>✕</button></div>
      <div className="modal-body">
        <div className="field"><label htmlFor="evento-titulo">Título</label><input id="evento-titulo" autoFocus required maxLength={500} value={titulo} disabled={ocupado} onChange={e => setTitulo(e.target.value)} /></div>
        <label className="check-label"><input type="checkbox" checked={todoElDia} disabled={ocupado} onChange={e => cambiarTodoElDia(e.target.checked)} />Todo el día</label>
        <div className="grid grid-2" style={{ marginTop:12 }}><div className="field"><label htmlFor="evento-inicio">Inicio</label><input id="evento-inicio" type={todoElDia?'date':'datetime-local'} value={inicio} required disabled={ocupado} onChange={e => setInicio(e.target.value)} /></div><div className="field"><label htmlFor="evento-fin">{todoElDia?'Último día':'Finalización'}</label><input id="evento-fin" type={todoElDia?'date':'datetime-local'} value={fin} required disabled={ocupado} onChange={e => setFin(e.target.value)} /></div></div>
        <div className="field"><label htmlFor="evento-lugar">Lugar</label><input id="evento-lugar" value={lugar} maxLength={10000} disabled={ocupado} onChange={e => setLugar(e.target.value)} /></div>
        <div className="field"><label htmlFor="evento-descripcion">Descripción</label><textarea id="evento-descripcion" value={descripcion} maxLength={10000} rows={3} disabled={ocupado} onChange={e => setDescripcion(e.target.value)} /></div>
        {esNuevo && <p className="hint">Si tenés Google conectado, este evento también se crea ahí.</p>}
        {!esNuevo && evento.google_event_id && <p className="hint">Los cambios se guardan también en Google Calendar. Si es un evento repetido, se edita esta fecha.</p>}
        {error && <p className="feedback-error" role="alert">{error}</p>}
        {reconectar && <button className="btn" type="button" disabled={ocupado} onClick={conectar}>Autorizar edición en Google</button>}
        {confirmando && (
          <div className="confirm-box">
            ¿Borrar este evento? {evento.google_event_id ? 'También se borra de Google Calendar. ' : ''}No se puede deshacer.
            <div className="actions">
              <button type="button" className="btn btn-sm btn-danger" disabled={ocupado} onClick={eliminar}>{ocupado ? 'Borrando…' : 'Sí, borrar'}</button>
              <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => setConfirmando(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        {!esNuevo && <button type="button" className="btn btn-danger" disabled={ocupado} onClick={() => setConfirmando(true)}>Eliminar</button>}
        <button type="button" className="btn" disabled={ocupado} onClick={cerrar}>Cancelar</button>
        <button className="btn btn-primary" disabled={ocupado || !titulo.trim()}>{ocupado ? 'Guardando…' : esNuevo ? 'Crear evento' : 'Guardar cambios'}</button>
      </div>
    </form>
  </div>
}
