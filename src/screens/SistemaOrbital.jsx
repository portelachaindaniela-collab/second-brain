import { useEffect, useMemo, useState } from 'react'
import { haceCuanto } from '../trabajadores.mjs'
import { colorIdentidad, vidaDeTrabajador, enCuanto } from '../tablero.mjs'
import { LIENZO, GRADOS_POR_SEGUNDO, disposicion, trazo, estadoTrabajador, pasaFiltro, coincideBusqueda, focoDe } from '../orbital.mjs'
import './SistemaOrbital.css'

// Íconos de cada trabajador, en una caja de 14×14 centrada en 0,0.
const ICONOS = {
  buscador_eventos: <><rect x="-6" y="-5" width="12" height="11" rx="2" /><path d="M-6 -1 H6 M-3 -7 V-3 M3 -7 V-3" /></>,
  google_sync: <><rect x="-7" y="-5" width="14" height="10" rx="2" /><path d="M-6.5 -4 L0 1 L6.5 -4" /></>,
  maria: <><path d="M-5 -7 H2 L5 -4 V7 H-5 Z M2 -7 V-4 H5" /><path d="M-2.5 0 H2.5 M-2.5 3 H2.5" /></>,
  scraper_empleo: <><rect x="-7" y="-3" width="14" height="10" rx="2" /><path d="M-3 -3 V-5.5 H3 V-3 M-7 1.5 H7" /></>,
}
const ICONO_GENERICO = <><circle r="5" /><path d="M0 -7.5 V-5 M0 5 V7.5 M-7.5 0 H-5 M5 0 H7.5" /></>

export function IconoTrabajador({ clave }) {
  return <g className="orbital-icono">{ICONOS[clave] ?? ICONO_GENERICO}</g>
}

function useMovimientoReducido() {
  const [reducido, setReducido] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!m) return
    const cambiar = () => setReducido(m.matches)
    m.addEventListener('change', cambiar)
    return () => m.removeEventListener('change', cambiar)
  }, [])
  return reducido
}

const TEXTO_ESTADO = { ok: 'activo', corriendo: 'corriendo', trabado: 'trabado', error: 'con error', pausado: 'pausado', sin_corridas: 'sin corridas' }

