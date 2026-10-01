import { useEffect, useMemo, useRef, useState } from 'react'
import { horaAR } from '../trabajadores.mjs'
import { colorIdentidad, actividadPorHora, grafoFlujo, caminoDe, destinosDe, corriendoAhora, GRAFO } from '../tablero.mjs'

const BARRAS = { ancho: 480, alto: 110 }

export function Actividad({ trabajadores, corridasPor, ahora }) {
  // La hora cambia cada hora: no hace falta recalcular con cada tic del reloj.
  const hora = Math.floor(ahora / 3600_000)
  const horas = useMemo(() => actividadPorHora(trabajadores, corridasPor, hora * 3600_000), [trabajadores, corridasPor, hora])
  const maximo = Math.max(1, ...horas.map(h => h.total))
  const paso = BARRAS.ancho / horas.length
  const porClave = Object.fromEntries(trabajadores.map(t => [t.clave, t]))
  return <>
    <p className="tablero-nota tenue">corridas por hora · máx {maximo}</p>
    <svg className="tablero-barras" viewBox={`0 0 ${BARRAS.ancho} ${BARRAS.alto}`} preserveAspectRatio="none" role="img"
      aria-label={`Corridas por hora en las últimas 24 horas: ${horas.reduce((s, h) => s + h.total, 0)} en total`}>
      <line x1="0" x2={BARRAS.ancho} y1={BARRAS.alto - 0.5} y2={BARRAS.alto - 0.5} className="tablero-eje" />
      {horas.map((h, i) => {
        let y = BARRAS.alto
        const titulo = `${horaAR(h.inicio)}–${horaAR(h.inicio + 3600_000)} · ${h.total ? h.partes.map(p => `${porClave[p.clave]?.nombre ?? p.clave} ${p.n}`).join(' · ') : 'sin corridas'}`
        return <g key={h.inicio}>
          <title>{titulo}</title>
          <rect x={i * paso} y="0" width={paso} height={BARRAS.alto} className="tablero-barra-fondo" />
          {h.partes.map(p => {
            const alto = (p.n / maximo) * (BARRAS.alto - 4)
            y -= alto
            return <rect key={p.clave} x={i * paso + 1.5} y={y} width={paso - 3} height={Math.max(alto - 1, 1)}
              style={{ fill: colorIdentidad(porClave[p.clave]?.color) }} />
          })}
        </g>
      })}
    </svg>
    <div className="consola-eje tenue"><span>-24h</span><span>now</span></div>
    <div className="tablero-leyenda">
      {trabajadores.map(t => <span key={t.clave}><i style={{ background: colorIdentidad(t.color) }} />{t.nombre}</span>)}
    </div>
  </>
}

export function Salud({ salud, alertas }) {
  const d = salud.datos
  const ev = d?.eventos ?? {}
  return <>
    <dl className="consola-json">
      <div><dt>supabase</dt><dd>{salud.error
        ? <span className="txt-error">no responde ({salud.error})</span>
        : salud.ms != null ? <>activo <span className="tenue">· responde en {salud.ms} ms</span></> : <span className="tenue">consultando…</span>}</dd></div>
      <div><dt>pg_cron</dt><dd>{d ? <>{d.jobs_activos} de {d.jobs_total} jobs activos{d.fallos_cron_24h ? <span className="txt-error"> · {d.fallos_cron_24h} fallos en 24 h</span> : <span className="tenue"> · sin fallos en 24 h</span>}</> : '—'}</dd></div>
      <div><dt>eventos</dt><dd>{d ? <>anotados {ev.anotado ?? 0} <span className="tenue">·</span> evaluados {ev.evaluado ?? 0}</> : '—'}</dd></div>
    </dl>
    <p className="consola-subtitulo">alertas <span className="tenue">· {alertas.length || 'ninguna'}</span></p>
    {alertas.length
      ? <ul className="tablero-alertas">{alertas.map(a => <li key={a.texto} className={a.nivel === 'error' ? 'txt-error' : 'txt-corriendo'}>{a.texto}</li>)}</ul>
      : <p className="tenue">nada pendiente.</p>}
  </>
}

function curva(x1, y1, x2, y2) {
  const m = (x1 + x2) / 2
  return `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}`
}

// Borde del nodo por donde sale o entra un hilo.
function borde(n, lado) {
  if (n.tipo === 'trabajador') return n.x + (lado === 'salida' ? GRAFO.radio : -GRAFO.radio)
  return n.x + (lado === 'salida' ? GRAFO.nodoAncho / 2 : -GRAFO.nodoAncho / 2)
}

