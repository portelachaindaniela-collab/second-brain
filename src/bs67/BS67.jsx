import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import Mascota from '../Mascota.jsx'
import { NOMBRE_APP, SUGERENCIAS, tituloDe, agruparCharlas, filtrarCharlas, paraGuardar, funcionDe, cuerpoPregunta, cuerpoAccion } from './charlas.mjs'
import './bs67.css'

// BS67: el mismo asistente en las tres apps (BS67/Second Brain, UP y PDG comercial). Las charlas quedan guardadas
// (bs67_charlas) y se retoman desde el menú; las acciones que cambian algo solo se hacen con Confirmar.
const NOMBRE_HERRAMIENTA = {
  resumen_del_dia: 'tu día', ver_proyectos: 'proyectos', ver_tareas: 'tareas', ver_agenda: 'agenda', ver_mails: 'mails', buscar_docs: 'docs',
  leer_doc: 'un doc', ver_cursos: 'cursos', ver_archivos: 'archivos', ver_eventos_para_ir: 'eventos', ver_noticias: 'Mi nicho',
  estado_trabajadores: 'trabajadores', ver_up: 'UP', ver_cuentas_pdg: 'cuentas de PDG', ver_trabajos_pdg: 'trabajos de PDG', leer_manual_pdg: 'el Manual',
  buscar_charlas: 'charlas anteriores', buscar_web: 'internet', leer_link: 'un link', estado_hoy: 'hoy en UP', pendientes: 'pendientes',
  ver_calendario: 'el calendario', ver_planes: 'planes', ver_borrador: 'un borrador', buscar_ficha: 'la Ficha', estado_noruega: 'Noruega',
}
const RETOMAR_HORAS = 12
const leerLocal = (k, porDefecto = null) => { try { return localStorage.getItem(k) ?? porDefecto } catch { return porDefecto } }
const guardarLocal = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }
const angosta = () => typeof window !== 'undefined' && window.innerWidth < 700

async function invocar(app, body) {
  const { data, error } = await supabase.functions.invoke(funcionDe(app), { body })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) throw new Error(r?.error || 'BS67 no respondió. Probá de nuevo en un momento.')
  return r
}

function Texto({ texto }) {
  return texto.split(/(https?:\/\/[^\s)]+)/g).map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p))
}

