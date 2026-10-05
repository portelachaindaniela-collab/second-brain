import { useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso } from './fechas.js'
import { NOMBRE_RED } from './pipeline.js'
import { resumenMetricas, versusMedia, leerCifra, recorte, captionDe, postsDeX } from './edicion.mjs'

// Ficha de lo aprobado y publicado un día: una pestaña por red con el texto, la foto, el link y, si ya salió, las métricas.
// Las métricas se cargan a mano hasta que cada red habilite leerlas (LinkedIn necesita aprobar un permiso; X es pago).
const KPIS = [['impresiones', 'Impresiones'], ['reacciones', 'Reacciones'], ['comentarios', 'Comentarios'], ['compartidos', 'Compartidos']]
const miles = v => (Number.isFinite(v) ? v.toLocaleString('es-AR') : '—')
const pct = v => `${(v * 100).toFixed(1).replace('.', ',')}%`

// Curva de impresiones: con una sola medición no hay curva.
function Curva({ serie }) {
  if (serie.length < 2) return null
  const max = Math.max(...serie.map(s => s.valor)) || 1
  const x = i => (i / (serie.length - 1)) * 280
  const y = v => 70 - (v / max) * 62
  const linea = serie.map((s, i) => `${x(i)},${y(s.valor)}`).join(' ')
  return (
    <figure className="up-pub-curva">
      <figcaption className="up-mono-k">Impresiones por medición</figcaption>
      <svg viewBox="0 0 280 74" preserveAspectRatio="none" role="img" aria-label={`Impresiones: ${serie.map(s => `${s.dia} ${s.valor}`).join(', ')}`}>
        <polygon points={`0,72 ${linea} 280,72`} />
        <polyline points={linea} />
      </svg>
      <div className="up-pub-curva-ejes"><span>{serie[0].dia.slice(5).split('-').reverse().join('/')}</span><span>{serie.at(-1).dia.slice(5).split('-').reverse().join('/')}</span></div>
    </figure>
  )
}

function CargarMetricas({ pieza, ultima, guardado, cancelar }) {
  const [dia, setDia] = useState(hoyIso())
  const [valores, setValores] = useState(() => Object.fromEntries(KPIS.map(([k]) => [k, ultima?.dia === hoyIso() && Number.isFinite(ultima[k]) ? String(ultima[k]) : ''])))
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function guardar(e) {
    e.preventDefault()
    const cifras = Object.fromEntries(KPIS.map(([k]) => [k, leerCifra(valores[k])]))
    if (Object.values(cifras).some(Number.isNaN)) { setError('Escribí solo números (sin letras ni signos).'); return }
    if (Object.values(cifras).every(v => v === null)) { setError('Cargá al menos un número.'); return }
    setOcupado(true); setError('')
    const { data, error: err } = await supabase.from('up_metricas').upsert({ pieza_id: pieza.id, dia, ...cifras, fuente: 'manual' }, { onConflict: 'pieza_id,dia' }).select('pieza_id,dia,impresiones,reacciones,comentarios,compartidos,fuente,updated_at').single()
    setOcupado(false)
    if (err) { setError('No se pudo guardar: ' + err.message); return }
    guardado(data)
  }

  return (
    <form className="up-pub-form" onSubmit={guardar}>
      <label className="up-campo-l">Medido el<input className="up-campo" type="date" value={dia} min={pieza.fecha} max={hoyIso()} onChange={e => setDia(e.target.value)} required /></label>
      <div className="up-pub-form-kpis">
        {KPIS.map(([k, label]) => (
          <label key={k} className="up-campo-l">{label}<input className="up-campo" inputMode="numeric" value={valores[k]} onChange={e => setValores(v => ({ ...v, [k]: e.target.value }))} /></label>
        ))}
      </div>
      <p className="up-mono-k">Lo ves en {NOMBRE_RED[pieza.red]}, en las estadísticas del post. Si cargás el mismo día dos veces, se reemplaza.</p>
      {error && <p role="alert" className="up-error">{error}</p>}
      <div className="up-acciones up-acciones-izq">
        <button type="button" className="up-btn" onClick={cancelar}>Cancelar</button>
        <button type="submit" className="up-btn up-btn-p" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar métricas'}</button>
      </div>
    </form>
  )
}

