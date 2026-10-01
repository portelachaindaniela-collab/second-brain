import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { ESTADOS_EVENTO, VEREDICTO_TEXTO, aInputLocal, desdeInputLocal, fechaEvento, textoCalculo, esPasado, reglasMasNuevas } from '../eventos.mjs'
import { horaAR } from '../trabajadores.mjs'
import { CabeceraPantalla, Bloques, Bloque, Pie } from '../estructura.jsx'
import './Trabajadores.css'
import './Eventos.css'

const VACIO = { nombre: '', inicio: '', fin: '', lugar: '', direccion: '', url: '', tiene_entrada: false, precio: '', agenda: '' }
const FILTROS = [{ id: 'proximos', label: 'próximos' }, { id: 'pasados', label: 'pasados' }, { id: 'todos', label: 'todos' }]
const etiquetaEstado = id => ESTADOS_EVENTO.find(e => e.id === id)?.label || id

function useReloj() {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30_000)
    return () => clearInterval(reloj)
  }, [])
  return ahora
}

async function mensajeDeError(error, data) {
  if (data?.error) return data.error
  if (error?.context) { try { return (await error.context.json()).error || error.message } catch { /* queda el mensaje genérico */ } }
  return error?.message || 'error desconocido'
}

function FormEvento({ evento, cerrar, guardado, borrado }) {
  const [f, setF] = useState(() => evento ? {
    nombre: evento.nombre, inicio: aInputLocal(evento.inicio_at), fin: aInputLocal(evento.fin_at), lugar: evento.lugar || '',
    direccion: evento.direccion || '', url: evento.url || '', tiene_entrada: evento.tiene_entrada, precio: evento.precio || '', agenda: evento.agenda || '',
  } : VACIO)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const campo = k => e => setF(prev => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function guardar() {
    setMensaje('')
    const inicio = desdeInputLocal(f.inicio)
    const fin = desdeInputLocal(f.fin)
    if (!f.nombre.trim()) { setMensaje('falta el nombre.'); return }
    if (!inicio) { setMensaje('falta la fecha y hora de inicio.'); return }
    if (fin && fin < inicio) { setMensaje('el fin es anterior al inicio.'); return }
    const fila = {
      nombre: f.nombre.trim(), inicio_at: inicio, fin_at: fin, lugar: f.lugar.trim() || null, direccion: f.direccion.trim() || null,
      url: f.url.trim() || null, tiene_entrada: f.tiene_entrada, precio: f.tiene_entrada ? f.precio.trim() || null : null, agenda: f.agenda.trim() || null,
    }
    setOcupado(true)
    const consulta = evento ? supabase.from('eventos').update(fila).eq('id', evento.id) : supabase.from('eventos').insert(fila)
    const { data, error } = await consulta.select().single()
    setOcupado(false)
    if (error) { setMensaje('no se pudo guardar: ' + error.message); return }
    guardado(data)
  }

  async function borrar() {
    setOcupado(true)
    const { error } = await supabase.from('eventos').delete().eq('id', evento.id)
    setOcupado(false)
    if (error) { setMensaje('no se pudo borrar: ' + error.message); return }
    borrado(evento.id)
  }

  return <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && !ocupado && cerrar()}>
    <div className="modal consola-modal">
      <div className="modal-head">
        <h3>{evento ? `editar ${evento.nombre}` : 'nuevo evento'}</h3>
        <button className="close-x" disabled={ocupado} onClick={cerrar}>✕</button>
      </div>
      <div className="modal-body">
        <div className="field"><label>nombre</label><input value={f.nombre} onChange={campo('nombre')} autoFocus /></div>
        <div className="eventos-dos">
          <div className="field"><label>empieza</label><input type="datetime-local" value={f.inicio} onChange={campo('inicio')} /></div>
          <div className="field"><label>termina</label><input type="datetime-local" value={f.fin} onChange={campo('fin')} /></div>
        </div>
        <div className="eventos-dos">
          <div className="field"><label>lugar</label><input value={f.lugar} onChange={campo('lugar')} placeholder="La Rural" /></div>
          <div className="field"><label>dirección</label><input value={f.direccion} onChange={campo('direccion')} placeholder="Av. Sarmiento 2704, CABA" /></div>
        </div>
        <div className="field"><label>url</label><input value={f.url} onChange={campo('url')} placeholder="https://" /></div>
        <div className="eventos-dos">
          <label className="eventos-check"><input type="checkbox" checked={f.tiene_entrada} onChange={campo('tiene_entrada')} /> tiene entrada</label>
          {f.tiene_entrada && <div className="field"><label>cuánto sale</label><input value={f.precio} onChange={campo('precio')} placeholder="$8000" /></div>}
        </div>
        <div className="field"><label>agenda (pegala como venga)</label>
          <textarea className="consola-parametros" rows={8} value={f.agenda} onChange={campo('agenda')} spellCheck={false} />
        </div>
        {mensaje && <p className="feedback-error" role="alert">{mensaje}</p>}
      </div>
      <div className="modal-foot">
        {evento && (confirmarBorrar
          ? <span className="eventos-borrar"><span className="txt-error">{evento.origen && evento.origen !== 'manual' ? `lo trajo el buscador (${evento.origen}): si lo borrás vuelve mañana, mejor [descartar]. ¿borrar igual?` : '¿borrar?'}</span> <button className="consola-boton" disabled={ocupado} onClick={borrar}>[sí, borrar]</button> <button className="consola-boton" disabled={ocupado} onClick={() => setConfirmarBorrar(false)}>[no]</button></span>
          : <button className="consola-boton eventos-borrar" disabled={ocupado} onClick={() => setConfirmarBorrar(true)}>[borrar]</button>)}
        <button className="consola-boton" disabled={ocupado} onClick={cerrar}>[cancelar]</button>
        <button className="consola-boton consola-boton-fuerte" disabled={ocupado} onClick={guardar}>{ocupado ? '[guardando…]' : '[guardar]'}</button>
      </div>
    </div>
  </div>
}