export default function BS67({ app = 'bs67', pantalla = null, proyectoId = null, alCambiar }) {
  const [abierto, setAbierto] = useState(false)
  const [menu, setMenu] = useState(() => !angosta() && leerLocal('bs67-menu', '1') === '1')
  const [charlas, setCharlas] = useState([])
  const [charlaId, setCharlaId] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [renombrando, setRenombrando] = useState(null) // { id, titulo }
  const [borrando, setBorrando] = useState(null) // id
  const [aviso, setAviso] = useState('')
  const mensajesRef = useRef([])
  const charlaRef = useRef(null)
  const ocupado = useRef(false)
  const final = useRef(null)
  const entrada = useRef(null)
  const boton = useRef(null)
  const abiertaUnaVez = useRef(false)

  const ponerMensajes = m => { mensajesRef.current = m; setMensajes(m) }
  const ponerCharla = id => { charlaRef.current = id; setCharlaId(id); guardarLocal(`bs67-charla-${app}`, id) }

  const cargarCharlas = useCallback(async () => {
    const { data, error } = await supabase.from('bs67_charlas').select('id,app,titulo,updated_at').order('updated_at', { ascending: false }).limit(200)
    if (error) { setAviso('No pude cargar tus charlas: ' + error.message); return [] }
    setCharlas(data || [])
    return data || []
  }, [])

  async function abrirCharla(id) {
    setAviso(''); setBorrando(null); setRenombrando(null)
    const { data, error } = await supabase.from('bs67_charlas').select('id,mensajes').eq('id', id).maybeSingle()
    if (error || !data) { setAviso('No pude abrir esa charla.'); return }
    ponerCharla(id); ponerMensajes(Array.isArray(data.mensajes) ? data.mensajes : [])
    if (angosta()) setMenu(false)
    setTimeout(() => entrada.current?.focus(), 0)
  }

  function nuevaCharla() {
    ponerCharla(null); ponerMensajes([]); setAviso(''); setTexto('')
    if (angosta()) setMenu(false)
    setTimeout(() => entrada.current?.focus(), 0)
  }

  // Al abrir por primera vez: retoma la última charla de esta app si es reciente; si no, arranca una nueva.
  useEffect(() => {
    if (!abierto || abiertaUnaVez.current) return
    abiertaUnaVez.current = true
    cargarCharlas().then(lista => {
      const ultima = leerLocal(`bs67-charla-${app}`)
      const c = lista.find(x => x.id === ultima)
      if (c && Date.now() - Date.parse(c.updated_at) < RETOMAR_HORAS * 3_600_000) abrirCharla(c.id)
    })
  }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (abierto) final.current?.scrollIntoView({ block: 'end' }) }, [abierto, mensajes, consultando])
  useEffect(() => { if (abierto) entrada.current?.focus() }, [abierto])

  // Guarda la charla (la crea con el primer mensaje) y la sube arriba en el menú.
  async function guardar(lista) {
    const titulo = tituloDe(lista)
    const fila = { mensajes: paraGuardar(lista), updated_at: new Date().toISOString() }
    if (charlaRef.current) {
      const actual = charlas.find(c => c.id === charlaRef.current)
      const cambios = actual && actual.titulo !== 'Charla nueva' ? fila : { ...fila, titulo }
      const { error } = await supabase.from('bs67_charlas').update(cambios).eq('id', charlaRef.current)
      if (error) { setAviso('No pude guardar la charla: ' + error.message); return }
      setCharlas(cs => [{ ...cs.find(c => c.id === charlaRef.current), ...cambios, id: charlaRef.current, mensajes: undefined }, ...cs.filter(c => c.id !== charlaRef.current)])
    } else {
      const { data, error } = await supabase.from('bs67_charlas').insert({ app, titulo, ...fila }).select('id,app,titulo,updated_at').single()
      if (error) { setAviso('No pude guardar la charla: ' + error.message); return }
      ponerCharla(data.id)
      setCharlas(cs => [data, ...cs])
    }
  }

  async function conBS67(tarea) {
    if (ocupado.current) return
    ocupado.current = true; setConsultando(true)
    try { await tarea() } catch (e) {
      const lista = [...mensajesRef.current, { rol: 'error', texto: e.message || 'No pude completar la consulta.' }]
      ponerMensajes(lista); await guardar(lista)
    } finally { ocupado.current = false; setConsultando(false); entrada.current?.focus() }
  }

  function enviar(valor = texto) {
    const mensaje = valor.trim()
    if (!mensaje || ocupado.current) return
    const previos = mensajesRef.current
    const lista = [...previos, { rol: 'user', texto: mensaje, at: new Date().toISOString() }]
    ponerMensajes(lista); setTexto('')
    conBS67(async () => {
      const r = await invocar(app, cuerpoPregunta(app, { mensaje, mensajes: previos, pantalla, proyectoId }))
      const nueva = [...mensajesRef.current, { rol: 'bot', texto: r.respuesta || '', propuesta: r.propuesta || null, herramientas: r.herramientas || [], at: new Date().toISOString() }]
      ponerMensajes(nueva); await guardar(nueva)
    })
  }

  function decidir(i, confirmar) {
    const p = mensajesRef.current[i].propuesta
    const marcar = (lista, decision) => lista.map((m, j) => (j === i ? { ...m, decision } : m))
    if (!confirmar) {
      const lista = [...marcar(mensajesRef.current, 'cancelada'), { rol: 'bot', texto: 'Listo, no hice nada.' }]
      ponerMensajes(lista); guardar(lista); return
    }
    ponerMensajes(marcar(mensajesRef.current, 'confirmando'))
    conBS67(async () => {
      try {
        const r = await invocar(app, cuerpoAccion(app, p))
        const lista = [...marcar(mensajesRef.current, 'confirmada'), { rol: 'bot', texto: r.respuesta, at: new Date().toISOString() }]
        ponerMensajes(lista); await guardar(lista)
        alCambiar?.()
      } catch (e) {
        ponerMensajes(marcar(mensajesRef.current, undefined))
        throw e
      }
    })
  }

  async function renombrar(e) {
    e.preventDefault()
    const titulo = renombrando.titulo.trim().slice(0, 80)
    if (!titulo) { setRenombrando(null); return }
    const { error } = await supabase.from('bs67_charlas').update({ titulo }).eq('id', renombrando.id)
    if (error) { setAviso('No pude renombrarla: ' + error.message); return }
    setCharlas(cs => cs.map(c => (c.id === renombrando.id ? { ...c, titulo } : c)))
    setRenombrando(null)
  }

  async function borrar(id) {
    const { error } = await supabase.from('bs67_charlas').delete().eq('id', id)
    if (error) { setAviso('No pude borrarla: ' + error.message); return }
    setCharlas(cs => cs.filter(c => c.id !== id)); setBorrando(null)
    if (id === charlaRef.current) nuevaCharla()
  }

  function alternarMenu() { setMenu(v => { if (!angosta()) guardarLocal('bs67-menu', v ? '0' : '1'); return !v }) }
  function cerrar() { setAbierto(false); boton.current?.focus() }

  const grupos = agruparCharlas(filtrarCharlas(charlas, busqueda))
  const recientes = charlas.slice(0, 3)
  const actual = charlas.find(c => c.id === charlaId)

  return (
    <div className={`bs67 bs67-app-${app}`} onKeyDown={e => { if (e.key === 'Escape' && abierto) { e.stopPropagation(); cerrar() } }}>
      {abierto && (
        <section className={`bs67-panel${menu ? ' con-menu' : ''}`} role="dialog" aria-label="BS67">
          {menu && (
            <nav className="bs67-menu" aria-label="Charlas">
              <button className="bs67-nueva" onClick={nuevaCharla}>+ Nueva charla</button>
              <input className="bs67-buscar" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar charlas" aria-label="Buscar charlas" />
              <div className="bs67-lista">
                {!charlas.length && <p className="bs67-menu-vacio">Tus charlas van a quedar acá.</p>}
                {charlas.length > 0 && !grupos.length && <p className="bs67-menu-vacio">No hay charlas con ese nombre.</p>}
                {grupos.map(g => (
                  <div key={g.titulo} className="bs67-grupo">
                    <h4>{g.titulo}</h4>
                    {g.charlas.map(c => (
                      <div key={c.id} className={`bs67-item${c.id === charlaId ? ' on' : ''}`}>
                        {renombrando?.id === c.id ? (
                          <form onSubmit={renombrar} className="bs67-renombrar">
                            <input autoFocus value={renombrando.titulo} onChange={e => setRenombrando({ ...renombrando, titulo: e.target.value })} onBlur={renombrar} aria-label="Nombre de la charla" maxLength={80} />
                          </form>
                        ) : borrando === c.id ? (
                          <div className="bs67-borrar">
                            <span>¿Borrar?</span>
                            <button onClick={() => borrar(c.id)} className="si">Sí</button>
                            <button onClick={() => setBorrando(null)}>No</button>
                          </div>
                        ) : (
                          <>
                            <button className="bs67-item-abrir" onClick={() => abrirCharla(c.id)} title={c.titulo}>
                              <span>{c.titulo}</span>
                              {c.app !== app && <small>{NOMBRE_APP[c.app] ?? c.app}</small>}
                            </button>
                            <span className="bs67-item-acciones">
                              <button onClick={() => setRenombrando({ id: c.id, titulo: c.titulo })} aria-label={`Renombrar «${c.titulo}»`} title="Renombrar">✎</button>
                              <button onClick={() => setBorrando(c.id)} aria-label={`Borrar «${c.titulo}»`} title="Borrar">🗑</button>
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </nav>
          )}

          <div className="bs67-charla">
            <header className="bs67-cab">
              <button className="bs67-ico" onClick={alternarMenu} aria-label={menu ? 'Ocultar charlas' : 'Ver charlas'} aria-expanded={menu} title="Charlas">☰</button>
              <span className="bs67-cab-mascota"><Mascota /></span>
              <div className="bs67-cab-titulo">
                <strong>{actual?.titulo ?? 'BS67'}</strong>
                <small>Tu asistente en {NOMBRE_APP[app]}{actual ? '' : ' · charla nueva'}</small>
              </div>
              <button className="bs67-ico" onClick={nuevaCharla} disabled={!mensajes.length} aria-label="Nueva charla" title="Nueva charla">＋</button>
              <button className="bs67-ico" onClick={cerrar} aria-label="Cerrar">×</button>
            </header>

            <div className="bs67-mensajes" role="log" aria-live="polite">
              {!mensajes.length && (
                <div className="bs67-bienvenida">
                  <p><b>¡Hola! Soy BS67.</b> Estoy en las tres apps y me acuerdo de lo que hablamos. Puedo leer tu información, buscar en internet y hacer cambios con tu OK.</p>
                  <div className="bs67-sugerencias">{SUGERENCIAS[app].map(s => <button key={s} onClick={() => enviar(s)} disabled={consultando}>{s}</button>)}</div>
                  {recientes.length > 0 && (
                    <div className="bs67-retomar">
                      <span>Seguí una charla</span>
                      {recientes.map(c => <button key={c.id} onClick={() => abrirCharla(c.id)}>{c.titulo}{c.app !== app && <small> · {NOMBRE_APP[c.app]}</small>}</button>)}
                    </div>
                  )}
                </div>
              )}
              {mensajes.map((m, i) => (
                <div key={i} className={`bs67-msj m-${m.rol}`}>
                  {m.texto && <p><Texto texto={m.texto} /></p>}
                  {m.herramientas?.length > 0 && <small className="bs67-uso">miró: {[...new Set(m.herramientas.map(h => NOMBRE_HERRAMIENTA[h] || h))].join(' · ')}</small>}
                  {m.propuesta && (
                    <div className="bs67-propuesta">
                      <span>Necesito tu OK</span>
                      <p>{m.propuesta.descripcion}</p>
                      {!m.decision && <div className="bs67-propuesta-acciones">
                        <button onClick={() => decidir(i, false)} disabled={consultando}>Cancelar</button>
                        <button className="p" onClick={() => decidir(i, true)} disabled={consultando}>Confirmar</button>
                      </div>}
                      {m.decision && <small className="bs67-uso">{{ confirmando: 'haciéndolo…', confirmada: 'confirmado', cancelada: 'cancelado' }[m.decision]}</small>}
                    </div>
                  )}
                </div>
              ))}
              {consultando && <p className="bs67-pensando" role="status">Pensando<i>.</i><i>.</i><i>.</i></p>}
              {aviso && <p className="bs67-aviso" role="alert">{aviso}</p>}
              <div ref={final} />
            </div>

            <form className="bs67-pie" onSubmit={e => { e.preventDefault(); enviar() }}>
              <textarea ref={entrada} rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribile a BS67 o pegá un link…" maxLength={8000} aria-label="Mensaje para BS67"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} />
              <button type="submit" disabled={consultando || !texto.trim()} aria-label="Enviar">↑</button>
            </form>
          </div>
        </section>
      )}
      <button ref={boton} className={`bs67-lanzador${abierto ? ' abierto' : ''}`} onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-label={abierto ? 'Cerrar BS67' : 'Conversar con BS67'} aria-expanded={abierto} title="BS67">
        <Mascota /><span>BS67</span>
      </button>
    </div>
  )
}
