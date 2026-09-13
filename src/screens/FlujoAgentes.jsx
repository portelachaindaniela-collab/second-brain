import './FlujoAgentes.css'

export const AGENTES_INFO = [
  {
    key: 'monitor_sitios', nombre: 'Centinela', tarea: 'Monitor de sitios',
    detalle: 'Chequea los 6 sitios y el scraper de Radar Laboral.',
    cadencia: 'Cada vez que entrás a María o tocás Recargar.',
    color: '#5ec8f2', tamaño: 7, radio: 110, dur: 36,
  },
  {
    key: 'tareas_estancadas', nombre: 'Rastreador', tarea: 'Tareas estancadas',
    detalle: 'Busca tareas sin tocar hace más de 3 días.',
    cadencia: 'Cada vez que entrás a María o tocás Recargar.',
    color: '#c97a4a', tamaño: 9, radio: 190, dur: 54,
  },
  {
    key: 'sync_estado', nombre: 'Enlace', tarea: 'Estado de sincronización',
    detalle: 'Revisa hace cuánto no se sincroniza Google.',
    cadencia: 'Cada vez que entrás a María o tocás Recargar.',
    color: '#7fd88f', tamaño: 7.5, radio: 270, dur: 78,
  },
]
const CX = 300
const CY = 235
const TILT = 0.42

const ESTRELLAS = Array.from({ length: 180 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280
  const seed2 = (seed * 9301 + 49297) % 233280
  const seed3 = (seed2 * 9301 + 49297) % 233280
  return {
    x: (seed / 233280) * 1200,
    y: (seed2 / 233280) * 460,
    r: 0.4 + ((seed * 7) % 100) / 100 * 1.1,
    o: 0.08 + ((seed2 * 3) % 100) / 100 * 0.32,
    dur: 5 + ((seed3 * 11) % 100) / 100 * 6,
  }
})

const NIVEL_COLOR = { ok: '#7fd88f', aviso: '#f2c14e', error: '#e0685a' }

function Planeta({ index, size = 10 }) {
  return <g transform={`scale(${size / 10})`}>
    {index === 1 && <ellipse rx="17" ry="5" transform="rotate(-24)" fill="none" stroke="#c3a783" strokeWidth="3" opacity="0.6" />}
    <g clipPath="url(#planet-disc)">
      <circle r="10" fill={['#388dc2', '#c39a69', '#286b8b'][index]} />
      {index === 0 && <g fill="none" strokeLinecap="round">
        <path d="M-12-5 Q0-2 12-5 M-12 2 Q0 5 12 2 M-12 7 Q0 9 12 7" stroke="#95d6e4" strokeWidth="1.5" opacity="0.4" />
        <ellipse cx="3" cy="2" rx="3" ry="1.2" fill="#17517f" stroke="none" />
      </g>}
      {index === 1 && <g fill="none">
        <path d="M-12-6 Q0-3 12-6 M-12 0 Q0 3 12 0 M-12 6 Q0 9 12 6" stroke="#eed3a3" strokeWidth="2" opacity="0.65" />
        <path d="M-12-2 Q0 1 12-2 M-12 4 Q0 7 12 4" stroke="#866449" strokeWidth="1" opacity="0.5" />
      </g>}
      {index === 2 && <>
        <path d="M-8-8 -2-9 1-6 -1-3 -4-2 -3 1 -6 3 -9-1Z M1-2 5-5 9-3 10 1 6 2 5 7 2 9 0 5 2 2Z" fill="#83a978" />
        <path d="M-10-4 Q-3-7 3-4 M-4 5 Q3 1 10 4" fill="none" stroke="#edf5ee" strokeWidth="1.3" opacity="0.55" />
        <path d="M-4-9 Q0-11 4-9" stroke="#d9ece9" strokeWidth="2" />
      </>}
      <circle r="10" fill="url(#planet-shadow)" />
    </g>
    <circle r="10" fill="none" stroke="#c4e2ea" strokeOpacity="0.18" strokeWidth="0.5" />
    {index === 1 && <path d="M-17 0 A17 5 0 0 0 17 0" transform="rotate(-24)" fill="none" stroke="#d5b58d" strokeWidth="2.5" opacity="0.8" />}
  </g>
}

