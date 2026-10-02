// Expresiones cron de 5 campos, como las corre pg_cron (en UTC). Lo usan María (servidor) y el panel de la app.

function campoCron(texto, min, max) {
  const valores = new Set()
  for (const parte of texto.split(',')) {
    const [rango, pasoTexto] = parte.split('/')
    const paso = pasoTexto === undefined ? 1 : Number(pasoTexto)
    if (!Number.isInteger(paso) || paso < 1) return null
    let desde, hasta
    if (rango === '*') { desde = min; hasta = max }
    else if (/^\d+-\d+$/.test(rango)) [desde, hasta] = rango.split('-').map(Number)
    else if (/^\d+$/.test(rango)) { desde = Number(rango); hasta = pasoTexto === undefined ? desde : max }
    else return null
    if (desde < min || hasta > max || desde > hasta) return null
    for (let v = desde; v <= hasta; v += paso) valores.add(v)
  }
  return valores
}

// Expresión cron de 5 campos (como pg_cron, en UTC). Devuelve null si no se entiende.
export function parsearCron(expr) {
  const partes = String(expr || '').trim().split(/\s+/)
  if (partes.length !== 5) return null
  const [minutos, horas, dias, meses, semanaCruda] = [
    campoCron(partes[0], 0, 59), campoCron(partes[1], 0, 23), campoCron(partes[2], 1, 31), campoCron(partes[3], 1, 12), campoCron(partes[4], 0, 7),
  ]
  if (!minutos || !horas || !dias || !meses || !semanaCruda) return null
  const semana = new Set([...semanaCruda].map(d => d % 7))
  return { minutos: [...minutos].sort((a, b) => a - b), horas, dias, meses, semana, diaLibre: partes[2] === '*', semanaLibre: partes[4] === '*' }
}

// Minutos de esa hora (UTC) en los que el cron dispara; vacío si no le toca en esa hora.
export function minutosProgramados(cron, inicioHora) {
  if (!cron) return []
  const d = new Date(inicioHora)
  if (!cron.horas.has(d.getUTCHours()) || !cron.meses.has(d.getUTCMonth() + 1)) return []
  const porDia = cron.dias.has(d.getUTCDate()), porSemana = cron.semana.has(d.getUTCDay())
  const diaOk = cron.diaLibre && cron.semanaLibre ? true : cron.diaLibre ? porSemana : cron.semanaLibre ? porDia : porDia || porSemana
  return diaOk ? cron.minutos : []
}
