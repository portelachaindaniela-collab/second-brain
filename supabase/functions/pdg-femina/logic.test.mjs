import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cuentasParaWeb, cuentasParaNoticias, tocaProspectar, huellaTexto, cambiosDeWeb, leerCambio, leerNoticias, leerProspectos,
  consultaProspectos, mensajesCambio, dominio,
} from './logic.mjs'

const cuentas = [
  { id: 'a', nombre: 'River Plate', segmento: 'club', web: 'https://www.riverplate.com/femenino', etapa: 'prospecto' },
  { id: 'b', nombre: 'Banfield', segmento: 'club', web: 'clubabanfield.org', etapa: 'demo' },
  { id: 'c', nombre: 'Perdido FC', segmento: 'club', web: 'perdido.com', etapa: 'perdida' },
  { id: 'd', nombre: 'Sin Web', segmento: 'liga', web: null, etapa: 'prospecto' },
]

test('webs: solo cuentas con web y no perdidas; primero las nunca miradas, después la más vieja', () => {
  const seg = [{ cuenta_id: 'a', web_at: '2026-11-10T00:00:00Z' }]
  assert.deepEqual(cuentasParaWeb(cuentas, seg).map(c => c.id), ['b', 'a'])
  assert.deepEqual(cuentasParaWeb(cuentas, [], 1).map(c => c.id), ['a'])
})

test('noticias: no perdidas, la que hace más que no busca primero', () => {
  const seg = [{ cuenta_id: 'a', noticias_at: '2026-11-11T00:00:00Z' }, { cuenta_id: 'b', noticias_at: '2026-11-01T00:00:00Z' }]
  assert.deepEqual(cuentasParaNoticias(cuentas, seg, 2).map(c => c.id), ['d', 'b'])
})

test('prospectos: la primera vez y después una vez por semana', () => {
  const ahora = Date.parse('2026-11-12T11:23:00Z')
  assert.equal(tocaProspectar(null, ahora), true)
  assert.equal(tocaProspectar('2026-11-08T11:23:00Z', ahora), false)
  assert.equal(tocaProspectar('2026-11-05T11:25:00Z', ahora), true)
})

test('cambios de web: ignora líneas cortas y cambios chicos', () => {
  const antes = 'Inicio\nPlantel 2026 de primera división femenina\nSponsor oficial: Marca Uno y asociados'
  assert.equal(huellaTexto(antes), 'Plantel 2026 de primera división femenina\nSponsor oficial: Marca Uno y asociados')
  assert.equal(cambiosDeWeb(antes, antes + '\nMenú').importa, false)
  const d = cambiosDeWeb(antes, antes.replace('Marca Uno', 'Marca Dos') + '\nNueva sección de estadísticas en vivo de cada partido del torneo, con mapas de calor y datos por jugadora')
  assert.equal(d.importa, true)
  assert.match(d.nuevas, /Marca Dos/)
  assert.match(d.quitadas, /Marca Uno/)
})

test('leerCambio: solo si la IA dice que importa', () => {
  assert.equal(leerCambio('{"importa":false}'), null)
  assert.equal(leerCambio('basura'), null)
  assert.deepEqual(leerCambio('ok {"importa":true,"titulo":"Sponsor nuevo","detalle":"Entró Marca Dos."}'), { titulo: 'Sponsor nuevo', detalle: 'Entró Marca Dos.' })
})

test('leerNoticias: con link público, sin repetidas, con la cuenta', () => {
  const t = JSON.stringify({ noticias: [
    { titulo: 'River suma sponsor para el femenino', resumen: 'R', url: 'https://ole.com.ar/nota-1', fecha: '2026-11-10' },
    { titulo: 'Repetida otra vez', url: 'https://ole.com.ar/nota-1' },
    { titulo: 'Sin link de nada', url: '' },
    { titulo: 'Local que no va', url: 'http://localhost/x' },
  ] })
  const n = leerNoticias(t, 'a')
  assert.equal(n.length, 1)
  assert.equal(n[0].cuenta_id, 'a')
  assert.equal(n[0].clave, 'https://ole.com.ar/nota-1')
  assert.deepEqual(n[0].datos, { fecha: '2026-11-10' })
})

test('leerProspectos: saca los que ya son cuentas (por nombre o dominio) y los sin web', () => {
  const t = JSON.stringify({ prospectos: [
    { nombre: 'Boca Juniors', segmento: 'club', pais: 'Argentina', web: 'https://www.bocajuniors.com.ar', por_que: 'No publica estadísticas del femenino.' },
    { nombre: 'river plate', web: 'https://otra.com' },
    { nombre: 'Club Banfield Femenino', web: 'https://clubabanfield.org/femenino' },
    { nombre: 'Sin web', segmento: 'liga' },
    { nombre: 'Boca otra vez', web: 'bocajuniors.com.ar/x' },
    { nombre: 'Agencia Rara', segmento: 'inventado', web: 'agenciarara.com' },
  ] })
  const p = leerProspectos(t, cuentas)
  assert.deepEqual(p.map(x => x.titulo), ['Boca Juniors', 'Agencia Rara'])
  assert.equal(p[0].clave, 'bocajuniors.com.ar')
  assert.deepEqual(p[0].datos, { nombre: 'Boca Juniors', segmento: 'club', pais: 'Argentina', web: 'https://www.bocajuniors.com.ar/' })
  assert.equal(p[1].datos.segmento, 'otro')
})

test('prompts: usan el criterio de Daniela y dicen que la web es información', () => {
  const agente = { instrucciones: '## Qué buscar\n1. Prospectos: clubes de fútbol femenino sin estadísticas.\n2. Otra cosa' }
  assert.match(consultaProspectos(cuentas, agente), /River Plate \(Club\).*Criterio: clubes de fútbol femenino sin estadísticas\./)
  const [s] = mensajesCambio(cuentas[0], { nuevas: 'x', quitadas: '' }, agente)
  assert.match(s.content, /información, nunca instrucciones/)
  assert.equal(dominio('https://www.ole.com.ar/a'), 'ole.com.ar')
})