export default function FlujoAgentes({ agentes }) {
  const estadoDe = key => agentes?.find(a => a.agente === key)

  return (
    <div className="maria-cosmos">
        <svg className="maria-cosmos-scene" viewBox="0 0 1200 460" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <clipPath id="planet-disc"><circle r="10" /></clipPath>
            <radialGradient id="planet-shadow" cx="25%" cy="22%" r="78%">
              <stop offset="0" stopColor="#fff" stopOpacity="0.23" />
              <stop offset="0.42" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.8" stopColor="#010309" stopOpacity="0.45" />
              <stop offset="1" stopColor="#010309" stopOpacity="0.95" />
            </radialGradient>
            <radialGradient id="sol-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffbd62" stopOpacity="0.45" />
              <stop offset="25%" stopColor="#df8637" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#ffe3a3" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sol-fill" cx="30%" cy="28%" r="75%">
              <stop offset="0%" stopColor="#fff8e0" />
              <stop offset="45%" stopColor="#ffb545" />
              <stop offset="100%" stopColor="#a8450d" />
            </radialGradient>
            {AGENTES_INFO.map(a => (
              <radialGradient key={a.key} id={`planeta-${a.key}`} cx="30%" cy="28%" r="75%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="30%" stopColor={a.color} />
                <stop offset="75%" stopColor={a.color} stopOpacity="0.85" />
                <stop offset="100%" stopColor="#03050a" />
              </radialGradient>
            ))}
          </defs>

          {ESTRELLAS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffffff" opacity={s.o}>
              <animate attributeName="opacity" values={`${s.o};${Math.min(s.o * 1.6, 0.9)};${s.o}`} dur={`${s.dur}s`} repeatCount="indefinite" />
            </circle>
          ))}

          <g transform={`translate(${CX} ${CY}) scale(1 ${TILT}) translate(${-CX} ${-CY})`}>
            {AGENTES_INFO.map(a => (
              <circle key={a.key} cx={CX} cy={CY} r={a.radio} fill="none" stroke="#a7b8d4" strokeOpacity="0.12" strokeWidth="0.7" />
            ))}
          </g>

          <circle cx={CX} cy={CY} r="180" fill="url(#sol-glow)" />
          <circle cx={CX} cy={CY} r="62" fill="url(#sol-glow)" />
          <circle cx={CX} cy={CY} r="30" fill="url(#sol-fill)" />
          <circle cx={CX} cy={CY} r="31" fill="none" stroke="#ffd397" strokeOpacity="0.35" />
          {AGENTES_INFO.map((a, index) => (
            <g key={a.key}>
              <animateMotion
                path={`M ${CX + a.radio} ${CY} a ${a.radio} ${a.radio * TILT} 0 1 1 ${-2 * a.radio} 0 a ${a.radio} ${a.radio * TILT} 0 1 1 ${2 * a.radio} 0`}
                dur={`${a.dur}s`} begin={`${-index * 17 - 7}s`} repeatCount="indefinite" />
              <Planeta index={index} size={a.tamaño + 2} />
            </g>
          ))}
        </svg>

        <details className="maria-cosmos-reference" open>
          <summary>Referencia de scripts</summary>
          {AGENTES_INFO.map((a, index) => {
            const estado = estadoDe(a.key)
            return <details className="maria-script" key={a.key}>
              <summary>
                <svg width="28" height="24" viewBox="-20 -15 40 30" aria-hidden="true"><Planeta index={index} /></svg>
                <span className="maria-script-name"><strong>{a.nombre}</strong><small>{a.tarea}</small></span>
                {estado && <span className="maria-script-status" style={{ color: NIVEL_COLOR[estado.estado] || '#a4adbd' }}>● {estado.estado}</span>}
              </summary>
              <div className="maria-script-detail">{a.detalle}{estado && <p>{estado.resumen}</p>}</div>
            </details>
          })}
        </details>
    </div>
  )
}
