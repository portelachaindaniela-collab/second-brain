import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import Md from './Md.jsx'
import { MANUAL_POR_DEFECTO, AGENTES_POR_DEFECTO } from './datos.js'

function Editable({ titulo, bajada, texto, porDefecto, guardar, filas = 18 }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(texto)
  const [estado, setEstado] = useState('')
  useEffect(() => { setValor(texto) }, [texto])

  async function confirmar() {
    setEstado('Guardando…')
    const error = await guardar(valor)
    setEstado(error ? 'No se pudo guardar: ' + error.message : 'Guardado')
    if (!error) setEditando(false)
  }
  return (
    <section className="pdg-seccion">
      <div className="pdg-barra">
        <h3 className="pdg-h3">{titulo}</h3>
        <span className="pdg-sp" />
        {estado && <small className="pdg-nota">{estado}</small>}
        {!editando && <button className="pdg-btn" onClick={() => { setEditando(true); setEstado('') }}>Editar</button>}
      </div>
      {bajada && <p className="pdg-ayuda">{bajada}</p>}
      {editando ? (
        <>
          <textarea className="pdg-campo pdg-editor" rows={filas} value={valor} onChange={e => setValor(e.target.value)} aria-label={titulo} />
          <div className="pdg-acciones">
            {porDefecto && valor !== porDefecto && <button className="pdg-btn" onClick={() => setValor(porDefecto)}>Volver al original</button>}
            <span className="pdg-sp" />
            <button className="pdg-btn" onClick={() => { setValor(texto); setEditando(false) }}>Cancelar</button>
            <button className="pdg-btn pdg-btn-p" onClick={confirmar}>Guardar</button>
          </div>
        </>
      ) : <div className="pdg-caja-texto"><Md texto={texto} /></div>}
    </section>
  )
}

export default function Manual({ agentes, recargar }) {
  const [manual, setManual] = useState(null)
  const [aviso, setAviso] = useState('')
  const [agente, setAgente] = useState(agentes[0]?.clave)

  useEffect(() => {
    supabase.from('pdg_manual').select('texto').maybeSingle().then(({ data, error }) => {
      if (error) setAviso('No se pudo cargar el manual: ' + error.message)
      else setManual(data?.texto ?? '')
    })
  }, [])

  const a = agentes.find(x => x.clave === agente)
  const original = AGENTES_POR_DEFECTO.find(x => x.clave === agente)
  return (
    <>
      <header className="pdg-enc">
        <h2>Manual comercial</h2>
        <p>Lo que los agentes saben de PDG sale de acá y de nada más. Si el sistema cambia (una liga nueva, la capa de jugadoras, precios), se cambia acá y vale desde el próximo trabajo.</p>
      </header>
      {aviso && <p role="alert" className="pdg-error">{aviso}</p>}
      {manual === null ? <p className="pdg-vacio">Cargando…</p> : (
        <Editable titulo="Qué es PDG y qué se vende" texto={manual} porDefecto={MANUAL_POR_DEFECTO} filas={28}
          guardar={async v => { const { error } = await supabase.from('pdg_manual').update({ texto: v }).not('owner_id', 'is', null); if (!error) setManual(v); return error }} />
      )}
      <div className="pdg-chips pdg-chips-agentes">
        {agentes.map(x => <button key={x.clave} className={agente === x.clave ? 'on' : ''} onClick={() => setAgente(x.clave)}>{x.nombre}</button>)}
      </div>
      {a && (
        <Editable key={a.clave} titulo={`Instrucciones: ${a.nombre}`} bajada={a.rol} texto={a.instrucciones} porDefecto={original?.instrucciones}
          guardar={async v => { const { error } = await supabase.from('pdg_agentes').update({ instrucciones: v }).eq('clave', a.clave); if (!error) recargar(); return error }} />
      )}
    </>
  )
}
