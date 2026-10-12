import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proximasAcciones, cifras, primerDiaLibre, partirIdea, leerAgenteMd, porSegmento } from './comercial.mjs'

const C = (o) => ({ nombre: 'X', segmento: 'club', etapa: 'prospecto', proxima_accion: null, proxima_fecha: null, ...o })

test('proximasAcciones: solo abiertas, ordenadas por fecha, vencidas marcadas, sin fecha al final', () => {
  const r = proximasAcciones([
    C({ nombre: 'B', proxima_fecha: '2026-10-15', proxima_accion: 'mail' }),
    C({ nombre: 'A', proxima_fecha: '2026-10-10', proxima_accion: 'llamar' }),
    C({ nombre: 'C', proxima_accion: 'algún día' }),
    C({ nombre: 'D', etapa: 'ganada', proxima_fecha: '2026-10-01', proxima_accion: 'x' }),
    C({ nombre: 'E' }),
  ], '2026-10-12')
  assert.deepEqual(r.map(c => c.nombre), ['A', 'B', 'C'])
  assert.equal(r[0].vencida, true)
  assert.equal(r[1].vencida, false)
})

test('cifras y porSegmento', () => {
  const cs = [C({ etapa: 'demo' }), C({ etapa: 'propuesta', proxima_fecha: '2026-10-01' }), C({ etapa: 'ganada' }), C({ etapa: 'perdida' }), C({ segmento: 'liga' })]
  const k = cifras(cs, '2026-10-12')
  assert.deepEqual([k.abiertas, k.enDemo, k.enPropuesta, k.ganadas, k.vencidas, k.sinAccion], [3, 1, 1, 1, 1, 2])
  assert.deepEqual(porSegmento(cs), [{ segmento: 'club', total: 2 }, { segmento: 'liga', total: 1 }])
})

test('primerDiaLibre salta los días ocupados desde mañana', () => {
  assert.equal(primerDiaLibre(['2026-10-13', '2026-10-14'], '2026-10-12'), '2026-10-15')
  assert.equal(primerDiaLibre([], '2026-12-31'), '2027-01-01')
})

test('partirIdea separa el segmento', () => {
  assert.deepEqual(partirIdea('[club] Informe post partido solo'), { segmento: 'club', idea: 'Informe post partido solo' })
  assert.deepEqual(partirIdea('Sin segmento'), { segmento: '', idea: 'Sin segmento' })
})

test('leerAgenteMd toma nombre, rol e instrucciones', () => {
  const a = leerAgenteMd('demo', '# Agente 2: Preparador de demos\n\n## Rol\nEspecialista.\n\n## Instrucciones\n1. Algo\n\n## Formato de salida\nX', 2)
  assert.equal(a.nombre, 'Preparador de demos')
  assert.equal(a.rol, 'Especialista.')
  assert.match(a.instrucciones, /^## Instrucciones[\s\S]*## Formato de salida\nX$/)
})
