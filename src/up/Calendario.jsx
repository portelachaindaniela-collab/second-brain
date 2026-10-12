import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso, fechaLarga, partesFecha } from './fechas.js'
import { ESTADOS, NOMBRE_RED, estadoVisible, correrPipeline } from './pipeline.js'
import EditorDia from './EditorDia.jsx'
import Publicacion from './Publicacion.jsx'
import Planes from './Planes.jsx'
import Importar from './Importar.jsx'
import { marcaCalendario } from './edicion.mjs'
import { moverMes, diasVisibles, cuantosPorPlan, bloqueoDeDia, separarBorrables } from './planes.mjs'

// Estado de una publicación, a partir de sus piezas: manda lo que necesita atención.
const ESTADOS_DIA = {
  error: 'Error',
  falta_info: 'Falta info',
  revision: 'En revisión',
  borrador: 'Borrador listo',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
  sin_borrador: 'Sin borrador',
  salteado: 'Salteado',
}
const URGENCIA = Object.keys(ESTADOS_DIA)

function estadoDelDia(dia, piezas) {
  if (dia.salteado) return 'salteado'
  if (!piezas.length) return 'sin_borrador'
  for (const e of ['error', 'falta_info', 'revision']) if (piezas.some(p => estadoVisible(p) === e)) return e
  if (piezas.some(p => p.estado === 'pendiente')) return piezas.some(p => p.estado === 'pendiente' && p.texto) ? 'borrador' : 'sin_borrador'
  return piezas.every(p => p.estado === 'publicado') ? 'publicado' : 'aprobado'
}

const NOMBRES_DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const SIGLA = { linkedin: 'IN', x: 'X', instagram: 'IG' }
const ORDEN_RED = ['linkedin', 'x', 'instagram']
const CLAVE_SIN_PLAN = 'up-calendario-sin-plan'
const CLAVE_VISTA = 'up-calendario-vista'
const CHIPS_POR_CELDA = 2

function claveMes(iso) { return iso.slice(0, 7) }