export function MapaFlujo({ trabajadores, corridasPor, ahora }) {
  const grafo = useMemo(() => grafoFlujo(trabajadores), [trabajadores])
  const [elegido, setElegido] = useState(null)
  const [destellos, setDestellos] = useState({})
  const corriendo = corriendoAhora(trabajadores, corridasPor, ahora)
  const firma = corriendo.join(',')
  const previo = useRef(new Set())

  // Cuando un trabajador deja de correr, sus destinos parpadean una vez. Sale del mismo Realtime que el tail.
  useEffect(() => {
    const actuales = new Set(firma ? firma.split(',') : [])
    const terminaron = [...previo.current].filter(k => !actuales.has(k))
    previo.current = actuales
    if (!terminaron.length) return
    setDestellos(prev => {
      const siguiente = { ...prev }
      for (const clave of terminaron) for (const id of destinosDe(clave, grafo)) siguiente[id] = (siguiente[id] ?? 0) + 1
      return siguiente
    })
  }, [firma, grafo])

  const activos = new Set(corriendo)
  const camino = caminoDe(elegido, grafo)
  const porId = Object.fromEntries(grafo.nodos.map(n => [n.id, n]))
  const colorDe = Object.fromEntries(trabajadores.map(t => [t.clave, colorIdentidad(t.color)]))
  const atenuado = id => (camino && !camino.nodos.has(id) ? ' is-atenuado' : '')
  const elegir = id => e => { e.stopPropagation(); setElegido(actual => (actual === id ? null : id)) }
  const teclado = id => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(id)(e) } }
  const W = GRAFO.nodoAncho, H = GRAFO.nodoAlto, R = GRAFO.radio

  return <>
    <p className="tablero-nota tenue">{elegido ? 'tocá el mismo nodo o el fondo para ver todo' : 'tocá un nodo para ver su camino'}</p>
    <div className="flujo-marco">
      <svg className={`flujo${camino ? ' hay-camino' : ''}`} viewBox={`0 0 ${GRAFO.ancho} ${grafo.alto}`} onClick={() => setElegido(null)}
        role="group" aria-label="Mapa de flujo: de dónde lee cada trabajador y adónde escribe">
        {['fuentes', 'trabajadores', 'destinos'].map((t, i) =>
          <text key={t} x={[GRAFO.x.fuente, GRAFO.x.trabajador, GRAFO.x.destino][i]} y="16" className="flujo-columna">{t}</text>)}

        <g>
          {grafo.hilos.map(h => {
            const a = porId[h.desde], b = porId[h.hasta]
            const activo = activos.has(h.clave)
            return <path key={h.id} d={curva(borde(a, 'salida'), a.y, borde(b, 'entrada'), b.y)}
              className={`flujo-hilo${activo ? ' is-activo' : ''}${camino && !camino.hilos.has(h.id) ? ' is-atenuado' : ''}`}
              style={activo ? { '--id': colorDe[h.clave] } : undefined} />
          })}
        </g>

        {grafo.nodos.map(n => {
          const comun = {
            transform: `translate(${n.x} ${n.y})`, tabIndex: 0, role: 'button',
            'aria-pressed': elegido === n.id, onClick: elegir(n.id), onKeyDown: teclado(n.id),
          }
          if (n.tipo === 'trabajador') {
            const activo = activos.has(n.clave)
            const pausado = trabajadores.find(t => t.clave === n.clave)?.activo === false
            return <g key={n.id} {...comun} className={`flujo-nodo flujo-nodo-trabajador${pausado ? ' is-pausado' : ''}${atenuado(n.id)}`} style={{ '--id': colorDe[n.clave] }}
              aria-label={`${n.etiqueta}${activo ? ', corriendo' : pausado ? ', pausado' : ''}`}>
              {activo && <circle r={R} className="flujo-anillo" />}
              <circle r={R} className="flujo-circulo" />
              <text y={R + 15} className="flujo-etiqueta">{n.etiqueta}</text>
            </g>
          }
          return <g key={n.id} {...comun} className={`flujo-nodo flujo-nodo-${n.tipo}${n.registro ? ' flujo-registro' : ''}${atenuado(n.id)}`} aria-label={n.etiqueta}>
            <rect x={-W / 2} y={-H / 2} width={W} height={H} rx="6" className="flujo-caja" />
            {destellos[n.id] > 0 && <rect key={destellos[n.id]} x={-W / 2} y={-H / 2} width={W} height={H} rx="6" className="flujo-destello" />}
            <text y="4" className="flujo-etiqueta">{n.etiqueta}</text>
          </g>
        })}
      </svg>
    </div>
  </>
}
