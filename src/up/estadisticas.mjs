// Estadísticas de la pantalla Agentes, calculadas sobre up_corridas (los pasos que anota cada agente).

export const AGENTES_ORDEN = ['planificador', 'investigador', 'redactor', 'revisor', 'disenador', 'publicador']
const AGENTES_DE_TEXTO = ['planificador', 'investigador', 'redactor', 'revisor']
const DIA_MS = 86_400_000

// Día (AAAA-MM-DD) en Buenos Aires.
export function diaAR(fecha) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(fecha))
}

// Los últimos n días hasta hoy, del más viejo al más nuevo.
export function ultimosDias(n, ahora) {
  return Array.from({ length: n }, (_, i) => diaAR(ahora - (n - 1 - i) * DIA_MS))
}

export const esCorridaDeTexto = c => (c.pasos || []).some(p => AGENTES_DE_TEXTO.includes(p.agente))

export function duracionS(c) {
  return c.finalizado_at ? Math.max(0, Math.round((Date.parse(c.finalizado_at) - Date.parse(c.iniciado_at)) / 1000)) : null
}

// Cómo terminó cada borrador de una corrida: aprobado al primer intento, aprobado después de corregir o en revisión.
export function resultadosRevisor(corrida) {
  const porRed = new Map()
  for (const p of corrida.pasos || []) {
    if (!p.red) continue
    const r = porRed.get(p.red) ?? { corrigio: false, resultado: null, at: p.at }
    if (p.agente === 'redactor' && p.accion.startsWith('corrigió')) r.corrigio = true
    if (p.agente === 'revisor' && p.accion === 'aprobó') { r.resultado = r.corrigio ? 'corregido' : 'directo'; r.at = p.at }
    if (p.agente === 'revisor' && p.accion === 'pasó a revisión') { r.resultado = 'revision'; r.at = p.at }
    porRed.set(p.red, r)
  }
  return [...porRed].filter(([, r]) => r.resultado).map(([red, r]) => ({ red, resultado: r.resultado, at: r.at }))
}

export function resumen(corridas, ahora, n = 14) {
  const dias = ultimosDias(n, ahora)
  const enVentana = new Set(dias)
  const antes = new Set(ultimosDias(n, ahora - n * DIA_MS))
  const pasos = corridas.flatMap(c => (c.pasos || []).map(p => ({ ...p, dia: diaAR(p.at) })))
  const escritos = pasos.filter(p => p.agente === 'redactor' && p.accion === 'escribió')

  const porDia = Object.fromEntries(dias.map(d => [d, { directo: 0, corregido: 0, revision: 0 }]))
  const totales = { directo: 0, corregido: 0, revision: 0 }
  for (const c of corridas) for (const r of resultadosRevisor(c)) {
    const d = diaAR(r.at)
    if (!enVentana.has(d)) continue
    porDia[d][r.resultado]++
    totales[r.resultado]++
  }
  const revisados = totales.directo + totales.corregido + totales.revision

  const deTexto = corridas.filter(c => esCorridaDeTexto(c) && enVentana.has(diaAR(c.iniciado_at)) && duracionS(c) !== null)
    .sort((a, b) => a.iniciado_at.localeCompare(b.iniciado_at))
  const duraciones = deTexto.map(c => ({ id: c.id, s: duracionS(c), corrigio: (c.pasos || []).some(p => p.accion.startsWith('corrigió')) }))

  const actividad = Object.fromEntries(AGENTES_ORDEN.map(a => [a, dias.map(d => pasos.filter(p => p.agente === a && p.dia === d).length)]))
  const enDias = p => enVentana.has(p.dia)

  return {
    dias, porDia, totales, revisados,
    borradores: escritos.filter(enDias).length,
    borradoresAntes: escritos.filter(p => antes.has(p.dia)).length,
    aprobadosPct: revisados ? Math.round(((totales.directo + totales.corregido) / revisados) * 100) : null,
    primerIntentoPct: revisados ? Math.round((totales.directo / revisados) * 100) : null,
    duraciones: duraciones.slice(-n),
    duracionMedia: duraciones.length ? Math.round(duraciones.reduce((s, d) => s + d.s, 0) / duraciones.length) : null,
    publicados: pasos.filter(p => enDias(p) && p.accion === 'publicó').length,
    erroresPublicacion: pasos.filter(p => enDias(p) && p.accion === 'no pudo publicar').length,
    actividad,
    totalAgente: Object.fromEntries(AGENTES_ORDEN.map(a => [a, actividad[a].reduce((s, v) => s + v, 0)])),
  }
}
