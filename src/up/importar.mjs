// Importar un calendario a UP desde una planilla: CSV/TSV, una tabla pegada (de Sheets, Excel o un doc en Markdown) o
// un .xlsx. Sin React ni base, para probarlo con node --test.

export const COLUMNAS = ['fecha', 'idea', 'semana', 'redes', 'instagram', 'tema_instagram', 'plan']

export const PLANTILLA = [
  'fecha,idea,semana,redes,instagram,tema_instagram',
  '2026-11-02,Qué aprendí armando un área de comunicación desde cero,Quién soy,"linkedin, x",,',
  '2026-11-04,Tres errores que cometí en mi primera cobertura,Quién soy,"linkedin, x, instagram",carrusel,Los 3 errores en placas',
  '2026-11-06,El método detrás de cada cobertura,Método,linkedin,,',
].join('\n') + '\n'

// Cómo puede venir escrito cada encabezado.
const SINONIMOS = {
  fecha: ['fecha', 'dia', 'date', 'cuando', 'fecha de publicacion'],
  idea: ['idea', 'tema', 'tema del dia', 'tema_dia', 'publicacion', 'post', 'titulo', 'contenido', 'descripcion'],
  semana: ['semana', 'tema de la semana', 'tema_semana', 'eje', 'pilar', 'categoria'],
  redes: ['redes', 'red', 'canales', 'canal', 'plataformas', 'plataforma'],
  instagram: ['instagram', 'formato', 'formato instagram', 'formato_instagram', 'formato ig'],
  tema_instagram: ['tema instagram', 'tema_instagram', 'tema ig', 'idea instagram', 'instagram tema'],
  plan: ['plan', 'plan de trabajo', 'campana', 'calendario'],
}

const plano = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_*]+/g, ' ').replace(/\s+/g, ' ').trim()

export function columnaDe(encabezado) {
  const h = plano(encabezado)
  for (const [col, nombres] of Object.entries(SINONIMOS)) if (nombres.some(n => plano(n) === h)) return col
  return null
}

// CSV con comillas ("a, b", "dijo ""hola"""), separador , ; tab o |.
export function leerCSV(texto, sep) {
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"' && campo === '') comillas = true
    else if (c === sep) { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  const limpias = filas.map(f => f.map(v => v.trim()))
  while (limpias.length && !limpias.at(-1).some(Boolean)) limpias.pop()
  return limpias
}

function separador(linea) {
  const cuenta = s => linea.split(s).length - 1
  return ['\t', ';', ',', '|'].sort((a, b) => cuenta(b) - cuenta(a))[0]
}

// Tabla de Markdown (| a | b |) como la que arma un chat o un doc.
function leerMarkdown(texto) {
  return texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('|'))
    .filter(l => !/^\|[\s:|-]+\|?$/.test(l))
    .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/^\*\*(.*)\*\*$/, '$1')))
}

// Texto pegado o archivo de texto → filas (la primera es el encabezado).
export function tablaDesdeTexto(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '')
  if (t.split(/\r?\n/).filter(l => l.trim().startsWith('|')).length >= 2) return leerMarkdown(t)
  const primera = t.split(/\r?\n/).find(l => l.trim()) ?? ''
  return leerCSV(t, separador(primera))
}

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 }
const dos = n => String(n).padStart(2, '0')

function valida(a, m, d) {
  const f = new Date(Date.UTC(a, m - 1, d))
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? `${a}-${dos(m)}-${dos(d)}` : null
}

// Sin año, la fecha es la próxima a partir de hoy (si ya pasó este año, la del año que viene).
function conAnio(m, d, hoy) {
  const a = Number(hoy.slice(0, 4))
  const f = valida(a, m, d)
  return f && f >= hoy ? f : valida(a + 1, m, d)
}

// AAAA-MM-DD, DD/MM/AAAA, DD-MM-AA, DD/MM, "lunes 3 de noviembre", "3 nov 2026" o número de serie de Excel.
export function leerFecha(valor, hoy) {
  const v = plano(valor).replace(/^(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom)\.?,?\s+/, '')
  let m
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valida(+m[1], +m[2], +m[3])
  if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) return valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})$/))) return conAnio(+m[2], +m[1], hoy)
  if ((m = v.match(/^(\d{1,2})(?: de)? ([a-z]{3})[a-z]*\.?(?:,? (?:de )?(\d{4}))?$/)) && MESES[m[2]]) return m[3] ? valida(+m[3], MESES[m[2]], +m[1]) : conAnio(MESES[m[2]], +m[1], hoy)
  if ((m = v.match(/^(\d{5})(?:\.\d+)?$/))) {
    const f = new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 86_400_000)
    return f.toISOString().slice(0, 10)
  }
  return null
}

export function leerRedes(valor) {
  const v = plano(valor)
  if (!v) return null
  if (/todas|todos|all/.test(v)) return ['linkedin', 'x', 'instagram']
  const redes = []
  if (/linked ?in|\bln\b|\bli\b|\bin\b/.test(v)) redes.push('linkedin')
  if (/\bx\b|twitter|\btw\b/.test(v)) redes.push('x')
  if (/insta|\big\b/.test(v)) redes.push('instagram')
  return redes
}

