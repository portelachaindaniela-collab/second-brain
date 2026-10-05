import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso, fechaLarga } from './fechas.js'
import { ESTADOS, NOMBRE_RED, estadoVisible } from './pipeline.js'
import { medir, postsDeX, captionDe, recorte } from './edicion.mjs'

// Mesa de trabajo: el texto de cada red del día en un editor simple y, al lado, cómo se ve en cada red mientras se
// escribe. El asistente puede proponer una versión; entra al editor solo si la dueña la usa, y se guarda al tocar
// Guardar o Aprobar.
const CAMPOS = 'id,fecha,red,texto,estado,assets,assets_texto,url_publicada,error_publicacion,formato:contenido->>formato'
const NOMBRE = 'Daniela Portela Chain'
const USUARIO = 'danielachain'
const PEDIDOS = {
  linkedin: ['Mejorá la primera línea', 'Hacelo más corto', 'Más directo'],
  x: ['Adaptalo a X', 'Armalo como hilo', 'Dejalo en un solo post'],
  instagram: ['Mejorá el caption', 'Hacelo más corto'],
}

const redesDelDia = d => d.redes.filter(r => r !== 'instagram' || d.formato_instagram !== 'ninguno')

// El día que se abre: el pedido (desde el Calendario), si no hoy, si no el próximo con publicación.
function diaInicial(dias, foco) {
  if (foco?.fecha && dias.some(d => d.fecha === foco.fecha)) return foco.fecha
  const hoy = hoyIso()
  return (dias.find(d => d.fecha >= hoy) || dias.at(-1))?.fecha ?? null
}

async function pedirVersion(body) {
  const { data, error } = await supabase.functions.invoke('up-asistente', { body: { redactar: body } })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) return { error: r?.error || 'El asistente no respondió. Probá de nuevo.' }
  return r
}

function Contador({ red, texto }) {
  const m = medir(red, texto)
  const detalle = red === 'x' && m.posts.length > 1 ? ` · hilo de ${m.posts.length}` : ''
  return <span className={m.excede ? 'excede' : ''}>{NOMBRE_RED[red]} <b>{m.usados}</b>/{m.limite}{red === 'x' && m.posts.length > 1 ? ' por post' : ''}{detalle}</span>
}

function Avatar() { return <span className="up-sim-avatar" aria-hidden="true">DP</span> }

// Cómo se ve en cada red. Es una simulación: la tipografía y el corte del «ver más» son aproximados.
function Simulacion({ red, texto, pieza }) {
  const [abierto, setAbierto] = useState(false)
  const [placa, setPlaca] = useState(0)
  const vacio = !texto.trim()
  if (red === 'linkedin') {
    const r = recorte(texto, 210)
    return (
      <article className="up-sim up-sim-in">
        <header><Avatar /><div><b>{NOMBRE}</b><small>Ahora · público</small></div><LogoRed red="linkedin" /></header>
        {vacio ? <p className="up-sim-vacio">Todavía no hay texto para LinkedIn.</p> : (
          <p className="up-sim-texto">{abierto || !r.cortado ? texto.trim() : r.visible}{r.cortado && !abierto && <>… <button className="up-sim-mas" onClick={() => setAbierto(true)}>ver más</button></>}</p>
        )}
        <footer><span>Recomendar</span><span>Comentar</span><span>Compartir</span></footer>
      </article>
    )
  }
  if (red === 'x') {
    const posts = postsDeX(texto)
    return (
      <article className="up-sim up-sim-x">
        {vacio ? <><header><Avatar /><div><b>{NOMBRE}</b> <small>@{USUARIO}</small></div><LogoRed red="x" /></header><p className="up-sim-vacio">Todavía no hay texto para X.</p></> : posts.map((p, i) => {
          const m = medir('x', p)
          return (
            <div key={i} className={`up-sim-tuit${i < posts.length - 1 ? ' sigue' : ''}`}>
              <Avatar />
              <div>
                <div className="up-sim-tuit-cab"><b>{NOMBRE}</b> <small>@{USUARIO} · ahora</small>{i === 0 && <LogoRed red="x" />}</div>
                <p className="up-sim-texto">{p}</p>
                {m.excede && <small className="up-sim-excede">{m.usados}/280: X no lo deja publicar así.</small>}
              </div>
            </div>
          )
        })}
      </article>
    )
  }
  // Instagram: las placas reales cuando el diseñador ya las armó con este mismo texto.
  const placas = pieza?.assets?.length && pieza.assets_texto === texto ? pieza.assets : []
  const caption = captionDe(texto)
  const r = recorte(caption, 125)
  const formato = pieza?.formato || 'carrusel'
  return (
    <article className="up-sim up-sim-ig">
      <header><Avatar /><div><b>{USUARIO}</b></div><LogoRed red="instagram" /></header>
      <div className="up-sim-foto">
        {placas.length ? (
          <>
            <img src={placas[placa] || placas[0]} alt={`Placa ${placa + 1} de ${placas.length}`} />
            {placas.length > 1 && (
              <div className="up-sim-pasar">
                <button disabled={placa === 0} onClick={() => setPlaca(placa - 1)} aria-label="Placa anterior">‹</button>
                <span>{placa + 1}/{placas.length}</span>
                <button disabled={placa >= placas.length - 1} onClick={() => setPlaca(placa + 1)} aria-label="Placa siguiente">›</button>
              </div>
            )}
          </>
        ) : <p>{formato === 'reel' ? 'Reel: el video lo subís vos.' : vacio ? 'Sin placas todavía.' : 'Las placas se arman unos minutos después de guardar este texto.'}</p>}
      </div>
      {vacio ? <p className="up-sim-vacio">Todavía no hay texto para Instagram.</p> : (
        <p className="up-sim-texto"><b>{USUARIO}</b> {abierto || !r.cortado ? caption : r.visible}{r.cortado && !abierto && <>… <button className="up-sim-mas" onClick={() => setAbierto(true)}>más</button></>}</p>
      )}
    </article>
  )
}

