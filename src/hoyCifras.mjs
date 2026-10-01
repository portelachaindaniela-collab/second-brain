// Cifras de la cabecera de Hoy. "Importantes" usa la misma regla que el resumen diario
// (supabase/functions/resumen-diario): fuera lo que coincide con "excluir", adentro lo que coincide con "incluir".
function coincideAlguno(mail, patrones) {
  if (!patrones.length) return false
  const texto = `${mail.subject || ''} ${mail.from_name || ''} ${mail.from_addr || ''}`.toLowerCase()
  return patrones.some(p => texto.includes(p))
}

export function mailsImportantes(mails, reglas) {
  const de = tipo => (reglas || []).filter(r => r.tipo === tipo).map(r => String(r.patron).toLowerCase())
  const excluir = de('excluir'), incluir = de('incluir')
  return (mails || []).filter(m => !coincideAlguno(m, excluir) && coincideAlguno(m, incluir))
}

// La línea del pie: "activo a las 08:00 · 2 reglas de mail".
export function resumenDiarioLinea({ soportado, suscripcion, reglas }) {
  const cantidad = (reglas || []).length
  const textoReglas = cantidad === 1 ? '1 regla de mail' : `${cantidad} reglas de mail`
  if (!soportado) return `no disponible en este dispositivo · ${textoReglas}`
  if (!suscripcion) return `apagado · ${textoReglas}`
  return `activo a las ${String(suscripcion.hora_local || '').slice(0, 5)} · ${textoReglas}`
}
