import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { fechaLarga } from './fechas.js'
import { AGENTES_ORDEN, resumen } from './estadisticas.mjs'

// Sala de control de UP: lo que escriben los agentes en vivo, el loop de la cadena, Noruega (el agente madre que
// chequea que todo funcione) y las estadísticas de 14 días. Todo sale de up_corridas y up_chequeos.
const AGENTES = {
  planificador: { nombre: 'Planificador', corto: 'PLAN' },
  investigador: { nombre: 'Investigador', corto: 'INV' },
  redactor: { nombre: 'Redactor', corto: 'RED' },
  revisor: { nombre: 'Revisor', corto: 'REV' },
  disenador: { nombre: 'Diseñador', corto: 'DIS' },
  publicador: { nombre: 'Publicador', corto: 'PUB' },
}
const ESTADO_CORRIDA = { corriendo: 'Trabajando', ok: 'Completa', cortado: 'Cortada por cuota', error: 'Con error' }
const ESTADO_NORUEGA = { ok: 'Todo en orden', aviso: 'Hay avisos', falla: 'Algo no anda' }
const DIAS = 14
const DIA_MS = 86_400_000
const TZ = 'America/Argentina/Buenos_Aires'
const REDUCIR_MOVIMIENTO = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function hora(iso, segundos = false) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', ...(segundos && { second: '2-digit' }), hourCycle: 'h23', timeZone: TZ })
}

