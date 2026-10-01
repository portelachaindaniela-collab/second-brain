import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { horaAR, haceCuanto } from '../trabajadores.mjs'
import {
  colorIdentidad, actividadPorHora, grafoFlujo, caminoDe, destinosDe, corriendoAhora, GRAFO,
  vidaDeTrabajador, grosorHilo, ultimaActividad, textoTrabajador,
} from '../tablero.mjs'

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

// Borde del nodo por donde sale o entra un hilo (en los trabajadores, por fuera del arco de la próxima corrida).
function borde(n, lado) {
  if (n.tipo === 'trabajador') return n.x + (lado === 'salida' ? GRAFO.radio + 7 : -GRAFO.radio - 7)
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

  const idPuntos = useId()
  const activos = new Set(corriendo)
  const camino = caminoDe(elegido, grafo)
  const porId = Object.fromEntries(grafo.nodos.map(n => [n.id, n]))
  const porClave = Object.fromEntries(trabajadores.map(t => [t.clave, t]))
  const colorDe = Object.fromEntries(trabajadores.map(t => [t.clave, colorIdentidad(t.color)]))
  // Señales de vida: cuándo corrió, cuándo vuelve, cuánto tráfico tuvo. Todo de trabajos_corridas y del cron.
  const vidas = Object.fromEntries(trabajadores.map(t => [t.clave, vidaDeTrabajador(t, corridasPor[t.clave] || [], ahora)]))
  const corridas24 = Object.values(vidas).reduce((suma, v) => suma + v.corridas24, 0)
  const atenuado = id => (camino && !camino.nodos.has(id) ? ' is-atenuado' : '')
  const elegir = id => e => { e.stopPropagation(); setElegido(actual => (actual === id ? null : id)) }
  const teclado = id => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(id)(e) } }
  const W = GRAFO.nodoAncho, H = GRAFO.nodoAlto, R = GRAFO.radio
  const actividad = (n, verbo) => {
    const t = ultimaActividad(n.id, grafo, vidas)
    return t ? `${verbo} ${haceCuanto(new Date(t).toISOString(), ahora)}` : `sin ${verbo === 'leído' ? 'lecturas' : 'escrituras'}`
  }

  return <>
    <p className="tablero-nota tenue">{elegido ? 'tocá el mismo nodo o el fondo para ver todo' : 'tocá un nodo para ver su camino · el grosor de cada hilo es su tráfico en 24 h · el arco, cuánto falta para la próxima corrida'}</p>
    <div className="flujo-marco">
      <svg className={`flujo${camino ? ' hay-camino' : ''}`} viewBox={`0 0 ${GRAFO.ancho} ${grafo.alto}`} onClick={() => setElegido(null)}
        role="group" aria-label="Mapa de flujo: de dónde lee cada trabajador y adónde escribe">
        <defs>
          <pattern id={idPuntos} width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="9" cy="9" r="0.9" className="flujo-punto" />
          </pattern>
        </defs>
        <rect width={GRAFO.ancho} height={grafo.alto} fill={`url(#${idPuntos})`} />
        {['fuentes', 'trabajadores', 'destinos'].map((t, i) =>
          <text key={t} x={[GRAFO.x.fuente, GRAFO.x.trabajador, GRAFO.x.destino][i]} y="18" className="flujo-columna">{t}</text>)}

        <g>
          {grafo.hilos.map(h => {
            const a = porId[h.desde], b = porId[h.hasta]
            const activo = activos.has(h.clave)
            return <path key={h.id} d={curva(borde(a, 'salida'), a.y, borde(b, 'entrada'), b.y)}
              className={`flujo-hilo${activo ? ' is-activo' : ''}${camino && !camino.hilos.has(h.id) ? ' is-atenuado' : ''}`}
              style={{ strokeWidth: grosorHilo(vidas[h.clave]?.corridas24), ...(activo ? { '--id': colorDe[h.clave] } : {}) }} />
          })}
        </g>

        {grafo.nodos.map(n => {
          const comun = {
            transform: `translate(${n.x} ${n.y})`, tabIndex: 0, role: 'button',
            'aria-pressed': elegido === n.id, onClick: elegir(n.id), onKeyDown: teclado(n.id),
          }
          if (n.tipo === 'trabajador') {
            const t = porClave[n.clave]
            const vida = vidas[n.clave]
            const activo = activos.has(n.clave)
            const pausado = t?.activo === false
            const dato = textoTrabajador(t, vida, activo, ahora)
            return <g key={n.id} {...comun} className={`flujo-nodo flujo-nodo-trabajador${pausado ? ' is-pausado' : ''}${atenuado(n.id)}`} style={{ '--id': colorDe[n.clave] }}
              aria-label={`${n.etiqueta}: ${dato}`}>
              <circle r={R + 13} className="flujo-halo" />
              <circle r={R + 6} className="flujo-arco-pista" />
              {!pausado && vida.progreso != null && <circle r={R + 6} className="flujo-arco" pathLength="100"
                strokeDasharray={`${Math.max(vida.progreso * 100, 0.5)} 100`} transform="rotate(-90)" />}
              {activo && <circle r={R} className="flujo-anillo" />}
              <circle r={R} className="flujo-orbe" />
              <circle r={R * 0.38} className="flujo-nucleo" />
              <text y={R + 26} className="flujo-etiqueta">{n.etiqueta}</text>
              <text y={R + 40} className="flujo-dato">{dato}</text>
            </g>
          }
          const destino = n.tipo === 'destino'
          const dato = n.registro ? `${corridas24} corridas en 24 h` : actividad(n, destino ? 'escrito' : 'leído')
          return <g key={n.id} {...comun} className={`flujo-nodo flujo-nodo-${n.tipo}${n.registro ? ' flujo-registro' : ''}${atenuado(n.id)}`} aria-label={`${n.etiqueta}: ${dato}`}>
            <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={destino ? 7 : H / 2} className="flujo-caja" />
            {destellos[n.id] > 0 && <rect key={destellos[n.id]} x={-W / 2} y={-H / 2} width={W} height={H} rx={destino ? 7 : H / 2} className="flujo-destello" />}
            {destino
              ? <g transform={`translate(${-W / 2 + 15} 0)`} className="flujo-icono">
                <ellipse cy="-5" rx="6" ry="2.4" /><path d="M-6 -5 V5 A6 2.4 0 0 0 6 5 V-5" /><path d="M-6 0 A6 2.4 0 0 0 6 0" />
              </g>
              : <circle cx={-W / 2 + 15} r="3.5" className="flujo-icono-fuente" />}
            <text x={-W / 2 + 28} y="4" className="flujo-etiqueta flujo-etiqueta-inicio">{n.etiqueta}</text>
            <text y={H / 2 + 15} className="flujo-dato">{dato}</text>
          </g>
        })}
      </svg>
    </div>
  </>
}
