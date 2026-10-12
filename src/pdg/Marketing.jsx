import { useState } from 'react'
import { Trabajo, Lanzador } from './Trabajos.jsx'

const FILTROS = [['', 'Todo'], ['marketing', 'Marketing'], ['objeciones', 'Objeciones'], ['prospector', 'Prospección'], ['demo', 'Demos'], ['propuesta', 'Propuestas']]

// Trabajo sin cuenta (campañas, objeciones generales) y archivo de todo lo que escribieron los agentes.
export default function Marketing({ agentes, trabajos, cuentas, recargar }) {
  const [filtro, setFiltro] = useState('')
  const [nuevo, setNuevo] = useState(null)
  const nombres = Object.fromEntries(agentes.map(a => [a.clave, a.nombre]))
  const nombreCuenta = Object.fromEntries(cuentas.map(c => [c.id, c.nombre]))
  const visibles = trabajos.filter(t => !filtro || t.agente === filtro)

  return (
    <>
      <section className="pdg-caja">
        <h3 className="pdg-h3">Contenido y objeciones generales</h3>
        <p className="pdg-ayuda">Para algo de una cuenta puntual, entrá a la cuenta. Las ideas de marketing se mandan al calendario de UP con un clic, dentro del plan "PDG".</p>
        <Lanzador agentes={agentes} alTerminar={t => { setNuevo(t.id); setFiltro(''); recargar() }} />
      </section>
      <section className="pdg-seccion">
        <div className="pdg-barra">
          <h3 className="pdg-h3">Archivo</h3>
          <span className="pdg-sp" />
          <div className="pdg-chips">
            {FILTROS.map(([v, l]) => <button key={v} className={filtro === v ? 'on' : ''} onClick={() => setFiltro(v)}>{l}</button>)}
          </div>
        </div>
        {visibles.length === 0 ? <p className="pdg-vacio">Nada por acá todavía.</p>
          : visibles.map(t => <Trabajo key={t.id} trabajo={t} nombreAgente={nombres[t.agente]} cuenta={nombreCuenta[t.cuenta_id]} alCambiar={recargar} abierto={t.id === nuevo} />)}
      </section>
    </>
  )
}
