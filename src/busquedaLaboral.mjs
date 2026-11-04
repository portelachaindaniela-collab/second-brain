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
    cifras, porFuente, embudo, porSemaforo, porCv,
    sinFecha: f.filter(p => p.mes === SIN_FECHA),
    otros: f.filter(p => p.categoria === 'otro'),
  }
}

// Grupos de puesto por palabra clave (la columna Puesto es texto libre). Gana el primero que coincide, en este orden.
// Para mover un puesto de grupo o sumar uno nuevo, se cambia solo esta lista.
export const GRUPOS_PUESTO = [
  ['Community Manager / Redes', /community|\bcm\b|social media|redes sociales/],
  ['Contenidos y redacción', /contenid|content|copywrit|redact|creador|periodist|editor|columnist/],
  ['Comunicación', /comunicac|communication|prensa/],
  ['Marketing y medios', /marketing|paid media|media|performance|seo|growth|campan|planning|trafficker|go to market/],
  ['Datos y calidad', /dato|data|calidad|documental|referencias comerciales/],
  ['RRHH', /rrhh|recursos humanos|recruiter|relaciones laborales|desarrollo rh/],
  ['Eventos y producción', /evento|productor|produccion|producer/],
  ['Administración y atención', /administra|recepcion|asistente|secretari|atencion|customer|office|auxiliar/],
]
export const OTROS_PUESTOS = 'Otros puestos'

export function grupoPuesto(puesto) {
  const t = normal(puesto)
  return GRUPOS_PUESTO.find(([, re]) => re.test(t))?.[0] ?? OTROS_PUESTOS
}

// Enviadas por grupo de puesto, partidas en rechazadas y sin decisión. Lo que más se mandó, arriba.
export function porGrupoPuesto(filasPreparadas) {
  const m = new Map()
  for (const p of filasPreparadas) {
    if (!esEnviada(p.categoria)) continue
    const g = grupoPuesto(p.puesto)
    const x = m.get(g) || { grupo: g, enviadas: 0, rechazadas: 0, sinDecision: 0 }
    x.enviadas++
    if (p.categoria === 'rechazada') x.rechazadas++; else x.sinDecision++
    m.set(g, x)
  }
  return [...m.values()].sort((a, b) => (a.grupo === OTROS_PUESTOS) - (b.grupo === OTROS_PUESTOS) || b.enviadas - a.enviadas || a.grupo.localeCompare(b.grupo))
}

// Enviadas por día (últimos 30), semana (últimas 16, de lunes a domingo) o mes (todos, sin saltear meses vacíos).
// Día y semana necesitan el día exacto: "marzo 2026" entra en el mes pero cuenta como sin fecha en las otras dos.
export const PERIODOS = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']]
const dos = n => String(n).padStart(2, '0')
const aDate = f => new Date(f.anio, f.mes - 1, f.dia)
const lunes = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const claveDia = d => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`

export function enviadasPorPeriodo(filasPreparadas, periodo, hoy = new Date()) {
  const enviadas = filasPreparadas.filter(p => esEnviada(p.categoria))
  const columnas = []
  if (periodo === 'mes') {
    const meses = enviadas.map(p => p.mes).filter(m => m !== SIN_FECHA).sort()
    if (meses.length) {
      let [a, m] = meses[0].split('-').map(Number)
      const ultimo = meses[meses.length - 1]
      const actual = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}`
      const fin = ultimo > actual ? ultimo : actual
      for (let k = `${a}-${dos(m)}`; k <= fin; m === 12 ? (a++, m = 1) : m++, k = `${a}-${dos(m)}`) {
        columnas.push({ clave: k, etiqueta: [MESES_CORTOS[m - 1], String(a)] })
      }
    }
  } else {
    const paso = periodo === 'semana' ? 7 : 1
    const cuantas = periodo === 'semana' ? 16 : 30
    const ultimo = periodo === 'semana' ? lunes(hoy) : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    for (let i = cuantas - 1; i >= 0; i--) {
      const d = new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() - i * paso)
      columnas.push({ clave: claveDia(d), etiqueta: [dos(d.getDate()), MESES_CORTOS[d.getMonth()]] })
    }
  }
  const porClave = new Map(columnas.map(c => [c.clave, Object.assign(c, { rechazadas: 0, sinDecision: 0 })]))
  let sinFecha = 0, fueraDeRango = 0
  for (const p of enviadas) {
    const f = p.fechaLeida
    let clave = null
    if (periodo === 'mes') clave = f ? p.mes : null
    else if (f?.dia) clave = claveDia(periodo === 'semana' ? lunes(aDate(f)) : aDate(f))
    if (!clave) { sinFecha++; continue }
    const c = porClave.get(clave)
    if (!c) { fueraDeRango++; continue }
    if (p.categoria === 'rechazada') c.rechazadas++; else c.sinDecision++
  }
  return { columnas, sinFecha, fueraDeRango }
}

// Link a la fila en Google Sheets. Sin gid abre la primera pestaña, que es la que lee la función postulaciones.
export function linkFila(urlPlanilla, fila) {
  if (!urlPlanilla) return null
  return `${urlPlanilla.split('#')[0]}#range=A${fila}`
}
