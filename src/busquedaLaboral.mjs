// Estadísticas de la búsqueda laboral, a partir de las mismas filas que lee la pantalla Postulaciones.
// Sin red: todo se calcula sobre lo que vino de la planilla. No se inventan columnas ni datos.
import { nombreCv, semaforoDe } from './postulaciones.mjs'

const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export const CATEGORIAS = [
  { clave: 'rechazada', titulo: 'Rechazada' },
  { clave: 'postulada', titulo: 'Postulada sin decisión' },
  { clave: 'descartada', titulo: 'Descartada por mí' },
  { clave: 'no_enviada', titulo: 'No enviada' },
  { clave: 'cerrada', titulo: 'Cerrada' },
  { clave: 'otro', titulo: 'Otro' },
]
export const tituloCategoria = clave => CATEGORIAS.find(c => c.clave === clave)?.titulo ?? clave

// Columna I (Estado). Lo que no encaja en ninguna regla queda como 'otro' para corregirlo en la planilla.
export function clasificarEstado(estado) {
  const e = normal(estado)
  if (!e) return 'no_enviada'
  if (e.startsWith('rechazad')) return 'rechazada'
  if (e.startsWith('postulad') || e.startsWith('respondid')) return 'postulada'
  if (e.startsWith('descartad')) return 'descartada'
  if (/^(sin enviar|carta lista|propuesta lista|sin evaluar|sin decidir|pendiente)/.test(e)) return 'no_enviada'
  if (e.startsWith('cerrad') || e.includes('convocatoria cerrada')) return 'cerrada'
  return 'otro'
}

export const esEnviada = cat => cat === 'rechazada' || cat === 'postulada'
// "Respondido 27/10": hubo respuesta pero todavía no hay decisión.
export const esRespondida = estado => normal(estado).startsWith('respondid')

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Columna A (Fecha): "18/08/2026" (o año de 2 dígitos) → día exacto; "marzo 2026" → solo el mes.
// Sin año o ilegible → null (se cuenta aparte como "sin fecha", no se adivina).
export function leerFechaFila(texto) {
  const t = normal(texto)
  if (!t) return null
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (m) {
    const dia = Number(m[1]), mes = Number(m[2]), anio = Number(m[3].length === 2 ? `20${m[3]}` : m[3])
    const f = new Date(anio, mes - 1, dia)
    if (f.getFullYear() !== anio || f.getMonth() !== mes - 1 || f.getDate() !== dia) return null
    return { anio, mes, dia }
  }
  m = t.match(/^([a-z]+)\s+(?:de\s+)?(\d{4})$/)
  if (m) {
    const i = MESES.indexOf(m[1] === 'setiembre' ? 'septiembre' : m[1])
    if (i >= 0) return { anio: Number(m[2]), mes: i + 1, dia: null }
  }
  return null
}

export const SIN_FECHA = 'sin-fecha'
export const claveMes = f => f ? `${f.anio}-${String(f.mes).padStart(2, '0')}` : SIN_FECHA
export function etiquetaMes(clave) {
  if (clave === SIN_FECHA) return 'Sin fecha'
  const [a, m] = clave.split('-')
  return `${MESES_CORTOS[Number(m) - 1]} ${a}`
}

