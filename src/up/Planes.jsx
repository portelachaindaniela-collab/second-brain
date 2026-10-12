import { useState } from 'react'
import { supabase } from '../supabase.js'
import { COLORES_PLAN, SIN_PLAN, colorLibre } from './planes.mjs'

// Formulario chico para crear o editar un plan: nombre y color.
function FormPlan({ plan, planes, dias, cerrar, alGuardar }) {
  const [nombre, setNombre] = useState(plan?.nombre ?? '')
  const [color, setColor] = useState(plan?.color ?? colorLibre(planes))
  const [ocupado, setOcupado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [aviso, setAviso] = useState('')

  async function guardar(e) {
    e.preventDefault()
    if (!nombre.trim()) { setAviso('Poné un nombre.'); return }
    setOcupado(true); setAviso('')
    const fila = { nombre: nombre.trim(), color }
    const { error } = plan
      ? await supabase.from('up_planes').update(fila).eq('id', plan.id)
      : await supabase.from('up_planes').insert({ ...fila, orden: Math.max(0, ...planes.map(p => p.orden + 1)) })
    setOcupado(false)
    if (error) { setAviso('No se pudo guardar: ' + error.message); return }
    alGuardar(plan ? `Plan «${fila.nombre}» guardado.` : `Plan «${fila.nombre}» creado. Cargá ideas y elegí este plan.`)
  }

  async function borrar() {
    setOcupado(true)
    const { error } = await supabase.from('up_planes').delete().eq('id', plan.id)
    setOcupado(false)
    if (error) { setAviso('No se pudo borrar: ' + error.message); return }
    alGuardar(dias ? `Plan borrado. Sus ${dias} días quedaron en «Sin plan».` : 'Plan borrado.')
  }

  return (
    <form className="up-plan-form" onSubmit={guardar}>
      <input className="up-campo" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del plan" aria-label="Nombre del plan" autoFocus maxLength={60} />
      <div className="up-plan-colores" role="radiogroup" aria-label="Color">
        {COLORES_PLAN.map(c => (
          <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={`Color ${c}`} className={c === color ? 'on' : ''} style={{ '--p': c }} onClick={() => setColor(c)} />
        ))}
      </div>
      {aviso && <p role="alert" className="up-error">{aviso}</p>}
      {borrando ? (
        <div className="up-plan-confirmar">
          <p>¿Borrar «{plan.nombre}»?{dias ? ` Sus ${dias} días no se borran: pasan a «Sin plan».` : ''}</p>
          <div className="up-acciones up-acciones-izq">
            <button type="button" className="up-btn" disabled={ocupado} onClick={() => setBorrando(false)}>No</button>
            <button type="button" className="up-btn up-btn-borrar" disabled={ocupado} onClick={borrar}>Sí, borrar</button>
          </div>
        </div>
      ) : (
        <div className="up-acciones up-acciones-izq">
          <button type="submit" className="up-btn up-btn-p" disabled={ocupado}>{plan ? 'Guardar' : 'Crear'}</button>
          <button type="button" className="up-btn" disabled={ocupado} onClick={cerrar}>Cancelar</button>
          {plan && <button type="button" className="up-link up-plan-borrar" disabled={ocupado} onClick={() => setBorrando(true)}>Borrar plan</button>}
        </div>
      )}
    </form>
  )
}

// Panel derecho del Calendario: los planes como los calendarios de Google, se tildan para verlos o no.
export default function Planes({ planes, cuentas, sinPlanVisible, alternar, alternarSinPlan, soloEste, recargar }) {
  const [editando, setEditando] = useState(null) // id del plan | 'nuevo' | null
  const [aviso, setAviso] = useState('')

  function listo(texto) { setEditando(null); setAviso(texto); recargar() }

  return (
    <aside className="up-planes" aria-label="Planes de trabajo">
      <div className="up-vol">Planes de trabajo</div>
      {aviso && <p role="status" className="up-plan-aviso">{aviso}</p>}
      <ul className="up-plan-lista">
        {planes.map(p => (
          <li key={p.id} className="up-plan" style={{ '--p': p.color }}>
            {editando === p.id ? (
              <FormPlan plan={p} planes={planes} dias={cuentas[p.id] || 0} cerrar={() => setEditando(null)} alGuardar={listo} />
            ) : (
              <>
                <label className="up-plan-fila">
                  <input type="checkbox" checked={p.visible} onChange={() => alternar(p)} />
                  <span className="up-plan-caja" aria-hidden="true" />
                  <span className="up-plan-nombre">{p.nombre}</span>
                  <small>{cuentas[p.id] || 0}</small>
                </label>
                <span className="up-plan-acciones">
                  <button className="up-plan-ico" onClick={() => soloEste(p)} title="Ver solo este plan" aria-label={`Ver solo ${p.nombre}`}>◉</button>
                  <button className="up-plan-ico" onClick={() => { setEditando(p.id); setAviso('') }} title="Editar plan" aria-label={`Editar ${p.nombre}`}>✎</button>
                </span>
              </>
            )}
          </li>
        ))}
        {cuentas[SIN_PLAN] > 0 && (
          <li className="up-plan" style={{ '--p': '#9A958A' }}>
            <label className="up-plan-fila">
              <input type="checkbox" checked={sinPlanVisible} onChange={alternarSinPlan} />
              <span className="up-plan-caja" aria-hidden="true" />
              <span className="up-plan-nombre up-plan-sin">Sin plan</span>
              <small>{cuentas[SIN_PLAN]}</small>
            </label>
          </li>
        )}
      </ul>
      {editando === 'nuevo'
        ? <FormPlan planes={planes} cerrar={() => setEditando(null)} alGuardar={listo} />
        : <button className="up-btn up-plan-nuevo" onClick={() => { setEditando('nuevo'); setAviso('') }}>+ Nuevo plan</button>}
      <p className="up-nota-chica">Destildar un plan solo lo saca de la vista: los agentes siguen escribiendo sus días. Para que un día no se escriba, abrilo y tocá Saltear.</p>
    </aside>
  )
}
