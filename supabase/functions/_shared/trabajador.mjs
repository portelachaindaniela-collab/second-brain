// Quién dispara la corrida de un trabajador que toca datos de la dueña.
// - cron: manda x-trabajador-secreto (sale de Vault); la dueña se toma de trabajadores.owner_id.
// - sesión: un JWT de usuaria (la app, la pantalla María o el botón [correr] del panel).
// Se anotan en trabajos_corridas las del cron y las que llegan con un origen de ORIGENES_ANOTADOS: la app
// escucha esas corridas en vivo para refrescar sus pantallas. Una llamada con sesión sin origen no se anota.
export const HEADER_SECRETO = 'x-trabajador-secreto'
export const ORIGENES_ANOTADOS = ['panel', 'app_arranque', 'app_manual']

export class ErrorAcceso extends Error {
  constructor(mensaje, status) {
    super(mensaje)
    this.status = status
  }
}

export async function identificarCorrida({ admin, req, clave, body }) {
  const secreto = req.headers.get(HEADER_SECRETO)
  if (secreto) {
    const { data: valido, error } = await admin.rpc('trabajador_secreto_valido', { p_secreto: secreto })
    if (error || valido !== true) throw new ErrorAcceso('Secreto de trabajador inválido.', 401)
    const { data: fila, error: errorFila } = await admin.from('trabajadores').select('owner_id').eq('clave', clave).maybeSingle()
    if (errorFila || !fila?.owner_id) throw new ErrorAcceso(`No hay un trabajador "${clave}" configurado.`, 503)
    return { ownerId: fila.owner_id, origen: 'cron', anotar: true, secreto }
  }
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /i, '') ?? ''
  const { data, error } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true }
  if (error || !data?.user) throw new ErrorAcceso('Sesión inválida', 401)
  const origen = ORIGENES_ANOTADOS.includes(body?.origen) ? body.origen : 'app'
  return { ownerId: data.user.id, origen, anotar: origen !== 'app', usuario: data.user }
}

export async function abrirCorrida(admin, trabajador) {
  const { data, error } = await admin.from('trabajos_corridas')
    .insert({ trabajador, estado: 'corriendo', iniciado_at: new Date().toISOString() }).select('id,iniciado_at').single()
  if (error) throw new Error(`No se pudo registrar la corrida: ${error.message}`)
  return data
}

export async function cerrarCorrida(admin, corrida, { estado, cantidad = null, payload = null, error = null }) {
  if (!corrida) return
  const fin = Date.now()
  await admin.from('trabajos_corridas').update({
    estado, cantidad_resultados: cantidad, payload, error,
    finalizado_at: new Date(fin).toISOString(), duracion_ms: fin - Date.parse(corrida.iniciado_at),
  }).eq('id', corrida.id)
}