export function SistemaOrbital({ trabajadores, corridasPor, ahora, elegido, onElegir, filtro = 'todos', busqueda = '' }) {
  const reducido = useMovimientoReducido()
  const [encima, setEncima] = useState(null)
  // El sistema gira despacio; se queda quieto mientras hay algo señalado o elegido, para poder tocarlo. El tiempo
  // quieto se descuenta, así al soltarlo sigue desde donde estaba en vez de saltar.
  const quieto = encima != null || elegido != null
  const [pausa, setPausa] = useState({ desde: null, acumulado: 0 })
  useEffect(() => {
    if (quieto && pausa.desde == null) setPausa(p => ({ ...p, desde: Date.now() }))
    if (!quieto && pausa.desde != null) setPausa(p => ({ desde: null, acumulado: p.acumulado + Date.now() - p.desde }))
  }, [quieto, pausa.desde])
  const reloj = (pausa.desde ?? ahora) - pausa.acumulado
  const giro = reducido ? 0 : ((reloj / 1000) * GRADOS_POR_SEGUNDO) % 360

  const d = useMemo(() => disposicion(trabajadores, { rotacion: giro, elegido }), [trabajadores, giro, elegido])
  const porId = Object.fromEntries(d.nodos.map(n => [n.id, n]))
  const porClave = Object.fromEntries(trabajadores.map(t => [t.clave, t]))
  const estados = Object.fromEntries(trabajadores.map(t => [t.clave, estadoTrabajador(t, corridasPor[t.clave] || [], ahora)]))
  const vidas = Object.fromEntries(trabajadores.map(t => [t.clave, vidaDeTrabajador(t, corridasPor[t.clave] || [], ahora)]))
  const visibles = new Set(trabajadores.filter(t => pasaFiltro(estados[t.clave], filtro) && coincideBusqueda(t.clave, busqueda, d)).map(t => t.clave))
  const foco = focoDe(encima ?? elegido, d)
  const filtrando = visibles.size < trabajadores.length
  const nodoVisible = id => !filtrando || d.enlaces.some(e => visibles.has(e.clave) && (e.desde === id || e.hasta === id)) || (id.startsWith('t:') && visibles.has(id.slice(2)))
  const tenue = id => (foco ? !foco.nodos.has(id) : !nodoVisible(id))
  const activos = trabajadores.filter(t => t.activo).length
  const conColor = clave => ({ '--id': colorIdentidad(porClave[clave]?.color) })
  const elegir = clave => e => { e.stopPropagation(); onElegir(elegido === clave ? null : clave) }
  const teclado = clave => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(clave)(e) } }

  const señalado = encima && porId[`t:${encima}`]
  const t = señalado && porClave[encima]
  const v = señalado && vidas[encima]

  return <div className="orbital">
    <svg className={`orbital-svg${foco ? ' hay-foco' : ''}`} viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`} onClick={() => onElegir(null)}
      role="group" aria-label="Sistema orbital: Second Brain en el centro, sus trabajadores alrededor, fuentes a la izquierda y destinos a la derecha">
      <defs>
        <marker id="orbital-flecha" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0.5 L7.5 4 L0 7.5 Z" className="orbital-flecha" />
        </marker>
      </defs>

      {d.orbitas.map(o => <ellipse key={o.clave} cx={LIENZO.cx} cy={LIENZO.cy} rx={o.rx} ry={o.ry} style={conColor(o.clave)}
        className={`orbital-orbita${foco?.nodos.has(`t:${o.clave}`) ? ' is-foco' : ''}${tenue(`t:${o.clave}`) ? ' is-tenue' : ''}`} />)}

      {d.enlaces.map(e => {
        const camino = trazo(porId[e.desde], porId[e.hasta])
        const enFoco = foco?.enlaces.has(e.id)
        const corriendo = estados[e.clave] === 'corriendo'
        const particulas = !reducido && (enFoco || corriendo)
        return <g key={e.id} style={conColor(e.clave)} className={`orbital-enlace${enFoco ? ' is-foco' : ''}${corriendo ? ' is-corriendo' : ''}${(foco ? !enFoco : !visibles.has(e.clave)) ? ' is-tenue' : ''}`}>
          <path d={camino} markerEnd={enFoco ? 'url(#orbital-flecha)' : undefined} />
          {particulas && [0, 1, 2].map(i => <circle key={i} r="2.2" className="orbital-particula">
            <animateMotion dur="3.6s" begin={`${i * 1.2}s`} repeatCount="indefinite" path={camino} />
          </circle>)}
        </g>
      })}

      <g className="orbital-nucleo" transform={`translate(${LIENZO.cx} ${LIENZO.cy})`}>
        {!reducido && <circle r={LIENZO.nucleo} className="orbital-nucleo-pulso" />}
        <circle r={LIENZO.nucleo} className="orbital-nucleo-cuerpo" />
        <text y="-3" className="orbital-nucleo-titulo">SECOND BRAIN</text>
        <text y="13" className="orbital-nucleo-dato">{activos} {activos === 1 ? 'trabajador activo' : 'trabajadores activos'}</text>
      </g>

      {d.nodos.filter(n => n.tipo !== 'trabajador').map(n => {
        const { ancho, alto } = LIENZO.tarjeta
        return <g key={n.id} transform={`translate(${n.x} ${n.y})`} className={`orbital-tarjeta orbital-${n.tipo}${n.registro ? ' is-registro' : ''}${tenue(n.id) ? ' is-tenue' : ''}${foco?.nodos.has(n.id) ? ' is-foco' : ''}`}>
          <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="9" />
          <text x={-ancho / 2 + 12} y="-2" className="orbital-tarjeta-titulo">{n.etiqueta}</text>
          <text x={-ancho / 2 + 12} y="13" className="orbital-tarjeta-desc">{n.descripcion}</text>
        </g>
      })}

      {d.nodos.filter(n => n.tipo === 'trabajador').map(n => {
        const estado = estados[n.clave]
        const vida = vidas[n.clave]
        const arriba = n.y < LIENZO.cy - 4
        const dato = estado === 'pausado' ? 'pausado' : estado === 'corriendo' ? 'corriendo ahora'
          : [vida.ultimaFin ? haceCuanto(new Date(vida.ultimaFin).toISOString(), ahora) : 'sin corridas', vida.proxima && `vuelve ${enCuanto(vida.proxima, ahora)}`].filter(Boolean).join(' · ')
        return <g key={n.id} className={`orbital-trabajador estado-${estado}${elegido === n.clave ? ' is-elegido' : ''}${tenue(n.id) ? ' is-tenue' : ''}`}
          style={{ ...conColor(n.clave), transform: `translate(${n.x}px, ${n.y}px)` }}
          tabIndex={0} role="button" aria-pressed={elegido === n.clave} aria-label={`${n.etiqueta}: ${TEXTO_ESTADO[estado]}, ${dato}`}
          onClick={elegir(n.clave)} onKeyDown={teclado(n.clave)} onMouseEnter={() => setEncima(n.clave)} onMouseLeave={() => setEncima(null)}
          onFocus={() => setEncima(n.clave)} onBlur={() => setEncima(null)}>
          <g className="orbital-trabajador-cuerpo">
            {estado === 'corriendo' && !reducido && <circle r={LIENZO.nodo} className="orbital-latido" />}
            <circle r={LIENZO.nodo + 7} className="orbital-halo" />
            <circle r={LIENZO.nodo} className="orbital-esfera" />
            <IconoTrabajador clave={n.clave} />
            <circle cx="13" cy="-13" r="4" className="orbital-estado" />
          </g>
          <text y={arriba ? -LIENZO.nodo - 22 : LIENZO.nodo + 18} className="orbital-nombre">{n.etiqueta}</text>
          <text y={arriba ? -LIENZO.nodo - 9 : LIENZO.nodo + 31} className="orbital-dato">{dato}</text>
        </g>
      })}
    </svg>

    {señalado && <div className="orbital-tooltip" style={{ left: `${(señalado.x / LIENZO.ancho) * 100}%`, top: `${(señalado.y / LIENZO.alto) * 100}%` }} role="tooltip">
      <strong>{t.nombre}</strong>
      <dl>
        <div><dt>Última ejecución</dt><dd>{v.ultimaFin ? haceCuanto(new Date(v.ultimaFin).toISOString(), ahora) : '—'}</dd></div>
        <div><dt>Próxima</dt><dd>{v.proxima ? enCuanto(v.proxima, ahora) : t.activo ? '—' : 'pausado'}</dd></div>
        <div><dt>Entradas</dt><dd>{d.enlaces.filter(e => e.hasta === señalado.id).map(e => porId[e.desde].etiqueta).join(', ') || '—'}</dd></div>
        <div><dt>Salidas</dt><dd>{d.enlaces.filter(e => e.desde === señalado.id).map(e => porId[e.hasta].etiqueta).join(', ')}</dd></div>
      </dl>
    </div>}
  </div>
}