function EditarReglas({ reglas, cerrar, guardado }) {
  const [texto, setTexto] = useState(reglas?.contenido || '')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const cambiado = texto !== (reglas?.contenido || '')

  async function guardar() {
    if (!texto.trim()) { setMensaje('las reglas no pueden quedar vacías.'); return }
    setOcupado(true); setMensaje('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('reglas_personales').upsert({ owner_id: user.id, contenido: texto }).select().single()
    setOcupado(false)
    if (error) { setMensaje('no se pudo guardar: ' + error.message); return }
    guardado(data)
  }

  return <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && !ocupado && !cambiado && cerrar()}>
    <div className="modal consola-modal eventos-modal-ancho">
      <div className="modal-head">
        <h3>reglas-personales.md</h3>
        <button className="close-x" disabled={ocupado} onClick={cerrar}>✕</button>
      </div>
      <div className="modal-body">
        <p className="hint">Es el único criterio de la evaluación. Lo que guardes acá lo usa la próxima evaluación, sin tocar código.
          {reglas?.updated_at && <> Última edición: {new Date(reglas.updated_at).toLocaleString('es-AR')}.</>}</p>
        <textarea className="consola-parametros eventos-reglas" value={texto} onChange={e => setTexto(e.target.value)} spellCheck={false} />
        {mensaje && <p className="feedback-error" role="alert">{mensaje}</p>}
      </div>
      <div className="modal-foot">
        <button className="consola-boton" disabled={ocupado} onClick={cerrar}>{cambiado ? '[descartar cambios]' : '[cerrar]'}</button>
        <button className="consola-boton consola-boton-fuerte" disabled={ocupado || !cambiado} onClick={guardar}>{ocupado ? '[guardando…]' : '[guardar]'}</button>
      </div>
    </div>
  </div>
}

