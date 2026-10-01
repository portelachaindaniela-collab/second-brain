import { useMemo } from 'react'
import { horaAR } from '../trabajadores.mjs'
import { colorIdentidad, actividadPorHora } from '../tablero.mjs'

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
