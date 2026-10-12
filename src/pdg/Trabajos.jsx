import { useState } from 'react'
import { supabase } from '../supabase.js'
import Md from './Md.jsx'
import { AGENTES_INFO, extraerIdeas } from './comercial.mjs'
import { correrAgente, mandarAUp } from './datos.js'

const ESTADO = { borrador: 'Borrador', aprobado: 'Aprobado', descartado: 'Descartado' }
const fechaCorta = iso => new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function IdeasParaUp({ texto }) {
  const [enviadas, setEnviadas] = useState({})
  const ideas = extraerIdeas(texto)
  if (!ideas.length) return null
  async function mandar(idea) {
    setEnviadas(e => ({ ...e, [idea]: 'mandando' }))
    try {
      const fecha = await mandarAUp(idea)
      setEnviadas(e => ({ ...e, [idea]: `En UP el ${new Date(`${fecha}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` }))
    } catch (err) {
      setEnviadas(e => ({ ...e, [idea]: 'No se pudo: ' + err.message }))
    }
  }
  return (
    <div className="pdg-ideas">
      <div className="pdg-rotulo">Mandar ideas al calendario de UP</div>
      {ideas.map(idea => (
        <div key={idea} className="pdg-idea">
          <span>{idea}</span>
          {enviadas[idea] && enviadas[idea] !== 'mandando'
            ? <small>{enviadas[idea]}</small>
            : <button className="pdg-btn" disabled={enviadas[idea] === 'mandando'} onClick={() => mandar(idea)}>{enviadas[idea] ? 'Mandando…' : '→ UP'}</button>}
        </div>
      ))}
    </div>
  )
}

export function Trabajo({ trabajo, nombreAgente, cuenta, alCambiar, abierto: abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [copiado, setCopiado] = useState(false)
  const [aviso, setAviso] = useState('')

  async function estado(e) {
    const { error } = await supabase.from('pdg_trabajos').update({ estado: e }).eq('id', trabajo.id)
    if (error) { setAviso('No se pudo guardar: ' + error.message); return }
    alCambiar?.()
  }
  async function borrar() {
    if (!window.confirm('¿Borrar este trabajo?')) return
    const { error } = await supabase.from('pdg_trabajos').delete().eq('id', trabajo.id)
    if (error) { setAviso('No se pudo borrar: ' + error.message); return }
    alCambiar?.()
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(trabajo.texto); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { setAviso('No se pudo copiar.') }
  }

  return (
    <article className={`pdg-trabajo e-${trabajo.estado}${abierto ? ' abierto' : ''}`}>
      <button className="pdg-trabajo-cab" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
        <span className="pdg-trabajo-agente">{nombreAgente || trabajo.agente}</span>
        {cuenta && <span className="pdg-trabajo-cuenta">{cuenta}</span>}
        {trabajo.pedido && <span className="pdg-trabajo-pedido">“{trabajo.pedido}”</span>}
        <span className="pdg-sp" />
        <span className={`pdg-estado e-${trabajo.estado}`}>{ESTADO[trabajo.estado]}</span>
        <span className="pdg-trabajo-fecha">{fechaCorta(trabajo.created_at)}</span>
      </button>
      {abierto && (
        <div className="pdg-trabajo-cuerpo">
          <Md texto={trabajo.texto} />
          {trabajo.agente === 'marketing' && <IdeasParaUp texto={trabajo.texto} />}
          {aviso && <p role="alert" className="pdg-error">{aviso}</p>}
          <div className="pdg-acciones">
            <button className="pdg-btn pdg-btn-borrar" onClick={borrar}>Borrar</button>
            <span className="pdg-sp" />
            <button className="pdg-btn" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</button>
            {trabajo.estado !== 'descartado' && <button className="pdg-btn" onClick={() => estado('descartado')}>Descartar</button>}
            {trabajo.estado !== 'aprobado'
              ? <button className="pdg-btn pdg-btn-p" onClick={() => estado('aprobado')}>Aprobar</button>
              : <button className="pdg-btn" onClick={() => estado('borrador')}>Volver a borrador</button>}
          </div>
          {trabajo.estado !== 'aprobado' && <p className="pdg-nota">Lo aprobado lo leen los demás agentes cuando trabajan con esta cuenta.</p>}
        </div>
      )}
    </article>
  )
}

// Botonera de agentes + pedido. Con cuenta corre cualquiera; sin cuenta solo marketing y objeciones.
export function Lanzador({ agentes, cuentaId, alTerminar }) {
  const disponibles = agentes.filter(a => cuentaId || a.clave === 'marketing' || a.clave === 'objeciones')
  const [elegido, setElegido] = useState(cuentaId ? disponibles[0]?.clave : 'marketing')
  const [pedido, setPedido] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState('')
  const info = AGENTES_INFO[elegido] || {}

  async function correr() {
    setTrabajando(true); setAviso('')
    try {
      const r = await correrAgente(elegido, cuentaId || null, pedido)
      setPedido('')
      if (r.avisoWeb) setAviso(`Ojo: no pude leer su web (${r.avisoWeb}). Trabajé con los datos de la ficha.`)
      alTerminar?.(r.trabajo)
    } catch (e) {
      setAviso(e.message)
    }
    setTrabajando(false)
  }

  return (
    <div className="pdg-lanzador">
      <div className="pdg-chips" role="tablist">
        {disponibles.map(a => (
          <button key={a.clave} role="tab" aria-selected={elegido === a.clave} className={elegido === a.clave ? 'on' : ''} onClick={() => setElegido(a.clave)}>
            {AGENTES_INFO[a.clave]?.corto || a.nombre}
          </button>
        ))}
      </div>
      <p className="pdg-ayuda">{info.ayuda}</p>
      <div className="pdg-lanzador-fila">
        <textarea className="pdg-campo" rows={2} value={pedido} onChange={e => setPedido(e.target.value)} placeholder={`Detalle opcional. ${info.pedido || ''}`} aria-label="Pedido para el agente" />
        <button className="pdg-btn pdg-btn-p pdg-btn-alto" disabled={trabajando || !elegido} onClick={correr}>{trabajando ? 'Trabajando…' : 'Correr'}</button>
      </div>
      {trabajando && <p className="pdg-nota">Puede tardar hasta un minuto{elegido === 'prospector' ? ': primero lee su web' : ''}.</p>}
      {aviso && <p role="alert" className="pdg-error">{aviso}</p>}
    </div>
  )
}
