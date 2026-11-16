import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoPanel, SIN_CLAVE, historialParaEnviar, paraGuardar, errorDocumento, rutaDocumento, medidaCaptura, fechaSubida, documentosPorTipo, TIPOS_CV } from './postulacionesAgente.mjs'

const permisosOk = { planilla: true, leer_mail: true, borradores: true, falta_extra: false }

test('sin clave de Claude, el panel lo dice antes que nada', () => {
  assert.deepEqual(avisoPanel({ claude: false, google: true, permisos: permisosOk }), { clave: 'sin_clave', texto: SIN_CLAVE })
  assert.equal(SIN_CLAVE, 'Falta configurar la API de Claude')
})

test('después pide Google y los permisos nuevos', () => {
  assert.equal(avisoPanel({ claude: true, google: false, permisos: {} }).clave, 'sin_google')
  assert.equal(avisoPanel({ claude: true, google: true, permisos: { ...permisosOk, leer_mail: false } }).clave, 'sin_google')
  assert.equal(avisoPanel({ claude: true, google: true, permisos: { ...permisosOk, borradores: false, falta_extra: true } }).clave, 'permisos')
  assert.equal(avisoPanel({ claude: true, google: true, permisos: permisosOk }), null)
  assert.equal(avisoPanel(null), null)
})

test('el historial va en texto, con las capturas y lo que hizo anotados', () => {
  const h = historialParaEnviar([
    { rol: 'user', texto: 'Mirá este', capturas: 2 },
    { rol: 'bot', texto: 'VA.', acciones: ['Cargado en la planilla (fila 40)'] },
    { rol: 'bot', texto: 'No pude', error: true },
    { rol: 'user', texto: '' },
  ])
  assert.deepEqual(h, [
    { rol: 'user', texto: 'Mirá este\n(Mandé 2 capturas)' },
    { rol: 'bot', texto: 'VA.\n(Hice: Cargado en la planilla (fila 40))' },
  ])
})

test('se guarda la charla sin errores ni imágenes', () => {
  assert.deepEqual(paraGuardar([{ rol: 'user', texto: 'x', capturas: 1, imagenes: ['data'] }, { rol: 'bot', texto: 'e', error: true }]), [{ rol: 'user', texto: 'x', capturas: 1 }])
})

test('documentos: solo PDF o .docx, hasta 15 MB', () => {
  assert.equal(errorDocumento('CV.pdf', 1000), null)
  assert.equal(errorDocumento('CV.DOCX', 1000), null)
  assert.match(errorDocumento('CV.doc', 1000), /PDF o .docx/)
  assert.match(errorDocumento('CV.pdf', 16 * 1024 * 1024), /15 MB/)
})

test('la ruta en Storage va en la carpeta de la dueña y sin caracteres raros', () => {
  assert.equal(rutaDocumento('u1', 'CV Marketing (nov) ñandú.pdf', 'abc'), 'u1/abc-CV-Marketing-nov-nandu.pdf')
})

test('las capturas se achican a 1568 px de lado mayor', () => {
  assert.deepEqual(medidaCaptura(1080, 2400), { ancho: 706, alto: 1568 })
  assert.deepEqual(medidaCaptura(800, 600), { ancho: 800, alto: 600 })
})

test('fecha de subida y documentos por tipo', () => {
  assert.equal(fechaSubida('2026-11-16T02:00:00Z'), '15/11/2026')
  const r = documentosPorTipo([{ tipo: 'Marketing', id: 'm' }, { tipo: 'Otros', id: 'o' }], TIPOS_CV)
  assert.equal(r.cvs.length, 6)
  assert.equal(r.cvs[0].doc.id, 'm')
  assert.equal(r.cvs[1].doc, null)
  assert.deepEqual(r.otros.map(d => d.id), ['o'])
})
