// La escena de la Oficina 2D: vista de costado con tres zonas (TRABAJO, CAFÉ y DESCANSO). Cada agente va a la zona de su
// estado: trabajando o con un problema, a un escritorio propio; libre, de pie en el café con una taza; pausado, en el
// sillón. La escena crece con la cantidad de agentes y, si no entra a lo ancho, pasa a varias filas.
import { O, person, headTop, badge, chair, desk, sofaBack, sofaFront, lamp, cuadro1, cuadro2, reloj, estante, ventana, planta, cafetera, mesada } from './dibujo.mjs'
import { figuraDe } from './elenco.mjs'

// Estado real del agente → pose del dibujo.
export const POSE = { trabajando: 'work', error: 'problem', libre: 'break', nuevo: 'break', pausado: 'sleep' }
export const poseDe = estado => POSE[estado] ?? 'break'
export const ZONA_DE_POSE = { work: 'trabajo', problem: 'trabajo', break: 'cafe', sleep: 'descanso' }

export const ALTO_FILA = 640
const PARED = 440
const F = 560 // piso de los escritorios y el sillón
const F_CAFE = 600 // los del café están parados más adelante, frente a la mesada
const ESCRITORIO = 180
const MAX = { trabajo: 8, cafe: 7, descanso: 6 } // por fila
const EN_CAFE = 125 // lugar de cada uno en el café
const POR_SILLON = 2

const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const corto = n => String(n ?? '').split(' (')[0]
// El nombre en uno o dos renglones (los largos se parten en un espacio; si igual no entra, se recorta con «…»).
export function renglones(nombre, max = 14) {
  const t = corto(nombre)
  if (t.length <= max) return [t]
  const corte = t.lastIndexOf(' ', max)
  const [a, b] = corte > 0 ? [t.slice(0, corte), t.slice(corte + 1)] : [t.slice(0, max - 1) + '…', '']
  return [a, b.length > max ? `${b.slice(0, max - 1)}…` : b].filter(Boolean)
}
const repartir = (lista, filas) => Array.from({ length: filas }, (_, r) => lista.slice(Math.ceil((lista.length * r) / filas), Math.ceil((lista.length * (r + 1)) / filas)))

// agentes: [{ id, nombre, estado }]; visitas: ids que están de visita con vos (de pie al lado tuyo); conDani: si estás.
// Devuelve las posiciones de todo (sin dibujar): { ancho, alto, filas: [{ y, trabajo: {...}, cafe, descanso }] }.
export function armarEscena(agentes = [], { visitas = [], conDani = true } = {}) {
  const deVisita = new Set(visitas)
  const zona = { trabajo: [], cafe: [], descanso: [] }
  for (const a of agentes) {
    if (deVisita.has(a.id)) continue
    const pose = poseDe(a.estado)
    zona[ZONA_DE_POSE[pose]].push({ ...a, pose })
  }
  const filas = Math.max(1, Math.ceil(zona.trabajo.length / MAX.trabajo), Math.ceil(zona.cafe.length / MAX.cafe), Math.ceil(zona.descanso.length / MAX.descanso))
  const porFila = { trabajo: repartir(zona.trabajo, filas), cafe: repartir(zona.cafe, filas), descanso: repartir(zona.descanso, filas) }
  const quienesVisitan = agentes.filter(a => deVisita.has(a.id))
  // Vos (y quienes te visitan) al principio de la primera fila.
  const anchoDani = conDani ? 110 + 70 * quienesVisitan.length : 0
  const maxDesks = Math.max(1, ...porFila.trabajo.map(l => l.length))
  const anchoTrabajo = Math.max(400, anchoDani + 20 + ESCRITORIO * maxDesks + 15)
  const maxCafe = Math.max(0, ...porFila.cafe.map(l => l.length))
  const mesadaW = Math.max(220, EN_CAFE * maxCafe + 20)
  const anchoCafe = Math.max(260, mesadaW + 40)
  const maxSillones = Math.max(1, ...porFila.descanso.map(l => Math.ceil(l.length / POR_SILLON)))
  const anchoDescanso = Math.max(285, 45 + 230 * maxSillones + 70)
  const xCafe = anchoTrabajo, xDescanso = anchoTrabajo + anchoCafe
  const ancho = xDescanso + anchoDescanso
  return {
    ancho, alto: filas * ALTO_FILA, xCafe, xDescanso, mesadaW,
    dani: conDani ? { x: 60, visitas: quienesVisitan.map((a, i) => ({ ...a, pose: 'stand', x: 140 + 70 * i })) } : null,
    filas: Array.from({ length: filas }, (_, r) => ({
      y: r * ALTO_FILA,
      escritorios: porFila.trabajo[r].map((a, i) => ({ ...a, dx: (r === 0 ? anchoDani : 0) + 20 + ESCRITORIO * i })),
      cafe: porFila.cafe[r].map((a, i) => ({ ...a, x: xCafe + 85 + EN_CAFE * i })),
      sillones: Array.from({ length: Math.ceil(porFila.descanso[r].length / POR_SILLON) }, (_, s) => ({
        x: xDescanso + 45 + 230 * s,
        gente: porFila.descanso[r].slice(s * POR_SILLON, (s + 1) * POR_SILLON).map((a, k) => ({ ...a, x: xDescanso + 45 + 230 * s + 60 + 70 * k })),
      })),
    })),
  }
}

