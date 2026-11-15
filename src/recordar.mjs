// Recuerda en qué pantalla estaba Daniela para que, al actualizar la página, vuelva a la misma y no al inicio.
// Usa el almacenamiento de la pestaña (sessionStorage): sobrevive a recargar, se borra al cerrar.
const PREFIJO = 'sb:'

function almacenDeSesion() {
  try { return globalThis.sessionStorage ?? null } catch { return null }
}

export function leerRecordado(clave, porDefecto, almacen = almacenDeSesion()) {
  try {
    const guardado = almacen?.getItem(PREFIJO + clave)
    return guardado == null ? porDefecto : JSON.parse(guardado)
  } catch { return porDefecto }
}

export function guardarRecordado(clave, valor, almacen = almacenDeSesion()) {
  try {
    if (valor == null) almacen?.removeItem(PREFIJO + clave)
    else almacen?.setItem(PREFIJO + clave, JSON.stringify(valor))
  } catch { /* sin almacenamiento: al recargar vuelve al inicio, como antes */ }
}
