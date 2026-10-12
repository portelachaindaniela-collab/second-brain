import { proximasAcciones, cifras, porSegmento, ETAPAS_ABIERTAS, NOMBRE_ETAPA, NOMBRE_SEGMENTO } from './comercial.mjs'
import { Trabajo } from './Trabajos.jsx'

export default function Tablero({ cuentas, trabajos, agentes, abrirCuenta, irA, recargar }) {
  const k = cifras(cuentas)
  const acciones = proximasAcciones(cuentas).slice(0, 8)
  const nombres = Object.fromEntries(agentes.map(a => [a.clave, a.nombre]))
  const nombreCuenta = Object.fromEntries(cuentas.map(c => [c.id, c.nombre]))
  const maxEtapa = Math.max(1, ...ETAPAS_ABIERTAS.map(e => cuentas.filter(c => c.etapa === e).length))
  const segmentos = porSegmento(cuentas)

  return (
    <>
      <section className="pdg-intro">
        <div className="pdg-hero">
          <h2><span>Vendemos el sistema,</span><span>no la web.</span></h2>
          <p>Recolección automática, motor de datos, almacén central y salidas (portal, app, informes, newsletter) adaptados a cada club, liga, agencia, medio o marca. Los agentes trabajan con el Manual como única fuente de verdad.</p>
          <div className="pdg-hero-acciones">
            <button className="pdg-cta" onClick={() => irA('cuentas')}>Ver cuentas</button>
            <button className="pdg-btn" onClick={() => irA('marketing')}>Pedir contenido</button>
          </div>
        </div>
        <div className="pdg-cifras">
          <div><b>{k.abiertas}</b><span>Cuentas abiertas</span></div>
          <div><b className="naranja">{k.enDemo}</b><span>En demo</span></div>
          <div><b>{k.enPropuesta}</b><span>Propuesta o negociación</span></div>
          <div><b className="violeta">{k.ganadas}</b><span>Ganadas</span></div>
        </div>
      </section>

      {(k.vencidas > 0 || k.sinAccion > 0) && (
        <p className="pdg-alerta">
          {k.vencidas > 0 && <>{k.vencidas} {k.vencidas === 1 ? 'acción vencida' : 'acciones vencidas'}. </>}
          {k.sinAccion > 0 && <>{k.sinAccion} {k.sinAccion === 1 ? 'cuenta abierta sin próximo paso' : 'cuentas abiertas sin próximo paso'}.</>}
        </p>
      )}

      <div className="pdg-dos">
        <section className="pdg-seccion">
          <h3 className="pdg-h3">Próximas acciones</h3>
          {acciones.length === 0 ? <p className="pdg-vacio">Nada anotado. Cada cuenta abierta debería tener un próximo paso.</p> : (
            <ul className="pdg-lista">
              {acciones.map(c => (
                <li key={c.id}>
                  <button onClick={() => abrirCuenta(c.id)} className={c.vencida ? 'vencida' : c.esHoy ? 'hoy' : ''}>
                    <span className="pdg-lista-fecha">{c.proxima_fecha ? new Date(`${c.proxima_fecha}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—'}</span>
                    <span><strong>{c.nombre}</strong> {c.proxima_accion}</span>
                    <span className="pdg-lista-etapa">{NOMBRE_ETAPA[c.etapa]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="pdg-seccion">
          <h3 className="pdg-h3">Embudo</h3>
          <div className="pdg-embudo">
            {ETAPAS_ABIERTAS.map(e => {
              const n = cuentas.filter(c => c.etapa === e).length
              return (
                <div key={e} className={`et-${e}`}>
                  <span>{NOMBRE_ETAPA[e]}</span>
                  <i><b style={{ width: `${(n / maxEtapa) * 100}%` }} /></i>
                  <span>{n}</span>
                </div>
              )
            })}
          </div>
          {segmentos.length > 0 && (
            <p className="pdg-nota">Abiertas por tipo: {segmentos.map(s => `${NOMBRE_SEGMENTO[s.segmento]} ${s.total}`).join(' · ')}</p>
          )}
        </section>
      </div>

      <section className="pdg-seccion">
        <h3 className="pdg-h3">Último trabajo de los agentes</h3>
        {trabajos.length === 0 ? <p className="pdg-vacio">Todavía no corrió ningún agente.</p>
          : trabajos.slice(0, 6).map(t => <Trabajo key={t.id} trabajo={t} nombreAgente={nombres[t.agente]} cuenta={nombreCuenta[t.cuenta_id]} alCambiar={recargar} />)}
      </section>
    </>
  )
}