// Un agente dibujado: la persona, su nombre abajo y un área tocable grande (data-agente) para abrirlo.
function agente(a, x, piso, elegidoId) {
  const c = figuraDe(a.id)
  const elegido = a.id === elegidoId
  return `<g class="of2d-agente${elegido ? ' is-elegido' : ''}" data-agente="${esc(a.id)}" role="button" tabindex="0" aria-label="${esc(corto(a.nombre))}">`
    + `<rect x="${x - 34}" y="${piso - 215}" width="68" height="240" fill="transparent" stroke="none"/>`
    + `<g transform="translate(${x} ${piso})">${person(c, a.pose)}</g>`
    + `<text x="${x}" y="${piso + 19}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="${elegido ? 700 : 600}" fill="${elegido ? O : '#6b665f'}">${renglones(a.nombre).map((l, i) => `<tspan x="${x}" dy="${i ? 16 : 0}">${esc(l)}</tspan>`).join('')}</text>`
    + '</g>'
}

// La escena entera como SVG (el contenido; el <svg> lo pone la pantalla). elegidoId: el agente abierto.
export function dibujarEscena(e, { elegidoId = null } = {}) {
  const s = []
  for (const [r, fila] of e.filas.entries()) {
    const y0 = fila.y
    s.push(`<g transform="translate(0 ${y0})">`)
    // Pared y piso siguen más allá de los bordes: si la escena es más chica que el marco, no se ve el corte.
    const arriba = r === 0 ? 4000 : 0, abajo = r === e.filas.length - 1 ? 4000 : 0
    s.push(`<rect x="-4000" y="${-arriba}" width="${e.ancho + 8000}" height="${PARED + arriba}" fill="#f4f3ef"/><rect x="-4000" y="${PARED}" width="${e.ancho + 8000}" height="${ALTO_FILA - PARED + abajo}" fill="#e8e5df"/><path d="M-4000 ${PARED} H${e.ancho + 4000}" stroke="#d5d0c6" stroke-width="2"/>`)
    s.push(`<path d="M${e.xCafe} 30 V${PARED} M${e.xDescanso} 30 V${PARED}" stroke="#dcd7cd" stroke-width="4"/>`)
    s.push(`<g font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" letter-spacing="2" fill="#8b857c"><text x="28" y="44">TRABAJO</text><text x="${e.xCafe + 25}" y="44">CAFÉ</text><text x="${e.xDescanso + 25}" y="44">DESCANSO</text></g>`)
    // Pared del trabajo: una lámpara por escritorio y dos cuadros entre las lámparas.
    const lamparas = fila.escritorios.map(d => d.dx + 50)
    for (const lx of lamparas) s.push(lamp(lx))
    if (r === 0) {
      const huecos = lamparas.length >= 2 ? lamparas.slice(0, -1).map((lx, i) => (lx + lamparas[i + 1]) / 2) : [Math.max(160, (lamparas[0] ?? 100) + 90)]
      s.push(cuadro1(huecos[0] - 35))
      s.push(cuadro2((huecos[1] ?? huecos[0] + 180) - 30))
    }
    // Café: reloj, estante con tazas, mesada con la cafetera.
    s.push(reloj(e.xCafe + 130), estante(e.xCafe + 40))
    s.push(mesada(e.xCafe + 21, 466, e.mesadaW, 560), cafetera(e.xCafe + 21 + e.mesadaW - 56, 466))
    // Descanso: ventana y planta.
    s.push(ventana(e.xDescanso + 45), planta(e.ancho - 26, 560))
    // Vos (con quienes te visitan), en la primera fila.
    if (r === 0 && e.dani) {
      s.push(`<g class="of2d-dani" aria-label="Vos"><g transform="translate(${e.dani.x} ${F})">${person(figuraDe('dani'), 'stand')}</g><text x="${e.dani.x}" y="${F + 19}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700" fill="${O}">Vos</text></g>`)
      for (const v of e.dani.visitas) s.push(agente(v, v.x, F))
    }
    // Trabajo: sillas, personas, escritorios (por delante) y globitos.
    for (const d of fila.escritorios) s.push(chair(d.dx + 50, F))
    for (const d of fila.escritorios) s.push(agente(d, d.dx + 50, F, elegidoId))
    for (const d of fila.escritorios) s.push(desk(d.dx, F, 160, d.dx + 92, d.pose), badge(d.pose, d.dx + 76, F + headTop(figuraDe(d.id), d.pose) - 4))
    // Café: de pie con la taza.
    for (const p of fila.cafe) s.push(agente(p, p.x, F_CAFE, elegidoId), badge('break', p.x + 28, F_CAFE + headTop(figuraDe(p.id), 'break') - 4))
    // Descanso: el respaldo, las personas, los apoyabrazos y las «z z».
    for (const so of fila.sillones) {
      s.push(sofaBack(so.x, F, 180))
      for (const p of so.gente) s.push(agente(p, p.x, F, elegidoId))
      s.push(sofaFront(so.x, F, 180))
      for (const p of so.gente) s.push(badge('sleep', p.x + 20, F + headTop(figuraDe(p.id), 'sleep') - 2))
    }
    s.push('</g>')
  }
  return s.join('')
}