function nombreMes(clave) {
  const [a, m] = clave.split('-').map(Number)
  const t = new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Celdas del mes empezando el lunes; null para los huecos antes del día 1 y después del último.
function celdasDelMes(clave) {
  const [a, m] = clave.split('-').map(Number)
  const primero = new Date(a, m - 1, 1)
  const dias = new Date(a, m, 0).getDate()
  const hueco = (primero.getDay() + 6) % 7
  const celdas = Array(hueco).fill(null)
  for (let d = 1; d <= dias; d++) celdas.push(`${clave}-${String(d).padStart(2, '0')}`)
  while (celdas.length % 7) celdas.push(null)
  return celdas
}

function agruparPorFecha(dias) {
  const m = new Map()
  for (const d of dias) m.set(d.fecha, [...(m.get(d.fecha) || []), d])
  return m
}

function leer(clave, porDefecto) {
  try { return localStorage.getItem(clave) ?? porDefecto } catch { return porDefecto }
}
function guardarLocal(clave, valor) {
  try { localStorage.setItem(clave, valor) } catch { /* sin almacenamiento: vale para esta sesión */ }
}

export default function Calendario({ abrirEdicion }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [mes, setMes] = useState(claveMes(hoyIso()))
  const [vista, setVista] = useState(() => leer(CLAVE_VISTA, 'mes'))
  const [elegido, setElegido] = useState(hoyIso()) // la fecha elegida
  const [elegidaId, setElegidaId] = useState(null) // la publicación elegida dentro de ese día
  const [editando, setEditando] = useState(null) // 'nuevo' | 'editar' | null
  const [generando, setGenerando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [sinPlanVisible, setSinPlanVisible] = useState(() => leer(CLAVE_SIN_PLAN, '1') === '1')
  const [seleccion, setSeleccion] = useState(null) // Set de ids de publicaciones mientras se elige para borrar varias
  const [borrandoVarios, setBorrandoVarios] = useState(false)
  const [importando, setImportando] = useState(false)
  const detalle = useRef(null)

  const cargar = useCallback(async () => {
    const [cal, pie, met, pla] = await Promise.all([
      supabase.from('up_calendario').select('id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias,salteado,plan_id,created_at').order('fecha').order('created_at'),
      supabase.from('up_piezas').select('id,calendario_id,fecha,red,estado,texto,assets,url_publicada,error_publicacion'),
      supabase.from('up_metricas').select('pieza_id,dia,impresiones,reacciones,comentarios,compartidos,fuente,updated_at'),
      supabase.from('up_planes').select('id,nombre,color,visible,orden').order('orden').order('created_at'),
    ])
    const fallo = cal.error || pie.error || pla.error
    if (fallo) { setError('No se pudo cargar el calendario: ' + fallo.message); return }
    setDatos({ dias: cal.data || [], piezas: pie.data || [], metricas: met.data || [], planes: pla.data || [] })
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>

  const hoy = hoyIso()
  const { planes } = datos
  const planDe = id => planes.find(p => p.id === id)
  const visiblesLista = diasVisibles(datos.dias, planes, sinPlanVisible)
  const visiblesIds = new Set(visiblesLista.map(d => d.id))
  const porFecha = agruparPorFecha(datos.dias)
  const visiblesPorFecha = agruparPorFecha(visiblesLista)
  const cuentas = cuantosPorPlan(datos.dias, planes)
  const piezasDe = d => datos.piezas.filter(p => p.calendario_id === d.id).sort((a, b) => ORDEN_RED.indexOf(a.red) - ORDEN_RED.indexOf(b.red))
  const delDia = porFecha.get(elegido) || []
  const dia = delDia.find(d => d.id === elegidaId) ?? delDia.find(d => visiblesIds.has(d.id)) ?? delDia[0]
  const semanas = [...new Set(datos.dias.map(d => d.tema_semana))]
  const piezasElegido = dia ? piezasDe(dia) : []
  const conTexto = piezasElegido.some(p => p.texto && ['pendiente', 'error', 'falta_info'].includes(p.estado))
  const delMes = visiblesLista.filter(d => claveMes(d.fecha) === mes)
  const planPorDefecto = planes.find(p => p.visible)?.id ?? planes[0]?.id
  // El estado de una celda es el más urgente de sus publicaciones.
  const estadoDeCelda = lista => lista.map(d => estadoDelDia(d, piezasDe(d))).sort((a, b) => URGENCIA.indexOf(a) - URGENCIA.indexOf(b))[0]

  function elegir(fecha, id = null) {
    if (seleccion) { alternarSeleccion(id ? [id] : (visiblesPorFecha.get(fecha) || []).map(d => d.id)); return }
    setElegido(fecha); setElegidaId(id); setEditando(null); setAviso(''); setBorrando(false)
    if (window.innerWidth < 1000) requestAnimationFrame(() => detalle.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // Tilda o destilda: si todas las del grupo ya estaban, las saca; si no, las agrega.
  function alternarSeleccion(ids) {
    if (!ids.length) return
    setBorrandoVarios(false)
    setSeleccion(s => {
      const n = new Set(s)
      if (ids.every(id => n.has(id))) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id))
      return n
    })
  }

  function empezarSeleccion() { setSeleccion(new Set()); setEditando(null); setBorrando(false); setBorrandoVarios(false); setAviso('') }
  function terminarSeleccion() { setSeleccion(null); setBorrandoVarios(false) }

  async function borrarSeleccionados() {
    const { borrables, bloqueados } = separarBorrables(datos.dias.filter(d => seleccion.has(d.id)), piezasDe)
    setOcupado(true)
    let error = null
    if (borrables.length) {
      const ids = borrables.map(d => d.id)
      error = (await supabase.from('up_piezas').delete().in('calendario_id', ids)).error
      if (!error) error = (await supabase.from('up_calendario').delete().in('id', ids)).error
    }
    setOcupado(false)
    if (error) { setAviso('No se pudo borrar: ' + error.message); setBorrandoVarios(false); return }
    terminarSeleccion()
    await cargar()
    const n = borrables.length
    setAviso(`${n === 1 ? 'Borré 1 publicación' : `Borré ${n} publicaciones`}.${bloqueados.length ? ` No borré ${bloqueados.length} porque ${bloqueados.length === 1 ? 'tiene' : 'tienen'} algo aprobado o publicado (${bloqueados.map(d => `«${d.tema_dia}»`).join(', ')}).` : ''}`)
  }

  async function importado(mensaje, fecha) {
    setImportando(false)
    await cargar()
    if (fecha) { setMes(claveMes(fecha)); setElegido(fecha); setElegidaId(null) }
    setAviso(mensaje)
  }

  function irA(clave) { setMes(clave); setBorrando(false) }
  function irAHoy() { setMes(claveMes(hoy)); elegir(hoy) }
  function cambiarVista(v) { setVista(v); guardarLocal(CLAVE_VISTA, v) }

  // "Nueva idea": en el día elegido si no pasó (aunque ya tenga otras publicaciones); si pasó, hoy.
  function nuevaIdea() {
    const f = elegido >= hoy ? elegido : hoy
    setElegido(f); setMes(claveMes(f)); setEditando('nuevo'); setAviso(''); setBorrando(false)
  }

  async function guardado(fila) {
    const habiaBorradores = editando === 'editar' && piezasDe(fila).some(p => p.texto)
    setEditando(null)
    await cargar()
    setElegido(fila.fecha); setElegidaId(fila.id); setMes(claveMes(fila.fecha))
    const plan = planDe(fila.plan_id)
    if (plan && !plan.visible) setAviso(`Guardado en «${plan.nombre}», que está oculto: tildalo a la derecha para verlo.`)
    else setAviso(habiaBorradores ? 'Guardado. Los borradores que ya estaban no cambian solos: tocá Volver a generar para rehacerlos con la idea nueva.' : 'Guardado. Los agentes la toman la mañana de ese día, o tocá Generar ahora.')
  }

  async function generar() {
    setGenerando(true); setAviso('')
    const mensaje = await correrPipeline(dia.fecha, conTexto, dia.id)
    setGenerando(false)
    await cargar()
    setAviso(mensaje || 'Listo: los borradores están en Hoy (o en «Necesito que me cuentes» si falta un dato).')
  }

  async function saltear() {
    setOcupado(true)
    const { error: e } = await supabase.from('up_calendario').update({ salteado: !dia.salteado }).eq('id', dia.id)
    setOcupado(false)
    if (e) { setAviso('No se pudo cambiar: ' + e.message); return }
    await cargar()
    setAviso(dia.salteado ? 'Listo, los agentes vuelven a escribir esta publicación.' : 'Salteada: los agentes no escriben esta publicación.')
  }

  async function borrarDia() {
    setOcupado(true)
    // Primero sus borradores sin aprobar, después la publicación.
    const { error: eP } = await supabase.from('up_piezas').delete().eq('calendario_id', dia.id)
    const { error: eD } = eP ? { error: eP } : await supabase.from('up_calendario').delete().eq('id', dia.id)
    setOcupado(false); setBorrando(false)
    if (eD) { setAviso('No se pudo borrar: ' + eD.message); return }
    setElegidaId(null)
    await cargar()
    setAviso('Publicación borrada.')
  }

  async function alternarPlan(plan) {
    setDatos(d => ({ ...d, planes: d.planes.map(p => (p.id === plan.id ? { ...p, visible: !p.visible } : p)) }))
    const { error: e } = await supabase.from('up_planes').update({ visible: !plan.visible }).eq('id', plan.id)
    if (e) { setAviso('No se pudo guardar el cambio: ' + e.message); cargar() }
  }

  async function soloEste(plan) {
    setDatos(d => ({ ...d, planes: d.planes.map(p => ({ ...p, visible: p.id === plan.id })) }))
    setSinPlanVisible(false); guardarLocal(CLAVE_SIN_PLAN, '0')
    const { error: e } = await supabase.from('up_planes').update({ visible: false }).neq('id', plan.id)
    const { error: e2 } = e ? { error: e } : await supabase.from('up_planes').update({ visible: true }).eq('id', plan.id)
    if (e2) { setAviso('No se pudo guardar el cambio: ' + e2.message); cargar() }
  }

  function alternarSinPlan() {
    setSinPlanVisible(v => { guardarLocal(CLAVE_SIN_PLAN, v ? '0' : '1'); return !v })
  }

  const chip = d => {
    const plan = planDe(d.plan_id)
    return { '--p': plan?.color ?? '#9A958A' }
  }

  return (
    <>
      <div className="up-cal-barra">
        <button className="up-btn" onClick={irAHoy}>Hoy</button>
        <div className="up-cal-flechas">
          <button className="up-btn" onClick={() => irA(moverMes(mes, -1))} aria-label="Mes anterior">‹</button>
          <button className="up-btn" onClick={() => irA(moverMes(mes, 1))} aria-label="Mes siguiente">›</button>
        </div>
        <h2 className="up-titular-2">{nombreMes(mes)}</h2>
        <span className="up-cal-resumen">{delMes.length} {delMes.length === 1 ? 'publicación' : 'publicaciones'}</span>
        <span className="up-sp" />
        <div className="up-cal-vistas" role="tablist" aria-label="Vista">
          <button role="tab" aria-selected={vista === 'mes'} className={vista === 'mes' ? 'on' : ''} onClick={() => cambiarVista('mes')}>Mes</button>
          <button role="tab" aria-selected={vista === 'lista'} className={vista === 'lista' ? 'on' : ''} onClick={() => cambiarVista('lista')}>Lista</button>
        </div>
        {seleccion
          ? <button className="up-btn" onClick={terminarSeleccion}>Listo</button>
          : <button className="up-btn" onClick={empezarSeleccion} disabled={!visiblesLista.length || importando}>Seleccionar</button>}
        <button className="up-btn" onClick={() => { terminarSeleccion(); setEditando(null); setImportando(true) }} disabled={importando}>Importar</button>
        <button className="up-btn up-btn-p" onClick={nuevaIdea} disabled={!!seleccion}>+ Nueva idea</button>
      </div>

      {seleccion && (
        <div className="up-sel-barra" role="region" aria-label="Selección para borrar">
          {borrandoVarios ? (
            <>
              <span>¿Borrar {seleccion.size === 1 ? 'esta publicación' : `estas ${seleccion.size} publicaciones`} y sus borradores sin aprobar? No se puede deshacer. Las que tengan algo aprobado o publicado se saltean.</span>
              <button className="up-btn" disabled={ocupado} onClick={() => setBorrandoVarios(false)}>No</button>
              <button className="up-btn up-btn-borrar" disabled={ocupado} onClick={borrarSeleccionados}>{ocupado ? 'Borrando…' : 'Sí, borrar'}</button>
            </>
          ) : (
            <>
              <strong>{seleccion.size ? `${seleccion.size} ${seleccion.size === 1 ? 'seleccionada' : 'seleccionadas'}` : 'Tocá las publicaciones que querés borrar'}</strong>
              <button className="up-link" onClick={() => setSeleccion(new Set([...seleccion, ...delMes.map(d => d.id)]))}>Todas las del mes</button>
              {seleccion.size > 0 && <button className="up-link" onClick={() => setSeleccion(new Set())}>Ninguna</button>}
              <span className="up-sp" />
              <button className="up-btn up-btn-borrar" disabled={!seleccion.size} onClick={() => setBorrandoVarios(true)}>Borrar {seleccion.size || ''}</button>
            </>
          )}
        </div>
      )}

      {importando ? (
        <Importar planes={planes} dias={datos.dias} hoy={hoy} cerrar={() => setImportando(false)} listo={importado} />
      ) : (
      <div className="up-cal">
        <section className="up-cal-mes">
          {vista === 'mes' ? (
            <div className="up-cal-grilla" role="grid">
              {NOMBRES_DIA.map(n => <div key={n} className="up-cal-nombre">{n}</div>)}
              {celdasDelMes(mes).map((fecha, k) => {
                if (!fecha) return <div key={k} className="up-cal-hueco" />
                const lista = visiblesPorFecha.get(fecha) || []
                const estado = lista.length ? estadoDeCelda(lista) : null
                const marcadas = lista.filter(d => seleccion?.has(d.id)).length
                const piezasCelda = lista.flatMap(piezasDe).filter(marcaCalendario)
                return (
                  <button key={fecha} role="gridcell"
                    className={`up-cal-dia${lista.length ? ` d-${estado}` : ' vacio'}${fecha < hoy ? ' pasado' : ''}${fecha === hoy ? ' hoy' : ''}${!seleccion && fecha === elegido ? ' elegido' : ''}${marcadas ? ' marcado' : ''}`}
                    aria-pressed={seleccion && lista.length ? marcadas === lista.length : undefined}
                    onClick={() => elegir(fecha)}
                    aria-label={lista.length ? `${fechaLarga(fecha)}: ${lista.map(d => d.tema_dia).join('; ')}, ${ESTADOS_DIA[estado]}` : fechaLarga(fecha)}>
                    <span className="up-cal-num">{Number(fecha.slice(8))}</span>
                    {seleccion && lista.length > 0 && <span className="up-sel-caja" aria-hidden="true" />}
                    {lista.some(d => d.redes.includes('instagram')) && <span className="up-cal-ig" title="Con Instagram"><LogoRed red="instagram" /></span>}
                    {lista.slice(0, CHIPS_POR_CELDA).map(d => (
                      <span key={d.id} className={`up-cal-chip${lista.length > 1 ? ' varias' : ''}`} style={chip(d)} title={`${d.tema_dia} · ${planDe(d.plan_id)?.nombre ?? 'Sin plan'}`}>{d.tema_dia}</span>
                    ))}
                    {lista.length > CHIPS_POR_CELDA && <span className="up-cal-mas">+{lista.length - CHIPS_POR_CELDA} más</span>}
                    <span className="up-cal-marcas">{piezasCelda.map(p => <i key={p.id} className={`m-${marcaCalendario(p)}`} title={`${NOMBRE_RED[p.red]}: ${ESTADOS[p.estado]}`}>{SIGLA[p.red]}</i>)}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <ol className="up-cal-lista">
              {!delMes.length && <li className="up-vacio">No hay publicaciones a la vista este mes.</li>}
              {delMes.map(d => {
                const f = partesFecha(d.fecha)
                const estado = estadoDelDia(d, piezasDe(d))
                return (
                  <li key={d.id}>
                    <button className={`up-cal-fila d-${estado}${!seleccion && d.id === dia?.id ? ' elegido' : ''}${d.fecha === hoy ? ' hoy' : ''}${seleccion ? ' seleccionando' : ''}${seleccion?.has(d.id) ? ' marcado' : ''}`} onClick={() => elegir(d.fecha, d.id)} aria-pressed={seleccion ? seleccion.has(d.id) : undefined}>
                      {seleccion && <span className="up-sel-caja" aria-hidden="true" />}
                      <span className="up-cal-fila-fecha"><small>{f.dia}</small><b>{f.numero}</b></span>
                      <span className="up-cal-fila-tema" style={chip(d)}>{d.tema_dia}<small>{planDe(d.plan_id)?.nombre ?? 'Sin plan'} · {d.tema_semana}</small></span>
                      <span className="up-cal-fila-redes">{d.redes.map(r => <LogoRed key={r} red={r} />)}</span>
                      <span className={`up-cal-fila-estado`}><i />{ESTADOS_DIA[estado]}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <details className="up-cal-ayuda">
            <summary>Cómo leer el calendario</summary>
            <p>El color de cada idea es el de su plan. Un día puede tener varias publicaciones. La raya de arriba del día dice en qué está (si hay varias, la que más te necesita):</p>
            <ul className="up-cal-leyenda">
              {Object.entries(ESTADOS_DIA).map(([k, v]) => <li key={k}><i className={`d-${k}`} />{v}</li>)}
              <li><LogoRed red="instagram" />Con Instagram</li>
            </ul>
            <ul className="up-cal-leyenda up-cal-leyenda-redes">
              {ORDEN_RED.map(r => <li key={r}><i className={`m-${r}`} />{NOMBRE_RED[r]} publicado</li>)}
              <li><i className="m-aprobado" />Aprobado, sin publicar</li>
            </ul>
          </details>
        </section>

        <div className="up-cal-lado">
          <Planes planes={planes} cuentas={cuentas} sinPlanVisible={sinPlanVisible} alternar={alternarPlan} alternarSinPlan={alternarSinPlan} soloEste={soloEste} recargar={cargar} />

          <section className="up-cal-detalle" ref={detalle} aria-label="Día elegido">
            {aviso && <p role="status" className="up-aviso-nota up-aviso-ok">{aviso}</p>}
            {editando ? (
              <EditorDia key={`${editando}-${elegido}-${dia?.id}`} dia={editando === 'editar' ? dia : null} fecha={elegido} semanas={semanas}
                planes={planes} planInicial={planPorDefecto} piezas={editando === 'editar' ? piezasElegido : []} cerrar={() => setEditando(null)} guardado={guardado} />
            ) : dia ? (
              <>
                <div className="up-vol">{fechaLarga(dia.fecha)}<span>Semana «{dia.tema_semana}»</span></div>
                {delDia.length > 1 && (
                  <div className="up-cal-varias" role="tablist" aria-label={`${delDia.length} publicaciones este día`}>
                    <span>{delDia.length} publicaciones este día</span>
                    {delDia.map(d => (
                      <button key={d.id} role="tab" aria-selected={d.id === dia.id} className={d.id === dia.id ? 'on' : ''} style={chip(d)} onClick={() => elegir(d.fecha, d.id)}>
                        <i />{d.tema_dia}{!visiblesIds.has(d.id) && <small> (oculta)</small>}
                      </button>
                    ))}
                  </div>
                )}
                <p className="up-cal-plan" style={chip(dia)}><i />{planDe(dia.plan_id)?.nombre ?? 'Sin plan'}{!visiblesIds.has(dia.id) && ' (oculto)'}</p>
                <h3 className="up-titular-2">{dia.tema_dia}</h3>
                {dia.tema_instagram && <p className="up-ficha-contexto">Instagram ({dia.formato_instagram}): {dia.tema_instagram}{dia.fotos_propias ? ', con tus fotos' : ''}</p>}
                <p className={`up-cal-estado d-${estadoDelDia(dia, piezasElegido)}`}><i />{ESTADOS_DIA[estadoDelDia(dia, piezasElegido)]}</p>
                <ul className="up-cal-piezas">
                  {piezasElegido.map(p => (
                    <li key={p.id}>
                      <LogoRed red={p.red} />{NOMBRE_RED[p.red]}
                      <span className={`up-estado e-${estadoVisible(p)}`}>{p.url_publicada ? <a href={p.url_publicada} target="_blank" rel="noreferrer">{ESTADOS[p.estado]}</a> : ESTADOS[estadoVisible(p)]}</span>
                    </li>
                  ))}
                </ul>
                {piezasElegido.some(marcaCalendario) && (
                  <Publicacion key={dia.id} piezas={piezasElegido.filter(marcaCalendario)}
                    metricas={datos.metricas} todasLasPiezas={datos.piezas} abrirEdicion={(fecha, red) => abrirEdicion(fecha, red, dia.id)}
                    alCargar={m => setDatos(d => ({ ...d, metricas: [...d.metricas.filter(x => !(x.pieza_id === m.pieza_id && x.dia === m.dia)), m] }))} />
                )}
                {!piezasElegido.length && !dia.salteado && <p className="up-vacio">{dia.fecha < hoy ? 'Esta publicación no tuvo borradores.' : 'Los agentes escriben los borradores la mañana de ese día.'}</p>}
                {borrando ? (
                  <div className="up-plan-confirmar">
                    <p>¿Borrar esta publicación{piezasElegido.length ? ' y sus borradores sin aprobar' : ''}? No se puede deshacer.</p>
                    <div className="up-acciones up-acciones-izq">
                      <button className="up-btn" disabled={ocupado} onClick={() => setBorrando(false)}>No</button>
                      <button className="up-btn up-btn-borrar" disabled={ocupado} onClick={borrarDia}>Sí, borrar</button>
                    </div>
                  </div>
                ) : (
                  <div className="up-acciones up-acciones-izq up-cal-botones">
                    <button className="up-btn" disabled={generando || ocupado} onClick={() => { setEditando('editar'); setAviso('') }}>Editar</button>
                    {dia.fecha >= hoy && !dia.salteado && <button className="up-btn up-btn-p" disabled={generando || ocupado} onClick={generar}>{generando ? 'Generando…' : conTexto ? 'Volver a generar' : 'Generar ahora'}</button>}
                    {dia.fecha >= hoy && <button className="up-btn" disabled={generando || ocupado} onClick={saltear}>{dia.salteado ? 'No saltear' : 'Saltear'}</button>}
                    <button className="up-link up-cal-borrar" disabled={generando || ocupado}
                      onClick={() => { const b = bloqueoDeDia(piezasElegido); if (b) setAviso(`${b} No se puede borrar.`); else { setBorrando(true); setAviso('') } }}>Borrar</button>
                  </div>
                )}
                {dia.fecha >= hoy && <button className="up-link up-cal-otra" onClick={() => { setEditando('nuevo'); setAviso('') }}>+ Otra publicación este día</button>}
              </>
            ) : (
              <>
                <div className="up-vol">{fechaLarga(elegido)}</div>
                <p className="up-vacio">Este día no tiene publicación.</p>
                {elegido >= hoy && <div className="up-acciones up-acciones-izq"><button className="up-btn up-btn-p" onClick={() => { setEditando('nuevo'); setAviso('') }}>Nueva idea para este día</button></div>}
              </>
            )}
          </section>
        </div>
      </div>
      )}
    </>
  )
}
