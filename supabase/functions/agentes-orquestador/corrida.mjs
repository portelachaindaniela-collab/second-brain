// Cómo queda anotada en trabajos_corridas una corrida de María. María ya no ejecuta chequeos: su corrida solo
// falla si no pudo leer o guardar (eso lo maneja index.ts). Lo que encontró — un sitio caído, un trabajador
// atrasado — es el resultado. cantidad_resultados = cosas para mirar.
export function resultadoCorrida(reportes, saludes = []) {
  const [sitios, tareas, sync] = ['monitor_sitios', 'tareas_estancadas', 'sync_estado'].map(k => reportes.find(a => a.agente === k))
  const cantidad = (sitios?.datos?.resumen ? sitios.datos.resumen.aviso + sitios.datos.resumen.error : 0)
    + (Array.isArray(tareas?.datos) ? tareas.datos.length : 0)
    + (sync && sync.estado !== 'ok' ? 1 : 0)
    + saludes.filter(s => s.estado !== 'ok').length
  return {
    estado: 'ok',
    cantidad,
    error: null,
    payload: { agentes: reportes.map(({ agente, estado, resumen }) => ({ agente, estado, resumen })) },
  }
}
