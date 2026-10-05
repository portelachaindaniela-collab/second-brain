import { useEffect, useState } from 'react'
import { hora } from '../supabase.js'
import { bloquesDelDia, topRemitentes, tareasPorProyecto, diaCorto } from '../hoyGraficos.mjs'
import { nombreTema } from '../noticias.mjs'
import { Barra } from './Panorama.jsx'
import './HoyGraficos.css'

const n = v => Number(v ?? 0).toLocaleString('es-AR')
const recortar = (texto, max) => texto.length <= max ? texto : `${texto.slice(0, Math.max(1, max - 1))}…`

// El día como un eje de horas: cada evento es una barra; los que se pisan van en otra línea. "Ahora" es una línea.
// En el celular el eje es más corto (si no, el SVG se achica y no se lee) y marca cada 4 horas.
function useAngosto(px = 600) {
  const consulta = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(`(max-width: ${px}px)`) : null
  const [angosto, setAngosto] = useState(() => !!consulta?.matches)
  useEffect(() => {
    if (!consulta) return
    const cambio = e => setAngosto(e.matches)
    consulta.addEventListener('change', cambio)
    return () => consulta.removeEventListener('change', cambio)
  }, [consulta?.media])
  return angosto
}

export function TuDia({ eventos, ahora, colorDe, abrir }) {
  const angosto = useAngosto()
  const DESDE = 7, HASTA = 24, ANCHO = angosto ? 400 : 760, ALTO_CARRIL = 30, MARGEN = 18, PASO = angosto ? 4 : 2
  const { bloques, todoElDia, carriles } = bloquesDelDia(eventos, ahora, DESDE, HASTA)
  const alto = MARGEN + carriles * ALTO_CARRIL + 26
  const x = h => ((h - DESDE) / (HASTA - DESDE)) * ANCHO
  const d = new Date(ahora)
  const ahoraH = d.getHours() + d.getMinutes() / 60
  return <>
    {todoElDia.length > 0 && <div className="hoy-todo-el-dia">{todoElDia.map(e => <button key={e.id} onClick={abrir} style={{ '--c': colorDe(e.project_id) }}>{e.title}</button>)}</div>}
    <svg className="hoy-dia" viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label={`${eventos.length} eventos hoy`}>
      {Array.from({ length: Math.floor((HASTA - DESDE) / PASO) + 1 }, (_, i) => DESDE + i * PASO).map(h => <g key={h}>
        <line x1={x(h)} x2={x(h)} y1={MARGEN - 6} y2={alto - 20} className="hoy-eje" />
        <text x={x(h)} y={alto - 6} textAnchor={h === DESDE ? 'start' : h === HASTA ? 'end' : 'middle'} className="hoy-eje-texto">{String(h % 24).padStart(2, '0')}</text>
      </g>)}
      {bloques.map(b => <g key={b.evento.id} className="hoy-evento" onClick={abrir} role="button" tabIndex="0" onKeyDown={e => { if (e.key === 'Enter') abrir() }}>
        <title>{`${b.evento.title} · ${hora(b.evento.starts_at)}${b.evento.ends_at ? `–${hora(b.evento.ends_at)}` : ''}`}</title>
        <rect x={x(b.desde)} y={MARGEN + b.carril * ALTO_CARRIL} width={Math.max(6, x(b.hasta) - x(b.desde))} height={ALTO_CARRIL - 6} rx="5" style={{ fill: colorDe(b.evento.project_id) }} />
        {x(b.hasta) - x(b.desde) > 34 && <text x={x(b.desde) + 7} y={MARGEN + b.carril * ALTO_CARRIL + 16} className="hoy-evento-texto">{recortar(b.evento.title, Math.floor((x(b.hasta) - x(b.desde) - 12) / 7))}</text>}
      </g>)}
      {ahoraH >= DESDE && ahoraH <= HASTA && <g className="hoy-ahora">
        <line x1={x(ahoraH)} x2={x(ahoraH)} y1={MARGEN - 10} y2={alto - 20} />
        <circle cx={x(ahoraH)} cy={MARGEN - 10} r="3.5" />
      </g>}
    </svg>
    {bloques.length === 0 && todoElDia.length === 0 && <p className="pano-vacio">sin eventos para hoy</p>}
  </>
}

// Columnas de los próximos días; hoy resaltado.
export function ProximosDias({ dias, resaltar = 0 }) {
  const max = Math.max(1, ...dias.map(d => d.n))
  return <div className="hoy-columnas" role="img" aria-label={dias.map(d => `${d.etiqueta} ${d.dia}: ${d.n}`).join(', ')}>
    {dias.map((d, i) => <div key={d.inicio} className={i === (resaltar < 0 ? dias.length + resaltar : resaltar) ? 'hoy-col hoy-col-hoy' : 'hoy-col'}>
      <span className="hoy-col-num">{d.n || ''}</span>
      <div className="hoy-col-barra"><div style={{ height: `${(d.n / max) * 100}%` }} /></div>
      <span className="hoy-col-dia">{d.etiqueta}<br />{d.dia}</span>
    </div>)}
  </div>
}

