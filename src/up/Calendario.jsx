import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso, fechaLarga } from './fechas.js'
import { ESTADOS, NOMBRE_RED, estadoVisible, correrPipeline } from './pipeline.js'
import EditorDia from './EditorDia.jsx'
import Publicacion from './Publicacion.jsx'
import { marcaCalendario } from './edicion.mjs'

// Estado de un día, a partir de sus piezas: manda lo que necesita atención.
const ESTADOS_DIA = {
  error: 'Error',
  falta_info: 'Falta info',
  revision: 'En revisión',
  borrador: 'Borrador listo',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
  sin_borrador: 'Sin borrador',
  salteado: 'Salteado',
}

function estadoDelDia(dia, piezas) {
  if (dia.salteado) return 'salteado'
  if (!piezas.length) return 'sin_borrador'
  for (const e of ['error', 'falta_info', 'revision']) if (piezas.some(p => estadoVisible(p) === e)) return e
  if (piezas.some(p => p.estado === 'pendiente')) return piezas.some(p => p.estado === 'pendiente' && p.texto) ? 'borrador' : 'sin_borrador'
  return piezas.every(p => p.estado === 'publicado') ? 'publicado' : 'aprobado'
}

const NOMBRES_DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const SIGLA = { linkedin: 'IN', x: 'X', instagram: 'IG' }
const ORDEN_RED = ['linkedin', 'x', 'instagram']

function claveMes(iso) { return iso.slice(0, 7) }

