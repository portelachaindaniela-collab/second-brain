// Agente de Postulaciones: todo lo que no llama a Claude, a Google ni a la base vive acá para probarlo con node --test.
// La función (index.ts) evalúa avisos con la API de Claude, carga la planilla, arma borradores en Gmail y lee los CVs.

// El modelo sale de la variable POSTULACIONES_MODELO (secret de la función): para cambiarlo no hay que tocar código.
export const MODELO_POR_DEFECTO = 'claude-sonnet-5-5'
export const modeloDe = env => String(env?.POSTULACIONES_MODELO || '').trim() || MODELO_POR_DEFECTO
export const hayClave = env => !!String(env?.ANTHROPIC_API_KEY || '').trim()

// Si el modelo se niega a una respuesta por un falso positivo de seguridad, la API la rehace con otro modelo en la misma
// llamada. Solo algunos modelos lo aceptan: con otro modelo se pide sin respaldo.
const CON_RESPALDO = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1'])
export const respaldoDe = modelo => (CON_RESPALDO.has(modelo) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {})

export const MAX_VUELTAS = 12
export const MAX_IMAGENES = 10
export const MAX_BYTES_IMAGEN = 4_000_000

export const HOJA_ID = '1_GpaluK1qMigrPHoV2IGnuvIzveCpZyAMHpacy-wi6I'
export const PESTANA = 'Postulaciones'

export const SCOPE_PLANILLAS = 'https://www.googleapis.com/auth/spreadsheets'
export const SCOPE_LEER_MAIL = 'https://www.googleapis.com/auth/gmail.readonly'
export const SCOPE_BORRADORES = 'https://www.googleapis.com/auth/gmail.compose'

// Qué permisos de Google tiene la conexión y cuáles faltan para el agente.
export function permisos(scopes) {
  const s = Array.isArray(scopes) ? scopes : []
  const r = { planilla: s.includes(SCOPE_PLANILLAS), leer_mail: s.includes(SCOPE_LEER_MAIL), borradores: s.includes(SCOPE_BORRADORES) }
  // gmail.compose se pide con el botón de la app (PERMISOS_EXTRA); gmail.readonly viene con Conectar Google.
  return { ...r, falta_extra: !r.planilla || !r.borradores, faltan_todos: !r.leer_mail }
}

export const TIPOS_CV = ['Marketing', 'Operativo', 'Datos', 'Medios', 'IA', 'EN']
export const TIPOS_DOC = [...TIPOS_CV, 'Otros']
export const SEMAFOROS = ['VERDE', 'AMARILLO', 'NEGRO']
export const ESTADO_VALIDO = /^(Borrador listo - sin enviar|Formulario - sin enviar|Postulada \d{2}\/\d{2}|RECHAZADA \d{2}\/\d{2}|Descartado|Sin evaluar)$/

// Tipos de archivo que se aceptan como documento.
export const MIME_PDF = 'application/pdf'
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export function formatoDoc(nombre, mime) {
  if (mime === MIME_PDF || /\.pdf$/i.test(nombre || '')) return 'pdf'
  if (mime === MIME_DOCX || /\.docx$/i.test(nombre || '')) return 'docx'
  return null
}

export const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const texto = (v, max = 2000) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
export const esMail = s => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(String(s || '').trim())
const esFechaISO = f => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f))

