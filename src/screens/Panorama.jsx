import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'
import { colorIdentidad } from '../tablero.mjs'
import { horaAR } from '../trabajadores.mjs'
import { nombreCorto, proximas, temasDeCanillita, duracionCorta, puntosDeLinea } from '../panorama.mjs'
import { nombreTema } from '../noticias.mjs'
import { Bloques, Bloque } from '../estructura.jsx'
import { Actividad } from './TableroTrabajadores.jsx'
import './Panorama.css'

const n = v => Number(v ?? 0).toLocaleString('es-AR')
const SIN_CORRIDAS = []
const TEMA_CORTO = { politica_ia: 'Política de IA', futbol_femenino: 'Fútbol femenino' }

// Línea chica para cifras y filas. relleno: el área bajo la línea, tenue.
export function Linea({ valores, color, ancho = 120, alto = 18, relleno = false }) {
  const puntos = puntosDeLinea(valores, ancho, alto)
  if (!puntos) return <svg className="pano-linea" width={ancho} height={alto} aria-hidden="true" />
  const ultimo = puntos.split(' ').at(-1).split(',')
  return <svg className="pano-linea" viewBox={`0 0 ${ancho} ${alto}`} width={ancho} height={alto} aria-hidden="true" preserveAspectRatio="none">
    {relleno && <path d={`M0,${alto} L${puntos.replaceAll(' ', ' L')} L${ancho},${alto} Z`} style={{ fill: color }} opacity=".15" />}
    <polyline points={puntos} fill="none" style={{ stroke: color }} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    <circle cx={ultimo[0]} cy={ultimo[1]} r="2.2" style={{ fill: color }} />
  </svg>
}

function Barra({ valor, maximo, color, raiz = false }) {
  const p = maximo > 0 ? (raiz ? Math.sqrt(valor / maximo) : valor / maximo) * 100 : 0
  return <div className="pano-barra"><div style={{ width: `${valor > 0 ? Math.max(p, 1.5) : 0}%`, background: color }} /></div>
}

// ---------- Paneles: uno por pregunta, cada uno un gráfico ----------
function useFuentesCanillita(versionCanillita) {
  const [datos, setDatos] = useState(null)
  useEffect(() => {
    let vivo = true
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString()
    const contar = canal => supabase.from('noticias').select('id', { count: 'exact', head: true }).eq('canal', canal).gte('created_at', desde)
    Promise.all([
      contar('x'), contar('web'), contar('bluesky'),
      supabase.from('noticias_medios').select('medio,ultimo_error').not('ultimo_error', 'is', null).order('medio'),
      supabase.from('noticias_medios').select('id', { count: 'exact', head: true }),
    ]).then(([x, web, bluesky, fallan, total]) => {
      if (!vivo) return
      setDatos({ canales: [['X', x.count ?? 0], ['Web', web.count ?? 0], ['Bluesky', bluesky.count ?? 0]], fallan: fallan.data ?? [], total: total.count ?? 0 })
    })
    return () => { vivo = false }
  }, [versionCanillita])
  return datos
}

function Duraciones({ trabajadores, resumenes }) {
  return trabajadores.map(t => {
    const r = resumenes[t.clave] ?? {}
    return <div key={t.clave} className="pano-fila">
      <span className="pano-quien"><i style={{ background: colorIdentidad(t.color) }} />{nombreCorto(t.nombre)}</span>
      <Linea valores={r.duraciones ?? []} color={colorIdentidad(t.color)} ancho={160} alto={16} />
      <span className="pano-num">{duracionCorta(r.duracionPromedio)}</span>
    </div>
  })
}