function leerFormato(valor) {
  const v = plano(valor)
  if (/reel|video/.test(v)) return 'reel'
  if (/carrusel|carousel|placa|foto|\bsi\b|\byes\b/.test(v)) return 'carrusel'
  return null
}

// Filas de la planilla → días para UP. Devuelve los días válidos y, por cada fila con problema, el motivo.
export function diasDesdeTabla(tabla, hoy) {
  const inicio = tabla.findIndex(f => f.some(Boolean))
  if (inicio < 0) return { dias: [], errores: [{ fila: 0, motivo: 'La planilla está vacía.' }], columnas: [] }
  const cols = tabla[inicio].map(columnaDe)
  const faltan = ['fecha', 'idea'].filter(c => !cols.includes(c))
  if (faltan.length) return { dias: [], errores: [{ fila: inicio + 1, motivo: `Falta la columna ${faltan.join(' y ')}. La primera fila tiene que tener los títulos (por ejemplo: fecha, idea, semana, redes).` }], columnas: cols }
  const dias = [], errores = [], vistas = new Map()
  tabla.slice(inicio + 1).forEach((fila, i) => {
    const n = inicio + i + 2
    const v = Object.fromEntries(cols.map((c, j) => [c, fila[j] ?? '']).filter(([c]) => c))
    if (!Object.values(v).some(Boolean)) return
    const fecha = leerFecha(v.fecha, hoy)
    if (!fecha) { errores.push({ fila: n, motivo: `No entiendo la fecha «${v.fecha || 'vacía'}».` }); return }
    const idea = String(v.idea ?? '').trim()
    if (!idea) { errores.push({ fila: n, motivo: 'Falta la idea.' }); return }
    if (vistas.has(fecha)) { errores.push({ fila: n, motivo: `El ${fecha} ya está en la fila ${vistas.get(fecha)}: UP publica una idea por día.` }); return }
    vistas.set(fecha, n)
    const formato = leerFormato(v.instagram)
    let redes = leerRedes(v.redes) ?? ['linkedin', 'x']
    if (formato && !redes.includes('instagram')) redes = [...redes, 'instagram']
    if (!redes.length) { errores.push({ fila: n, motivo: `No reconozco las redes «${v.redes}» (LinkedIn, X o Instagram).` }); return }
    const ig = redes.includes('instagram')
    dias.push({
      fila: n, fecha, tema_dia: idea.slice(0, 500), tema_semana: String(v.semana ?? '').trim().slice(0, 120) || null, redes,
      formato_instagram: ig ? formato ?? 'carrusel' : 'ninguno',
      tema_instagram: ig ? String(v.tema_instagram ?? '').trim().slice(0, 300) || null : null,
      plan: String(v.plan ?? '').trim().slice(0, 60) || null,
    })
  })
  return { dias: dias.sort((a, b) => a.fecha.localeCompare(b.fecha)), errores, columnas: cols }
}

// ---------- .xlsx sin librerías: es un zip con XML adentro ----------

async function inflar(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flujo).arrayBuffer())
}

async function archivosZip(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf)
  let fin = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break }
  if (fin < 0) throw new Error('El archivo no es un Excel válido.')
  const total = dv.getUint16(fin + 10, true)
  let p = dv.getUint32(fin + 16, true)
  const dec = new TextDecoder()
  const archivos = new Map()
  for (let k = 0; k < total; k++) {
    const metodo = dv.getUint16(p + 10, true), comprimido = dv.getUint32(p + 20, true)
    const largoNombre = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), coment = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + largoNombre))
    const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    archivos.set(nombre, { metodo, datos: b.subarray(inicio, inicio + comprimido) })
    p += 46 + largoNombre + extra + coment
  }
  return {
    async texto(nombre) {
      const a = archivos.get(nombre)
      if (!a) return null
      return dec.decode(a.metodo === 0 ? a.datos : await inflar(a.datos))
    },
    nombres: [...archivos.keys()],
  }
}

const xmlTexto = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const indiceColumna = ref => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

// Primera hoja de un .xlsx → filas de texto.
export async function tablaDesdeXlsx(buf) {
  const zip = await archivosZip(buf)
  const compartidos = [...((await zip.texto('xl/sharedStrings.xml')) ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => xmlTexto([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')))
  const hoja = zip.nombres.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0]
  const xml = hoja ? await zip.texto(hoja) : null
  if (!xml) throw new Error('El Excel no tiene hojas.')
  const filas = []
  for (const f of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const fila = []
    for (const c of f[2].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], cuerpo = c[2] ?? ''
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1]
      const tipo = attrs.match(/t="(\w+)"/)?.[1]
      const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let valor = ''
      if (tipo === 's') valor = compartidos[Number(v)] ?? ''
      else if (tipo === 'inlineStr') valor = xmlTexto(cuerpo)
      else if (v !== undefined) valor = xmlTexto(v)
      fila[ref ? indiceColumna(ref) : fila.length] = valor.trim()
    }
    const r = Number(f[1].match(/r="(\d+)"/)?.[1]) || filas.length + 1
    filas[r - 1] = Array.from(fila, x => x ?? '')
  }
  return Array.from(filas, f => f ?? [])
}
