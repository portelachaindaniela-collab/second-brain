import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import {
  modeloDe, hayClave, respaldoDe, MODELO_POR_DEFECTO, permisos, validar, HERRAMIENTAS, filasDeValores, filaNueva, proximaFila, duplicado,
  buscarFilas, procesosAbiertos, dominiosDe, consultaEnviados, consultasRechazos, mimeBorrador, textoDeXmlWord, textoDocx, formatoDoc,
  rutaValida, bloqueCvs, armarSistema, armarMensajes, validarImagenes, textoFinal, resumenAccion, ESTADO_VALIDO, ddmm,
} from './logic.mjs'
import { PROMPT_SISTEMA } from './prompt.mjs'
import { PERMISOS_EXTRA } from '../postulaciones/logic.mjs'

test('el modelo sale de la variable y, si no está, es Sonnet 5.5', () => {
  assert.equal(modeloDe({}), 'claude-sonnet-5-5')
  assert.equal(MODELO_POR_DEFECTO, 'claude-sonnet-5-5')
  assert.equal(modeloDe({ POSTULACIONES_MODELO: ' claude-opus-5-5 ' }), 'claude-opus-5-5')
})

test('sin clave no hay modelo', () => {
  assert.equal(hayClave({}), false)
  assert.equal(hayClave({ ANTHROPIC_API_KEY: '  ' }), false)
  assert.equal(hayClave({ ANTHROPIC_API_KEY: 'x' }), true)
})