function QueTrajo({ trabajadores, resumenes }) {
  const maximo = Math.max(1, ...trabajadores.map(t => resumenes[t.clave]?.resultados ?? 0))
  return [...trabajadores].sort((a, b) => (resumenes[b.clave]?.resultados ?? 0) - (resumenes[a.clave]?.resultados ?? 0)).map(t => <div key={t.clave} className="pano-fila">
    <span className="pano-quien"><i style={{ background: colorIdentidad(t.color) }} />{nombreCorto(t.nombre)}</span>
    <Barra valor={resumenes[t.clave]?.resultados ?? 0} maximo={maximo} color={colorIdentidad(t.color)} raiz />
    <span className="pano-num">{n(resumenes[t.clave]?.resultados)}</span>
  </div>)
}

function Temas({ temas }) {
  if (!temas.length) return <p className="pano-vacio">sin notas en las últimas 24 h</p>
  const maximo = temas[0][1]
  return temas.map(([tema, v]) => <div key={tema} className="pano-fila pano-fila-baja">
    <span className="pano-quien" title={nombreTema(tema)}>{TEMA_CORTO[tema] ?? nombreTema(tema)}</span>
    <Barra valor={v} maximo={maximo} color="var(--id-arena)" />
    <span className="pano-num">{n(v)}</span>
  </div>)
}

function Canales({ datos }) {
  if (!datos) return <p className="pano-vacio">contando…</p>
  const total = datos.canales.reduce((s, [, v]) => s + v, 0)
  const colores = { X: 'var(--gray-900)', Web: 'var(--id-arena)', Bluesky: 'var(--id-azul)' }
  return <>
    <div className="pano-apilada">{datos.canales.map(([c, v]) => v > 0 && <div key={c} style={{ flexGrow: v, background: colores[c] }} title={`${c}: ${v}`} />)}</div>
    <div className="pano-trio">{datos.canales.map(([c, v]) => <div key={c}>
      <small>{c}</small><b>{n(v)}</b><span style={{ color: colores[c] }}>{total ? Math.round((v / total) * 100) : 0}%</span>
    </div>)}</div>
  </>
}

function Fallas({ datos }) {
  if (!datos) return <p className="pano-vacio">revisando…</p>
  if (!datos.fallan.length) return <p className="pano-vacio">ninguna fuente falló en su última lectura</p>
  return <ol className="pano-lista">{datos.fallan.slice(0, 8).map((f, i) => <li key={f.medio} title={f.ultimo_error}>
    <span>{String(i + 1).padStart(2, '0')}</span>{f.medio}<em>{/^web/.test(f.ultimo_error) ? 'web' : /Bluesky/.test(f.ultimo_error) ? 'bluesky' : 'X'}</em>
  </li>)}</ol>
}

function ProximaHora({ trabajadores, ahora }) {
  const minuto = Math.floor(ahora / 60_000)
  const lista = useMemo(() => proximas(trabajadores, minuto * 60_000), [trabajadores, minuto])
  const ancho = 400, desde = minuto * 60_000
  const xDe = t => 10 + ((t - desde) / 3_600_000) * (ancho - 20)
  return <svg className="pano-hora" viewBox={`0 0 ${ancho} 120`} role="img" aria-label={`${lista.length} corridas en la próxima hora`}>
    <text x="10" y="16" className="pano-tenue">{lista.length} corridas en la próxima hora</text>
    <line x1="10" x2={ancho - 10} y1="62" y2="62" className="pano-eje" />
    {[0, 15, 30, 45, 60].map(m => <g key={m}>
      <line x1={10 + (m / 60) * (ancho - 20)} x2={10 + (m / 60) * (ancho - 20)} y1="58" y2="66" className="pano-eje" />
      <text x={10 + (m / 60) * (ancho - 20)} y="84" textAnchor={m === 0 ? 'start' : m === 60 ? 'end' : 'middle'} className="pano-tenue">{m === 0 ? 'ahora' : horaAR(desde + m * 60_000)}</text>
    </g>)}
    {lista.map((p, i) => <g key={`${p.clave}-${p.cuando}`}>
      <title>{`${p.nombre} · ${horaAR(p.cuando)}`}</title>
      <line x1={xDe(p.cuando)} x2={xDe(p.cuando)} y1="62" y2={i % 2 ? 92 : 32} style={{ stroke: colorIdentidad(p.color) }} />
      <circle cx={xDe(p.cuando)} cy="62" r="4.5" style={{ fill: colorIdentidad(p.color) }} />
    </g>)}
  </svg>
}

