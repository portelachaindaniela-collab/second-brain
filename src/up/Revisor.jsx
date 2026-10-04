import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { fechaLarga } from './fechas.js'
import { correrPipeline, NOMBRE_RED } from './pipeline.js'
import { conResaltados } from './resaltar.jsx'

const CHEQUEOS = [
  { tipo: 'dato', label: 'Cada dato está en la ficha' },
  { tipo: 'camara', label: 'Nada sugiere que aparecés en cámara' },
  { tipo: 'formato', label: 'El largo sirve para la red' },
]

// Un borrador que el revisor no dejó pasar después de las correcciones automáticas.
function Caso({ pieza, alResolver }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(pieza.texto || '')
  const [ocupada, setOcupada] = useState('')
  const [aviso, setAviso] = useState('')
  const problemas = pieza.problemas || []

  async function guardar() {
    setOcupada('guardar'); setAviso('')
    const { error } = await supabase.from('up_piezas').update({ texto: texto.trim(), estado: 'pendiente', problemas: null, motivo_revision: null }).eq('id', pieza.id)
    setOcupada('')
    if (error) { setAviso('No se pudo guardar: ' + error.message); return }
    alResolver()
  }

  // Se vacía el borrador para que el pipeline lo escriba de nuevo desde cero.
  async function regenerar() {
    setOcupada('regenerar'); setAviso('')
    const { error } = await supabase.from('up_piezas').update({ texto: null, contenido: null, estado: 'pendiente', problemas: null, motivo_revision: null, intentos_revision: 0 }).eq('id', pieza.id)
    if (error) { setOcupada(''); setAviso('No se pudo preparar la pieza: ' + error.message); return }
    const mensaje = await correrPipeline(pieza.fecha)
    setOcupada('')
    setAviso(mensaje)
    alResolver()
  }

  return (
    <article className="up-caso">
      <div className="up-caso-borrador">
        <div className="up-vol"><LogoRed red={pieza.red} />{NOMBRE_RED[pieza.red]}<span>{fechaLarga(pieza.fecha)}</span></div>
        {pieza.up_calendario?.tema_dia && <h3 className="up-titular-2">{pieza.up_calendario.tema_dia}</h3>}
        {editando
          ? <textarea className="up-editor" value={texto} onChange={e => setTexto(e.target.value)} rows={Math.max(8, texto.split('\n').length + 2)} aria-label="Texto del borrador" />
          : <div className="up-cuerpo-nota">{(pieza.texto || '').split(/\n{2,}/).filter(Boolean).map((p, i) => <p key={i}>{conResaltados(p, problemas)}</p>)}</div>}
        {aviso && <p role="alert" className="up-error">{aviso}</p>}
        <div className="up-acciones">
          {editando ? (
            <>
              <button className="up-btn" disabled={!!ocupada} onClick={() => { setTexto(pieza.texto || ''); setEditando(false) }}>Cancelar</button>
              <button className="up-btn up-btn-p" disabled={!!ocupada || !texto.trim()} onClick={guardar}>{ocupada === 'guardar' ? 'Guardando…' : 'Guardar'}</button>
            </>
          ) : (
            <>
              <button className="up-btn" disabled={!!ocupada} onClick={regenerar}>{ocupada === 'regenerar' ? 'Generando…' : 'Volver a generar'}</button>
              <button className="up-btn up-btn-p" disabled={!!ocupada} onClick={() => setEditando(true)}>Corregir yo</button>
            </>
          )}
        </div>
      </div>
      <aside className="up-caso-chequeos">
        <div className="up-vol">Chequeos<span>{pieza.intentos_revision} {pieza.intentos_revision === 1 ? 'corrección' : 'correcciones'} automáticas</span></div>
        <ul className="up-chequeos">
          {CHEQUEOS.map(c => {
            const fallas = problemas.filter(p => (p.tipo || 'dato') === c.tipo)
            return (
              <li key={c.tipo} className={fallas.length ? 'falla' : 'ok'}>
                <b>{fallas.length ? '✕' : '✓'}</b> {c.label}
                {fallas.map((f, i) => <p key={i}>{f.fragmento ? <><mark>{f.fragmento}</mark>: </> : null}{f.motivo}</p>)}
              </li>
            )
          })}
        </ul>
      </aside>
    </article>
  )
}

export default function Revisor({ alCambiar }) {
  const [piezas, setPiezas] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('up_piezas')
      .select('id,fecha,red,texto,problemas,motivo_revision,intentos_revision,up_calendario(tema_dia)')
      .eq('estado', 'revision').order('fecha')
    if (error) { setError('No se pudieron cargar los borradores en revisión: ' + error.message); return }
    setPiezas(data || [])
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!piezas) return <p className="up-vacio">Cargando…</p>

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo">Revisor · {piezas.length} {piezas.length === 1 ? 'borrador' : 'borradores'}</div>
        <h2 className="up-titular-1">{piezas.length ? 'Lo que el revisor no dejó pasar' : 'No hay borradores en revisión'}</h2>
        {piezas.length > 0 && <p className="up-bajada">El dato marcado no está en la ficha, sugiere que aparecés en cámara o no entra en la red. Corregilo vos o pedí otra versión.</p>}
      </div>
      {piezas.map(p => <Caso key={p.id} pieza={p} alResolver={() => { cargar(); alCambiar?.() }} />)}
    </>
  )
}
