import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { leerCSV, tablaDesdeTexto, leerFecha, leerRedes, columnaDe, diasDesdeTabla, tablaDesdeXlsx, PLANTILLA } from './importar.mjs'

const HOY = '2026-10-12'

test('lee CSV con comillas, punto y coma y tabs', () => {
  assert.deepEqual(leerCSV('a,b\n"x, y","dijo ""hola"""\n', ','), [['a', 'b'], ['x, y', 'dijo "hola"']])
  assert.deepEqual(tablaDesdeTexto('fecha;idea\r\n3/11;Algo\r\n'), [['fecha', 'idea'], ['3/11', 'Algo']])
  assert.deepEqual(tablaDesdeTexto('fecha\tidea\n3/11\tPegado de Sheets'), [['fecha', 'idea'], ['3/11', 'Pegado de Sheets']])
})

test('lee una tabla de Markdown como la de un chat o un doc', () => {
  const md = 'Mi plan:\n\n| Fecha | Idea | Redes |\n|---|:---|---|\n| 03/11 | **Arranque** | LinkedIn |\n| 05/11 | Segunda | todas |\n\nCualquier cosa avisá.'
  assert.deepEqual(tablaDesdeTexto(md), [['Fecha', 'Idea', 'Redes'], ['03/11', 'Arranque', 'LinkedIn'], ['05/11', 'Segunda', 'todas']])
})

test('entiende fechas en muchos formatos', () => {
  assert.equal(leerFecha('2026-11-03', HOY), '2026-11-03')
  assert.equal(leerFecha('3/11/2026', HOY), '2026-11-03')
  assert.equal(leerFecha('03-11-26', HOY), '2026-11-03')
  assert.equal(leerFecha('3/11', HOY), '2026-11-03')
  assert.equal(leerFecha('5/1', HOY), '2027-01-05')
  assert.equal(leerFecha('lunes 3 de noviembre', HOY), '2026-11-03')
  assert.equal(leerFecha('Mar 4 nov. 2026', HOY), '2026-11-04')
  assert.equal(leerFecha('46329', HOY), '2026-11-03')
  assert.equal(leerFecha('31/02/2026', HOY), null)
  assert.equal(leerFecha('pronto', HOY), null)
})

test('reconoce redes y encabezados con otros nombres', () => {
  assert.deepEqual(leerRedes('LinkedIn + X'), ['linkedin', 'x'])
  assert.deepEqual(leerRedes('IG, twitter'), ['x', 'instagram'])
  assert.deepEqual(leerRedes('Todas'), ['linkedin', 'x', 'instagram'])
  assert.equal(columnaDe('Tema del día'), 'idea')
  assert.equal(columnaDe('Tema_semana'), 'semana')
  assert.equal(columnaDe('Formato IG'), 'instagram')
  assert.equal(columnaDe('Notas'), null)
})

test('arma los días y explica las filas con problemas', () => {
  const tabla = tablaDesdeTexto('Fecha,Tema del día,Semana,Redes,Formato,Notas\n3/11,Arranque,Quién soy,linkedin,,x\n4/11,,Quién soy,x,,\nmañana,Algo,,,,\n5/11,Placas,,x,carrusel,\n3/11,Repetida,,,,\n\n6/11,Nada,,tiktok,,')
  const r = diasDesdeTabla(tabla, HOY)
  assert.deepEqual(r.dias.map(d => [d.fecha, d.tema_dia, d.redes.join('+'), d.formato_instagram]), [
    ['2026-11-03', 'Arranque', 'linkedin', 'ninguno'],
    ['2026-11-03', 'Repetida', 'linkedin+x', 'ninguno'],
    ['2026-11-05', 'Placas', 'x+instagram', 'carrusel'],
  ])
  assert.deepEqual(r.errores.map(e => e.fila), [3, 4, 8])
  const dup = diasDesdeTabla(tablaDesdeTexto('fecha,idea\n3/11,Uno\n3/11,uno\n3/11,Dos'), HOY)
  assert.deepEqual(dup.dias.map(d => d.tema_dia), ['Uno', 'Dos'])
  assert.match(dup.errores[0].motivo, /fila 2/)
})

test('pide las columnas mínimas y la plantilla sirve', () => {
  assert.match(diasDesdeTabla([['dia', 'texto']], HOY).errores[0].motivo, /idea/)
  const r = diasDesdeTabla(tablaDesdeTexto(PLANTILLA), HOY)
  assert.equal(r.dias.length, 3)
  assert.equal(r.errores.length, 0)
  assert.equal(r.dias[1].tema_instagram, 'Los 3 errores en placas')
})

// Un .xlsx mínimo (zip con deflate) para probar el lector.
function zip(archivos) {
  const locales = [], centrales = []
  let pos = 0
  for (const [nombre, texto] of Object.entries(archivos)) {
    const n = Buffer.from(nombre), datos = deflateRawSync(Buffer.from(texto))
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(datos.length, 18); l.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(datos.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42)
    locales.push(l, n, datos); centrales.push(c, n)
    pos += 30 + n.length + datos.length
  }
  const central = Buffer.concat(centrales)
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(archivos).length, 10); fin.writeUInt32LE(central.length, 12); fin.writeUInt32LE(pos, 16)
  const b = Buffer.concat([...locales, central, fin])
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length)
}

test('lee la primera hoja de un .xlsx', async () => {
  const buf = zip({
    'xl/sharedStrings.xml': '<sst><si><t>fecha</t></si><si><t>idea</t></si><si><r><t>Café &amp; </t></r><r><t>charla</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>46329</v></c><c r="C2" t="inlineStr"><is><t>suelto</t></is></c><c r="B2" t="s"><v>2</v></c></row></sheetData></worksheet>',
  })
  const tabla = await tablaDesdeXlsx(buf)
  assert.deepEqual(tabla, [['fecha', 'idea'], ['46329', 'Café & charla', 'suelto']])
  assert.equal(diasDesdeTabla(tabla, HOY).dias[0].fecha, '2026-11-03')
})
