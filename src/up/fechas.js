// Fechas de UP: el calendario guarda días (YYYY-MM-DD) sin hora, en la zona horaria de la dueña.
export function hoyIso() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

function aFecha(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function partesFecha(iso) {
  const f = aFecha(iso)
  return { dia: f.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''), numero: f.getDate(), mes: f.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') }
}

export function fechaLarga(iso) {
  const t = (iso ? aFecha(iso) : new Date()).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
