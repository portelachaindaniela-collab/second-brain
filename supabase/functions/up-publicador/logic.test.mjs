import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hoyAR, horaAR, tocaPublicar, escaparLinkedIn, cuerpoPostLinkedIn, urlPostLinkedIn, motivoErrorLinkedIn } from './logic.mjs'

test('día y hora de Buenos Aires', () => {
  assert.equal(hoyAR(new Date('2026-10-07T02:30:00Z')), '2026-10-06')
  assert.equal(horaAR(new Date('2026-10-06T12:05:00Z')), '09:05')
  assert.equal(horaAR(new Date('2026-10-06T02:30:00Z')), '23:30')
})

test('publica solo lo aprobado de hoy, en una red automática y cuando llegó la hora', () => {
  const p = { estado: 'aprobado', red: 'linkedin', fecha: '2026-10-06' }
  assert.equal(tocaPublicar(p, '09:00:00', '2026-10-06', '09:00'), true)
  assert.equal(tocaPublicar(p, '09:00:00', '2026-10-06', '08:59'), false)
  assert.equal(tocaPublicar(p, null, '2026-10-06', '23:00'), false)
  assert.equal(tocaPublicar({ ...p, estado: 'pendiente' }, '09:00', '2026-10-06', '10:00'), false)
  assert.equal(tocaPublicar({ ...p, fecha: '2026-10-05' }, '09:00', '2026-10-06', '10:00'), false)
  assert.equal(tocaPublicar({ ...p, red: 'x' }, '09:00', '2026-10-06', '10:00'), false)
  assert.equal(tocaPublicar({ ...p, error_publicacion: 'LinkedIn respondió 500.' }, '09:00', '2026-10-06', '10:00'), false)
})

test('escapa los caracteres reservados de LinkedIn', () => {
  assert.equal(escaparLinkedIn('Equipo de 7 (Colegiales) #futsal @club_x ~ *hola* [a] {b} <c> | \\'), 'Equipo de 7 \\(Colegiales\\) \\#futsal \\@club\\_x \\~ \\*hola\\* \\[a\\] \\{b\\} \\<c\\> \\| \\\\')
  assert.equal(escaparLinkedIn('Sin nada raro: 4.300, +170%.'), 'Sin nada raro: 4.300, +170%.')
})

test('arma el post para el perfil de la dueña', () => {
  const c = cuerpoPostLinkedIn('abc123', 'Hola (prueba)')
  assert.equal(c.author, 'urn:li:person:abc123')
  assert.equal(c.commentary, 'Hola \\(prueba\\)')
  assert.equal(c.visibility, 'PUBLIC')
  assert.equal(c.lifecycleState, 'PUBLISHED')
})

test('link al post y mensajes de error', () => {
  assert.equal(urlPostLinkedIn('urn:li:share:123'), 'https://www.linkedin.com/feed/update/urn:li:share:123/')
  assert.equal(urlPostLinkedIn(null), null)
  assert.match(motivoErrorLinkedIn(401, {}), /Reconectala/)
  assert.match(motivoErrorLinkedIn(500, { message: 'boom' }), /500: boom/)
})