// Las herramientas que ve el modelo. Ninguna manda mails ni borra o reordena filas.
export const HERRAMIENTAS = [
  {
    name: 'leer_planilla',
    description: 'Lee filas de la planilla de postulaciones (pestaña Postulaciones, columnas A a J). Sirve para evitar duplicados y para encontrar un aviso. Sin "buscar" devuelve las últimas 40 filas.',
    input_schema: {
      type: 'object',
      properties: { buscar: { type: 'string', description: 'Texto a buscar en puesto, empresa, link, zona o estado (sin distinguir mayúsculas ni acentos).' } },
      additionalProperties: false,
    },
  },
  {
    name: 'agregar_fila',
    description: 'Agrega una fila al final de la planilla, en las columnas A a J. Si ya hay una fila con la misma empresa y el mismo puesto, no carga nada y devuelve esa fila (salvo forzar: true, solo si Daniela confirmó que es otro aviso).',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'A. dd/mm/aaaa, el día que Daniela pasa el aviso.' },
        puesto: { type: 'string', description: 'B.' },
        empresa: { type: 'string', description: 'C. Si no figura: "Sin nombre (vía <cuenta o consultora>)".' },
        zona: { type: 'string', description: 'D. Ciudad, modalidad y jornada si figuran; si no, "Sin dato".' },
        fuente: { type: 'string', description: 'E. Ej.: "Instagram @cuenta", "LinkedIn", "Bumeran".' },
        link: { type: 'string', description: 'F. Dónde se postula (link o mail); si el aviso pide asunto, va acá.' },
        semaforo: { type: 'string', enum: SEMAFOROS, description: 'G.' },
        porque: { type: 'string', description: 'H. Una línea.' },
        estado: { type: 'string', description: 'I. "Borrador listo - sin enviar" | "Formulario - sin enviar" | "Postulada dd/mm" | "RECHAZADA dd/mm" | "Descartado" | "Sin evaluar".' },
        cv: { type: 'string', enum: [...TIPOS_CV, ''], description: 'J. Vacío si no va.' },
        forzar: { type: 'boolean', description: 'Cargar aunque ya exista la misma empresa y puesto. Solo si Daniela lo confirmó.' },
      },
      required: ['fecha', 'puesto', 'empresa', 'zona', 'fuente', 'link', 'semaforo', 'porque', 'estado', 'cv'],
      additionalProperties: false,
    },
  },
  {
    name: 'actualizar_estado',
    description: 'Cambia solo la columna I (Estado) de una fila. Hay que pasar el puesto y la empresa de esa fila tal como figuran (los da leer_planilla): si no coinciden, no escribe.',
    input_schema: {
      type: 'object',
      properties: {
        fila: { type: 'integer', description: 'Número de fila en la hoja (la 1 es el encabezado).' },
        puesto: { type: 'string' },
        empresa: { type: 'string' },
        estado: { type: 'string', description: '"Borrador listo - sin enviar" | "Formulario - sin enviar" | "Postulada dd/mm" | "RECHAZADA dd/mm" | "Descartado" | "Sin evaluar".' },
      },
      required: ['fila', 'puesto', 'empresa', 'estado'],
      additionalProperties: false,
    },
  },
  {
    name: 'crear_borrador',
    description: 'Crea un BORRADOR en el Gmail de Daniela (nunca lo manda). Si se pasa cv, adjunta el archivo vigente de ese tipo de CV si está subido. Los documentos "Otros" solo se adjuntan si Daniela lo pidió.',
    input_schema: {
      type: 'object',
      properties: {
        para: { type: 'string', description: 'El mail del aviso.' },
        asunto: { type: 'string' },
        htmlBody: { type: 'string', description: 'Cuerpo en HTML (<p>, <ul>/<li>, <a href>). Sin Markdown.' },
        body: { type: 'string', description: 'El mismo mail en texto plano (alternativa al HTML).' },
        cv: { type: 'string', enum: TIPOS_CV, description: 'Tipo de CV a adjuntar.' },
        adjuntar_otros: { type: 'array', items: { type: 'string' }, description: 'Ids de documentos "Otros" a adjuntar. Solo si Daniela lo pidió.' },
      },
      required: ['para', 'asunto', 'htmlBody', 'body'],
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_enviados',
    description: 'Busca en Enviados de Gmail los mails mandados a un destinatario (mail o dominio) desde una fecha, para confirmar un envío.',
    input_schema: {
      type: 'object',
      properties: {
        para: { type: 'string', description: 'Mail o dominio del destinatario.' },
        desde: { type: 'string', description: 'aaaa-mm-dd. Si no se pasa, los últimos 30 días.' },
      },
      required: ['para'],
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_rechazos',
    description: 'Busca en Recibidos de Gmail posibles mails de rechazo y devuelve también los procesos de la planilla que siguen abiertos, para cruzarlos. No cambia nada: para marcar, usá actualizar_estado con la fecha del mail de rechazo.',
    input_schema: {
      type: 'object',
      properties: { desde: { type: 'string', description: 'aaaa-mm-dd. Si no se pasa, los últimos 60 días.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'abrir_link',
    description: 'Trae el texto completo de un aviso desde una URL pública. Algunas páginas (por ejemplo Instagram o LinkedIn sin sesión) no dejan leerse: en ese caso pedile a Daniela el texto o capturas.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'leer_cv',
    description: 'Con tipo: el texto del CV vigente de ese tipo (o, con "Otros", el de los documentos de referencia). Sin tipo: la lista de documentos subidos con su fecha.',
    input_schema: {
      type: 'object',
      properties: { tipo: { type: 'string', enum: TIPOS_DOC } },
      additionalProperties: false,
    },
  },
]

export const NOMBRES_HERRAMIENTAS = new Set(HERRAMIENTAS.map(h => h.name))

// Valida lo que pide el modelo antes de tocar algo. Devuelve { ok, args } o { ok: false, error } (el error vuelve al
// modelo como resultado de la herramienta, para que corrija).
export function validar(nombre, a = {}) {
  a = a && typeof a === 'object' ? a : {}
  switch (nombre) {
    case 'leer_planilla': return { ok: true, args: { buscar: texto(a.buscar, 200) } }
    case 'agregar_fila': {
      const f = {
        fecha: texto(a.fecha, 20), puesto: texto(a.puesto, 300), empresa: texto(a.empresa, 300), zona: texto(a.zona, 300),
        fuente: texto(a.fuente, 200), link: texto(a.link, 1000), semaforo: texto(a.semaforo, 20).toUpperCase(), porque: texto(a.porque, 1000),
        estado: texto(a.estado, 100), cv: texto(a.cv, 20), forzar: a.forzar === true,
      }
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(f.fecha)) return { ok: false, error: 'La fecha (A) va como dd/mm/aaaa.' }
      if (!f.puesto || !f.empresa) return { ok: false, error: 'Faltan el puesto (B) o la empresa (C).' }
      if (!SEMAFOROS.includes(f.semaforo)) return { ok: false, error: 'El semáforo (G) es VERDE, AMARILLO o NEGRO.' }
      if (!ESTADO_VALIDO.test(f.estado)) return { ok: false, error: 'El estado (I) no es uno de los permitidos.' }
      if (f.cv && !TIPOS_CV.includes(f.cv)) return { ok: false, error: `El CV (J) es uno de: ${TIPOS_CV.join(', ')}; o vacío.` }
      if (f.semaforo === 'NEGRO' && f.cv) return { ok: false, error: 'Si no va (NEGRO), la columna J (CV) queda vacía.' }
      for (const k of ['zona', 'fuente', 'link', 'porque']) if (!f[k]) f[k] = k === 'zona' ? 'Sin dato' : ''
      return { ok: true, args: f }
    }
    case 'actualizar_estado': {
      const fila = Number(a.fila)
      const estado = texto(a.estado, 100)
      if (!Number.isInteger(fila) || fila < 2) return { ok: false, error: 'La fila tiene que ser un número de 2 en adelante.' }
      if (!ESTADO_VALIDO.test(estado)) return { ok: false, error: 'El estado no es uno de los permitidos.' }
      return { ok: true, args: { fila, puesto: texto(a.puesto, 300), empresa: texto(a.empresa, 300), estado } }
    }
    case 'crear_borrador': {
      const para = texto(a.para, 300)
      if (!esMail(para)) return { ok: false, error: 'El destinatario tiene que ser un mail. Si se postula por formulario, no hay borrador.' }
      const asunto = texto(a.asunto, 300)
      const html = String(a.htmlBody ?? '').trim().slice(0, 50000)
      const plano = String(a.body ?? '').trim().slice(0, 50000)
      if (!asunto || !html || !plano) return { ok: false, error: 'Faltan el asunto, el htmlBody o el body.' }
      if (a.cv && !TIPOS_CV.includes(a.cv)) return { ok: false, error: `El CV es uno de: ${TIPOS_CV.join(', ')}.` }
      const otros = Array.isArray(a.adjuntar_otros) ? a.adjuntar_otros.map(String).filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 5) : []
      return { ok: true, args: { para, asunto, html, plano, cv: a.cv || null, otros } }
    }
    case 'buscar_enviados': {
      const para = texto(a.para, 300).replace(/^@/, '')
      if (!para || /\s/.test(para) || !/\./.test(para)) return { ok: false, error: 'Pasame un mail o un dominio.' }
      if (a.desde && !esFechaISO(a.desde)) return { ok: false, error: 'La fecha "desde" va como aaaa-mm-dd.' }
      return { ok: true, args: { para, desde: a.desde || null } }
    }
    case 'buscar_rechazos': {
      if (a.desde && !esFechaISO(a.desde)) return { ok: false, error: 'La fecha "desde" va como aaaa-mm-dd.' }
      return { ok: true, args: { desde: a.desde || null } }
    }
    case 'abrir_link': {
      const url = texto(a.url, 2000)
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Pasame un link que empiece con http o https.' }
      return { ok: true, args: { url } }
    }
    case 'leer_cv': {
      if (a.tipo && !TIPOS_DOC.includes(a.tipo)) return { ok: false, error: `El tipo es uno de: ${TIPOS_DOC.join(', ')}.` }
      return { ok: true, args: { tipo: a.tipo || null } }
    }
  }
  return { ok: false, error: 'Herramienta desconocida.' }
}

// ---------- Planilla ----------

const CAMPOS = ['fecha', 'puesto', 'empresa', 'zona', 'fuente', 'link', 'semaforo', 'porque', 'estado', 'cv']

// Valores de A1:J → filas como objetos (columnas fijas A a J). `fila` es el número en la hoja; la 1 es el encabezado.
export function filasDeValores(valores = []) {
  return valores.slice(1).map((celdas, i) => {
    const p = { fila: i + 2 }
    CAMPOS.forEach((c, j) => { p[c] = String(celdas?.[j] ?? '').trim() })
    return p
  }).filter(p => p.puesto || p.empresa || p.link)
}

export const filaNueva = f => CAMPOS.map(c => f[c] ?? '')

// La fila donde se escribe lo nuevo: la siguiente a la última con algo (nunca se inserta en el medio).
export const proximaFila = (valores = []) => Math.max(2, valores.length + 1)

export function duplicado(filas, puesto, empresa) {
  return filas.find(p => normal(p.puesto) === normal(puesto) && normal(p.empresa) === normal(empresa)) || null
}

export function buscarFilas(filas, buscar) {
  const q = normal(buscar)
  if (!q) return filas.slice(-40)
  return filas.filter(p => [p.puesto, p.empresa, p.link, p.zona, p.estado, p.fuente].some(c => normal(c).includes(q))).slice(-60)
}

// Procesos que siguen abiertos (postulada, sin rechazo ni descarte): los que pueden tener un rechazo en el mail.
export function procesosAbiertos(filas) {
  return filas.filter(p => /postulad|enviad/i.test(p.estado) && !/rechazad|descartad|cerrad/i.test(p.estado))
}

const DOMINIOS_COMUNES = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.ar', 'live.com', 'icloud.com', 'hotmail.com.ar'])

export function dominiosDe(procesos) {
  const d = new Set()
  for (const p of procesos) {
    for (const m of String(p.link || '').match(/[^\s@<>()",;:]+@([a-z0-9.-]+\.[a-z]{2,})/gi) || []) {
      const dom = m.split('@')[1].toLowerCase()
      if (!DOMINIOS_COMUNES.has(dom)) d.add(dom)
    }
  }
  return [...d]
}

// ---------- Gmail ----------

const fechaGmail = iso => iso.replace(/-/g, '/')
const haceDias = (n, hoy = new Date()) => new Date(hoy.getTime() - n * 86400000).toISOString().slice(0, 10)

export function consultaEnviados({ para, desde }, hoy = new Date()) {
  return `in:sent to:${para} after:${fechaGmail(desde || haceDias(30, hoy))}`
}

export const PALABRAS_RECHAZO = [
  'lamentablemente', '"no ha sido seleccionada"', '"no fue seleccionada"', '"no continuar"', '"otros candidatos"', '"otro candidato"',
  '"otras candidaturas"', '"no avanzaremos"', '"no vamos a avanzar"', '"no seguir avanzando"', '"perfil no se ajusta"', '"vacante cubierta"',
  '"búsqueda cerrada"', 'unfortunately', '"not be moving forward"', '"other candidates"', '"not selected"', 'regret',
]

// Una consulta por palabras de rechazo y, si hay procesos con mail propio, otra por los dominios de esas empresas.
export function consultasRechazos(procesos, desde, hoy = new Date()) {
  const despues = `after:${fechaGmail(desde || haceDias(60, hoy))}`
  const q = [`in:inbox ${despues} (${PALABRAS_RECHAZO.join(' OR ')})`]
  const doms = dominiosDe(procesos).slice(0, 30)
  if (doms.length) q.push(`in:inbox ${despues} from:(${doms.join(' OR ')})`)
  return q
}

const ZONA = 'America/Argentina/Buenos_Aires'
export function ddmm(ms) {
  const p = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(Number(ms)))
  const v = t => p.find(x => x.type === t)?.value
  return `${v('day')}/${v('month')}/${v('year')}`
}

export function resumenMensaje(m) {
  const h = Object.fromEntries((m?.payload?.headers || []).map(x => [String(x.name).toLowerCase(), x.value]))
  return { id: m.id, de: h.from || '', para: h.to || '', asunto: h.subject || '', fecha: m.internalDate ? ddmm(m.internalDate) : '', extracto: String(m.snippet || '').slice(0, 300) }
}

// ---------- Mail en borrador (MIME) ----------

const utf8 = s => new TextEncoder().encode(String(s))
export function base64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const enLineas = b64 => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd()
const encabezado = s => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(utf8(s))}?=`)
const sinSaltos = s => String(s).replace(/[\r\n]+/g, ' ')

// adjuntos: [{ nombre, mime, bytes: Uint8Array }]. Devuelve el mail en base64url, como lo pide Gmail (drafts.create).
export function mimeBorrador({ para, asunto, html, plano, adjuntos = [] }, frontera = 'sb') {
  const alt = `${frontera}-alt`
  const mixto = `${frontera}-mix`
  const parteAlt = [
    `Content-Type: multipart/alternative; boundary="${alt}"`, '',
    `--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', enLineas(base64(utf8(plano))),
    `--${alt}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', enLineas(base64(utf8(html))),
    `--${alt}--`,
  ]
  const cabeza = [`To: ${sinSaltos(para)}`, `Subject: ${encabezado(sinSaltos(asunto))}`, 'MIME-Version: 1.0']
  let lineas
  if (!adjuntos.length) lineas = [...cabeza, ...parteAlt]
  else {
    lineas = [...cabeza, `Content-Type: multipart/mixed; boundary="${mixto}"`, '', `--${mixto}`, ...parteAlt]
    for (const a of adjuntos) {
      const ascii = sinSaltos(a.nombre).replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
      const utf = encodeURIComponent(sinSaltos(a.nombre))
      lineas.push(`--${mixto}`, `Content-Type: ${a.mime}; name="${ascii}"`, `Content-Disposition: attachment; filename="${ascii}"; filename*=UTF-8''${utf}`,
        'Content-Transfer-Encoding: base64', '', enLineas(base64(a.bytes)))
    }
    lineas.push(`--${mixto}--`)
  }
  return base64(utf8(lineas.join('\r\n'))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---------- Documentos (CVs) ----------

// El archivo de un .docx que tiene el texto, sacado del zip sin librerías (DecompressionStream existe en Deno y Node).
async function archivoDelZip(bytes, buscado) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fin = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break }
  if (fin < 0) throw new Error('El archivo .docx está dañado.')
  const total = dv.getUint16(fin + 10, true)
  let p = dv.getUint32(fin + 16, true)
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const metodo = dv.getUint16(p + 10, true)
    const largo = dv.getUint32(p + 20, true)
    const lNombre = dv.getUint16(p + 28, true)
    const lExtra = dv.getUint16(p + 30, true)
    const lComent = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const nombre = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + lNombre))
    p += 46 + lNombre + lExtra + lComent
    if (nombre !== buscado) continue
    const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    const datos = bytes.subarray(ini, ini + largo)
    if (metodo === 0) return datos
    if (metodo !== 8) throw new Error('El .docx usa una compresión que no sé leer.')
    const salida = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(salida).arrayBuffer())
  }
  throw new Error('El .docx no tiene texto (falta word/document.xml).')
}

const entidades = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&')

export function textoDeXmlWord(xml) {
  return entidades(String(xml)
    .replace(/<w:tab\/>/g, '\t').replace(/<w:(br|cr)\/>/g, '\n').replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function textoDocx(bytes) {
  return textoDeXmlWord(new TextDecoder().decode(await archivoDelZip(bytes, 'word/document.xml')))
}

export const limpiarTexto = t => String(t ?? '').split('\0').join('').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 60000)

// Carpeta de la dueña + nombre sin caracteres raros (lo arma la app al subir; la función lo vuelve a controlar).
export const rutaValida = (ruta, ownerId) => typeof ruta === 'string' && ruta.startsWith(`${ownerId}/`) && !ruta.includes('..') && ruta.length < 400

// ---------- Lo que se le manda al modelo ----------

const ORDEN_TIPO = Object.fromEntries(TIPOS_DOC.map((t, i) => [t, i]))
export const ordenarDocs = docs => [...docs].sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || String(a.subido_at).localeCompare(String(b.subido_at)))

// El texto de los CVs para el bloque cacheado del sistema. Siempre en el mismo orden para que el caché sirva.
export function bloqueCvs(docs) {
  const cvs = ordenarDocs(docs).filter(d => d.tipo !== 'Otros')
  const otros = ordenarDocs(docs).filter(d => d.tipo === 'Otros')
  const faltan = TIPOS_CV.filter(t => !cvs.some(d => d.tipo === t))
  const partes = ['# TEXTO DE LOS CVs SUBIDOS POR DANIELA (fuente principal)']
  if (!cvs.length) partes.push('Todavía no subió ningún CV: usá los DATOS DE DANIELA del prompt y avisale que falta subirlo.')
  for (const d of cvs) {
    partes.push(`## CV ${d.tipo} — archivo «${d.archivo}», subido el ${ddmm(Date.parse(d.subido_at))}`)
    partes.push(d.texto?.trim() ? d.texto.trim() : '(No se pudo leer el texto de este archivo. Pedile a Daniela que lo suba de nuevo, en otro formato.)')
  }
  if (faltan.length && cvs.length) partes.push(`Sin CV subido: ${faltan.join(', ')}.`)
  if (otros.length) partes.push(`Documentos de referencia "Otros" (no se adjuntan salvo que Daniela lo pida; leelos con leer_cv tipo "Otros"): ${otros.map(d => `«${d.archivo}» (id ${d.id})`).join(', ')}.`)
  return partes.join('\n\n')
}

