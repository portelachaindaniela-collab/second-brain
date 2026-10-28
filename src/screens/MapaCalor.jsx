import { Fragment, useState } from 'react'
import { colorIdentidad } from '../tablero.mjs'
import { horaAR, programaDe, duracionLegible } from '../trabajadores.mjs'
import { nombreCorto, celdasDeCalor } from '../panorama.mjs'

const n = v => Number(v ?? 0).toLocaleString('es-AR')
const ESTADO = { ok: 'ok', error: 'falló', corriendo: 'corriendo', hueco: 'no corrió y le tocaba', libre: 'no le tocaba' }

function lectura(t, c) {
  const rango = `${horaAR(c.inicio)}–${horaAR(c.inicio + 3600_000)}`
  const partes = [nombreCorto(t.nombre), rango, ESTADO[c.estado] ?? c.estado]
  if (c.corrida) partes.push(`${n(c.resultados)} resultados`, c.cantidad > 1 ? `${c.cantidad} corridas` : null, c.corrida.duracion_ms != null ? duracionLegible(c.corrida.duracion_ms) : null)
  return partes.filter(Boolean).join(' · ')
}

// Una fila por trabajador y una celda por hora: el color de identidad, más fuerte cuanto más trajo; rojo si falló.
// Al pasar el mouse se marca la cruz (su fila y su hora) y arriba se lee qué pasó; tocar la celda abre la corrida.
export function MapaCalor({ trabajadores, corridasPor, ahora, abrirCorrida, elegir }) {
  const [foco, setFoco] = useState(null)
  const filas = trabajadores.map(t => {
    const celdas = celdasDeCalor(corridasPor[t.clave] || [], ahora, programaDe(t))
    return { t, celdas, total: celdas.reduce((s, c) => s + c.resultados, 0) }
  })
  const horas = filas[0]?.celdas.map(c => c.inicio) ?? []
  if (!filas.length) return <p className="pano-vacio">ningún trabajador para mostrar</p>
  return <div className="calor" onMouseLeave={() => setFoco(null)}>
    <p className={`calor-lectura${foco ? ' is-activa' : ''}`} aria-live="polite">{foco ? foco.texto : 'pasá el mouse por una celda · tocala para abrir la corrida · tocá un nombre para verlo en el sistema'}</p>
    <div className="calor-grilla" style={{ '--horas': horas.length }}>
      <span />
      {horas.map((h, i) => <span key={h} className={`calor-hora${foco?.col === i ? ' is-foco' : ''}`}>{i % 3 === 0 || i === horas.length - 1 ? horaAR(h).slice(0, 2) : ''}</span>)}
      <span className="calor-hora calor-hora-total">24 h</span>
      {filas.map(({ t, celdas, total }, f) => <Fragment key={t.clave}>
        <button type="button" className={`calor-nombre${foco?.fila === f ? ' is-foco' : ''}`} style={{ '--id': colorIdentidad(t.color) }} onClick={() => elegir(t.clave)}>
          <i />{nombreCorto(t.nombre)}
        </button>
        {celdas.map((c, i) => {
          const texto = lectura(t, c)
          const props = {
            className: `calor-celda calor-${c.estado}${foco && (foco.fila === f || foco.col === i) ? ' en-cruz' : ''}`,
            style: { '--id': colorIdentidad(t.color), '--nivel': c.nivel },
            onMouseEnter: () => setFoco({ fila: f, col: i, texto }),
            onFocus: () => setFoco({ fila: f, col: i, texto }),
          }
          return c.corrida
            ? <button key={c.inicio} type="button" {...props} aria-label={texto} onClick={() => abrirCorrida(c.corrida)} />
            : <span key={c.inicio} {...props} />
        })}
        <span className="calor-total">{n(total)}</span>
      </Fragment>)}
    </div>
  </div>
}