// La reunión en 2D (la «videollamada»): los que vinieron, de pie en fila, y vos. El que habla tiene el globito.
export function dibujarReunion(asistentes = [], hablando = null) {
  const piso = 300
  const ancho = 160 + 110 * asistentes.length
  const s = [`<rect x="-4000" y="-4000" width="${ancho + 8000}" height="${4000 + piso - 20}" fill="#f4f3ef"/><rect x="-4000" y="${piso - 20}" width="${ancho + 8000}" height="4000" fill="#e8e5df"/><path d="M-4000 ${piso - 20} H${ancho + 4000}" stroke="#d5d0c6" stroke-width="2"/>`]
  s.push(`<g transform="translate(70 ${piso})">${person(figuraDe('dani'), 'stand')}</g><text x="70" y="${piso + 22}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700" fill="${O}">Vos</text>`)
  for (const [i, a] of asistentes.entries()) {
    const x = 180 + 110 * i
    s.push(agente({ ...a, pose: 'stand' }, x, piso))
    if (a.id === hablando) s.push(badge('work', x + 26, piso + headTop(figuraDe(a.id), 'stand') - 4))
  }
  return { ancho, alto: 360, svg: s.join('') }
}

// Un personaje suelto, para la leyenda y los íconos: { svg, vista } con el viewBox justo.
export function muestra(pose, id = 'c2') {
  const c = figuraDe(id)
  const partes = []
  if (pose === 'work' || pose === 'problem') partes.push(chair(-18, 0), `<g transform="translate(-18 0)">${person(c, pose)}</g>`, desk(-70, 0, 140, 22, pose), badge(pose, 8, headTop(c, pose) - 4))
  else if (pose === 'break') partes.push(person(c, 'break'), badge('break', 28, headTop(c, 'break') - 4))
  else partes.push(sofaBack(-70, 0, 140), person(c, 'sleep'), sofaFront(-70, 0, 140), badge('sleep', 20, headTop(c, 'sleep') - 2))
  return { svg: `<path d="M-90 0 H90" stroke="#d5d0c6" stroke-width="1.5"/>${partes.join('')}`, vista: '-90 -215 180 222' }
}