function SaludPorTrabajador({ trabajadores, resumenes, salud, alertas }) {
  const d = salud?.datos
  return <>
    {trabajadores.map(t => {
      const r = resumenes[t.clave] ?? {}
      return <div key={t.clave} className="pano-fila pano-fila-baja">
        <span className="pano-quien"><i style={{ background: colorIdentidad(t.color) }} />{nombreCorto(t.nombre)}</span>
        <Barra valor={r.ok ?? 0} maximo={Math.max(1, r.corridas ?? 0)} color={r.error ? 'var(--red-600)' : 'var(--green-600)'} />
        <span className="pano-num">{r.ok ?? 0}/{r.corridas ?? 0}</span>
      </div>
    })}
    <p className="pano-sistema">
      {salud?.error ? <span className="txt-error">supabase no responde</span> : <>supabase {salud?.ms != null ? `${salud.ms} ms` : '…'}</>}
      {d && <> · pg_cron {d.jobs_activos}/{d.jobs_total}{d.fallos_cron_24h ? <span className="txt-error"> · {d.fallos_cron_24h} fallos</span> : ''}</>}
      {alertas.length > 0 && <span className="txt-corriendo"> · {alertas.length} {alertas.length === 1 ? 'alerta' : 'alertas'}</span>}
    </p>
  </>
}

const nota = texto => <span className="bloque-nota">{texto}</span>

export function PanelesPanorama({ trabajadores, corridasPor, resumenes, ahora, salud, alertas }) {
  const canillita = corridasPor.canillita ?? SIN_CORRIDAS
  const versionCanillita = canillita.find(c => c.estado !== 'corriendo')?.id ?? 0
  const datos = useFuentesCanillita(versionCanillita)
  const hora = Math.floor(ahora / 3600_000)
  const temas = useMemo(() => temasDeCanillita(canillita, hora * 3600_000), [canillita, hora])
  const totalTemas = temas.reduce((s, [, v]) => s + v, 0)
  return <Bloques disposicion="tres">
    <Bloque titulo="Duración, últimas 40" accion={nota('por trabajador')}><Duraciones trabajadores={trabajadores} resumenes={resumenes} /></Bloque>
    <Bloque titulo="Qué trajo cada uno" accion={nota('resultados 24 h')}><QueTrajo trabajadores={trabajadores} resumenes={resumenes} /></Bloque>
    <Bloque titulo="Actividad por hora" accion={nota('corridas 24 h')}><Actividad trabajadores={trabajadores} corridasPor={corridasPor} ahora={ahora} /></Bloque>
    <Bloque titulo="Canillita por tema" accion={nota(`${n(totalTemas)} notas 24 h`)}><Temas temas={temas} /></Bloque>
    <Bloque titulo="Canillita por canal" accion={nota('notas 24 h')}><Canales datos={datos} /></Bloque>
    <Bloque titulo="Dónde falla" accion={nota(datos ? `${datos.fallan.length} de ${datos.total} fuentes` : '…')}><Fallas datos={datos} /></Bloque>
    <Bloque titulo="La próxima hora" accion={nota('qué corre y cuándo')}><ProximaHora trabajadores={trabajadores} ahora={ahora} /></Bloque>
    <Bloque titulo="Salud" accion={nota('corridas ok, 24 h')}><SaludPorTrabajador trabajadores={trabajadores} resumenes={resumenes} salud={salud} alertas={alertas} /></Bloque>
    <Bloque titulo="La regla" accion={nota('una por capa')}>
      <div className="pano-regla"><div><small>los trabajadores</small><b>escriben</b></div><div><small>María</small><b className="c2">consolida</b></div><div><small>BS67</small><b className="c3">comunica</b></div></div>
    </Bloque>
  </Bloques>
}
