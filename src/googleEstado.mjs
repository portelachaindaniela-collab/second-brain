// La sincronización con Google la hace el trabajador google_sync (servidor, cada 15 min). La app no sincroniza
// en ciclo: lee el estado de sus corridas en trabajos_corridas y solo la dispara al abrir (si está vieja),
// al tocar "Sincronizar ahora" o al terminar de conectar la cuenta.
export const TRABAJADOR_GOOGLE = 'google_sync'
export const MINUTOS_FRESCA = 5

// Estado de la conexión a partir de las corridas más recientes (la primera, la más nueva). Una corrida que falló
// sin respuesta de Google (por ejemplo, un corte de red) no dice nada de la conexión: se mira la anterior.
export function estadoGoogle(corridas) {
  const conDatos = (corridas ?? []).find(c => c.estado !== 'corriendo' && c.payload && typeof c.payload.conectado === 'boolean')
  if (!conDatos) return null
  const p = conDatos.payload
  return p.conectado
    ? { conectado: true, cuenta: p.cuenta ?? null, sincronizado_at: conDatos.finalizado_at ?? null }
    : { conectado: false, reconectar: p.reconectar === true }
}

export function debeSincronizarAlAbrir(ultima, ahora = Date.now(), minutos = MINUTOS_FRESCA) {
  if (!ultima) return true
  const edad = ahora - Date.parse(ultima.iniciado_at)
  // Una corrida en curso que arrancó hace poco va a terminar sola; si lleva mucho, quedó trabada.
  if (ultima.estado === 'corriendo') return edad > 10 * 60_000
  return edad > minutos * 60_000
}
