export const AGENTES_INFO = [
  {
    key: 'monitor_sitios', nombre: 'Centinela', tarea: 'Monitor de sitios',
    detalle: 'Chequea los 6 sitios y el scraper de Radar Laboral.',
    cadencia: 'Cada vez que entrás a María o tocás Recargar.',
    color: '#5ec8f2', tamaño: 7, radio: 60, dur: 9,
  },
  {
    key: 'tareas_estancadas', nombre: 'Rastreador', tarea: 'Tareas estancadas',
    detalle: 'Busca tareas sin tocar hace más de 3 días.',
    cadencia: 'Cada vez que entrás a María o tocás Recargar.',
    color: '#c97a4a', tamaño: 9, radio: 106, dur: 14,
  },
  {
    key: 'sync_estado', nombre: 'Enlace', tarea: 'Estado de sincronización',
    detalle: 'Revisa hace cuánto no se sincroniza Google.',
    cadencia: 'Cada vez que entrás a María o tocás Recargar.',
    color: '#7fd88f', tamaño: 7.5, radio: 150, dur: 20,
  },
]
const CX = 190
const CY = 195
const TILT = 0.42

const ESTRELLAS = Array.from({ length: 90 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280
  const seed2 = (seed * 9301 + 49297) % 233280
  const seed3 = (seed2 * 9301 + 49297) % 233280
  return {
    x: (seed / 233280) * 380,
    y: (seed2 / 233280) * 360,
    r: 0.4 + ((seed * 7) % 100) / 100 * 1.1,
    o: 0.2 + ((seed2 * 3) % 100) / 100 * 0.6,
    dur: 5 + ((seed3 * 11) % 100) / 100 * 6,
  }
})

const NIVEL_COLOR = { ok: '#7fd88f', aviso: '#f2c14e', error: '#e0685a' }

export default function FlujoAgentes({ agentes }) {
  const estadoDe = key => agentes?.find(a => a.agente === key)

  return (
    <div className="card" style={{ marginBottom: 20, background: '#03050c', border: '1px solid #1c2333', padding: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <svg viewBox="0 0 380 380" style={{ width: 280, height: 280, flexShrink: 0 }}>
          <defs>
            <radialGradient id="sol-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffe3a3" stopOpacity="0.9" />
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
                <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
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
              <circle key={a.key} cx={CX} cy={CY} r={a.radio} fill="none" stroke="#2c3958" strokeWidth="1" strokeDasharray="1.5 5" />
            ))}
          </g>

          <circle cx={CX} cy={CY} r="46" fill="url(#sol-glow)" opacity="0.8" />

          {AGENTES_INFO.map(a => (
            <g key={a.key}>
              <animateTransform attributeName="transform" type="rotate"
                from={`0 ${CX} ${CY}`} to={`360 ${CX} ${CY}`}
                dur={`${a.dur}s`} repeatCount="indefinite" />
              <g transform={`translate(${CX} ${CY}) scale(1 ${TILT}) translate(${-CX} ${-CY})`}>
                <circle cx={CX + a.radio} cy={CY} r={a.tamaño} fill={`url(#planeta-${a.key})`} stroke="#00000040" strokeWidth="0.5" />
              </g>
            </g>
          ))}

          <circle cx={CX} cy={CY} r="24" fill="url(#sol-fill)" />
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#3a2205">María</text>
        </svg>

        <div className="card-pad" style={{ flex: 1, minWidth: 220, background: '#0b0f1d', border: '1px solid #1c2333', borderRadius: 10, padding: 14 }}>
          <h3 style={{ fontSize: 12, color: '#8892ad', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Referencia de scripts</h3>
          {AGENTES_INFO.map(a => {
            const estado = estadoDe(a.key)
            return (
              <div key={a.key} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #1c2333' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, flexShrink: 0, boxShadow: `0 0 6px ${a.color}` }} />
                  <strong style={{ fontSize: 13, color: '#f2f4fa' }}>{a.nombre}</strong>
                  <span style={{ fontSize: 11.5, color: '#8892ad' }}>· {a.tarea}</span>
                  {estado && (
                    <span style={{ marginLeft: 'auto', fontSize: 9.5, color: NIVEL_COLOR[estado.estado] || '#8892ad', opacity: 0.22 }}>
                      ● {estado.estado}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#c3c8db', marginBottom: 2 }}>{a.detalle}</div>
                <div style={{ fontSize: 11.5, color: '#7d879f' }}>⏱ {a.cadencia}</div>
                {estado && <div style={{ fontSize: 10.5, color: '#5c6683', opacity: 0.28, marginTop: 2 }}>{estado.resumen}</div>}
              </div>
            )
          })}
          <div style={{ fontSize: 11.5, color: '#7d879f' }}>Los tres reportes quedan guardados abajo, en "Reportes de procesos".</div>
        </div>
      </div>
    </div>
  )
}