// Columna E (Fuente): "Instagram @desocupada.arg" → "Instagram"; "Mail Claro Empleos" → "Mail".
// Lo que no empieza con un canal conocido queda como está escrito.
const CANALES = Object.fromEntries(['LinkedIn', 'Indeed', 'HiringRoom', 'Instagram', 'Mail', 'X', 'Threads', 'ZonaJobs', 'Bumeran', 'Computrabajo', 'Workana', 'Greenhouse', 'Teamtailor', 'Workable', 'Telegram'].map(c => [c.toLowerCase(), c]))
export function canalDe(fuente) {
  const t = String(fuente || '').trim()
  if (!t) return 'Sin fuente'
  const primera = normal(t.split(/[\s(/]/)[0])
  return CANALES[primera] || t
}

export const nombreCvONada = cv => nombreCv(cv) || 'Sin CV indicado'

// Cada fila con lo que hace falta para contar y filtrar.
export function prepararFilas(filas) {
  return filas.map(p => {
    const fecha = leerFechaFila(p.fecha)
    return { ...p, categoria: clasificarEstado(p.estado), fechaLeida: fecha, mes: claveMes(fecha), canal: canalDe(p.fuente), color: semaforoDe(p.semaforo) }
  })
}

const contar = (items, clave) => {
  const m = new Map()
  for (const it of items) { const k = clave(it); m.set(k, (m.get(k) || 0) + 1) }
  return m
}

export function estadisticas(filasPreparadas) {
  const f = filasPreparadas
  const enviadas = f.filter(p => esEnviada(p.categoria))
  const rechazos = f.filter(p => p.categoria === 'rechazada')
  const sinDecision = f.filter(p => p.categoria === 'postulada')

  const cifras = {
    total: f.length,
    enviadas: enviadas.length,
    rechazos: rechazos.length,
    sinDecision: sinDecision.length,
    tasaRechazo: enviadas.length ? rechazos.length / enviadas.length : null,
  }

  // 1. Enviadas por mes (según la columna Fecha). "Sin fecha" va aparte, al final.
  const meses = new Map()
  for (const p of enviadas) {
    const m = meses.get(p.mes) || { mes: p.mes, rechazadas: 0, sinDecision: 0 }
    if (p.categoria === 'rechazada') m.rechazadas++; else m.sinDecision++
    meses.set(p.mes, m)
  }
  const porMes = [...meses.values()].filter(m => m.mes !== SIN_FECHA).sort((a, b) => a.mes.localeCompare(b.mes))
  const enviadasSinFecha = meses.get(SIN_FECHA) || null

  // 2. Rechazos por fuente, con cuántas se enviaron por esa fuente.
  const enviadasPorCanal = contar(enviadas, p => p.canal)
  const porFuente = [...contar(rechazos, p => p.canal)].map(([canal, n]) => ({ canal, rechazos: n, enviadas: enviadasPorCanal.get(canal) || 0 }))
    .sort((a, b) => b.rechazos - a.rechazos || a.canal.localeCompare(b.canal))

  // 3. Embudo. Evaluadas: todas menos las que dicen "Sin evaluar" o no tienen estado.
  const evaluadas = f.filter(p => { const e = normal(p.estado); return e && !e.startsWith('sin evaluar') }).length
  const conRespuesta = rechazos.length + sinDecision.filter(p => esRespondida(p.estado)).length
  const embudo = [
    { etapa: 'Ofertas', n: f.length },
    { etapa: 'Evaluadas', n: evaluadas },
    { etapa: 'Enviadas', n: enviadas.length },
    { etapa: 'Con respuesta', n: conRespuesta },
    { etapa: 'Rechazadas', n: rechazos.length },
  ]

  // 4. Semáforo (todas las ofertas).
  const colores = contar(f, p => p.color)
  const porSemaforo = ['verde', 'amarillo', 'rojo', 'negro', ''].map(c => ({ color: c, n: colores.get(c) || 0 }))

  // 5. Por CV (solo las enviadas).
  const cvs = new Map()
  for (const p of enviadas) {
    const k = nombreCvONada(p.cv)
    const c = cvs.get(k) || { cv: k, enviadas: 0, rechazadas: 0 }
    c.enviadas++
    if (p.categoria === 'rechazada') c.rechazadas++
    cvs.set(k, c)
  }
  const porCv = [...cvs.values()].sort((a, b) => b.enviadas - a.enviadas || a.cv.localeCompare(b.cv))

  return {
    cifras, porMes, enviadasSinFecha, porFuente, embudo, porSemaforo, porCv,
    sinFecha: f.filter(p => p.mes === SIN_FECHA),
    otros: f.filter(p => p.categoria === 'otro'),
  }
}

// Link a la fila en Google Sheets. Sin gid abre la primera pestaña, que es la que lee la función postulaciones.
export function linkFila(urlPlanilla, fila) {
  if (!urlPlanilla) return null
  return `${urlPlanilla.split('#')[0]}#range=A${fila}`
}
