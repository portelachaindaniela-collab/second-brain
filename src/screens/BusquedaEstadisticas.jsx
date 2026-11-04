import { useEffect, useMemo, useRef, useState } from 'react'
import { Bloques, Bloque } from '../estructura.jsx'
import { Barra } from './Panorama.jsx'
import { CATEGORIAS, PERIODOS, tituloCategoria, prepararFilas, estadisticas, etiquetaMes, linkFila, porGrupoPuesto, enviadasPorPeriodo, SIN_FECHA } from '../busquedaLaboral.mjs'
import './BusquedaEstadisticas.css'

// Estadísticas de la búsqueda laboral, dentro de Postulaciones. Usa las filas que la pantalla ya leyó de la planilla.

const ROJO = 'var(--red-600)', AZUL = 'var(--accent)'
const COLOR_SEMAFORO = { verde: 'var(--green-600)', amarillo: 'var(--amber-600)', rojo: 'var(--red-600)', negro: 'var(--gray-500)', '': 'var(--gray-300)' }
const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`

function Leyenda() {
  return <p className="busq-leyenda"><span><i style={{ background: ROJO }} />rechazadas</span><span><i style={{ background: AZUL }} />sin decisión</span></p>
}

function PorPeriodo({ filas }) {
  const [periodo, setPeriodo] = useState('mes')
  const { columnas, sinFecha, fueraDeRango } = useMemo(() => enviadasPorPeriodo(filas, periodo), [filas, periodo])
  // En pantallas angostas el gráfico se desplaza: se arranca mostrando lo más reciente (a la derecha).
  const caja = useRef(null)
  useEffect(() => { if (caja.current) caja.current.scrollLeft = caja.current.scrollWidth }, [columnas])
  const max = Math.max(1, ...columnas.map(c => c.rechazadas + c.sinDecision))
  const total = columnas.reduce((s, c) => s + c.rechazadas + c.sinDecision, 0)
  const rango = periodo === 'dia' ? 'en los últimos 30 días' : periodo === 'semana' ? 'en las últimas 16 semanas' : 'en total'
  return <>
    <div className="busq-periodo">
      <div className="postu-chips-filtro" role="tablist" aria-label="Período">
        {PERIODOS.map(([v, t]) => <button key={v} role="tab" aria-selected={periodo === v} className={periodo === v ? 'activo' : ''} onClick={() => setPeriodo(v)}>{t}</button>)}
      </div>
      <span className="busq-nota"><strong>{total}</strong> enviadas {rango}</span>
    </div>
    <Leyenda />
    {columnas.length ? <div ref={caja} className={`busq-columnas busq-columnas-${periodo}`} role="img" aria-label={columnas.map(c => `${c.etiqueta.join(' ')}: ${c.rechazadas} rechazadas, ${c.sinDecision} sin decisión`).join('; ')}>
      {columnas.map(c => <div key={c.clave} className="busq-col" title={`${c.etiqueta.join(' ')}: ${c.rechazadas + c.sinDecision} enviadas (${c.rechazadas} rechazadas, ${c.sinDecision} sin decisión)`}>
        <span className="busq-col-num">{c.rechazadas + c.sinDecision || ''}</span>
        <div className="busq-col-barra">
          <span style={{ height: `${(c.sinDecision / max) * 100}%`, background: AZUL }} />
          <span style={{ height: `${(c.rechazadas / max) * 100}%`, background: ROJO }} />
        </div>
        <span className="busq-col-mes">{c.etiqueta[0]}<br />{c.etiqueta[1]}</span>
      </div>)}
    </div> : <p className="pano-vacio">todavía no hay postulaciones enviadas</p>}
    <p className="busq-nota">
      Según la columna Fecha (en los rechazos de LinkedIn es el día del rechazo).
      {sinFecha > 0 && ` ${sinFecha} sin ${periodo === 'mes' ? 'fecha legible' : 'día exacto'}.`}
      {fueraDeRango > 0 && ` ${fueraDeRango} fuera de este rango.`}
    </p>
  </>
}

function PorPuesto({ grupos }) {
  if (!grupos.length) return <p className="pano-vacio">todavía no hay postulaciones enviadas</p>
  const max = Math.max(1, ...grupos.map(g => g.enviadas))
  return <>
    <Leyenda />
    <div className="busq-puestos">
      {grupos.map(g => <div key={g.grupo} className="busq-puesto" title={`${g.grupo}: ${g.enviadas} enviadas, ${g.rechazadas} rechazadas, ${g.sinDecision} sin decisión`}>
        <span className="busq-puesto-nombre">{g.grupo}</span>
        <div className="busq-puesto-barra"><div style={{ width: `${(g.enviadas / max) * 100}%` }}>
          {g.rechazadas > 0 && <span style={{ flex: g.rechazadas, background: ROJO }}>{g.rechazadas}</span>}
          {g.sinDecision > 0 && <span style={{ flex: g.sinDecision, background: AZUL }}>{g.sinDecision}</span>}
        </div></div>
        <span className="busq-puesto-num"><b>{g.enviadas}</b> {g.enviadas === 1 ? 'enviada' : 'enviadas'} · <span className="busq-rojo">{pct(g.rechazadas / g.enviadas)}</span> rechazo</span>
      </div>)}
    </div>
    <p className="busq-nota">Solo las enviadas, agrupadas por palabras del puesto. Adentro de cada barra: rechazadas y sin decisión.</p>
  </>
}

// Barra partida: la parte roja son las rechazadas sobre el total.
function BarraPartida({ total, rojo, maximo }) {
  const ancho = maximo > 0 ? (total / maximo) * 100 : 0
  return <div className="pano-barra"><div className="busq-partida" style={{ width: `${ancho}%` }}>
    <span style={{ flex: rojo, background: ROJO }} /><span style={{ flex: total - rojo, background: 'var(--gray-500)' }} />
  </div></div>
}

function Embudo({ etapas }) {
  const max = Math.max(1, etapas[0]?.n || 0)
  return <div className="busq-embudo">
    {etapas.map((e, i) => <div key={e.etapa} className="pano-fila">
      <span className="pano-quien">{e.etapa}</span>
      <Barra valor={e.n} maximo={max} color={i === etapas.length - 1 ? ROJO : AZUL} />
      <span className="pano-num">{e.n}{i > 0 && etapas[i - 1].n > 0 && <small> · {pct(e.n / etapas[i - 1].n)}</small>}</span>
    </div>)}
    <p className="busq-nota">Evaluadas: todas menos “Sin evaluar” o sin estado. Con respuesta: rechazadas + “Respondido”. El acuse automático no cuenta como respuesta.</p>
  </div>
}

function Tabla({ filas, url }) {
  const [categoria, setCategoria] = useState('')
  const [canal, setCanal] = useState('')
  const [mes, setMes] = useState('')
  const canales = useMemo(() => [...new Set(filas.map(p => p.canal))].sort((a, b) => a.localeCompare(b)), [filas])
  const meses = useMemo(() => [...new Set(filas.map(p => p.mes))].sort((a, b) => a === SIN_FECHA ? 1 : b === SIN_FECHA ? -1 : b.localeCompare(a)), [filas])
  const visibles = filas.filter(p => (!categoria || p.categoria === categoria) && (!canal || p.canal === canal) && (!mes || p.mes === mes))
  return <>
    <div className="busq-filtros">
      <select aria-label="Estado" value={categoria} onChange={e => setCategoria(e.target.value)}>
        <option value="">Todos los estados</option>
        {CATEGORIAS.map(c => <option key={c.clave} value={c.clave}>{c.titulo}</option>)}
      </select>
      <select aria-label="Fuente" value={canal} onChange={e => setCanal(e.target.value)}>
        <option value="">Todas las fuentes</option>
        {canales.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select aria-label="Mes" value={mes} onChange={e => setMes(e.target.value)}>
        <option value="">Todos los meses</option>
        {meses.map(m => <option key={m} value={m}>{etiquetaMes(m)}</option>)}
      </select>
      <span className="busq-nota">{visibles.length} de {filas.length}</span>
    </div>
    <div className="busq-tabla-caja">
      <table className="busq-tabla">
        <thead><tr><th>Fecha</th><th>Puesto</th><th>Empresa</th><th>Fuente</th><th>Estado</th><th>CV</th><th /></tr></thead>
        <tbody>{visibles.map(p => <tr key={p.fila}>
          <td className="busq-mono">{p.fecha || '—'}</td>
          <td>{p.color && <span className={`postu-punto ${p.color}`} aria-label={`semáforo ${p.color}`} />}{p.puesto || '(sin puesto)'}</td>
          <td>{p.empresa}</td>
          <td title={p.fuente}>{p.canal}</td>
          <td><span className={`busq-cat busq-cat-${p.categoria}`}>{tituloCategoria(p.categoria)}</span><small>{p.estado}</small></td>
          <td>{p.cv}</td>
          <td>{url && <a href={linkFila(url, p.fila)} target="_blank" rel="noreferrer" title={`Fila ${p.fila} en la planilla`}>fila {p.fila} ↗</a>}</td>
        </tr>)}</tbody>
      </table>
      {!visibles.length && <p className="pano-vacio">nada con estos filtros</p>}
    </div>
  </>
}

export default function BusquedaEstadisticas({ filas: filasPlanilla, url }) {
  const filas = useMemo(() => prepararFilas(filasPlanilla), [filasPlanilla])
  const s = useMemo(() => estadisticas(filas), [filas])
  const grupos = useMemo(() => porGrupoPuesto(filas), [filas])
  const maxFuente = Math.max(1, ...s.porFuente.map(f => f.rechazos))
  const maxSemaforo = Math.max(1, ...s.porSemaforo.map(x => x.n))
  const maxCv = Math.max(1, ...s.porCv.map(c => c.enviadas))
  const cifras = [
    ['Total de ofertas', s.cifras.total],
    ['Enviadas', s.cifras.enviadas],
    ['Rechazos', s.cifras.rechazos],
    ['Sin decisión', s.cifras.sinDecision],
    ['Tasa de rechazo', pct(s.cifras.tasaRechazo)],
  ]

  return <div className="busq">
    <dl className="busq-cifras">{cifras.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <p className="busq-nota">Enviadas = rechazadas + postuladas sin decisión. La tasa de rechazo es sobre las enviadas.</p>

    {s.otros.length > 0 && <div className="busq-aviso" role="alert">
      <strong>{s.otros.length} {s.otros.length === 1 ? 'estado no encaja' : 'estados no encajan'} en ninguna categoría</strong> (se cuentan como “Otro”). Corregilos en la planilla:
      <ul>{s.otros.map(p => <li key={p.fila}><a href={linkFila(url, p.fila) || undefined} target="_blank" rel="noreferrer">fila {p.fila}</a> · {p.puesto || p.empresa} · “{p.estado}”</li>)}</ul>
    </div>}

    <Bloques>
      <Bloque titulo="Enviadas por puesto" ancho="completo">
        <PorPuesto grupos={grupos} />
      </Bloque>
      <Bloque titulo="Enviadas por día, semana y mes" ancho="completo">
        <PorPeriodo filas={filas} />
        {s.sinFecha.length > 0 && <p className="busq-nota">{s.sinFecha.length} {s.sinFecha.length === 1 ? 'fila tiene' : 'filas tienen'} una fecha que no se puede leer: {s.sinFecha.map(p => `fila ${p.fila} (“${p.fecha || 'vacía'}”)`).join(', ')}.</p>}
      </Bloque>
      <Bloque titulo="Embudo">
        <Embudo etapas={s.embudo} />
      </Bloque>
      <Bloque titulo="Rechazos por fuente">
        {s.porFuente.length ? s.porFuente.map(f => <div key={f.canal} className="pano-fila">
          <span className="pano-quien" title={f.canal}>{f.canal}</span>
          <Barra valor={f.rechazos} maximo={maxFuente} color={ROJO} />
          <span className="pano-num" title={`${f.rechazos} rechazos de ${f.enviadas} enviadas`}>{f.rechazos}<small> / {f.enviadas}</small></span>
        </div>) : <p className="pano-vacio">sin rechazos</p>}
        <p className="busq-nota">Rechazos / enviadas por esa fuente.</p>
      </Bloque>
      <Bloque titulo="Semáforo">
        {s.porSemaforo.map(x => <div key={x.color || 'sin'} className="pano-fila">
          <span className="pano-quien"><i style={{ background: COLOR_SEMAFORO[x.color] }} />{x.color ? x.color[0].toUpperCase() + x.color.slice(1) : 'Sin semáforo'}</span>
          <Barra valor={x.n} maximo={maxSemaforo} color={COLOR_SEMAFORO[x.color]} />
          <span className="pano-num">{x.n}</span>
        </div>)}
      </Bloque>
      <Bloque titulo="Por CV usado" ancho="completo">
        {s.porCv.length ? <>
          <p className="busq-leyenda"><span><i style={{ background: ROJO }} />rechazadas</span><span><i style={{ background: 'var(--gray-500)' }} />resto de las enviadas</span></p>
          {s.porCv.map(c => <div key={c.cv} className="pano-fila busq-fila-cv">
            <span className="pano-quien" title={c.cv}>{c.cv}</span>
            <BarraPartida total={c.enviadas} rojo={c.rechazadas} maximo={maxCv} />
            <span className="pano-num">{c.enviadas}<small> · {c.rechazadas} rechazadas</small></span>
          </div>)}
        </> : <p className="pano-vacio">todavía no hay postulaciones enviadas</p>}
        <p className="busq-nota">Solo las enviadas, según la columna “CV a usar”.</p>
      </Bloque>
      <Bloque titulo="Todas las ofertas" ancho="completo">
        <Tabla filas={filas} url={url} />
      </Bloque>
    </Bloques>
  </div>
}