function Veredicto({ v, evento, reglas }) {
  const plan = v.plan
  return <div className="eventos-veredicto">
    <div className="consola-linea eventos-envuelve">
      <span className={`consola-etiqueta eventos-tag eventos-tag-${v.veredicto}`}>{VEREDICTO_TEXTO[v.veredicto]}</span>
      <strong>{v.motivo}</strong>
    </div>
    {v.razonamiento && <p className="eventos-razon">{v.razonamiento}</p>}
    {v.calculo_evento_entero && <div className="consola-linea eventos-envuelve">
      <span className="consola-etiqueta">calc</span>
      <span>{textoCalculo(v.calculo_evento_entero)}{v.calculo_plan && <span className="tenue"> · entero</span>}</span>
    </div>}
    {v.calculo_plan && <div className="consola-linea eventos-envuelve">
      <span className="consola-etiqueta" />
      <span>{textoCalculo(v.calculo_plan)} <span className="tenue">· recortado</span></span>
    </div>}
    {(v.viaje_detalle || v.preparacion_supuesta) && <div className="consola-linea eventos-envuelve">
      <span className="consola-etiqueta" />
      <span className="tenue">{v.viaje_detalle}{v.preparacion_supuesta && ' · el tiempo de prepararte es supuesto: las reglas no lo dicen'}</span>
    </div>}
    {plan && <div className="consola-linea eventos-envuelve">
      <span className="consola-etiqueta">plan</span>
      <span>{[plan.franja, plan.salir_de_casa && `salís ${plan.salir_de_casa}`, plan.llegar && `llegás ${plan.llegar}`, plan.volver && `te volvés ${plan.volver}`].filter(Boolean).join(' · ')}</span>
    </div>}
    {v.agenda && <div className="eventos-agenda">
      {v.agenda.vale.map((a, i) => <div key={`v${i}`} className="consola-linea eventos-envuelve"><span className="consola-etiqueta txt-ok">{i === 0 ? 'vale' : ''}</span><span>{a.item}{a.por_que && <span className="tenue"> — {a.por_que}</span>}</span></div>)}
      {v.agenda.saltear.map((a, i) => <div key={`s${i}`} className="consola-linea eventos-envuelve"><span className="consola-etiqueta tenue">{i === 0 ? 'skip' : ''}</span><span className="tenue">{a.item}{a.por_que && ` — ${a.por_que}`}</span></div>)}
    </div>}
    <div className="tenue eventos-pie">evaluado {new Date(evento.evaluado_at).toLocaleDateString('es-AR')} {horaAR(Date.parse(evento.evaluado_at))}
      {reglasMasNuevas(evento, reglas?.updated_at) && <span className="txt-corriendo"> · editaste las reglas después: re-evaluá para usarlas</span>}</div>
  </div>
}

function FilaEvento({ evento, reglas, editar, actualizado }) {
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState('')

  async function evaluar() {
    setOcupado('evaluar'); setAviso('')
    const { data, error } = await supabase.functions.invoke('evaluar-evento', { body: { evento_id: evento.id } })
    setOcupado('')
    if (error || !data?.evento) { setAviso(await mensajeDeError(error, data)); return }
    actualizado(data.evento)
  }

  async function marcar(estado) {
    setOcupado(estado); setAviso('')
    const { data, error } = await supabase.from('eventos').update({ estado }).eq('id', evento.id).select().single()
    setOcupado('')
    if (error) { setAviso('no se pudo cambiar: ' + error.message); return }
    actualizado(data)
  }

  const lugar = [evento.lugar, evento.direccion].filter(Boolean).join(' · ')
  const entrada = evento.tiene_entrada ? `entrada ${evento.precio || 'sin precio'}` : 'libre'
  return <section className="consola-fila eventos-fila">
    <div className="eventos-fecha tenue">{fechaEvento(evento.inicio_at, evento.fin_at)}</div>
    <div className="consola-fila-cuerpo">
      <div className="consola-titulo">
        <strong>{evento.url ? <a href={evento.url} target="_blank" rel="noreferrer">{evento.nombre}</a> : evento.nombre}</strong>
        <span className={`eventos-estado eventos-estado-${evento.estado}`}>{etiquetaEstado(evento.estado)}</span>
      </div>
      <div className="tenue eventos-envuelve">{[lugar, entrada, evento.agenda && 'agenda cargada', evento.origen && evento.origen !== 'manual' && `vía ${evento.origen}`].filter(Boolean).join(' · ')}</div>
      {evento.veredicto ? <Veredicto v={evento.veredicto} evento={evento} reglas={reglas} /> : <div className="tenue">sin evaluar.</div>}
      <div className="consola-acciones">
        <button className="consola-boton" disabled={!!ocupado} onClick={evaluar}>{ocupado === 'evaluar' ? '[evaluando…]' : evento.veredicto ? '[re-evaluar]' : '[evaluar]'}</button>
        <button className="consola-boton" disabled={!!ocupado} onClick={editar}>[editar]</button>
        {evento.estado !== 'fui' && <button className="consola-boton" disabled={!!ocupado} onClick={() => marcar('fui')}>[fui]</button>}
        {evento.estado !== 'no_fui' && <button className="consola-boton" disabled={!!ocupado} onClick={() => marcar('no_fui')}>[no fui]</button>}
        {evento.estado !== 'descartado' && <button className="consola-boton" disabled={!!ocupado} onClick={() => marcar('descartado')}>[descartar]</button>}
        {aviso && <span className="txt-error" role="status">{aviso}</span>}
      </div>
    </div>
  </section>
}

