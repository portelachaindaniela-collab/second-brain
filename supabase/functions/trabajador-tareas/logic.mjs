export const TRABAJADOR = 'tareas_estancadas'
export const DIAS_DEFECTO = 3
export const MAXIMO = 20

// trabajadores.parametros.dias_sin_tocar: cuántos días sin tocar hacen que una tarea cuente como estancada.
export function diasSinTocar(parametros) {
  const d = Number(parametros?.dias_sin_tocar)
  return Number.isInteger(d) && d >= 1 && d <= 90 ? d : DIAS_DEFECTO
}

export function limiteTouched(dias, ahora = Date.now()) {
  return new Date(ahora - dias * 24 * 3600_000).toISOString()
}

// El trabajador lista; cuántas son "demasiadas" lo decide María.
export function resultadoTareas(tareas, dias) {
  return { estado: 'ok', cantidad: tareas.length, payload: { dias_sin_tocar: dias, tareas } }
}
