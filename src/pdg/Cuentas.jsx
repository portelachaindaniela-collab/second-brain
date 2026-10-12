import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { ETAPAS, SEGMENTOS, NOMBRE_ETAPA, NOMBRE_SEGMENTO, hoyISO } from './comercial.mjs'
import { Trabajo, Lanzador } from './Trabajos.jsx'

const VACIA = { nombre: '', segmento: 'club', pais: '', web: '', contacto: '', notas: '', etapa: 'prospecto', proxima_accion: '', proxima_fecha: '' }
const limpiar = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' && k !== 'nombre' ? (v.trim() || null) : v]))

function FormCuenta({ inicial, guardar, cancelar, borrar }) {
  const [f, setF] = useState({ ...VACIA, ...Object.fromEntries(Object.entries(inicial || {}).map(([k, v]) => [k, v ?? ''])) })
  const [ocupado, setOcupado] = useState(false)
  const campo = (k) => ({ value: f[k] ?? '', onChange: e => setF(x => ({ ...x, [k]: e.target.value })) })
  async function enviar(e) {
    e.preventDefault()
    setOcupado(true)
    await guardar(limpiar({ nombre: f.nombre.trim(), segmento: f.segmento, pais: f.pais, web: f.web, contacto: f.contacto, notas: f.notas, etapa: f.etapa, proxima_accion: f.proxima_accion, proxima_fecha: f.proxima_fecha }))
    setOcupado(false)
  }
  return (
    <form className="pdg-form" onSubmit={enviar}>
      <label className="ancho">Nombre<input className="pdg-campo" required {...campo('nombre')} placeholder="Club, liga, agencia, medio o marca" autoFocus={!inicial} /></label>
      <label>Tipo<select className="pdg-campo" {...campo('segmento')}>{SEGMENTOS.map(s => <option key={s} value={s}>{NOMBRE_SEGMENTO[s]}</option>)}</select></label>
      <label>Etapa<select className="pdg-campo" {...campo('etapa')}>{ETAPAS.map(s => <option key={s} value={s}>{NOMBRE_ETAPA[s]}</option>)}</select></label>
      <label>País<input className="pdg-campo" {...campo('pais')} /></label>
      <label>Web<input className="pdg-campo" {...campo('web')} placeholder="ejemplo.com" /></label>
      <label className="ancho">Contacto<input className="pdg-campo" {...campo('contacto')} placeholder="Quién, cargo, cómo llegar" /></label>
      <label className="ancho">Próxima acción<input className="pdg-campo" {...campo('proxima_accion')} placeholder="Ej.: mandar mail de primer contacto" /></label>
      <label>Para cuándo<input type="date" className="pdg-campo" {...campo('proxima_fecha')} /></label>
      <label className="ancho">Notas (los agentes las leen)<textarea className="pdg-campo" rows={4} {...campo('notas')} placeholder="Qué sabés de ellos, qué te dijeron, qué les interesa" /></label>
      <div className="pdg-acciones ancho">
        {borrar && <button type="button" className="pdg-btn pdg-btn-borrar" onClick={borrar}>Borrar cuenta</button>}
        <span className="pdg-sp" />
        <button type="button" className="pdg-btn" onClick={cancelar}>Cancelar</button>
        <button className="pdg-btn pdg-btn-p" disabled={ocupado || !f.nombre.trim()}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

function FichaCuenta({ cuenta, agentes, volver, alCambiar }) {
  const [c, setC] = useState(cuenta)
  const [editando, setEditando] = useState(false)
  const [trabajos, setTrabajos] = useState(null)
  const [nuevo, setNuevo] = useState(null)
  const [aviso, setAviso] = useState('')
  const nombres = Object.fromEntries(agentes.map(a => [a.clave, a.nombre]))

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('pdg_trabajos').select('*').eq('cuenta_id', cuenta.id).order('created_at', { ascending: false })
    if (error) { setAviso('No se pudieron cargar los trabajos: ' + error.message); return }
    setTrabajos(data || [])
  }, [cuenta.id])
  useEffect(() => { cargar() }, [cargar])

  async function guardar(cambios) {
    const { data, error } = await supabase.from('pdg_cuentas').update(cambios).eq('id', c.id).select('*').single()
    if (error) { setAviso('No se pudo guardar: ' + error.message); return }
    setC(data); setEditando(false); alCambiar()
  }
  async function moverEtapa(etapa) {
    await guardar({ etapa })
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar ${c.nombre} y todo lo que escribieron los agentes para esta cuenta?`)) return
    const { error } = await supabase.from('pdg_cuentas').delete().eq('id', c.id)
    if (error) { setAviso('No se pudo borrar: ' + error.message); return }
    alCambiar(); volver()
  }

  const hoy = hoyISO()
  return (
    <div className="pdg-ficha">
      <button className="pdg-volver" onClick={volver}>‹ Todas las cuentas</button>
      <header className="pdg-ficha-cab">
        <div>
          <div className="pdg-rotulo">{NOMBRE_SEGMENTO[c.segmento]}{c.pais ? ` · ${c.pais}` : ''}</div>
          <h2>{c.nombre}</h2>
          {c.web && <a className="pdg-web" href={/^https?:/.test(c.web) ? c.web : `https://${c.web}`} target="_blank" rel="noreferrer">{c.web} ↗</a>}
        </div>
        {!editando && <button className="pdg-btn" onClick={() => setEditando(true)}>Editar ficha</button>}
      </header>

      <div className="pdg-etapas" role="group" aria-label="Etapa de la venta">
        {ETAPAS.map(e => <button key={e} className={c.etapa === e ? `on et-${e}` : ''} onClick={() => c.etapa !== e && moverEtapa(e)}>{NOMBRE_ETAPA[e]}</button>)}
      </div>
      {aviso && <p role="alert" className="pdg-error">{aviso}</p>}

      {editando
        ? <FormCuenta inicial={c} guardar={guardar} cancelar={() => setEditando(false)} borrar={borrar} />
        : (
          <div className="pdg-ficha-datos">
            <div className={`pdg-proxima${c.proxima_fecha && c.proxima_fecha < hoy ? ' vencida' : ''}`}>
              <div className="pdg-rotulo">Próxima acción</div>
              {c.proxima_accion || c.proxima_fecha
                ? <p>{c.proxima_accion || 'Sin detalle'}{c.proxima_fecha && <small> · {new Date(`${c.proxima_fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</small>}</p>
                : <p className="pdg-vacio">Nada anotado. <button className="pdg-link" onClick={() => setEditando(true)}>Anotar</button></p>}
            </div>
            {c.contacto && <div><div className="pdg-rotulo">Contacto</div><p>{c.contacto}</p></div>}
            {c.notas && <div className="ancho"><div className="pdg-rotulo">Notas</div><p className="pdg-notas">{c.notas}</p></div>}
          </div>
        )}

      <section className="pdg-seccion">
        <h3 className="pdg-h3">Agentes</h3>
        <Lanzador agentes={agentes} cuentaId={c.id} alTerminar={t => { setNuevo(t.id); cargar() }} />
      </section>

      <section className="pdg-seccion">
        <h3 className="pdg-h3">Lo que escribieron {trabajos && <span>{trabajos.length}</span>}</h3>
        {!trabajos ? <p className="pdg-vacio">Cargando…</p>
          : trabajos.length === 0 ? <p className="pdg-vacio">Todavía nada. Empezá por Prospectar.</p>
            : trabajos.map(t => <Trabajo key={t.id} trabajo={t} nombreAgente={nombres[t.agente]} alCambiar={cargar} abierto={t.id === nuevo} />)}
      </section>
    </div>
  )
}

export default function Cuentas({ cuentas, agentes, recargar, abrirId, setAbrirId }) {
  const [creando, setCreando] = useState(false)
  const [segmento, setSegmento] = useState('')
  const [verCerradas, setVerCerradas] = useState(false)
  const [aviso, setAviso] = useState('')
  const abierta = cuentas.find(c => c.id === abrirId)

  if (abierta) return <FichaCuenta key={abierta.id} cuenta={abierta} agentes={agentes} volver={() => setAbrirId(null)} alCambiar={recargar} />

  async function crear(datos) {
    const { data, error } = await supabase.from('pdg_cuentas').insert(datos).select('id').single()
    if (error) { setAviso('No se pudo crear: ' + error.message); return }
    setCreando(false); await recargar(); setAbrirId(data.id)
  }

  const visibles = cuentas.filter(c => !segmento || c.segmento === segmento)
  const columnas = ETAPAS.filter(e => verCerradas || (e !== 'ganada' && e !== 'perdida'))
  const hoy = hoyISO()
  return (
    <>
      <div className="pdg-barra">
        <div className="pdg-chips">
          <button className={!segmento ? 'on' : ''} onClick={() => setSegmento('')}>Todas</button>
          {SEGMENTOS.map(s => <button key={s} className={segmento === s ? 'on' : ''} onClick={() => setSegmento(s)}>{NOMBRE_SEGMENTO[s]}</button>)}
        </div>
        <span className="pdg-sp" />
        <label className="pdg-check"><input type="checkbox" checked={verCerradas} onChange={e => setVerCerradas(e.target.checked)} /> Ver ganadas y perdidas</label>
        <button className="pdg-btn pdg-btn-p" onClick={() => setCreando(true)}>+ Nueva cuenta</button>
      </div>
      {aviso && <p role="alert" className="pdg-error">{aviso}</p>}
      {creando && <div className="pdg-caja"><h3 className="pdg-h3">Nueva cuenta</h3><FormCuenta guardar={crear} cancelar={() => setCreando(false)} /></div>}
      {cuentas.length === 0 && !creando
        ? <p className="pdg-vacio">Todavía no hay cuentas. Cargá el primer club, liga, agencia, medio o marca al que le quieras vender el sistema.</p>
        : (
          <div className="pdg-tablero" style={{ '--cols': columnas.length }}>
            {columnas.map(e => {
              const items = visibles.filter(c => c.etapa === e)
              return (
                <section key={e} className={`pdg-col et-${e}`}>
                  <div className="pdg-col-cab"><span>{NOMBRE_ETAPA[e]}</span><span>{items.length}</span></div>
                  {items.map(c => (
                    <button key={c.id} className="pdg-tarjeta" onClick={() => setAbrirId(c.id)}>
                      <strong>{c.nombre}</strong>
                      <span className="pdg-tarjeta-seg">{NOMBRE_SEGMENTO[c.segmento]}{c.pais ? ` · ${c.pais}` : ''}</span>
                      {(c.proxima_accion || c.proxima_fecha) && (
                        <span className={`pdg-tarjeta-prox${c.proxima_fecha && c.proxima_fecha < hoy ? ' vencida' : ''}`}>
                          {c.proxima_fecha ? new Date(`${c.proxima_fecha}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) + ' · ' : ''}{c.proxima_accion || ''}
                        </span>
                      )}
                    </button>
                  ))}
                </section>
              )
            })}
          </div>
        )}
    </>
  )
}