function sumarDia(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function nombreMes(clave) {
  const [a, m] = clave.split('-').map(Number)
  const t = new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Celdas del mes empezando el lunes; null para los huecos antes del día 1 y después del último.
function celdasDelMes(clave) {
  const [a, m] = clave.split('-').map(Number)
  const primero = new Date(a, m - 1, 1)
  const dias = new Date(a, m, 0).getDate()
  const hueco = (primero.getDay() + 6) % 7
  const celdas = Array(hueco).fill(null)
  for (let d = 1; d <= dias; d++) celdas.push(`${clave}-${String(d).padStart(2, '0')}`)
  while (celdas.length % 7) celdas.push(null)
  return celdas
}

export default function Calendario({ abrirEdicion }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [mes, setMes] = useState(claveMes(hoyIso()))
  const [elegido, setElegido] = useState(hoyIso())
  const [editando, setEditando] = useState(null) // 'nuevo' | 'editar' | null
  const [generando, setGenerando] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    const [cal, pie, met] = await Promise.all([
      supabase.from('up_calendario').select('id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias,salteado').order('fecha'),
      supabase.from('up_piezas').select('id,fecha,red,estado,texto,assets,url_publicada,error_publicacion'),
      supabase.from('up_metricas').select('pieza_id,dia,impresiones,reacciones,comentarios,compartidos,fuente,updated_at'),
    ])
    if (cal.error || pie.error) { setError('No se pudo cargar el calendario: ' + (cal.error || pie.error).message); return }
    setDatos({ dias: cal.data || [], piezas: pie.data || [], metricas: met.data || [] })
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>

  const hoy = hoyIso()
  const porFecha = new Map(datos.dias.map(d => [d.fecha, d]))
  const piezasDe = fecha => datos.piezas.filter(p => p.fecha === fecha).sort((a, b) => ORDEN_RED.indexOf(a.red) - ORDEN_RED.indexOf(b.red))
  const meses = [...new Set(datos.dias.map(d => claveMes(d.fecha)))]
  if (!meses.includes(mes)) meses.push(mes)
  meses.sort()
  const i = meses.indexOf(mes)
  const dia = porFecha.get(elegido)
  const conInstagram = datos.dias.filter(d => d.redes.includes('instagram')).length
  const semanas = [...new Set(datos.dias.map(d => d.tema_semana))]
  const piezasElegido = piezasDe(elegido)
  const conTexto = piezasElegido.some(p => p.texto && ['pendiente', 'error', 'falta_info'].includes(p.estado))

  function elegir(fecha) { setElegido(fecha); setEditando(null); setAviso('') }

  // "Nueva idea": el día elegido si está libre y no pasó; si no, el próximo día libre desde hoy.
  function nuevaIdea() {
    let f = !porFecha.has(elegido) && elegido >= hoy ? elegido : hoy
    while (porFecha.has(f)) f = sumarDia(f, 1)
    setElegido(f); setMes(claveMes(f)); setEditando('nuevo'); setAviso('')
  }

  async function guardado(fila) {
    const habiaBorradores = editando === 'editar' && piezasDe(fila.fecha).some(p => p.texto)
    setEditando(null)
    await cargar()
    setElegido(fila.fecha); setMes(claveMes(fila.fecha))
    setAviso(habiaBorradores ? 'Guardado. Los borradores que ya estaban no cambian solos: tocá Volver a generar para rehacerlos con la idea nueva.' : 'Guardado. Los agentes la toman la mañana de ese día, o tocá Generar ahora.')
  }

  async function generar() {
    setGenerando(true); setAviso('')
    const mensaje = await correrPipeline(elegido, conTexto)
    setGenerando(false)
    await cargar()
    setAviso(mensaje || 'Listo: los borradores están en Hoy (o en «Necesito que me cuentes» si falta un dato).')
  }

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo up-antetitulo-acciones">Calendario editorial · {datos.dias.length} días · {conInstagram} con Instagram
          <button className="up-btn up-btn-p" onClick={nuevaIdea}>+ Nueva idea</button>
        </div>
      </div>
      <div className="up-cal">
        <section className="up-cal-mes">
          <div className="up-cal-cab">
            <button className="up-btn" disabled={i <= 0} onClick={() => setMes(meses[i - 1])} aria-label="Mes anterior">‹</button>
            <h2 className="up-titular-2">{nombreMes(mes)}</h2>
            <button className="up-btn" disabled={i >= meses.length - 1} onClick={() => setMes(meses[i + 1])} aria-label="Mes siguiente">›</button>
          </div>
          <div className="up-cal-grilla" role="grid">
            {NOMBRES_DIA.map(n => <div key={n} className="up-cal-nombre">{n}</div>)}
            {celdasDelMes(mes).map((fecha, k) => {
              if (!fecha) return <div key={k} className="up-cal-hueco" />
              const d = porFecha.get(fecha)
              const estado = d ? estadoDelDia(d, piezasDe(fecha)) : null
              return (
                <button key={fecha} role="gridcell"
                  className={`up-cal-dia${d ? ` d-${estado}` : ' vacio'}${fecha === hoy ? ' hoy' : ''}${fecha === elegido ? ' elegido' : ''}`}
                  onClick={() => elegir(fecha)} aria-label={d ? `${fechaLarga(fecha)}: ${ESTADOS_DIA[estado]}` : fechaLarga(fecha)}>
                  <span className="up-cal-num">{Number(fecha.slice(8))}</span>
                  {d?.redes.includes('instagram') && <span className="up-cal-ig" title={`Instagram: ${d.formato_instagram}`}><LogoRed red="instagram" /></span>}
                  {d && <span className="up-cal-tema">{d.tema_dia}</span>}
                  <span className="up-cal-marcas">{piezasDe(fecha).filter(marcaCalendario).map(p => <i key={p.id} className={`m-${marcaCalendario(p)}`} title={`${NOMBRE_RED[p.red]}: ${ESTADOS[p.estado]}`}>{SIGLA[p.red]}</i>)}</span>
                </button>
              )
            })}
          </div>
          <ul className="up-cal-leyenda">
            {Object.entries(ESTADOS_DIA).map(([k, v]) => <li key={k}><i className={`d-${k}`} />{v}</li>)}
            <li><LogoRed red="instagram" />Con Instagram</li>
          </ul>
          <ul className="up-cal-leyenda up-cal-leyenda-redes">
            {ORDEN_RED.map(r => <li key={r}><i className={`m-${r}`} />{NOMBRE_RED[r]} publicado</li>)}
            <li><i className="m-aprobado" />Aprobado, sin publicar</li>
          </ul>
        </section>

        <aside className="up-cal-detalle">
          {aviso && <p role="status" className="up-aviso-nota up-aviso-ok">{aviso}</p>}
          {editando ? (
            <EditorDia key={`${editando}-${elegido}`} dia={editando === 'editar' ? dia : null} fecha={elegido} semanas={semanas} cerrar={() => setEditando(null)} guardado={guardado} />
          ) : dia ? (
            <>
              <div className="up-vol">{fechaLarga(dia.fecha)}<span>Semana «{dia.tema_semana}»</span></div>
              <h3 className="up-titular-2">{dia.tema_dia}</h3>
              {dia.tema_instagram && <p className="up-ficha-contexto">Instagram ({dia.formato_instagram}): {dia.tema_instagram}{dia.fotos_propias ? ', con tus fotos' : ''}</p>}
              <p className={`up-cal-estado d-${estadoDelDia(dia, piezasDe(dia.fecha))}`}><i />{ESTADOS_DIA[estadoDelDia(dia, piezasDe(dia.fecha))]}</p>
              <ul className="up-cal-piezas">
                {piezasDe(dia.fecha).map(p => (
                  <li key={p.id}>
                    <LogoRed red={p.red} />{NOMBRE_RED[p.red]}
                    <span className={`up-estado e-${estadoVisible(p)}`}>{p.url_publicada ? <a href={p.url_publicada} target="_blank" rel="noreferrer">{ESTADOS[p.estado]}</a> : ESTADOS[estadoVisible(p)]}</span>
                  </li>
                ))}
              </ul>
              {piezasDe(dia.fecha).some(marcaCalendario) && (
                <Publicacion key={dia.fecha} piezas={piezasDe(dia.fecha).filter(marcaCalendario)}
                  metricas={datos.metricas} todasLasPiezas={datos.piezas} abrirEdicion={abrirEdicion}
                  alCargar={m => setDatos(d => ({ ...d, metricas: [...d.metricas.filter(x => !(x.pieza_id === m.pieza_id && x.dia === m.dia)), m] }))} />
              )}
              {!piezasDe(dia.fecha).length && !dia.salteado && <p className="up-vacio">{dia.fecha < hoy ? 'Este día no tuvo borradores.' : 'Los agentes escriben los borradores la mañana de ese día.'}</p>}
              {dia.fecha >= hoy && !dia.salteado && (
                <div className="up-acciones up-acciones-izq">
                  <button className="up-btn" disabled={generando} onClick={() => { setEditando('editar'); setAviso('') }}>Editar</button>
                  <button className="up-btn up-btn-p" disabled={generando} onClick={generar}>{generando ? 'Generando…' : conTexto ? 'Volver a generar' : 'Generar ahora'}</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="up-vol">{fechaLarga(elegido)}</div>
              <p className="up-vacio">Este día no tiene publicación.</p>
              {elegido >= hoy && <div className="up-acciones up-acciones-izq"><button className="up-btn up-btn-p" onClick={() => { setEditando('nuevo'); setAviso('') }}>Nueva idea para este día</button></div>}
            </>
          )}
        </aside>
      </div>
    </>
  )
}