function haceCuanto(iso, ahora) {
  const min = Math.round((ahora - Date.parse(iso)) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

// El cron del pipeline corre a los minutos 2, 12, 22… de las 9 y las 10 UTC (06:02 a 07:52 de Buenos Aires).
function proximaCorrida(ahora) {
  const t = new Date(ahora)
  t.setUTCSeconds(0, 0)
  t.setUTCMinutes(t.getUTCMinutes() + ((12 - (t.getUTCMinutes() % 10)) % 10 || 10))
  for (let i = 0; i < 300; i++, t.setUTCMinutes(t.getUTCMinutes() + 10)) {
    if (t.getUTCHours() === 9 || t.getUTCHours() === 10) return t
  }
  return null
}

function cuandoEs(fecha, ahora) {
  const dia = d => new Date(d).toLocaleDateString('es-AR', { timeZone: TZ })
  if (dia(fecha) === dia(ahora)) return 'hoy'
  if (dia(fecha) === dia(ahora + DIA_MS)) return 'mañana'
  return new Date(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', timeZone: TZ })
}

function plural(n, uno, varios) { return n === 1 ? uno : varios }

function tituloCorrida(pasos) {
  if (pasos.length && pasos.every(p => p.agente === 'disenador')) return 'Placas'
  if (pasos.length && pasos.every(p => p.agente === 'publicador')) return 'Publicaciones'
  return 'Borradores'
}

function tono(accion) {
  if (/^(aprobó|publicó|armó)/.test(accion)) return 'ok'
  if (/^(marcó|no pudo|error|pasó a revisión|cortó)/.test(accion)) return 'mal'
  return ''
}

// ---------- Consola: los pasos de la corrida se escriben en pantalla ----------
function Consola({ corrida }) {
  const lineas = (corrida?.pasos || []).map(p => ({
    hora: hora(p.at, true), agente: AGENTES[p.agente]?.nombre.toLowerCase() || p.agente, red: p.red, tono: tono(p.accion),
    texto: `${p.accion}${p.detalle ? ` — ${p.detalle.length > 180 ? `${p.detalle.slice(0, 180)}…` : p.detalle}` : ''}`,
  }))
  const [listas, setListas] = useState(REDUCIR_MOVIMIENTO ? lineas.length : 0)
  const [letras, setLetras] = useState(0)
  const total = lineas.length
  const largo = lineas[listas]?.texto.length ?? 0

  useEffect(() => {
    if (listas >= total) return
    const t = setTimeout(() => {
      if (letras >= largo) { setListas(n => n + 1); setLetras(0) } else setLetras(n => Math.min(largo, n + 3))
    }, letras >= largo ? 380 : 16)
    return () => clearTimeout(t)
  }, [listas, letras, total, largo])

  const hasta = Math.min(listas + 1, total)
  const desde = Math.max(0, hasta - 14)
  return (
    <div className="up-term" aria-live="polite">
      {!total && <p className="up-term-l up-term-h">Sin corridas todavía. Cuando los agentes trabajen, lo vas a ver acá.</p>}
      {lineas.slice(desde, hasta).map((l, i) => {
        const idx = desde + i
        const escribiendo = idx === listas
        return (
          <p key={idx} className="up-term-l">
            <span className="up-term-h">{l.hora}</span> <span className="up-term-a">{l.agente.padEnd(12)}</span>{' '}
            {l.red && <span className="up-term-red">{l.red === 'linkedin' ? 'IN' : l.red === 'instagram' ? 'IG' : 'X'}</span>}
            <span className={escribiendo ? '' : `up-term-${l.tono}`}>{escribiendo ? l.texto.slice(0, letras) : l.texto}</span>
            {escribiendo && <span className="up-term-cursor" />}
          </p>
        )
      })}
    </div>
  )
}

// ---------- Loop: la cadena en anillo, con Noruega en el centro ----------
function Anillo({ activo, girando, noruega, revisando }) {
  const cx = 220, cy = 160, R = 108
  const pos = AGENTES_ORDEN.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / AGENTES_ORDEN.length; return [cx + R * Math.cos(a), cy + R * Math.sin(a)] })
  const color = { ok: '#7FB08E', aviso: '#E3B23C', falla: '#E08B7F' }[noruega?.estado] || '#8A857A'
  const k = AGENTES_ORDEN.indexOf(activo)
  return (
    <svg viewBox="0 0 440 320" className="up-anillo" role="img" aria-label="Cadena de agentes con Noruega en el centro">
      {/* La pista gira siempre en el sentido de la cadena; cuando los agentes corren, se pone ámbar y acelera. */}
      <circle cx={cx} cy={cy} r={R} fill="none" strokeWidth="1.5" className={`up-anillo-pista${girando ? ' corriendo' : ''}`} />
      <path d={`M ${pos[2][0] - 18} ${pos[2][1] + 2} Q ${cx + 20} ${cy + 40} ${pos[3][0] + 18} ${pos[3][1] + 2}`} fill="none" stroke="#E3B23C" strokeWidth="1.2" strokeDasharray="4 4" className="up-anillo-bucle" />
      {k > 0 && <path d={`M ${pos[k - 1][0]} ${pos[k - 1][1]} A ${R} ${R} 0 0 1 ${pos[k][0]} ${pos[k][1]}`} fill="none" className="up-anillo-tramo" />}
      <text x={cx + 62} y={cy + 100} textAnchor="start" className="up-anillo-chico" fill="#E3B23C">corrige ×2</text>
      {girando && !REDUCIR_MOVIMIENTO && (
        <g className="up-anillo-giro" style={{ transformOrigin: `${cx}px ${cy}px` }}><circle cx={cx} cy={cy - R} r="4" fill="#E3B23C" /></g>
      )}
      <circle cx={cx} cy={cy} r="46" fill="none" stroke={color} strokeWidth="1.2" />
      <text x={cx} y={cy - 4} textAnchor="middle" className="up-anillo-centro">Noruega</text>
      {revisando && <circle cx={cx} cy={cy} r="46" fill="none" stroke="#E3B23C" strokeWidth="2" className="up-anillo-revisando" />}
      <text x={cx} y={cy + 14} textAnchor="middle" className="up-anillo-chico" fill={revisando ? '#E3B23C' : color}>{revisando ? 'revisando…' : noruega ? ESTADO_NORUEGA[noruega.estado].toLowerCase() : 'sin revisar'}</text>
      {AGENTES_ORDEN.map((id, i) => {
        const [x, y] = pos[i]
        const on = id === activo
        const dx = x - cx, ancla = Math.abs(dx) < 10 ? 'middle' : dx > 0 ? 'start' : 'end'
        return (
          <g key={id}>
            {on && <circle cx={x} cy={y} r="17" fill="none" stroke="#E3B23C" strokeWidth="2" className="up-anillo-halo" />}
            <circle cx={x} cy={y} r="17" fill={on ? '#E3B23C' : '#141414'} stroke={on ? '#E3B23C' : '#E9E4D8'} strokeWidth="1.5" />
            <text x={x} y={y + 4} textAnchor="middle" className="up-anillo-num" fill={on ? '#141414' : '#E9E4D8'}>{String(i + 1).padStart(2, '0')}</text>
            <text x={x + (ancla === 'start' ? 24 : ancla === 'end' ? -24 : 0)} y={y + (ancla === 'middle' ? (y < cy ? -24 : 32) : 4)} textAnchor={ancla} className="up-anillo-nombre">{AGENTES[id].nombre.toLowerCase()}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------- Gráficos ----------
const COLOR_RESULTADO = { directo: 'var(--up-tinta)', corregido: 'var(--up-aviso)', revision: 'var(--up-error)' }

function Barras({ dias, porDia }) {
  const W = 520, top = 10, alto = 140
  const max = Math.max(3, ...dias.map(d => porDia[d].directo + porDia[d].corregido + porDia[d].revision))
  const ancho = (W - 40) / dias.length
  return (
    <svg viewBox="0 0 520 180" className="up-graf" role="img" aria-label="Borradores por día según el resultado del revisor">
      {[0, Math.ceil(max / 2), max].map(y => {
        const yy = top + alto - (y * alto) / max
        return <g key={y}><line x1="24" x2={W} y1={yy} y2={yy} stroke="var(--up-filete)" /><text x="16" y={yy + 3} textAnchor="end" className="up-graf-eje">{y}</text></g>
      })}
      {dias.map((d, i) => {
        const x = 34 + i * ancho
        let acc = 0
        const barras = ['directo', 'corregido', 'revision'].filter(k => porDia[d][k]).map(k => {
          const h = (porDia[d][k] * alto) / max
          acc += h
          return <rect key={k} x={x} y={top + alto - acc} width={ancho * 0.72} height={h} fill={COLOR_RESULTADO[k]} />
        })
        return <g key={d}>{barras}<text x={x + ancho * 0.36} y={top + alto + 16} textAnchor="middle" className="up-graf-eje">{d.slice(8)}</text></g>
      })}
    </svg>
  )
}

function Dona({ totales, pct }) {
  const cx = 110, cy = 88, r = 62, C = 2 * Math.PI * r
  const tot = totales.directo + totales.corregido + totales.revision
  const partes = ['directo', 'corregido', 'revision'].map((k, i, ks) => {
    const antes = ks.slice(0, i).reduce((s, x) => s + totales[x], 0)
    return { k, L: tot ? (totales[k] / tot) * C : 0, off: tot ? (antes / tot) * C : 0 }
  })
  return (
    <svg viewBox="0 0 220 176" className="up-graf up-graf-dona" role="img" aria-label="Resultado del revisor">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--up-filete)" strokeWidth="18" />
      {partes.filter(p => p.L > 0).map(p => <circle key={p.k} cx={cx} cy={cy} r={r} fill="none" stroke={COLOR_RESULTADO[p.k]} strokeWidth="18" strokeDasharray={`${p.L} ${C - p.L}`} strokeDashoffset={-p.off} transform={`rotate(-90 ${cx} ${cy})`} />)}
      <text x={cx} y={cy + 6} textAnchor="middle" className="up-graf-grande">{pct === null ? '—' : `${pct}%`}</text>
      <text x={cx} y={cy + 24} textAnchor="middle" className="up-graf-eje">aprobados</text>
    </svg>
  )
}

function Linea({ duraciones }) {
  const W = 260, top = 14, alto = 120
  const max = Math.max(60, ...duraciones.map(d => d.s))
  const px = i => 22 + (duraciones.length > 1 ? (i * (W - 30)) / (duraciones.length - 1) : (W - 30) / 2)
  const py = s => top + alto - (s * alto) / max
  const d = duraciones.map((x, i) => `${i ? 'L' : 'M'} ${px(i)} ${py(x.s)}`).join(' ')
  return (
    <svg viewBox="0 0 260 150" className="up-graf" role="img" aria-label="Duración de cada corrida en segundos">
      {[0, Math.round(max / 2), max].map(y => <g key={y}><line x1="22" x2={W} y1={py(y)} y2={py(y)} stroke="var(--up-filete)" /><text x="16" y={py(y) + 3} textAnchor="end" className="up-graf-eje">{y}</text></g>)}
      {duraciones.length > 1 && <path d={`${d} L ${px(duraciones.length - 1)} ${py(0)} L ${px(0)} ${py(0)} Z`} fill="rgba(18,18,18,.06)" />}
      <path d={d} fill="none" stroke="var(--up-tinta)" strokeWidth="1.6" />
      {duraciones.map((x, i) => (x.corrigio || duraciones.length === 1) && <circle key={x.id} cx={px(i)} cy={py(x.s)} r="3" fill={x.corrigio ? 'var(--up-aviso)' : 'var(--up-tinta)'} />)}
    </svg>
  )
}

function Corrida({ corrida, abierta, alternar }) {
  const pasos = corrida.pasos || []
  return (
    <li className={`up-corrida${abierta ? ' abierta' : ''}`}>
      <button className="up-corrida-fila" onClick={alternar} aria-expanded={abierta}>
        <span className="up-corrida-hora">{new Date(corrida.iniciado_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: TZ })} · {hora(corrida.iniciado_at)}</span>
        <span className="up-corrida-titulo">{tituloCorrida(pasos)} del {fechaLarga(corrida.fecha).toLowerCase()}<small>{corrida.origen === 'cron' ? 'Corrida automática' : 'La pediste vos'} · {pasos.length} {plural(pasos.length, 'paso', 'pasos')}</small></span>
        <span className={`up-tag t-${corrida.estado}`}>{ESTADO_CORRIDA[corrida.estado]}</span>
      </button>
      {abierta && (
        <ol className="up-pasos">
          {pasos.map((p, i) => (
            <li key={i}>
              <span className="up-paso-hora">{hora(p.at, true)}</span>
              <span className="up-paso-agente">{AGENTES[p.agente]?.nombre || 'Sistema'}</span>
              <span className="up-paso-texto">{p.red && <LogoRed red={p.red} />}<b>{p.accion}</b>{p.detalle && <span> — {p.detalle}</span>}</span>
            </li>
          ))}
          {corrida.error && <li className="up-paso-error"><span className="up-paso-hora" /><span className="up-paso-agente">Error</span><span className="up-paso-texto">{corrida.error}</span></li>}
        </ol>
      )}
    </li>
  )
}

export default function Agentes() {
  const [corridas, setCorridas] = useState(null)
  const [chequeos, setChequeos] = useState([])
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [revisando, setRevisando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [resultado, setResultado] = useState(null) // { estado, texto } de la revisión pedida a mano
  const [ahora, setAhora] = useState(() => Date.now())

  const cargar = useCallback(async () => {
    const desde = new Date(Date.now() - 2 * DIAS * DIA_MS).toISOString()
    const [c, ch] = await Promise.all([
      supabase.from('up_corridas').select('*').gte('iniciado_at', desde).order('iniciado_at', { ascending: false }).limit(500),
      supabase.from('up_chequeos').select('id,estado,chequeos,at').order('at', { ascending: false }).limit(48),
    ])
    if (c.error) { setError('No se pudo cargar el trabajo de los agentes: ' + c.error.message); return }
    setCorridas(c.data || [])
    setChequeos(ch.data || [])
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // En vivo: cada paso que anotan los agentes y cada revisión de Noruega llegan sin recargar.
  useEffect(() => {
    const canal = supabase.channel('up-agentes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'up_corridas' }, p => {
        if (!p.new?.id) return
        setCorridas(cs => [p.new, ...(cs || []).filter(c => c.id !== p.new.id)].sort((a, b) => b.iniciado_at.localeCompare(a.iniciado_at)))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'up_chequeos' }, p => {
        if (p.new?.id) setChequeos(cs => [p.new, ...cs.filter(c => c.id !== p.new.id)].slice(0, 48))
      })
      .subscribe()
    const reloj = setInterval(() => setAhora(Date.now()), 30_000)
    return () => { supabase.removeChannel(canal); clearInterval(reloj) }
  }, [])

  // Revisión a pedido: se ve en el loop mientras corre y al terminar dice qué encontró (aunque todo siga en verde).
  async function revisarAhora() {
    setRevisando(true); setAviso(''); setResultado(null)
    const { data, error } = await supabase.functions.invoke('up-noruega', { body: {} })
    if (error || data?.error) { setRevisando(false); setAviso(data?.error || 'Noruega no pudo revisar ahora. Probá de nuevo en un rato.'); return }
    await cargar()
    setRevisando(false)
    const r = data?.resultados?.[0]
    if (!r) return
    const bien = r.chequeos.filter(c => c.estado === 'ok').length
    const otros = r.chequeos.filter(c => c.estado !== 'ok').map(c => c.nombre.toLowerCase())
    setResultado({ estado: r.estado, texto: `Revisó a las ${hora(new Date().toISOString())}: ${r.estado === 'ok' ? 'todo en orden' : `mirá ${otros.join(', ')}`} (${bien} de ${r.chequeos.length} chequeos bien).` })
  }

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!corridas) return <p className="up-vacio">Cargando…</p>

  const enCurso = corridas.find(c => c.estado === 'corriendo')
  const mostrada = enCurso || corridas.find(c => (c.pasos || []).length > 1) || corridas[0]
  const activo = enCurso ? (enCurso.pasos || []).at(-1)?.agente : null
  const stats = resumen(corridas, ahora, DIAS)
  const noruega = chequeos[0]
  const proxima = proximaCorrida(ahora)
  const todosLosPasos = corridas.flatMap(c => c.pasos || [])
  const ultimoDe = id => todosLosPasos.filter(p => p.agente === id).sort((a, b) => b.at.localeCompare(a.at))[0]
  const dif = stats.borradores - stats.borradoresAntes
  const maxAct = Math.max(1, ...AGENTES_ORDEN.flatMap(id => stats.actividad[id]))

  return (
    <>
      <div className="up-enc up-enc-sala">
        <div>
          <div className="up-antetitulo">Agentes · sala de control</div>
          <h2 className="up-titular-1">{enCurso ? `Los agentes están trabajando en el ${fechaLarga(enCurso.fecha).toLowerCase()}` : 'Los agentes, en vivo'}</h2>
          <p className="up-bajada">Lo que están escribiendo, cómo gira la cadena, qué encontró Noruega y qué rindió cada agente en los últimos {DIAS} días.</p>
        </div>
        <div className="up-sala-estado">
          <div><span className={`up-led l-${noruega?.estado || 'off'}`} /><b>{noruega ? ESTADO_NORUEGA[noruega.estado].toUpperCase() : 'SIN REVISAR'}</b></div>
          {mostrada && <div>última corrida · <b>{hora(mostrada.iniciado_at)}</b> · {ESTADO_CORRIDA[mostrada.estado].toLowerCase()}</div>}
          {proxima && <div>próxima · <b>{cuandoEs(proxima, ahora)} {hora(proxima.toISOString())}</b></div>}
        </div>
      </div>

      <section className="up-consola">
        <div>
          <div className="up-consola-cab">
            <span className={enCurso ? 'up-vivo' : ''}>{enCurso ? <><i />en vivo</> : 'última corrida'}</span>
            {mostrada && <span>{tituloCorrida(mostrada.pasos || []).toLowerCase()} · <b>{new Date(mostrada.iniciado_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: TZ })} {hora(mostrada.iniciado_at)}</b></span>}
          </div>
          <Consola key={mostrada?.id || 'nada'} corrida={mostrada} />
        </div>
        <div className="up-consola-loop">
          <div className="up-consola-cab"><span>loop de agentes</span><span>{activo ? <>trabajando · <b>{AGENTES[activo]?.nombre.toLowerCase()}</b></> : 'en espera'}</span></div>
          <Anillo activo={activo} girando={Boolean(enCurso)} noruega={noruega} revisando={revisando} />
        </div>
      </section>

      <div className="up-vol up-vol-sala">Noruega · agente madre<span>{noruega ? `revisó ${haceCuanto(noruega.at, ahora)} · cada 30 min` : 'todavía no revisó'}</span></div>
      <section className="up-noruega">
        <ul key={resultado?.texto || 'chequeos'} className={`up-chequeos-sala${resultado ? ' recien' : ''}`}>
          {(noruega?.chequeos || []).map(c => (
            <li key={c.id}><span className={`up-led l-${c.estado}`} /><b>{c.nombre}</b><span>{c.detalle}</span></li>
          ))}
          {!noruega && <li><span className="up-led l-off" /><b>Sin revisiones</b><span>Noruega revisa cada 30 minutos. Podés pedirle una revisión ahora.</span></li>}
        </ul>
        <aside className="up-noruega-lado">
          <div className="up-mono-k">Últimas {chequeos.length} revisiones</div>
          <div className="up-ticks" aria-label="Historial de revisiones de Noruega">
            {[...chequeos].reverse().map(c => <i key={c.id} className={`l-${c.estado}`} title={`${hora(c.at)} · ${ESTADO_NORUEGA[c.estado]}`} />)}
          </div>
          <button className="up-btn" disabled={revisando} onClick={revisarAhora}>{revisando ? 'Revisando…' : 'Revisar ahora'}</button>
          {resultado && <p role="status" className={`up-aviso-nota ${resultado.estado === 'ok' ? 'up-aviso-ok' : resultado.estado === 'falla' ? 'up-aviso-error' : ''}`}>{resultado.texto}</p>}
          {aviso && <p role="alert" className="up-error">{aviso}</p>}
        </aside>
      </section>

      <div className="up-vol up-vol-sala">Estadísticas<span>últimos {DIAS} días</span></div>
      <section className="up-kpis">
        <div><div className="up-mono-k">Borradores</div><div className="up-kpi-v">{stats.borradores}</div><div className="up-mono-d">{dif === 0 ? 'igual que antes' : `${dif > 0 ? '▲' : '▼'} ${Math.abs(dif)} vs ${DIAS} días antes`}</div></div>
        <div><div className="up-mono-k">Pasan el revisor</div><div className="up-kpi-v">{stats.aprobadosPct ?? '—'}{stats.aprobadosPct !== null && <small>%</small>}</div><div className="up-mono-d">{stats.primerIntentoPct === null ? 'sin borradores revisados' : `al primer intento: ${stats.primerIntentoPct}%`}</div></div>
        <div><div className="up-mono-k">Duración media</div><div className="up-kpi-v">{stats.duracionMedia ?? '—'}{stats.duracionMedia !== null && <small>s</small>}</div><div className="up-mono-d">por corrida</div></div>
        <div><div className="up-mono-k">Publicados</div><div className="up-kpi-v">{stats.publicados}</div><div className="up-mono-d">{stats.erroresPublicacion} {plural(stats.erroresPublicacion, 'error', 'errores')}</div></div>
      </section>
      <section className="up-graficos">
        <div><h4 className="up-mono-k">Borradores por día <span>· resultado del revisor</span></h4><Barras dias={stats.dias} porDia={stats.porDia} />
          <div className="up-ley"><span><i style={{ background: 'var(--up-tinta)' }} />aprobó al primer intento</span><span><i style={{ background: 'var(--up-aviso)' }} />aprobó tras corregir</span><span><i style={{ background: 'var(--up-error)' }} />pasó a revisión</span></div></div>
        <div><h4 className="up-mono-k">Revisor <span>· {stats.revisados} {plural(stats.revisados, 'borrador', 'borradores')}</span></h4><Dona totales={stats.totales} pct={stats.aprobadosPct} />
          <div className="up-ley"><span><i style={{ background: 'var(--up-tinta)' }} />{stats.totales.directo} directo</span><span><i style={{ background: 'var(--up-aviso)' }} />{stats.totales.corregido} corregidos</span><span><i style={{ background: 'var(--up-error)' }} />{stats.totales.revision} a revisión</span></div></div>
        <div><h4 className="up-mono-k">Duración de corridas <span>· segundos</span></h4>
          {stats.duraciones.length ? <Linea duraciones={stats.duraciones} /> : <p className="up-vacio">Sin corridas en estos días.</p>}
          <div className="up-ley"><span><i style={{ background: 'var(--up-aviso)', borderRadius: '50%' }} />corridas con correcciones</span></div></div>
      </section>

      <div className="up-vol up-vol-sala">Agentes<span>actividad diaria · {DIAS} días</span></div>
      <table className="up-tabla-agentes">
        <thead><tr><th>Agente</th><th>Estado</th><th className="up-col-act">Actividad</th><th className="up-col-num">{DIAS}d</th><th className="up-col-ult">Última acción</th></tr></thead>
        <tbody>
          {AGENTES_ORDEN.map((id, i) => {
            const ultimo = ultimoDe(id)
            const estado = id === activo ? ['run', 'trabajando'] : !ultimo ? ['off', 'sin actividad'] : id === 'disenador' || id === 'publicador' ? ['ok', 'en espera'] : ['ok', 'listo']
            return (
              <tr key={id}>
                <td className="up-tabla-n"><small>{String(i + 1).padStart(2, '0')} · {AGENTES[id].corto}</small>{AGENTES[id].nombre}</td>
                <td><span className={`up-led l-${estado[0]}`} />{estado[1]}</td>
                <td className="up-col-act"><div className="up-spark">{stats.actividad[id].map((v, j) => <i key={j} className={v ? '' : 'z'} style={{ height: v ? `${4 + (v / maxAct) * 20}px` : '2px' }} />)}</div></td>
                <td className="up-col-num">{stats.totalAgente[id]}</td>
                <td className="up-col-ult">{ultimo ? <><b>{ultimo.accion}</b> · {haceCuanto(ultimo.at, ahora)}</> : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <section className="up-bloque up-sala-registro">
        <div className="up-vol up-vol-grande">Registro de corridas<span>{corridas.length} {plural(corridas.length, 'corrida', 'corridas')} · {2 * DIAS} días</span></div>
        {corridas.length === 0
          ? <p className="up-vacio">Cuando los agentes trabajen, acá vas a ver cada paso: qué datos eligieron, qué escribieron y qué marcó el revisor.</p>
          : <ul className="up-corridas">{corridas.slice(0, 40).map(c => <Corrida key={c.id} corrida={c} abierta={abierta === c.id} alternar={() => setAbierta(abierta === c.id ? null : c.id)} />)}</ul>}
      </section>
    </>
  )
}