test('el respaldo ante negativas solo va con los modelos que lo aceptan', () => {
  assert.deepEqual(respaldoDe('claude-sonnet-5-5'), { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
  assert.deepEqual(respaldoDe('claude-haiku-4-5'), {})
})

test('los permisos extra de Google incluyen los borradores de Gmail', () => {
  assert.ok(PERMISOS_EXTRA.includes('https://www.googleapis.com/auth/gmail.compose'))
  assert.ok(PERMISOS_EXTRA.includes('https://www.googleapis.com/auth/spreadsheets'))
  const p = permisos(['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/gmail.readonly'])
  assert.equal(p.planilla, true)
  assert.equal(p.leer_mail, true)
  assert.equal(p.borradores, false)
  assert.equal(p.falta_extra, true)
})

test('el prompt de sistema está entero', () => {
  assert.ok(PROMPT_SISTEMA.startsWith('Sos el agente de Postulaciones de Daniela Portela Chain.'))
  assert.ok(PROMPT_SISTEMA.endsWith('Si una herramienta falla, decilo claro y seguí con lo que puedas.'))
})

test('ninguna herramienta manda mails ni borra filas', () => {
  const nombres = HERRAMIENTAS.map(h => h.name)
  assert.deepEqual(nombres, ['leer_planilla', 'agregar_fila', 'actualizar_estado', 'crear_borrador', 'buscar_enviados', 'buscar_rechazos', 'abrir_link', 'leer_cv'])
  assert.ok(!nombres.some(n => /enviar|mandar|borrar|eliminar|ordenar/.test(n)))
})

const filaOk = { fecha: '16/11/2026', puesto: 'Analista de Marketing Digital', empresa: 'Acme', zona: 'CABA · Híbrido', fuente: 'LinkedIn', link: 'rrhh@acme.com', semaforo: 'verde', porque: 'Pide contenidos y Meta Ads.', estado: 'Borrador listo - sin enviar', cv: 'Marketing' }

test('agregar_fila valida las columnas', () => {
  const v = validar('agregar_fila', filaOk)
  assert.equal(v.ok, true)
  assert.equal(v.args.semaforo, 'VERDE')
  assert.deepEqual(filaNueva(v.args), ['16/11/2026', 'Analista de Marketing Digital', 'Acme', 'CABA · Híbrido', 'LinkedIn', 'rrhh@acme.com', 'VERDE', 'Pide contenidos y Meta Ads.', 'Borrador listo - sin enviar', 'Marketing'])
  assert.equal(validar('agregar_fila', { ...filaOk, fecha: '16/11' }).ok, false)
  assert.equal(validar('agregar_fila', { ...filaOk, semaforo: 'ROJO' }).ok, false)
  assert.equal(validar('agregar_fila', { ...filaOk, estado: 'Enviada' }).ok, false)
  assert.equal(validar('agregar_fila', { ...filaOk, cv: 'Ventas' }).ok, false)
  assert.equal(validar('agregar_fila', { ...filaOk, semaforo: 'NEGRO', estado: 'Descartado' }).ok, false, 'si no va, sin CV')
  const negro = validar('agregar_fila', { ...filaOk, semaforo: 'NEGRO', estado: 'Descartado', cv: '', zona: '' })
  assert.equal(negro.ok, true)
  assert.equal(negro.args.zona, 'Sin dato')
})

test('los estados permitidos son los de la columna I', () => {
  for (const e of ['Borrador listo - sin enviar', 'Formulario - sin enviar', 'Postulada 16/11', 'RECHAZADA 03/12', 'Descartado', 'Sin evaluar']) assert.ok(ESTADO_VALIDO.test(e), e)
  for (const e of ['Postulada', 'postulada 16/11', 'RECHAZADA 3/12', 'Enviada']) assert.ok(!ESTADO_VALIDO.test(e), e)
  assert.equal(validar('actualizar_estado', { fila: 1, puesto: 'x', empresa: 'y', estado: 'Descartado' }).ok, false)
  assert.equal(validar('actualizar_estado', { fila: 40, puesto: 'x', empresa: 'y', estado: 'Postulada 16/11' }).ok, true)
})

test('crear_borrador pide un mail y los dos cuerpos', () => {
  const base = { para: 'rrhh@acme.com', asunto: 'Analista - Daniela Portela Chain', htmlBody: '<p>Hola</p>', body: 'Hola' }
  assert.equal(validar('crear_borrador', base).ok, true)
  assert.equal(validar('crear_borrador', { ...base, para: 'https://acme.com/form' }).ok, false)
  assert.equal(validar('crear_borrador', { ...base, body: '' }).ok, false)
  assert.equal(validar('crear_borrador', { ...base, cv: 'Ventas' }).ok, false)
  assert.deepEqual(validar('crear_borrador', { ...base, adjuntar_otros: ['no-es-id', '0b5f1c6e-2b0b-4c6e-9a3d-1f2e3d4c5b6a'] }).args.otros, ['0b5f1c6e-2b0b-4c6e-9a3d-1f2e3d4c5b6a'])
})

const valores = [
  ['Fecha', 'Puesto', 'Empresa', 'Zona / Modalidad', 'Fuente', 'Link o contacto', 'Semaforo', 'Por que', 'Estado', 'CV a usar'],
  ['12/05/2026', 'Especialista de Paid Media Sr', 'AdGrowers', '', 'LinkedIn', '', '', '', 'RECHAZADA 12/05'],
  ['01/11/2026', 'Analista de Contenidos', 'Medios SA', 'CABA', 'Bumeran', 'busquedas@medios.com.ar', 'VERDE', '', 'Postulada 02/11', 'Medios'],
  [],
  ['10/11/2026', 'Data Entry', 'Sin nombre (vía @empleos)', '', 'Instagram @empleos', 'cv@gmail.com', 'VERDE', '', 'POSTULADA - sin respuesta', 'Operativo'],
]

test('lee la planilla por columnas fijas A a J y sabe dónde agregar', () => {
  const filas = filasDeValores(valores)
  assert.deepEqual(filas.map(f => f.fila), [2, 3, 5])
  assert.equal(filas[1].cv, 'Medios')
  assert.equal(proximaFila(valores), 6)
  assert.equal(proximaFila([valores[0]]), 2)
})

test('detecta duplicados por empresa y puesto, sin acentos ni mayúsculas', () => {
  const filas = filasDeValores(valores)
  assert.equal(duplicado(filas, 'analista de contenídos', 'MEDIOS S.A.')?.fila, 3)
  assert.equal(duplicado(filas, 'Analista de Contenidos', 'Otra'), null)
  assert.deepEqual(buscarFilas(filas, 'medios').map(f => f.fila), [3])
  assert.equal(buscarFilas(filas, '').length, 3)
})

test('rechazos: procesos abiertos y dominios propios de las empresas', () => {
  const abiertos = procesosAbiertos(filasDeValores(valores))
  assert.deepEqual(abiertos.map(f => f.fila), [3, 5])
  assert.deepEqual(dominiosDe(abiertos), ['medios.com.ar'])
  const hoy = new Date('2026-11-16T12:00:00Z')
  const q = consultasRechazos(abiertos, null, hoy)
  assert.equal(q.length, 2)
  assert.match(q[0], /^in:inbox after:2026\/09\/17 \(lamentablemente OR /)
  assert.equal(q[1], 'in:inbox after:2026/09/17 from:(medios.com.ar)')
  assert.equal(consultaEnviados({ para: 'busquedas@medios.com.ar', desde: '2026-11-01' }), 'in:sent to:busquedas@medios.com.ar after:2026/11/01')
  assert.equal(consultaEnviados({ para: 'x@y.com' }, hoy), 'in:sent to:x@y.com after:2026/10/17')
})

test('fechas de los mails en hora de Argentina', () => {
  assert.equal(ddmm(Date.parse('2026-11-16T02:00:00Z')), '15/11/2026')
})

const desdeBase64url = raw => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

test('el borrador lleva texto, HTML y el CV adjunto', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x00])
  const raw = mimeBorrador({ para: 'rrhh@acme.com', asunto: 'Analista de Comunicación - Daniela Portela Chain', html: '<p>Hola, ¿cómo están?</p>', plano: 'Hola, ¿cómo están?', adjuntos: [{ nombre: 'CV Marketing ñ.pdf', mime: 'application/pdf', bytes: pdf }] }, 'X')
  assert.ok(!/[+/=]/.test(raw), 'base64url')
  const m = desdeBase64url(raw)
  assert.match(m, /^To: rrhh@acme.com\r\nSubject: =\?UTF-8\?B\?/)
  assert.match(m, /Content-Type: multipart\/mixed; boundary="X-mix"/)
  assert.match(m, /Content-Type: multipart\/alternative; boundary="X-alt"/)
  assert.match(m, /filename="CV Marketing _.pdf"; filename\*=UTF-8''CV%20Marketing%20%C3%B1.pdf/)
  const partes = m.split('\r\n\r\n')
  const html = partes.find(p => p.startsWith('PHA+'))
  assert.equal(Buffer.from(html.split('\r\n')[0], 'base64').toString('utf8'), '<p>Hola, ¿cómo están?</p>')
  assert.ok(m.includes(Buffer.from(pdf).toString('base64')))
  assert.ok(m.trimEnd().endsWith('--X-mix--'))
})

