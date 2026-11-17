import { useEffect, useRef } from 'react'
import './Oficina2D.css'

// La Oficina sin dibujo: no hay escena. Este componente solo lleva los tiempos de las reuniones y las visitas
// (alPlanificar, alVolvieron, alLlegoVisita, alTerminoInterna) y muestra los avisos que le pasa la pantalla.
// Durante una reunión, en lugar del dibujo, muestra quiénes están y quién habla.
export default function Oficina2D({ agentes, abrir, reunion = null, hablando = null, alPlanificar, alVolvieron,
  pantallaCompleta = false, reunionInterna = null, alTerminoInterna = null, visita = null, alLlegoVisita = null, children }) {
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

  if (pantallaCompleta) {
    const asistentes = (reunion?.asistentes ?? []).map(id => agentes.find(a => a.id === id)).filter(Boolean)
    return <div className="of2d o3-completa">
      <div className="of2d-sala">
        <ul className="of2d-asistentes" aria-label="Quiénes están en la reunión">
          <li>Vos</li>
          {asistentes.map(a => <li key={a.id} className={a.id === hablando ? 'is-hablando' : ''}>
            <button type="button" onClick={() => abrir(a.id)}>{a.nombre}{a.id === hablando && <span> · está hablando</span>}</button>
          </li>)}
        </ul>
      </div>
      {children}
    </div>
  }
  return <div className="of2d-sin-dibujo">{children}</div>
}