export default function Eventos() {
  const [eventos, setEventos] = useState([])
  const [reglas, setReglas] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('proximos')
  const [editando, setEditando] = useState(null)
  const [viendoReglas, setViendoReglas] = useState(false)
  const ahora = useReloj()

  const cargar = useCallback(async () => {
    setError('')
    const [ev, re] = await Promise.all([
      supabase.from('eventos').select('*').order('inicio_at'),
      supabase.from('reglas_personales').select('*').maybeSingle(),
    ])
    setCargando(false)
    if (ev.error) { setError('no se pudieron cargar los eventos: ' + ev.error.message); return }
    setEventos(ev.data || [])
    setReglas(re.data || null)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const actualizado = useCallback(e => setEventos(prev => {
    const resto = prev.filter(x => x.id !== e.id)
    return [...resto, e].sort((a, b) => a.inicio_at.localeCompare(b.inicio_at))
  }), [])

  const visibles = eventos.filter(e => filtro === 'todos' || (filtro === 'pasados') === esPasado(e, ahora))
  if (filtro === 'pasados') visibles.reverse()
  const cuenta = id => eventos.filter(e => e.estado === id).length
  const proximos7 = eventos.filter(e => e.estado !== 'descartado' && Date.parse(e.inicio_at) >= ahora && Date.parse(e.inicio_at) < ahora + 7 * 86_400_000).length
  const grupo = estados => visibles.filter(e => estados.includes(e.estado))
  const porEvaluar = grupo(['anotado']), evaluados = grupo(['evaluado']), decididos = grupo(['fui', 'no_fui', 'descartado'])
  const filas = (lista, vacio) => (cargando ? null : lista.length === 0
    ? <p className="tenue">{vacio}</p>
    : lista.map(e => <FilaEvento key={e.id} evento={e} reglas={reglas} editar={() => setEditando(e)} actualizado={actualizado} />))
  const enFiltro = FILTROS.find(f => f.id === filtro)?.label

  return <div className="consola">
    <CabeceraPantalla sobretitulo="Planes" titulo="Eventos" cargando={cargando}
      subtitulo="Cada plan evaluado con tus reglas personales antes de comprometerte."
      cifras={[
        { valor: cuenta('anotado'), etiqueta: 'anotados', nivel: cuenta('anotado') ? 'aviso' : undefined },
        { valor: cuenta('evaluado'), etiqueta: 'evaluados' },
        { valor: proximos7, etiqueta: 'próximos 7 días' },
      ]} />

    {!cargando && !reglas && <p className="txt-corriendo">no hay reglas cargadas: sin reglas no se puede evaluar. <button className="consola-boton" onClick={() => setViendoReglas(true)}>[cargar reglas]</button></p>}
    {error && <p className="txt-error">{error}</p>}
    {cargando && <p className="tenue">cargando…</p>}

    <Bloques>
      <Bloque titulo="Por evaluar" accion={<button className="consola-boton consola-boton-fuerte" onClick={() => setEditando('nuevo')}>[+ evento]</button>}>
        {filas(porEvaluar, `nada por evaluar en ${enFiltro}.`)}
      </Bloque>
      <Bloque titulo="Evaluados">
        {filas(evaluados, `ningún evaluado en ${enFiltro}.`)}
      </Bloque>
      <Bloque titulo="Decididos" ancho="completo">
        {filas(decididos, `nada decidido en ${enFiltro}: los que marques como fui, no fui o descartado van acá.`)}
      </Bloque>
    </Bloques>

    <Pie titulo="Mostrando" resumen={`eventos ${enFiltro}`} boton="Cambiar">
      <div className="consola-acciones">
        {FILTROS.map(f => <button key={f.id} className={`consola-boton${filtro === f.id ? ' consola-boton-fuerte' : ''}`} onClick={() => setFiltro(f.id)}>{filtro === f.id ? `[${f.label}]` : f.label}</button>)}
        <button className="consola-boton" onClick={cargar}>[recargar]</button>
      </div>
    </Pie>
    <Pie titulo="Reglas personales" boton={reglas ? 'Editar' : 'Cargar'} onBoton={() => setViendoReglas(true)}
      resumen={reglas ? `el criterio de cada evaluación · editadas ${new Date(reglas.updated_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : 'sin cargar: no se puede evaluar'} />

    {editando && <FormEvento evento={editando === 'nuevo' ? null : editando} cerrar={() => setEditando(null)}
      guardado={e => { setEditando(null); actualizado(e) }}
      borrado={id => { setEditando(null); setEventos(prev => prev.filter(x => x.id !== id)) }} />}
    {viendoReglas && <EditarReglas reglas={reglas} cerrar={() => setViendoReglas(false)} guardado={r => { setViendoReglas(false); setReglas(r) }} />}
  </div>
}