test('sin adjuntos, el borrador es solo texto y HTML', () => {
  const m = desdeBase64url(mimeBorrador({ para: 'a@b.com', asunto: 'Hola', html: '<p>x</p>', plano: 'x' }, 'Y'))
  assert.ok(!m.includes('multipart/mixed'))
  assert.match(m, /Subject: Hola\r\n/)
  assert.ok(m.endsWith('--Y-alt--'))
})

// Un zip mínimo (como un .docx) armado a mano.
function zip(archivos) {
  const locales = []
  const centrales = []
  let offset = 0
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const n = Buffer.from(nombre)
    const datos = deflateRawSync(Buffer.from(contenido))
    const l = Buffer.alloc(30)
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(datos.length, 18); l.writeUInt16LE(n.length, 26)
    locales.push(l, n, datos)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(datos.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42)
    centrales.push(c, n)
    offset += 30 + n.length + datos.length
  }
  const central = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(archivos).length, 10); fin.writeUInt32LE(central.length, 12); fin.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locales, central, fin]))
}

const XML = '<w:document><w:body><w:p><w:r><w:t>Daniela Portela Chain</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Marketing &amp; Contenidos</w:t><w:tab/><w:t>2023</w:t></w:r></w:p></w:body></w:document>'

test('saca el texto de un .docx', async () => {
  assert.equal(textoDeXmlWord(XML), 'Daniela Portela Chain\nMarketing & Contenidos\t2023')
  assert.equal(await textoDocx(zip({ '[Content_Types].xml': '<x/>', 'word/document.xml': XML })), 'Daniela Portela Chain\nMarketing & Contenidos\t2023')
  await assert.rejects(textoDocx(zip({ 'otra.xml': '<x/>' })), /no tiene texto/)
  await assert.rejects(textoDocx(new Uint8Array(40)), /dañado/)
})