export function Sitios({ sitios, enOrden }) {
  if (!sitios.length) return <p className="pano-vacio">María todavía no revisó los sitios</p>
  const max = Math.max(100, ...sitios.map(s => s.latencia ?? 0))
  return <>
    {sitios.map(s => <div key={s.nombre} className="pano-fila" title={s.url}>
      <span className="pano-quien"><i style={{ background: s.nivel === 'ok' ? 'var(--green-600)' : s.nivel === 'error' ? 'var(--red-600)' : 'var(--amber-600)' }} />{s.nombre.replace(/\s*\(.*\)$/, '')}</span>
      <Barra valor={s.latencia ?? 0} maximo={max} color={s.nivel === 'ok' ? 'var(--green-600)' : 'var(--red-600)'} />
      <span className="pano-num">{s.latencia != null ? `${s.latencia} ms` : s.nivel}</span>
    </div>)}
    {enOrden.length > 0 && <p className="pano-sistema">en orden: {enOrden.join(' · ')}</p>}
  </>
}

export function MailSinLeer({ mails, dias, importantes, abrirMail }) {
  const remitentes = topRemitentes(mails, 4)
  const max = Math.max(1, ...remitentes.map(r => r[1]))
  return <>
    <ProximosDias dias={dias} resaltar={-1} />
    {remitentes.length > 0 && <p className="hoy-subtitulo">quién escribe más</p>}
    {remitentes.map(([quien, v]) => <div key={quien} className="pano-fila pano-fila-baja">
      <span className="pano-quien">{quien}</span>
      <Barra valor={v} maximo={max} color="var(--id-azul)" />
      <span className="pano-num">{v}</span>
    </div>)}
    {importantes.length > 0 && <>
      <p className="hoy-subtitulo">importantes</p>
      {importantes.slice(0, 3).map(m => <button key={m.id} className="hoy-fila-boton" disabled={!m.gmail_id} onClick={() => abrirMail(m.gmail_id)}>{m.subject || '(sin asunto)'}</button>)}
    </>}
  </>
}

export function Tareas({ tareas, total, proyectos, abrirProyecto, quietas }) {
  const grupos = tareasPorProyecto(tareas, proyectos)
  const max = Math.max(1, ...grupos.map(g => g.n))
  return <>
    <div className="pano-trio hoy-trio">
      <div><small>abiertas</small><b>{n(total)}</b></div>
      <div><small>quietas +3 días</small><b className={quietas ? 'txt-corriendo' : undefined}>{n(quietas)}</b></div>
      <div><small>proyectos</small><b>{grupos.filter(g => g.id).length}</b></div>
    </div>
    {grupos.map(g => <div key={g.id ?? 'sin'} className="pano-fila pano-fila-baja">
      <span className="pano-quien"><i style={{ background: g.color }} />{g.nombre}</span>
      <Barra valor={g.n} maximo={max} color={g.color} />
      <span className="pano-num">{g.n}</span>
    </div>)}
    {tareas.slice(0, 4).map(t => <button key={t.id} className="hoy-fila-boton" onClick={() => t.project_id && abrirProyecto(t.project_id)} disabled={!t.project_id}>{t.title}</button>)}
    {total === 0 && <p className="pano-vacio">no hay tareas abiertas</p>}
  </>
}

export function NichoHoy({ temas }) {
  if (!temas.length) return <p className="pano-vacio">Canillita no trajo notas en las últimas 24 h</p>
  const max = temas[0][1]
  return temas.slice(0, 8).map(([t, v]) => <div key={t} className="pano-fila pano-fila-baja">
    <span className="pano-quien">{t === 'politica_ia' ? 'Política de IA' : nombreTema(t)}</span>
    <Barra valor={v} maximo={max} color="var(--id-arena)" />
    <span className="pano-num">{n(v)}</span>
  </div>)
}

export function TrabajadoresHoy({ horas }) {
  const ok = horas.reduce((s, h) => s + h.ok, 0), error = horas.reduce((s, h) => s + h.error, 0)
  const max = Math.max(1, ...horas.map(h => h.ok + h.error))
  return <>
    <div className="pano-trio hoy-trio">
      <div><small>corridas 24 h</small><b>{n(ok + error)}</b></div>
      <div><small>ok</small><b style={{ color: 'var(--green-600)' }}>{n(ok)}</b></div>
      <div><small>fallas</small><b style={{ color: error ? 'var(--red-600)' : undefined }}>{n(error)}</b></div>
    </div>
    <div className="hoy-horas" role="img" aria-label={`${ok} corridas ok y ${error} fallas en 24 horas`}>
      {horas.map(h => <div key={h.inicio} title={`${hora(new Date(h.inicio).toISOString())}: ${h.ok} ok${h.error ? `, ${h.error} con error` : ''}`}>
        {h.error > 0 && <span className="hoy-horas-error" style={{ height: `${(h.error / max) * 100}%` }} />}
        <span className="hoy-horas-ok" style={{ height: `${(h.ok / max) * 100}%` }} />
      </div>)}
    </div>
    <div className="hoy-eje-pie"><span>-24 h</span><span>ahora</span></div>
  </>
}

export function ProximosEventos({ eventos, colorDe, abrir }) {
  if (!eventos.length) return <p className="pano-vacio">nada en los próximos 7 días</p>
  return eventos.slice(0, 6).map(e => <button key={e.id} className="hoy-proximo" onClick={abrir}>
    <span className="hoy-proximo-dia" style={{ '--c': colorDe(e.project_id) }}>{diaCorto(Date.parse(e.starts_at))}</span>
    <span className="hoy-proximo-titulo">{e.title}</span>
    <span className="hoy-proximo-hora">{e.all_day ? 'todo el día' : hora(e.starts_at)}</span>
  </button>)
}
