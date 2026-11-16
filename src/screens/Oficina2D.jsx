import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { armarEscena, dibujarEscena, dibujarReunion } from '../oficina2d/escena.mjs'
import './Oficina2D.css'

// La Oficina en 2D: vista de costado, plana, con TRABAJO, CAFÉ y DESCANSO. Cada agente está en la zona de su estado real
// y cambia de lugar cuando cambia el estado. Se arrastra para moverse, se acerca y aleja con la rueda, con dos dedos o con
// los botones + y −, y ⌂ vuelve al inicio. Tocar un agente lo abre.
// Las reuniones y las visitas no caminan: se avisa enseguida a la pantalla (alPlanificar, alVolvieron, alLlegoVisita,
// alTerminoInterna) para que todo siga funcionando igual que antes.
const ZOOM_MIN = 0.15, ZOOM_MAX = 2.5, LEGIBLE = 0.75, ARRASTRE = 6

export default function Oficina2D({ agentes, elegidoId, abrir, conDani = true, visitantes = [], reunion = null, hablando = null, alPlanificar, alVolvieron,
  pantallaCompleta = false, reunionInterna = null, alTerminoInterna = null, visita = null, alLlegoVisita = null, children }) {
  const marco = useRef(null)
  const firmaVisitas = visitantes.join('|')
  const escena = useMemo(() => armarEscena(agentes, { visitas: visitantes, conDani }), [agentes, firmaVisitas, conDani]) // eslint-disable-line react-hooks/exhaustive-deps
  const svg = useMemo(() => dibujarEscena(escena, { elegidoId }), [escena, elegidoId])

  // ---------- Reuniones y visitas (sin caminata) ----------
  const planificada = useRef(null)
  useEffect(() => {
    if (reunion?.estado !== 'convocada' || planificada.current === reunion.id) return
    planificada.current = reunion.id
    alPlanificar?.(reunion.id, Object.fromEntries(reunion.asistentes.map((id, i) => [id, 2 + i * 0.4])))
  }, [reunion, alPlanificar])
  useEffect(() => {
    if (reunion?.estado !== 'volviendo') return
    const id = reunion.id
    const t = setTimeout(() => alVolvieron?.(id), 1200)
    return () => clearTimeout(t)
  }, [reunion?.estado, reunion?.id, alVolvieron]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (reunionInterna?.estado !== 'volviendo') return
    const id = reunionInterna.id
    const t = setTimeout(() => alTerminoInterna?.(id), 3000)
    return () => clearTimeout(t)
  }, [reunionInterna?.estado, reunionInterna?.id, alTerminoInterna]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!visita) return
    const t = setTimeout(() => alLlegoVisita?.(visita.id, visita.agente), 1200)
    return () => clearTimeout(t)
  }, [visita?.id, visita?.agente]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Mover y acercar ----------
  const [vista, setVista] = useState(null) // { s, x, y }
  const medida = useRef({ w: 0, h: 0 })
  const ajustar = useCallback((v, w = medida.current.w, h = medida.current.h) => {
    const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.s))
    const cw = escena.ancho * s, ch = escena.alto * s
    const x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, v.x))
    const y = ch <= h ? (h - ch) / 2 : Math.min(0, Math.max(h - ch, v.y))
    return { s, x, y }
  }, [escena.ancho, escena.alto])
  // Al inicio: entra entera si se lee bien; si no (celular, muchos agentes), arranca a un tamaño legible desde la izquierda.
  const inicio = useCallback(() => {
    const { w, h } = medida.current
    if (!w || !h) return null
    const entra = Math.min(w / escena.ancho, h / escena.alto)
    // En pantalla ancha se lee bien más chico (entra todo); en el celular, los personajes tienen que reconocerse.
    const legible = w >= 900 ? 0.45 : LEGIBLE
    const s = Math.max(entra, Math.min(legible, h / Math.min(escena.alto, 640)))
    return ajustar({ s, x: 0, y: 0 }, w, h)
  }, [escena.ancho, escena.alto, ajustar])
  useEffect(() => {
    const el = marco.current
    if (!el || pantallaCompleta) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      const antes = medida.current
      medida.current = { w: r.width, h: r.height }
      setVista(v => (!v || !antes.w ? inicio() : ajustar(v)))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [inicio, ajustar, pantallaCompleta])
  // Si la escena cambia de tamaño (alguien cambió de zona), se mantiene dentro del marco.
  useEffect(() => { setVista(v => (v ? ajustar(v) : v)) }, [ajustar])

  const zoomEn = useCallback((factor, cx, cy) => setVista(v => {
    if (!v) return v
    const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.s * factor))
    const k = s / v.s
    return ajustar({ s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
  }), [ajustar])
  const centroZoom = f => zoomEn(f, medida.current.w / 2, medida.current.h / 2)

  // Rueda: acerca o aleja donde está el puntero (sin mover la página).
  useEffect(() => {
    const el = marco.current
    if (!el || pantallaCompleta) return
    const alRodar = ev => {
      ev.preventDefault()
      const r = el.getBoundingClientRect()
      zoomEn(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top)
    }
    el.addEventListener('wheel', alRodar, { passive: false })
    return () => el.removeEventListener('wheel', alRodar)
  }, [zoomEn, pantallaCompleta])

  // Arrastrar con un dedo o el mouse; con dos dedos, acercar. Un toque sin arrastre abre al agente tocado.
  const punteros = useRef(new Map())
  const gesto = useRef(null)
  const alBajar = ev => {
    if (ev.target.closest('button, .o3-encuentro, .reunion-aviso, .o3-interna')) return
    marco.current?.setPointerCapture?.(ev.pointerId)
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    gesto.current = { movio: false, inicio: { x: ev.clientX, y: ev.clientY }, objetivo: ev.target, dist: null }
  }
  const alMover = ev => {
    const p = punteros.current.get(ev.pointerId)
    if (!p || !gesto.current) return
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (Math.hypot(ev.clientX - gesto.current.inicio.x, ev.clientY - gesto.current.inicio.y) > ARRASTRE) gesto.current.movio = true
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const r = marco.current.getBoundingClientRect()
      if (gesto.current.dist) zoomEn(d / gesto.current.dist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top)
      gesto.current.dist = d
      gesto.current.movio = true
      return
    }
    if (gesto.current.movio) setVista(v => (v ? ajustar({ ...v, x: v.x + dx, y: v.y + dy }) : v))
  }
  const alSubir = ev => {
    punteros.current.delete(ev.pointerId)
    const g = gesto.current
    if (!punteros.current.size) gesto.current = null
    else if (g) g.dist = null
    if (!g || g.movio) return
    const id = g.objetivo?.closest?.('[data-agente]')?.getAttribute('data-agente')
    if (id) abrir(id)
  }
  const alTeclear = ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return
    const id = ev.target.closest?.('[data-agente]')?.getAttribute('data-agente')
    if (id) { ev.preventDefault(); abrir(id) }
  }

  if (pantallaCompleta) {
    const asistentes = (reunion?.asistentes ?? []).map(id => agentes.find(a => a.id === id)).filter(Boolean)
    const r = dibujarReunion(asistentes, hablando)
    return <div className="of2d o3-completa">
      <div className="of2d-sala" onClick={ev => { const id = ev.target.closest('[data-agente]')?.getAttribute('data-agente'); if (id) abrir(id) }}>
        <svg viewBox={`0 0 ${r.ancho} ${r.alto}`} role="img" aria-label="La reunión" dangerouslySetInnerHTML={{ __html: r.svg }} />
      </div>
      {children}
    </div>
  }

  return <div className="of2d" ref={marco} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSubir} onPointerCancel={alSubir} onKeyDown={alTeclear}>
    {vista && <div className="of2d-lienzo" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.s})`, width: escena.ancho, height: escena.alto }}>
      <svg width={escena.ancho} height={escena.alto} viewBox={`0 0 ${escena.ancho} ${escena.alto}`} role="group"
        aria-label="La oficina: TRABAJO, CAFÉ y DESCANSO. Tocá un agente para ver qué está haciendo." dangerouslySetInnerHTML={{ __html: svg }} />
    </div>}
    <div className="of2d-botones">
      <button type="button" aria-label="Acercar" onClick={() => centroZoom(1.3)}>+</button>
      <button type="button" aria-label="Alejar" onClick={() => centroZoom(1 / 1.3)}>−</button>
      <button type="button" aria-label="Volver al inicio" onClick={() => setVista(inicio())}>⌂</button>
    </div>
    {children}
  </div>
}