test('solo PDF o .docx, y en la carpeta de la dueña', () => {
  assert.equal(formatoDoc('cv.PDF', ''), 'pdf')
  assert.equal(formatoDoc('cv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx')
  assert.equal(formatoDoc('cv.doc', 'application/msword'), null)
  assert.ok(rutaValida('u1/abc-cv.pdf', 'u1'))
  assert.ok(!rutaValida('u2/abc-cv.pdf', 'u1'))
  assert.ok(!rutaValida('u1/../u2/cv.pdf', 'u1'))
})

const docs = [
  { id: 'o1', tipo: 'Otros', archivo: 'Analítico.pdf', texto: 'Materias', subido_at: '2026-11-10T10:00:00Z' },
  { id: 'd1', tipo: 'Datos', archivo: 'CV Datos.pdf', texto: 'QA y reporting', subido_at: '2026-11-12T10:00:00Z' },
  { id: 'm1', tipo: 'Marketing', archivo: 'CV Marketing.pdf', texto: 'Meta Ads', subido_at: '2026-11-15T10:00:00Z' },
]

test('el bloque de CVs va en orden fijo, con fecha, y los Otros solo nombrados', () => {
  const b = bloqueCvs(docs)
  assert.ok(b.indexOf('CV Marketing') < b.indexOf('CV Datos'))
  assert.match(b, /## CV Marketing — archivo «CV Marketing.pdf», subido el 15\/11\/2026\n\nMeta Ads/)
  assert.match(b, /Sin CV subido: Operativo, Medios, IA, EN\./)
  assert.match(b, /«Analítico.pdf» \(id o1\)/)
  assert.ok(!b.includes('Materias'))
  assert.equal(bloqueCvs([...docs].reverse()), b, 'mismo texto en cualquier orden: el caché sirve')
  assert.match(bloqueCvs([]), /Todavía no subió ningún CV/)
})

test('el sistema: prompt y CVs cacheados, la fecha aparte', () => {
  const s = armarSistema(PROMPT_SISTEMA, docs, 'lunes 16 de noviembre de 2026')
  assert.equal(s.length, 3)
  assert.equal(s[0].text, PROMPT_SISTEMA)
  assert.deepEqual(s[0].cache_control, { type: 'ephemeral' })
  assert.deepEqual(s[1].cache_control, { type: 'ephemeral' })
  assert.equal(s[2].cache_control, undefined)
  assert.match(s[2].text, /lunes 16 de noviembre/)
})

test('los mensajes: historial de texto y las capturas en el mensaje nuevo', () => {
  const m = armarMensajes([{ rol: 'bot', texto: 'Hola' }, { rol: 'user', texto: 'Te paso uno' }, { rol: 'bot', texto: 'Dale' }, { rol: 'x', texto: 'no' }], 'Este', [{ media_type: 'image/jpeg', data: 'AAAA' }])
  assert.deepEqual(m.map(x => x.role), ['user', 'assistant', 'user'])
  assert.deepEqual(m[2].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
  assert.deepEqual(m[2].content[1], { type: 'text', text: 'Este' })
  assert.equal(armarMensajes([], '', [{ media_type: 'image/png', data: 'AA==' }])[0].content[1].text, 'Te paso estas capturas.')
})

test('valida las capturas', () => {
  assert.deepEqual(validarImagenes(undefined), { ok: true, imagenes: [] })
  assert.equal(validarImagenes([{ media_type: 'image/jpeg', data: 'AAAA' }]).ok, true)
  assert.equal(validarImagenes([{ media_type: 'application/pdf', data: 'AAAA' }]).ok, false)
  assert.equal(validarImagenes(Array(11).fill({ media_type: 'image/jpeg', data: 'AAAA' })).ok, false)
  assert.equal(validarImagenes([{ media_type: 'image/jpeg', data: 'A'.repeat(6_000_000) }]).ok, false)
})

test('texto final y resumen de lo que hizo', () => {
  assert.equal(textoFinal([{ type: 'thinking', thinking: '' }, { type: 'text', text: 'VA.' }, { type: 'tool_use' }]), 'VA.')
  assert.equal(resumenAccion('agregar_fila', { puesto: 'P', empresa: 'E', semaforo: 'VERDE' }, { ok: true, fila: 40 }), 'Cargado en la planilla (fila 40): P · E · VERDE')
  assert.equal(resumenAccion('agregar_fila', {}, { duplicado: true }), null)
  assert.equal(resumenAccion('crear_borrador', { para: 'a@b.com' }, { ok: true, adjuntos: ['CV.pdf'] }), 'Borrador en Gmail para a@b.com con CV.pdf')
  assert.equal(resumenAccion('leer_planilla', {}, { filas: [] }), null)
})