function Vista({ pieza }) {
  const [abierto, setAbierto] = useState(false)
  if (pieza.red === 'instagram' && pieza.assets?.length) {
    return <a className="up-pub-foto" href={pieza.assets[0]} target="_blank" rel="noreferrer"><img src={pieza.assets[0]} alt="Primera placa" loading="lazy" /></a>
  }
  const texto = pieza.red === 'instagram' ? captionDe(pieza.texto || '') : pieza.red === 'x' ? postsDeX(pieza.texto || '').join('\n\n') : (pieza.texto || '')
  const r = recorte(texto, 280)
  return <p className="up-pub-texto">{abierto || !r.cortado ? texto : r.visible}{r.cortado && !abierto && <>… <button className="up-sim-mas" onClick={() => setAbierto(true)}>ver todo</button></>}</p>
}

export default function Publicacion({ piezas, metricas, todasLasPiezas, alCargar, abrirEdicion }) {
  const [red, setRed] = useState(piezas[0]?.red)
  const [cargando, setCargando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const pieza = piezas.find(p => p.red === red) || piezas[0]
  if (!pieza) return null
  const res = resumenMetricas(metricas.filter(m => m.pieza_id === pieza.id))
  // La media: la última medición de impresiones de las otras publicaciones de la misma red.
  const otras = todasLasPiezas.filter(p => p.red === pieza.red && p.id !== pieza.id && p.estado === 'publicado')
    .map(p => resumenMetricas(metricas.filter(m => m.pieza_id === p.id))?.ultima?.impresiones)
  const vs = res ? versusMedia(res.ultima.impresiones, otras) : null

  async function copiarTexto() {
    try { await navigator.clipboard.writeText(pieza.texto || ''); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sin portapapeles */ }
  }

  return (
    <div className="up-pub">
      <div className="up-pub-redes" role="tablist">
        {piezas.map(p => <button key={p.id} role="tab" aria-selected={p.id === pieza.id} className={`r-${p.red}${p.id === pieza.id ? ' on' : ''}`} onClick={() => { setRed(p.red); setCargando(false) }}><LogoRed red={p.red} />{NOMBRE_RED[p.red]}</button>)}
      </div>
      {pieza.estado === 'aprobado' && (pieza.error_publicacion
        ? <p className="up-aviso-nota up-aviso-error"><b>No se pudo publicar.</b> {pieza.error_publicacion}</p>
        : <p className="up-aviso-nota">Aprobado, todavía no salió. Las métricas se cargan cuando se publique.</p>)}
      <Vista key={pieza.id} pieza={pieza} />
      <div className="up-acciones up-acciones-izq">
        {pieza.url_publicada && <a className="up-btn up-btn-a" href={pieza.url_publicada} target="_blank" rel="noreferrer">Ver post</a>}
        <button className="up-btn" onClick={copiarTexto}>{copiado ? 'Copiado' : 'Copiar texto'}</button>
        <button className="up-btn" onClick={() => abrirEdicion(pieza.fecha, pieza.red)}>Ir a la mesa</button>
      </div>

      {pieza.estado === 'publicado' && <>
      <div className="up-vol up-pub-vol">Métricas{res && <span>al {res.ultima.dia.slice(5).split('-').reverse().join('/')} · {res.ultima.fuente === 'manual' ? 'carga manual' : res.ultima.fuente}</span>}</div>
      {res ? (
        <>
          <dl className="up-pub-kpis">
            {KPIS.map(([k, label]) => (
              <div key={k}><dt>{label}</dt><dd>{miles(res.ultima[k])}</dd>
                {k === 'impresiones' && vs !== null && <small className={vs >= 0 ? 'sube' : 'baja'}>{vs >= 0 ? '▲' : '▼'} {pct(Math.abs(vs))} vs tu media</small>}
                {k === 'reacciones' && res.interaccion !== null && <small>{pct(res.interaccion)} interacción</small>}
              </div>
            ))}
          </dl>
          <Curva serie={res.serie} />
        </>
      ) : !cargando && <p className="up-vacio">Todavía no cargaste métricas de esta publicación.</p>}
      {cargando
        ? <CargarMetricas key={pieza.id} pieza={pieza} ultima={res?.ultima} cancelar={() => setCargando(false)} guardado={m => { setCargando(false); alCargar(m) }} />
        : <div className="up-acciones up-acciones-izq"><button className="up-btn up-btn-p" onClick={() => setCargando(true)}>Cargar métricas</button></div>}
      </>}
    </div>
  )
}
