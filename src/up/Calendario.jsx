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

// Estado de un día, a partir de sus piezas: manda lo que necesita atención.
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

function claveMes(iso) { return iso.slice(0, 7) }

function sumarDia(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

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
  const [elegido, setElegido] = useState(hoyIso())
  const [editando, setEditando] = useState(null) // 'nuevo' | 'editar' | null
  const [generando, setGenerando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [sinPlanVisible, setSinPlanVisible] = useState(() => leer(CLAVE_SIN_PLAN, '1') === '1')
  const [seleccion, setSeleccion] = useState(null) // Set de fechas mientras se elige para borrar varias; null fuera de ese modo
  const [borrandoVarios, setBorrandoVarios] = useState(false)
  const [importando, setImportando] = useState(false)
  const detalle = useRef(null)

  const cargar = useCallback(async () => {
    const [cal, pie, met, pla] = await Promise.all([
      supabase.from('up_calendario').select('id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias,salteado,plan_id').order('fecha'),
      supabase.from('up_piezas').select('id,fecha,red,estado,texto,assets,url_publicada,error_publicacion'),
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
  const porFecha = new Map(datos.dias.map(d => [d.fecha, d]))
  const visibles = new Map(diasVisibles(datos.dias, planes, sinPlanVisible).map(d => [d.fecha, d]))
  const cuentas = cuantosPorPlan(datos.dias, planes)
  const piezasDe = fecha => datos.piezas.filter(p => p.fecha === fecha).sort((a, b) => ORDEN_RED.indexOf(a.red) - ORDEN_RED.indexOf(b.red))
  const dia = porFecha.get(elegido)
  const semanas = [...new Set(datos.dias.map(d => d.tema_semana))]
  const piezasElegido = piezasDe(elegido)
  const conTexto = piezasElegido.some(p => p.texto && ['pendiente', 'error', 'falta_info'].includes(p.estado))
  const delMes = [...visibles.values()].filter(d => claveMes(d.fecha) === mes)
  const planPorDefecto = planes.find(p => p.visible)?.id ?? planes[0]?.id

  function elegir(fecha) {
    if (seleccion) { if (visibles.has(fecha)) alternarSeleccion(fecha); return }
    setElegido(fecha); setEditando(null); setAviso(''); setBorrando(false)
    if (window.innerWidth < 1000) requestAnimationFrame(() => detalle.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function alternarSeleccion(fecha) {
    setBorrandoVarios(false)
    setSeleccion(s => { const n = new Set(s); if (n.has(fecha)) n.delete(fecha); else n.add(fecha); return n })
  }

  function empezarSeleccion() { setSeleccion(new Set()); setEditando(null); setBorrando(false); setBorrandoVarios(false); setAviso('') }
  function terminarSeleccion() { setSeleccion(null); setBorrandoVarios(false) }

  async function borrarSeleccionados() {
    const { borrables, bloqueados } = separarBorrables(datos.dias.filter(d => seleccion.has(d.fecha)), piezasDe)
    setOcupado(true)
    let error = null
    if (borrables.length) {
      const fechas = borrables.map(d => d.fecha)
      error = (await supabase.from('up_piezas').delete().in('fecha', fechas)).error
      if (!error) error = (await supabase.from('up_calendario').delete().in('id', borrables.map(d => d.id))).error
    }
    setOcupado(false)
    if (error) { setAviso('No se pudo borrar: ' + error.message); setBorrandoVarios(false); return }
    terminarSeleccion()
    await cargar()
    const n = borrables.length
    setAviso(`${n === 1 ? 'Borré 1 publicación' : `Borré ${n} publicaciones`}.${bloqueados.length ? ` No borré ${bloqueados.length} porque ${bloqueados.length === 1 ? 'tiene' : 'tienen'} algo aprobado o publicado (${bloqueados.map(d => Number(d.fecha.slice(8)) + '/' + Number(d.fecha.slice(5, 7))).join(', ')}).` : ''}`)
  }

  async function importado(mensaje, fecha) {
    setImportando(false)
    await cargar()
    if (fecha) { setMes(claveMes(fecha)); setElegido(fecha) }
    setAviso(mensaje)
  }

  function irA(clave) { setMes(clave); setBorrando(false) }
  function irAHoy() { setMes(claveMes(hoy)); elegir(hoy) }
  function cambiarVista(v) { setVista(v); guardarLocal(CLAVE_VISTA, v) }

  // "Nueva idea": el día elegido si está libre y no pasó; si no, el próximo día libre desde hoy.
  function nuevaIdea() {
    let f = !porFecha.has(elegido) && elegido >= hoy ? elegido : hoy
    while (porFecha.has(f)) f = sumarDia(f, 1)
    setElegido(f); setMes(claveMes(f)); setEditando('nuevo'); setAviso(''); setBorrando(false)
  }

  async function guardado(fila) {
    const habiaBorradores = editando === 'editar' && piezasDe(fila.fecha).some(p => p.texto)
    setEditando(null)
    await cargar()
    setElegido(fila.fecha); setMes(claveMes(fila.fecha))
    const plan = planDe(fila.plan_id)
    if (plan && !plan.visible) setAviso(`Guardado en «${plan.nombre}», que está oculto: tildalo a la derecha para verlo.`)
    else setAviso(habiaBorradores ? 'Guardado. Los borradores que ya estaban no cambian solos: tocá Volver a generar para rehacerlos con la idea nueva.' : 'Guardado. Los agentes la toman la mañana de ese día, o tocá Generar ahora.')
  }

  async function generar() {
    setGenerando(true); setAviso('')
    const mensaje = await correrPipeline(elegido, conTexto)
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
    setAviso(dia.salteado ? 'Listo, los agentes vuelven a escribir este día.' : 'Salteado: los agentes no escriben nada este día.')
  }

  async function borrarDia() {
    setOcupado(true)
    // Primero los borradores sin aprobar de esa fecha, después el día.
    const { error: eP } = await supabase.from('up_piezas').delete().eq('fecha', dia.fecha)
    const { error: eD } = eP ? { error: eP } : await supabase.from('up_calendario').delete().eq('id', dia.id)
    setOcupado(false); setBorrando(false)
    if (eD) { setAviso('No se pudo borrar: ' + eD.message); return }
    await cargar()
    setAviso('Día borrado. Quedó libre para otra idea.')
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
          : <button className="up-btn" onClick={empezarSeleccion} disabled={!visibles.size || importando}>Seleccionar</button>}
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
              <button className="up-link" onClick={() => setSeleccion(new Set([...seleccion, ...delMes.map(d => d.fecha)]))}>Todas las del mes</button>
              {seleccion.size > 0 && <button className="up-link" onClick={() => setSeleccion(new Set())}>Ninguna</button>}
              <span className="up-sp" />
              <button className="up-btn up-btn-borrar" disabled={!seleccion.size} onClick={() => setBorrandoVarios(true)}>Borrar {seleccion.size || ''}</button>
            </>
          )}
        </div>
      )}

      {importando ? (
        <Importar planes={planes} dias={datos.dias} piezasDe={piezasDe} hoy={hoy} cerrar={() => setImportando(false)} listo={importado} />
      ) : (
      <div className="up-cal">
        <section className="up-cal-mes">
          {vista === 'mes' ? (
            <div className="up-cal-grilla" role="grid">
              {NOMBRES_DIA.map(n => <div key={n} className="up-cal-nombre">{n}</div>)}
              {celdasDelMes(mes).map((fecha, k) => {
                if (!fecha) return <div key={k} className="up-cal-hueco" />
                const d = visibles.get(fecha)
                const estado = d ? estadoDelDia(d, piezasDe(fecha)) : null
                return (
                  <button key={fecha} role="gridcell"
                    className={`up-cal-dia${d ? ` d-${estado}` : ' vacio'}${fecha < hoy ? ' pasado' : ''}${fecha === hoy ? ' hoy' : ''}${!seleccion && fecha === elegido ? ' elegido' : ''}${seleccion?.has(fecha) ? ' marcado' : ''}`}
                    aria-pressed={seleccion && d ? seleccion.has(fecha) : undefined}
                    onClick={() => elegir(fecha)} aria-label={d ? `${fechaLarga(fecha)}: ${d.tema_dia}, ${ESTADOS_DIA[estado]}` : fechaLarga(fecha)}>
                    <span className="up-cal-num">{Number(fecha.slice(8))}</span>
                    {seleccion && d && <span className="up-sel-caja" aria-hidden="true" />}
                    {d?.redes.includes('instagram') && <span className="up-cal-ig" title={`Instagram: ${d.formato_instagram}`}><LogoRed red="instagram" /></span>}
                    {d && <span className="up-cal-chip" style={chip(d)} title={planDe(d.plan_id)?.nombre ?? 'Sin plan'}>{d.tema_dia}</span>}
                    <span className="up-cal-marcas">{piezasDe(fecha).filter(marcaCalendario).map(p => <i key={p.id} className={`m-${marcaCalendario(p)}`} title={`${NOMBRE_RED[p.red]}: ${ESTADOS[p.estado]}`}>{SIGLA[p.red]}</i>)}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <ol className="up-cal-lista">
              {!delMes.length && <li className="up-vacio">No hay publicaciones a la vista este mes.</li>}
              {delMes.map(d => {
                const f = partesFecha(d.fecha)
                const estado = estadoDelDia(d, piezasDe(d.fecha))
                return (
                  <li key={d.fecha}>
                    <button className={`up-cal-fila d-${estado}${!seleccion && d.fecha === elegido ? ' elegido' : ''}${d.fecha === hoy ? ' hoy' : ''}${seleccion ? ' seleccionando' : ''}${seleccion?.has(d.fecha) ? ' marcado' : ''}`} onClick={() => elegir(d.fecha)} aria-pressed={seleccion ? seleccion.has(d.fecha) : undefined}>
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
            <p>El color de cada idea es el de su plan. La raya de arriba del día dice en qué está:</p>
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
              <EditorDia key={`${editando}-${elegido}`} dia={editando === 'editar' ? dia : null} fecha={elegido} semanas={semanas}
                planes={planes} planInicial={planPorDefecto} piezas={piezasElegido} cerrar={() => setEditando(null)} guardado={guardado} />
            ) : dia ? (
              <>
                <div className="up-vol">{fechaLarga(dia.fecha)}<span>Semana «{dia.tema_semana}»</span></div>
                <p className="up-cal-plan" style={chip(dia)}><i />{planDe(dia.plan_id)?.nombre ?? 'Sin plan'}{!visibles.has(dia.fecha) && ' (oculto)'}</p>
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
                  <Publicacion key={dia.fecha} piezas={piezasElegido.filter(marcaCalendario)}
                    metricas={datos.metricas} todasLasPiezas={datos.piezas} abrirEdicion={abrirEdicion}
                    alCargar={m => setDatos(d => ({ ...d, metricas: [...d.metricas.filter(x => !(x.pieza_id === m.pieza_id && x.dia === m.dia)), m] }))} />
                )}
                {!piezasElegido.length && !dia.salteado && <p className="up-vacio">{dia.fecha < hoy ? 'Este día no tuvo borradores.' : 'Los agentes escriben los borradores la mañana de ese día.'}</p>}
                {borrando ? (
                  <div className="up-plan-confirmar">
                    <p>¿Borrar este día{piezasElegido.length ? ' y sus borradores sin aprobar' : ''}? No se puede deshacer.</p>
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
                      onClick={() => { const b = bloqueoDeDia(piezasElegido); if (b) setAviso(`${b} No se puede borrar.`); else { setBorrando(true); setAviso('') } }}>Borrar día</button>
                  </div>
                )}
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