export default function Mesa({ foco }) {
  const [dias, setDias] = useState(null)
  const [fecha, setFecha] = useState(null)
  const [piezas, setPiezas] = useState([])
  const [textos, setTextos] = useState({})
  const [red, setRed] = useState(foco?.red || 'linkedin')
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState(null) // { tipo: 'ok' | 'error', texto }
  const [pidiendo, setPidiendo] = useState(false)
  const [pedido, setPedido] = useState('')
  const [propuesta, setPropuesta] = useState(null)
  // En la lista de días: lo que viene y las últimas dos semanas.
  const [desde] = useState(() => new Date(Date.now() - 14 * 86_400_000).toLocaleDateString('en-CA'))

  useEffect(() => {
    supabase.from('up_calendario').select('id,fecha,tema_dia,tema_instagram,redes,formato_instagram,salteado').eq('salteado', false).order('fecha')
      .then(({ data, error }) => {
        if (error) { setAviso({ tipo: 'error', texto: 'No se pudo cargar el calendario: ' + error.message }); setDias([]); return }
        setDias(data || [])
        setFecha(diaInicial(data || [], foco))
      })
  }, [foco])

  const cargarDia = useCallback(async f => {
    const { data, error } = await supabase.from('up_piezas').select(CAMPOS).eq('fecha', f)
    if (error) { setAviso({ tipo: 'error', texto: 'No se pudo cargar el día: ' + error.message }); return }
    setPiezas(data || [])
    setTextos(Object.fromEntries((data || []).map(p => [p.red, p.texto || ''])))
  }, [])

  useEffect(() => { if (fecha) cargarDia(fecha) }, [fecha, cargarDia])

  if (!dias) return <p className="up-vacio">Cargando…</p>
  const dia = dias.find(d => d.fecha === fecha)
  if (!dia) return <p className="up-vacio">No hay días en el calendario. Cargá una idea en Calendario y escribila acá.</p>

  const redes = redesDelDia(dia)
  const activa = redes.includes(red) ? red : redes[0]
  const pieza = r => piezas.find(p => p.red === r)
  const texto = textos[activa] ?? ''
  const actual = pieza(activa)
  const publicada = actual?.estado === 'publicado'
  const sinGuardar = r => (textos[r] ?? '') !== (pieza(r)?.texto || '')
  const opciones = dias.filter(d => d.fecha >= desde || d.fecha === fecha)

  function cambiarDia(f) {
    if (redes.some(sinGuardar) && !window.confirm('Hay cambios sin guardar. ¿Cambiar de día igual?')) return
    setFecha(f); setPropuesta(null); setPidiendo(false); setAviso(null)
  }

  function escribir(valor) { setTextos(t => ({ ...t, [activa]: valor })); setAviso(null) }

  async function guardar(aprobar) {
    const limpio = texto.trim()
    if (!limpio) return
    setOcupado(aprobar ? 'aprobar' : 'guardar'); setAviso(null)
    const estado = aprobar || actual?.estado === 'aprobado' ? 'aprobado' : 'pendiente'
    const cambios = { texto: limpio, estado, problemas: null, motivo_revision: null, error_publicacion: null }
    const { data, error } = actual
      ? await supabase.from('up_piezas').update(cambios).eq('id', actual.id).select(CAMPOS).single()
      : await supabase.from('up_piezas').insert({ ...cambios, fecha: dia.fecha, red: activa, calendario_id: dia.id, contenido: activa === 'instagram' ? { formato: dia.formato_instagram } : null }).select(CAMPOS).single()
    setOcupado('')
    if (error) { setAviso({ tipo: 'error', texto: 'No se pudo guardar: ' + error.message }); return }
    setPiezas(ps => [...ps.filter(p => p.id !== data.id), data])
    setTextos(t => ({ ...t, [activa]: data.texto }))
    setAviso({ tipo: 'ok', texto: aprobar ? `${NOMBRE_RED[activa]} aprobado.` : 'Guardado.' })
  }

  // Lleva el texto de esta red al editor de las otras (sin guardar), para adaptarlo desde ahí.
  function copiarATodas() {
    const otras = redes.filter(r => r !== activa && pieza(r)?.estado !== 'publicado')
    if (!otras.length) return
    if (otras.some(r => (textos[r] ?? '').trim()) && !window.confirm(`Esto reemplaza el texto de ${otras.map(r => NOMBRE_RED[r]).join(' e ')} en el editor (no se guarda hasta que toques Guardar). ¿Seguir?`)) return
    setTextos(t => ({ ...t, ...Object.fromEntries(otras.map(r => [r, texto])) }))
    setAviso({ tipo: 'ok', texto: `Copiado a ${otras.map(r => NOMBRE_RED[r]).join(' e ')}. Adaptalo en cada pestaña y guardá.` })
  }

  async function pedir(valor = pedido) {
    const p = valor.trim()
    if (!p) return
    setOcupado('asistente'); setPropuesta(null); setAviso(null)
    const r = await pedirVersion({ fecha: dia.fecha, red: activa, texto, pedido: p })
    setOcupado('')
    if (r.error) { setAviso({ tipo: 'error', texto: r.error }); return }
    setPropuesta({ red: activa, texto: r.propuesta, numeros: r.numeros_sin_fuente || [] })
    setPidiendo(false); setPedido('')
  }

  function usarPropuesta() {
    setTextos(t => ({ ...t, [propuesta.red]: propuesta.texto }))
    setRed(propuesta.red); setPropuesta(null)
    setAviso({ tipo: 'ok', texto: 'La versión del asistente está en el editor. Revisala y guardá.' })
  }

  return (
    <div className="up-mesa">
      <section className="up-mesa-trabajo">
        <div className="up-mesa-barra">
          <select className="up-campo up-mesa-dia" value={fecha} onChange={e => cambiarDia(e.target.value)} aria-label="Día">
            {opciones.map(d => <option key={d.fecha} value={d.fecha}>{fechaLarga(d.fecha)} · {d.tema_dia}</option>)}
          </select>
          <div className="up-mesa-redes" role="tablist">
            {redes.map(r => (
              <button key={r} role="tab" aria-selected={r === activa} className={r === activa ? 'on' : ''} onClick={() => { setRed(r); setAviso(null) }}>
                <LogoRed red={r} />{NOMBRE_RED[r]}{sinGuardar(r) && <i title="Sin guardar" />}
              </button>
            ))}
          </div>
        </div>

        <div className="up-mesa-hoja">
          <div className="up-mesa-hoja-cab">
            <h3>{activa === 'instagram' && dia.tema_instagram ? dia.tema_instagram : dia.tema_dia}</h3>
            {actual && <span className={`up-estado e-${estadoVisible(actual)}`}>{ESTADOS[estadoVisible(actual)]}</span>}
          </div>
          {!publicada && !pidiendo && !propuesta && <button className="up-btn up-mesa-pedir" disabled={!!ocupado} onClick={() => setPidiendo(true)}>✦ Pedirle al asistente</button>}
          <textarea className="up-mesa-texto" value={texto} onChange={e => escribir(e.target.value)} readOnly={publicada}
            placeholder={activa === 'x' ? 'Escribí el post. Para un hilo: «1/ …», una línea en blanco, «2/ …»' : activa === 'instagram' && dia.formato_instagram === 'carrusel' ? 'Placa 1. …\nPlaca 2. …\nCaption:\nEl texto de abajo de la foto' : 'Escribí el post…'}
            aria-label={`Texto de ${NOMBRE_RED[activa]}`} />
          <div className="up-mesa-pie">
            <span>{publicada ? 'Ya está publicado: no se edita.' : sinGuardar(activa) ? 'sin guardar' : actual ? 'guardado' : 'sin borrador'}</span>
            <div className="up-mesa-cuenta">{redes.map(r => <Contador key={r} red={r} texto={textos[r] ?? ''} />)}</div>
          </div>
        </div>

        {!publicada && (pidiendo ? (
          <form className="up-mesa-pedido" onSubmit={e => { e.preventDefault(); pedir() }}>
            <div className="up-mono-k">¿Qué hago con el texto de {NOMBRE_RED[activa]}?</div>
            <div className="up-mesa-chips">{PEDIDOS[activa].map(p => <button type="button" key={p} className="up-btn" disabled={!!ocupado} onClick={() => pedir(p)}>{p}</button>)}</div>
            <div className="up-mesa-pedido-fila">
              <input className="up-campo" value={pedido} onChange={e => setPedido(e.target.value)} placeholder="O escribí el pedido…" aria-label="Pedido para el asistente" />
              <button type="button" className="up-btn" onClick={() => setPidiendo(false)}>Cancelar</button>
              <button type="submit" className="up-btn up-btn-p" disabled={!!ocupado || !pedido.trim()}>{ocupado === 'asistente' ? 'Escribiendo…' : 'Pedir'}</button>
            </div>
            {ocupado === 'asistente' && <p className="up-mono-k">el asistente está escribiendo…</p>}
          </form>
        ) : propuesta ? (
          <div className="up-mesa-propuesta">
            <div className="up-mono-k">✦ Asistente · versión para {NOMBRE_RED[propuesta.red]}</div>
            <p>{propuesta.texto}</p>
            {propuesta.numeros.length > 0 && <p className="up-aviso-nota up-aviso-error">Ojo: {propuesta.numeros.join(', ')} no {propuesta.numeros.length === 1 ? 'está' : 'están'} en tu texto ni en la Ficha. Revisalo antes de usarla.</p>}
            <div className="up-acciones up-acciones-izq">
              <button className="up-btn" onClick={() => setPropuesta(null)}>Descartar</button>
              <button className="up-btn" onClick={() => { setPropuesta(null); setPidiendo(true) }}>Pedir otra</button>
              <button className="up-btn up-btn-p" onClick={usarPropuesta}>Usar esta versión</button>
            </div>
          </div>
        ) : null)}

        {aviso && <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`up-aviso-nota ${aviso.tipo === 'error' ? 'up-aviso-error' : 'up-aviso-ok'}`}>{aviso.texto}</p>}

        {!publicada && (
          <div className="up-mesa-acciones">
            {redes.length > 1 && <button className="up-btn" disabled={!!ocupado || !texto.trim()} onClick={copiarATodas}>Copiar a las otras redes</button>}
            <button className="up-btn" disabled={!!ocupado || !texto.trim() || !sinGuardar(activa)} onClick={() => guardar(false)}>{ocupado === 'guardar' ? 'Guardando…' : 'Guardar'}</button>
            {actual?.estado !== 'aprobado' || sinGuardar(activa)
              ? <button className="up-btn up-btn-p" disabled={!!ocupado || !texto.trim() || medir(activa, texto).excede} onClick={() => guardar(true)}>{ocupado === 'aprobar' ? 'Aprobando…' : `Aprobar ${NOMBRE_RED[activa]}`}</button>
              : null}
          </div>
        )}
        {publicada && actual.url_publicada && <p className="up-aviso-nota up-aviso-ok">Publicado. <a href={actual.url_publicada} target="_blank" rel="noreferrer">Ver en {NOMBRE_RED[activa]}</a></p>}
      </section>

      <aside className="up-mesa-sim" aria-label="Simulación">
        <div className="up-mono-k up-mesa-sim-cab">Simulación · cómo se ve en cada red<span>en vivo</span></div>
        {redes.map(r => <Simulacion key={`${fecha}-${r}`} red={r} texto={textos[r] ?? ''} pieza={pieza(r)} />)}
      </aside>
    </div>
  )
}
