// Cómo queda anotada en trabajos_corridas una sincronización. 'error' es que no se pudo sincronizar;
// si el calendario se guardó pero falló la revisión de eliminados, la corrida es ok y el aviso va en el payload.
export function resultadoCorrida(r) {
  if (!r?.conectado) {
    return { estado: 'error', error: r?.reconectar ? 'Google pide reconectar la cuenta.' : 'Google no está vinculado.', payload: r ?? null }
  }
  if (r.error && r.eventos == null) return { estado: 'error', error: String(r.error), payload: r }
  return { estado: 'ok', cantidad: (r.eventos ?? 0) + (r.mails ?? 0), payload: r }
}
