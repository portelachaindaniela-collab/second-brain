// Cómo queda anotada en trabajos_corridas una corrida de María. 'error' es que un chequeo no pudo correr,
// no que haya encontrado problemas: eso es el resultado. cantidad_resultados = cosas para mirar.
export function resultadoCorrida(agentes) {
  const fallos = agentes.filter(a => a.fallo)
  const [sitios, tareas, sync] = ['monitor_sitios', 'tareas_estancadas', 'sync_estado'].map(k => agentes.find(a => a.agente === k))
  const cantidad = (sitios?.datos?.resumen ? sitios.datos.resumen.aviso + sitios.datos.resumen.error : 0)
    + (Array.isArray(tareas?.datos) ? tareas.datos.length : 0)
    + (sync && !sync.fallo && sync.estado !== 'ok' ? 1 : 0)
  return {
    estado: fallos.length ? 'error' : 'ok',
    cantidad: fallos.length ? null : cantidad,
    error: fallos.length ? fallos.map(a => `${a.agente}: ${a.resumen}`).join(' · ') : null,
    payload: { agentes: agentes.map(({ agente, estado, resumen }) => ({ agente, estado, resumen })) },
  }
}
