// Cálculos del departamento comercial de PDG (sin React, con tests).
export { NOMBRE_SEGMENTO, NOMBRE_ETAPA, extraerIdeas } from '../../supabase/functions/pdg-agente/logic.mjs'

export const ETAPAS = ['prospecto', 'contactada', 'demo', 'propuesta', 'negociacion', 'ganada', 'perdida']
export const ETAPAS_ABIERTAS = ['prospecto', 'contactada', 'demo', 'propuesta', 'negociacion']
export const SEGMENTOS = ['club', 'liga', 'agencia', 'medio', 'marca', 'otro']

export const AGENTES_INFO = {
  prospector: { corto: 'Prospectar', ayuda: 'Revisa su web, encuentra qué parte del sistema le sirve y escribe el primer contacto.', pedido: 'Ej.: enfocate en su equipo de Reserva' },
  demo: { corto: 'Preparar demo', ayuda: 'Arma el recorrido de 15 minutos para mostrarle el sistema funcionando.', pedido: 'Ej.: la reunión es con el área de prensa' },
  objeciones: { corto: 'Objeciones', ayuda: 'Responde a lo que frena la venta. Sin objeción, arma las 5 más probables.', pedido: 'Ej.: "ya tenemos datos de Opta"' },
  propuesta: { corto: 'Propuesta', ayuda: 'Redacta la propuesta comercial y técnica con fases y entregables.', pedido: 'Ej.: quieren portal + informe post partido, sin app' },
  marketing: { corto: 'Marketing', ayuda: 'Escribe ideas y piezas que muestran lo que hace el sistema, listas para mandar a UP.', pedido: 'Ej.: campaña para agencias de representación' },
}

export function hoyISO(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

// Cuentas abiertas con próxima acción, la más urgente primero; las vencidas marcadas. Sin fecha van al final.
export function proximasAcciones(cuentas, hoy = hoyISO()) {
  return cuentas
    .filter(c => ETAPAS_ABIERTAS.includes(c.etapa) && (c.proxima_accion || c.proxima_fecha))
    .map(c => ({ ...c, vencida: !!c.proxima_fecha && c.proxima_fecha < hoy, esHoy: c.proxima_fecha === hoy }))
    .sort((a, b) => (a.proxima_fecha || '9999').localeCompare(b.proxima_fecha || '9999') || a.nombre.localeCompare(b.nombre))
}

export function cifras(cuentas, hoy = hoyISO()) {
  const abiertas = cuentas.filter(c => ETAPAS_ABIERTAS.includes(c.etapa))
  return {
    abiertas: abiertas.length,
    enDemo: cuentas.filter(c => c.etapa === 'demo').length,
    enPropuesta: cuentas.filter(c => c.etapa === 'propuesta' || c.etapa === 'negociacion').length,
    ganadas: cuentas.filter(c => c.etapa === 'ganada').length,
    vencidas: abiertas.filter(c => c.proxima_fecha && c.proxima_fecha < hoy).length,
    sinAccion: abiertas.filter(c => !c.proxima_accion && !c.proxima_fecha).length,
  }
}

export function porSegmento(cuentas) {
  return SEGMENTOS.map(s => ({ segmento: s, total: cuentas.filter(c => c.segmento === s && ETAPAS_ABIERTAS.includes(c.etapa)).length })).filter(x => x.total > 0)
}

// Primer día a partir de mañana que no tiene publicación en el calendario de UP.
export function primerDiaLibre(ocupadas, hoy = hoyISO()) {
  const usadas = new Set(ocupadas)
  const d = new Date(`${hoy}T12:00:00Z`)
  for (let i = 1; i < 400; i++) {
    d.setUTCDate(d.getUTCDate() + 1)
    const f = d.toISOString().slice(0, 10)
    if (!usadas.has(f)) return f
  }
  return null
}

// "[club] Idea" → { segmento: 'club', idea: 'Idea' }
export function partirIdea(linea) {
  const m = String(linea).match(/^\[([^\]]+)\]\s*(.+)$/)
  return m ? { segmento: m[1].trim(), idea: m[2].trim() } : { segmento: '', idea: String(linea).trim() }
}

// Manual y agentes por defecto a partir de los .md de sales-system-pdg (se cargan la primera vez).
export function leerAgenteMd(clave, md, orden) {
  const titulo = md.match(/^#\s+(.+)$/m)?.[1] ?? clave
  const nombre = titulo.replace(/^Agente\s+\d+\s*:\s*/i, '').trim()
  const rol = md.match(/^##\s+Rol\s*\n([\s\S]*?)(?=^##\s)/m)?.[1]?.trim() ?? ''
  const i = md.search(/^##\s+(?!Rol\b)/m)
  const instrucciones = i >= 0 ? md.slice(i).trim() : ''
  return { clave, nombre, rol, instrucciones, orden }
}