// El sistema en tres bloques: el prompt fijo y los CVs (los dos cacheados), y la fecha de hoy aparte (cambia todos los días).
export function armarSistema(prompt, docs, hoy) {
  return [
    { type: 'text', text: prompt, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: bloqueCvs(docs), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `Hoy es ${hoy}. La planilla es la pestaña "${PESTANA}" de la planilla de postulaciones de Daniela.` },
  ]
}

// Historial que manda la app ({ rol: 'user' | 'bot', texto }) + el mensaje nuevo con sus capturas.
export function armarMensajes(historial, mensaje, imagenes = []) {
  const previos = (Array.isArray(historial) ? historial : [])
    .filter(m => (m?.rol === 'user' || m?.rol === 'bot') && typeof m.texto === 'string' && m.texto.trim())
    .slice(-30)
    .map(m => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.texto.slice(0, 8000) }))
  // La API pide que empiece la usuaria y que no haya dos turnos seguidos del asistente al principio.
  while (previos.length && previos[0].role !== 'user') previos.shift()
  const contenido = [
    ...imagenes.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } })),
    { type: 'text', text: mensaje || (imagenes.length ? 'Te paso estas capturas.' : '') },
  ]
  return [...previos, { role: 'user', content: contenido }]
}

export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export function validarImagenes(imagenes) {
  if (imagenes == null) return { ok: true, imagenes: [] }
  if (!Array.isArray(imagenes)) return { ok: false, error: 'Las capturas llegaron mal.' }
  if (imagenes.length > MAX_IMAGENES) return { ok: false, error: `Pasame hasta ${MAX_IMAGENES} capturas por mensaje.` }
  for (const i of imagenes) {
    if (!TIPOS_IMAGEN.includes(i?.media_type) || typeof i?.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(i.data)) return { ok: false, error: 'Una de las capturas no es una imagen que pueda leer.' }
    if (i.data.length * 0.75 > MAX_BYTES_IMAGEN) return { ok: false, error: 'Una de las capturas es muy pesada.' }
  }
  return { ok: true, imagenes: imagenes.map(i => ({ media_type: i.media_type, data: i.data })) }
}

export const textoFinal = contenido => (contenido || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()

// Una línea para la app de lo que hizo cada herramienta que cambia algo.
export function resumenAccion(nombre, args, resultado) {
  if (resultado?.error || resultado?.duplicado) return null
  if (nombre === 'agregar_fila') return `Cargado en la planilla (fila ${resultado.fila}): ${args.puesto} · ${args.empresa} · ${args.semaforo}`
  if (nombre === 'actualizar_estado') return `Fila ${args.fila}: ${args.estado}`
  if (nombre === 'crear_borrador') return `Borrador en Gmail para ${args.para}${resultado.adjuntos?.length ? ` con ${resultado.adjuntos.join(', ')}` : ''}`
  return null
}
