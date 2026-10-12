// Planes de trabajo del Calendario de UP y reglas para editar días. Sin React ni base, para probarlo con node --test.

export const COLORES_PLAN = ['#326891', '#3D6B4F', '#B8741A', '#A3302A', '#6B4E9B', '#2E7D7A', '#5E6A71']

export const SIN_PLAN = 'sin-plan'

// Clave AAAA-MM del mes que está n meses antes o después.
export function moverMes(clave, n) {
  const [a, m] = clave.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// El primer color que todavía no usa ningún plan (si están todos, se repite en orden).
export function colorLibre(planes) {
  const usados = new Set(planes.map(p => p.color.toUpperCase()))
  return COLORES_PLAN.find(c => !usados.has(c.toUpperCase())) ?? COLORES_PLAN[planes.length % COLORES_PLAN.length]
}

// Los días que se ven según los planes tildados. Un día cuyo plan ya no existe cuenta como "Sin plan".
export function diasVisibles(dias, planes, sinPlanVisible = true) {
  const visible = new Map(planes.map(p => [p.id, p.visible]))
  return dias.filter(d => (d.plan_id && visible.has(d.plan_id) ? visible.get(d.plan_id) : sinPlanVisible))
}

export function cuantosPorPlan(dias, planes) {
  const ids = new Set(planes.map(p => p.id))
  const cuenta = { [SIN_PLAN]: 0 }
  for (const d of dias) {
    const k = d.plan_id && ids.has(d.plan_id) ? d.plan_id : SIN_PLAN
    cuenta[k] = (cuenta[k] ?? 0) + 1
  }
  return cuenta
}

// Un día con algo aprobado o publicado no se borra ni se mueve: ya salió (o está por salir) con esa fecha.
export function bloqueoDeDia(piezas) {
  if (piezas.some(p => p.estado === 'publicado')) return 'Este día ya tiene publicaciones publicadas.'
  if (piezas.some(p => p.estado === 'aprobado')) return 'Este día tiene publicaciones aprobadas: desaprobalas antes o salteá el día.'
  return ''
}

// Borrado masivo: separa los días que se pueden borrar de los que tienen algo aprobado o publicado.
export function separarBorrables(dias, piezasDe) {
  const borrables = [], bloqueados = []
  for (const d of dias) (bloqueoDeDia(piezasDe(d.fecha)) ? bloqueados : borrables).push(d)
  return { borrables, bloqueados }
}
