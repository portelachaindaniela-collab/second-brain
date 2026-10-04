import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso, fechaLarga } from './fechas.js'
import { ESTADOS, NOMBRE_RED, estadoVisible } from './pipeline.js'

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

function claveMes(iso) { return iso.slice(0, 7) }

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

export default function Calendario() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [mes, setMes] = useState(claveMes(hoyIso()))
  const [elegido, setElegido] = useState(hoyIso())

  useEffect(() => {
    Promise.all([
      supabase.from('up_calendario').select('id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias,salteado').order('fecha'),
      supabase.from('up_piezas').select('id,fecha,red,estado,texto,url_publicada,error_publicacion'),
    ]).then(([cal, pie]) => {
      if (cal.error || pie.error) { setError('No se pudo cargar el calendario: ' + (cal.error || pie.error).message); return }
      setDatos({ dias: cal.data || [], piezas: pie.data || [] })
    })
  }, [])

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>
  if (datos.dias.length === 0) return <p className="up-vacio">Todavía no hay días cargados.</p>

  const hoy = hoyIso()
  const porFecha = new Map(datos.dias.map(d => [d.fecha, d]))
  const piezasDe = fecha => datos.piezas.filter(p => p.fecha === fecha)
  const meses = [...new Set(datos.dias.map(d => claveMes(d.fecha)))]
  if (!meses.includes(mes)) meses.push(mes)
  meses.sort()
  const i = meses.indexOf(mes)
  const dia = porFecha.get(elegido)
  const conInstagram = datos.dias.filter(d => d.redes.includes('instagram')).length

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo">Calendario editorial · {datos.dias.length} días · {conInstagram} con Instagram</div>
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
                <button key={fecha} role="gridcell" disabled={!d}
                  className={`up-cal-dia${d ? ` d-${estado}` : ' vacio'}${fecha === hoy ? ' hoy' : ''}${fecha === elegido ? ' elegido' : ''}`}
                  onClick={() => setElegido(fecha)} aria-label={d ? `${fechaLarga(fecha)}: ${ESTADOS_DIA[estado]}` : fechaLarga(fecha)}>
                  <span className="up-cal-num">{Number(fecha.slice(8))}</span>
                  {d?.redes.includes('instagram') && <span className="up-cal-ig" title={`Instagram: ${d.formato_instagram}`}><LogoRed red="instagram" /></span>}
                  {d && <span className="up-cal-tema">{d.tema_dia}</span>}
                </button>
              )
            })}
          </div>
          <ul className="up-cal-leyenda">
            {Object.entries(ESTADOS_DIA).map(([k, v]) => <li key={k}><i className={`d-${k}`} />{v}</li>)}
            <li><LogoRed red="instagram" />Con Instagram</li>
          </ul>
        </section>

        <aside className="up-cal-detalle">
          {dia ? (
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
              {!piezasDe(dia.fecha).length && !dia.salteado && <p className="up-vacio">{dia.fecha < hoy ? 'Este día no tuvo borradores.' : 'Los agentes escriben los borradores la mañana de ese día.'}</p>}
            </>
          ) : <p className="up-vacio">Elegí un día del calendario.</p>}
        </aside>
      </div>
    </>
  )
}
