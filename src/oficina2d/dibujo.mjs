// La Oficina en 2D: el dibujo de los personajes y los muebles, en SVG (texto). Es una copia fiel de personajes_oficina.py
// (el diseño de Daniela): misma geometría, colores, grosores y ropa. Todo se dibuja inline, sin <use> ni <defs>.
// El origen de cada persona está en sus pies (el piso); de pie mide unos 200 de alto.

export const O = '#2b2b2b' // contorno
export const SW = 1.6 // grosor del contorno, parejo en todo
export const ESTADO = { work: '#3fae6e', problem: '#e05252', break: '#e8973a', sleep: '#8a84a8' }

// Los 8 personajes del archivo y Daniela.
export const CAST = [
  { id: 'c1', hair: 'curls', hc: '#2a1d17', skin: '#8d5a3b', top: 'blouse', tc: '#c9775a', bottom: 'skirt', bc: '#2f3e56', shoe: '#2b2b2b', earrings: true, l1: 'Rulos y aros', l2: 'Blusa y pollera' },
  { id: 'c2', hair: 'short', hc: '#6b4a2e', skin: '#f3d2b8', top: 'shirt_tie', tc: '#fafafa', tie: '#2f3e56', bottom: 'pants', bc: '#3a3a3a', shoe: '#2b2b2b', glasses: true, l1: 'Lentes', l2: 'Camisa, corbata y pantalón' },
  { id: 'c3', hair: 'short', hc: '#262626', skin: '#c68b59', top: 'blazer', tc: '#fafafa', jc: '#2f3e56', inner: 'tee', bottom: 'pants', bc: '#d8cbb5', shoe: '#5a4636', beard: true, l1: 'Barba', l2: 'Saco sobre remera' },
  { id: 'c4', hair: 'buzz', hc: '#4a3426', skin: '#e0b48e', top: 'polo', tc: '#9bb0a0', bottom: 'pants', bc: '#2f3e56', shoe: '#2b2b2b', mustache: true, l1: 'Bigote', l2: 'Chomba y pantalón' },
  { id: 'c5', hair: 'long', hc: '#1f1f1f', skin: '#f3d2b8', top: 'tee', tc: '#3a3a3a', bottom: 'pants', bc: '#5d7590', shoe: '#fafafa', tattoo: true, ear_piercing: true, l1: 'Pelo largo, tatuajes', l2: 'Remera y jean' },
  { id: 'c6', hair: 'bun', hc: '#3b2416', skin: '#5e3b28', top: 'blouse', tc: '#fafafa', bottom: 'pants', bc: '#3a3a3a', shoe: '#2b2b2b', nose_piercing: true, l1: 'Rodete, piercing', l2: 'Blusa y pantalón' },
  { id: 'c7', hair: 'bald', hc: '#3a2a20', skin: '#c68b59', top: 'shirt', tc: '#bcd0e3', bottom: 'pants', bc: '#3a3a3a', shoe: '#2b2b2b', glasses: true, beard: true, l1: 'Pelado, lentes, barba', l2: 'Camisa y pantalón' },
  { id: 'c8', hair: 'pony', hc: '#8a5a3a', skin: '#e0b48e', top: 'blazer', tc: '#fafafa', jc: '#d8cbb5', inner: 'blouse', bottom: 'skirt', bc: '#3a3a3a', shoe: '#2b2b2b', l1: 'Colita', l2: 'Saco, blusa y pollera' },
]
export const DANI = {
  id: 'dani', hair: 'long_up', hc: '#2a1c16', skin: '#f1d0b8', top: 'blazer', tc: '#fafafa', jc: '#1f2a3d', inner: 'vblouse', bottom: 'pants', bc: '#2b2b2b', shoe: '#2b2b2b',
  glasses: 'square', studs: true, necklace: true, face: 'oval', slim: true, l1: 'Daniela', l2: 'Saco azul, blusa blanca, lentes cuadrados y cadenita',
}

function head(c, expr) {
  const H = c.hc, K = c.skin, st = c.hair
  const s = []
  if (st === 'long') s.push(`<rect x="-19" y="-190" width="38" height="50" rx="15" fill="${H}"/>`)
  if (st === 'curls') for (const [x, y, r] of [[-14, -184, 9], [-4, -192, 10], [7, -192, 10], [16, -183, 9], [-19, -171, 7], [19, -171, 7]]) s.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${H}"/>`)
  if (st === 'bun') s.push(`<circle cx="0" cy="-195" r="7.5" fill="${H}"/>`)
  if (st === 'pony') s.push(`<ellipse cx="17" cy="-170" rx="5" ry="13" fill="${H}"/>`)
  if (c.face === 'oval') {
    s.push(`<circle cx="-13.5" cy="-169" r="3" fill="${K}"/><circle cx="13.5" cy="-169" r="3" fill="${K}"/>`)
    s.push(`<path d="M-13.5 -176 C-13.5 -186 -8 -190 0 -190 C8 -190 13.5 -186 13.5 -176 L13 -166 C12 -157 6 -151 0 -151 C-6 -151 -12 -157 -13 -166 Z" fill="${K}"/>`)
  } else {
    s.push(`<circle cx="-15" cy="-168" r="3.5" fill="${K}"/><circle cx="15" cy="-168" r="3.5" fill="${K}"/>`)
    s.push(`<rect x="-15" y="-188" width="30" height="36" rx="14" fill="${K}"/>`)
  }
  if (st === 'short') s.push(`<path d="M-15.5 -174 C-17 -195 17 -195 15.5 -174 C10 -185 -4 -186 -15.5 -174 Z" fill="${H}"/>`)
  else if (st === 'buzz') s.push(`<path d="M-15 -177 C-14 -192 14 -192 15 -177 C8 -185 -8 -185 -15 -177 Z" fill="${H}"/>`)
  else if (st === 'curls') for (const [x, y, r] of [[-9, -186, 6.5], [0, -188.5, 7], [9, -186, 6.5]]) s.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${H}"/>`)
  else if (st === 'long') s.push(`<path d="M-15.5 -170 C-16 -195 16 -195 15.5 -170 C12 -182 2 -185 -5 -181 C-10 -178 -13 -175 -15.5 -170 Z" fill="${H}"/>`)
  else if (st === 'long_up') s.push(`<path d="M-14.5 -172 C-16 -198 16 -198 14.5 -172 C12 -183 7 -188 0 -188 C-7 -188 -12 -183 -14.5 -172 Z" fill="${H}"/>`)
  else if (st === 'bun' || st === 'pony') s.push(`<path d="M-15.5 -174 C-16 -193 16 -193 15.5 -174 C8 -184 -8 -184 -15.5 -174 Z" fill="${H}"/>`)
  if (c.beard) s.push(`<path d="M-15 -169 C-15 -145 15 -145 15 -169 C10 -158 -10 -158 -15 -169 Z" fill="${c.hair !== 'bald' ? c.hc : '#3a2a20'}"/>`)
  // cejas
  if (expr === 'worried') s.push('<path d="M-10 -176 L-3 -179 M10 -176 L3 -179" fill="none" stroke-width="1.4"/>')
  else if (expr !== 'sleep') s.push('<path d="M-9 -178 H-3 M3 -178 H9" fill="none" stroke-width="1.4"/>')
  // ojos
  if (expr === 'normal' || expr === 'happy_open') s.push(`<ellipse cx="-6" cy="-170" rx="1.8" ry="2.4" fill="${O}" stroke="none"/><ellipse cx="6" cy="-170" rx="1.8" ry="2.4" fill="${O}" stroke="none"/>`)
  else if (expr === 'worried') s.push(`<ellipse cx="-6" cy="-170" rx="2.1" ry="2.9" fill="${O}" stroke="none"/><ellipse cx="6" cy="-170" rx="2.1" ry="2.9" fill="${O}" stroke="none"/>`)
  else if (expr === 'relaxed') s.push('<path d="M-8.5 -169 Q-6 -172.5 -3.5 -169 M3.5 -169 Q6 -172.5 8.5 -169" fill="none" stroke-width="1.4"/>')
  else if (expr === 'sleep') s.push('<path d="M-8.5 -170 Q-6 -167.5 -3.5 -170 M3.5 -170 Q6 -167.5 8.5 -170" fill="none" stroke-width="1.4"/>')
  // nariz
  s.push('<path d="M0 -167 Q2.6 -163.5 0 -161.5" fill="none" stroke-width="1.3"/>')
  const boca = c.beard ? '#f4f3ef' : O
  if (c.mustache) s.push(`<path d="M-6.5 -160 Q0 -164 6.5 -160 Q0 -158.6 -6.5 -160 Z" fill="${c.hc}" stroke-width="1"/>`)
  if (expr === 'worried') s.push(`<path d="M-5 -156.5 q1.7 -1.5 3.3 0 q1.7 1.5 3.3 0 q1.7 -1.5 3.4 0" fill="none" stroke="${boca}" stroke-width="1.3"/>`)
  else if (expr === 'sleep') s.push(`<ellipse cx="0" cy="-156.5" rx="1.6" ry="1.3" fill="${boca}" stroke="none"/>`)
  else if (!c.mustache) s.push(`<path d="M-4 -157.5 Q0 -155 4 -157.5" fill="none" stroke="${boca}" stroke-width="1.3"/>`)
  else s.push(`<path d="M-3 -156 Q0 -154.5 3 -156" fill="none" stroke="${boca}" stroke-width="1.2"/>`)
  if (c.glasses === 'square') s.push('<rect x="-11" y="-174.5" width="10" height="8.5" rx="1.5" fill="none" stroke-width="1.4"/><rect x="1" y="-174.5" width="10" height="8.5" rx="1.5" fill="none" stroke-width="1.4"/><path d="M-1 -171 H1 M-11 -172 H-13.5 M11 -172 H13.5" stroke-width="1.3"/>')
  else if (c.glasses) s.push('<circle cx="-6" cy="-170" r="4.6" fill="none" stroke-width="1.3"/><circle cx="6" cy="-170" r="4.6" fill="none" stroke-width="1.3"/><path d="M-1.4 -170 H1.4" stroke-width="1.3"/>')
  if (c.nose_piercing) s.push('<circle cx="2.4" cy="-162" r="1.1" fill="#d9d9d9" stroke="none"/>')
  if (c.ear_piercing) s.push('<circle cx="-16" cy="-164.5" r="1.3" fill="#d9d9d9" stroke="none"/><circle cx="-17.5" cy="-169" r="1" fill="#d9d9d9" stroke="none"/>')
  if (c.studs) s.push('<circle cx="-14" cy="-165" r="1.2" fill="#e6e6e6" stroke-width="0.8"/><circle cx="14" cy="-165" r="1.2" fill="#e6e6e6" stroke-width="0.8"/>')
  if (c.earrings) s.push('<circle cx="-15.5" cy="-163" r="2" fill="#d9b45a" stroke-width="1"/><circle cx="15.5" cy="-163" r="2" fill="#d9b45a" stroke-width="1"/>')
  return s.join('')
}

const TORSO = 'M-20 -138 Q-20 -147 -12 -147 H12 Q20 -147 20 -138 L18 -92 H-18 Z'

function torso(c) {
  const s = []
  const t = c.top
  if (t === 'blazer') {
    const inner = c.inner ?? 'tee'
    s.push(`<path d="${TORSO}" fill="${c.tc}"/>`)
    if (inner === 'tee') s.push('<path d="M-6 -147 Q0 -141 6 -147" fill="none" stroke-width="1.2"/>')
    else if (inner === 'vblouse') s.push(`<path d="M-6 -147 L0 -131 L6 -147 Z" fill="${c.skin}" stroke-width="1.2"/>`)
    else s.push('<path d="M-6 -147 Q0 -139 6 -147" fill="none" stroke-width="1.2"/>')
    const J = c.jc
    s.push(`<path d="M-20 -138 Q-20 -147 -12 -147 H-6 L-2 -122 L-5 -92 H-18 Z" fill="${J}"/>`)
    s.push(`<path d="M20 -138 Q20 -147 12 -147 H6 L2 -122 L5 -92 H18 Z" fill="${J}"/>`)
    s.push('<path d="M-6 -147 L-10 -134 L-3 -128 M6 -147 L10 -134 L3 -128" fill="none" stroke-width="1.2"/>')
    s.push(`<circle cx="-4" cy="-110" r="1" fill="${O}" stroke="none"/>`)
    if (c.necklace) s.push('<path d="M-4.6 -147 Q-2.5 -138 0 -137.5 Q2.5 -138 4.6 -147" fill="none" stroke="#b9bec4" stroke-width="0.9"/><circle cx="0" cy="-136.6" r="1.3" fill="#e4e7ea" stroke="#9aa0a7" stroke-width="0.6"/>')
    return s.join('')
  }
  s.push(`<path d="${TORSO}" fill="${c.tc}"/>`)
  if (t === 'tee') s.push('<path d="M-6 -147 Q0 -141 6 -147" fill="none" stroke-width="1.2"/>')
  else if (t === 'shirt' || t === 'shirt_tie') {
    s.push('<path d="M-7 -147 L0 -140 L7 -147" fill="none" stroke-width="1.2"/>')
    if (t === 'shirt_tie') s.push(`<path d="M0 -141 L-3 -137 L0 -110 L3 -137 Z" fill="${c.tie}" stroke-width="1.1"/>`)
    else for (const y of [-133, -122, -111, -100]) s.push(`<circle cx="0" cy="${y}" r="0.9" fill="${O}" stroke="none"/>`)
  } else if (t === 'polo') {
    s.push('<path d="M-7 -147 L-2 -142 L0 -147 M7 -147 L2 -142 L0 -147 M0 -147 V-134" fill="none" stroke-width="1.2"/>')
    s.push(`<circle cx="0" cy="-139" r="0.8" fill="${O}" stroke="none"/><circle cx="0" cy="-135" r="0.8" fill="${O}" stroke="none"/>`)
  } else if (t === 'blouse') s.push('<path d="M-7 -147 Q0 -137 7 -147" fill="none" stroke-width="1.2"/>')
  return s.join('')
}

const sleeve = c => (c.top === 'blazer' ? [c.jc, true] : [c.tc, ['shirt', 'shirt_tie', 'blouse'].includes(c.top)])

function arms(c, pose) {
  const K = c.skin
  const [col, largo] = sleeve(c)
  const s = []
  if (['stand', 'sleep', 'work', 'break_l'].includes(pose)) {
    const sides = pose !== 'break_l' ? [-1, 1] : [-1]
    const h = pose === 'work' ? 22 : 48
    for (const sd of sides) {
      const x = sd > 0 ? 20 : -29
      const hy = -143 + h + 2
      s.push(`<rect x="${x}" y="-143" width="9" height="${h}" rx="4.5" fill="${K}"/>`)
      if (largo) s.push(`<rect x="${x}" y="-143" width="9" height="${h - 3}" rx="4.5" fill="${col}"/>`)
      else {
        s.push(`<rect x="${x}" y="-143" width="9" height="17" rx="4.5" fill="${col}"/>`)
        if (c.tattoo && sd < 0 && h > 30) s.push('<path d="M-25.5 -120 q2 2 0 4 q-2 2 0 4 M-26 -107 l3 0" fill="none" stroke-width="1"/>')
      }
      s.push(`<circle cx="${sd * 24.5}" cy="${hy}" r="4.5" fill="${K}"/>`)
    }
  }
  return s.join('')
}

function armCup(c) {
  const K = c.skin
  const [col, largo] = sleeve(c)
  const s = []
  const path = 'M24 -140 L27 -116 L14 -122'
  s.push(`<path d="${path}" fill="none" stroke="${O}" stroke-width="${9 + 2 * SW}" stroke-linecap="round" stroke-linejoin="round"/>`)
  s.push(`<path d="${path}" fill="none" stroke="${K}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`)
  const sp = largo ? path : 'M24 -140 L25.5 -128'
  s.push(`<path d="${sp}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`)
  s.push('<rect x="3" y="-136" width="11" height="13" rx="2" fill="#fafafa"/><path d="M3 -132 h-3 v5 h3" fill="none" stroke-width="1.2"/>')
  s.push(`<circle cx="14" cy="-124" r="4.5" fill="${K}"/>`)
  s.push('<path d="M6 -140 q-2 -3 0 -6 M10 -140 q-2 -3 0 -6" fill="none" stroke="#b5ada2" stroke-width="1.2"/>')
  return s.join('')
}

function armsRaised(c) {
  const K = c.skin
  const [col, largo] = sleeve(c)
  const s = []
  for (const sd of [-1, 1]) {
    const p = `M${sd * 21} -140 C${sd * 34} -150 ${sd * 32} -166 ${sd * 20} -174`
    s.push(`<path d="${p}" fill="none" stroke="${O}" stroke-width="${9 + 2 * SW}" stroke-linecap="round"/>`)
    s.push(`<path d="${p}" fill="none" stroke="${K}" stroke-width="9" stroke-linecap="round"/>`)
    const sp = largo ? p : `M${sd * 21} -140 C${sd * 27} -144 ${sd * 30} -148 ${sd * 31} -152`
    s.push(`<path d="${sp}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/>`)
    s.push(`<circle cx="${sd * 19}" cy="-176" r="4.5" fill="${K}"/>`)
  }
  // gota de sudor
  s.push('<path d="M23 -192 q3.5 4.5 0 6.5 q-3.5 -2 0 -6.5 z" fill="#9cc7e8" stroke-width="1"/>')
  return s.join('')
}

function legs(c, sit) {
  const b = c.bottom, B = c.bc, S = c.shoe, K = c.skin
  const s = []
  if (!sit) {
    if (b === 'pants') {
      s.push(`<rect x="-17.5" y="-94" width="16" height="88" rx="2" fill="${B}"/><rect x="1.5" y="-94" width="16" height="88" rx="2" fill="${B}"/>`)
      if (['shirt', 'shirt_tie', 'polo'].includes(c.top)) s.push(`<rect x="-18" y="-96" width="36" height="4" rx="1" fill="${O}" stroke="none"/>`)
    } else {
      s.push(`<rect x="-12" y="-64" width="8" height="58" rx="3" fill="${K}"/><rect x="4" y="-64" width="8" height="58" rx="3" fill="${K}"/>`)
      s.push(`<path d="M-18 -94 H18 L22 -58 Q0 -55 -22 -58 Z" fill="${B}"/>`)
    }
    s.push(`<rect x="-19" y="-7" width="17" height="7" rx="3.5" fill="${S}"/><rect x="2" y="-7" width="17" height="7" rx="3.5" fill="${S}"/>`)
  } else {
    if (b === 'pants') {
      s.push(`<rect x="-16" y="-46" width="12" height="40" rx="3" fill="${B}"/><rect x="4" y="-46" width="12" height="40" rx="3" fill="${B}"/>`)
      s.push(`<rect x="-18" y="-55" width="36" height="13" rx="5" fill="${B}"/>`)
    } else {
      s.push(`<rect x="-14" y="-46" width="9" height="40" rx="3" fill="${K}"/><rect x="5" y="-46" width="9" height="40" rx="3" fill="${K}"/>`)
      s.push(`<rect x="-20" y="-57" width="40" height="15" rx="6" fill="${B}"/>`)
    }
    s.push(`<rect x="-18" y="-7" width="15" height="7" rx="3.5" fill="${S}"/><rect x="3" y="-7" width="15" height="7" rx="3.5" fill="${S}"/>`)
  }
  return s.join('')
}

const EXPR = { stand: 'normal', work: 'happy_open', problem: 'worried', break: 'relaxed', sleep: 'sleep' }

// Una persona (c: un personaje de CAST, DANI o una variación) en una pose: stand | work | problem | break | sleep.
export function person(c, pose) {
  const sit = ['work', 'problem', 'sleep'].includes(pose)
  const dy = sit ? 46 : 0
  const expr = EXPR[pose]
  const s = [`<g stroke="${O}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round">`]
  const up = `<g transform="translate(0 ${dy})">`
  const sx = c.slim ? ' scale(0.88 1)' : ''
  if (c.hair === 'long_up') {
    const rot = pose === 'sleep' ? ' transform="rotate(-14 0 -150)"' : ''
    s.push(`${up}<g${rot}><rect x="-18" y="-194" width="36" height="58" rx="15" fill="${c.hc}"/></g></g>`)
  }
  s.push(`<g transform="translate(0 ${dy})${sx}"><rect x="-4" y="-154" width="8" height="9" fill="${c.skin}"/>${torso(c)}</g>`)
  if (c.hair === 'long_up') {
    const H = c.hc
    s.push(`${up}<path d="M-11 -153 Q-19 -152 -20 -141 L-19 -114 H-12 L-12 -141 Z" fill="${H}"/><path d="M11 -153 Q19 -152 20 -141 L19 -114 H12 L12 -141 Z" fill="${H}"/></g>`)
  }
  s.push(c.slim ? `<g transform="scale(0.9 1)">${legs(c, sit)}</g>` : legs(c, sit))
  s.push(`<g transform="translate(0 ${dy})${sx}">`)
  if (pose === 'stand') s.push(arms(c, 'stand'))
  else if (pose === 'work') s.push(arms(c, 'work'))
  else if (pose === 'sleep') s.push(arms(c, 'sleep'))
  else if (pose === 'break') s.push(arms(c, 'break_l'))
  if (sx) s.push(`</g>${up}`)
  s.push(pose === 'sleep' ? `<g transform="rotate(-14 0 -150)">${head(c, expr)}</g>` : head(c, expr))
  if (pose === 'problem') s.push(armsRaised(c))
  if (pose === 'break') s.push(armCup(c))
  s.push('</g></g>')
  return s.join('')
}

// Dónde queda lo más alto de la cabeza (para poner el globito arriba).
export function headTop(c, pose) {
  const top = c.hair === 'bun' ? -203 : c.hair === 'curls' ? -202 : -195
  return top + (['work', 'problem', 'sleep'].includes(pose) ? 46 : 0)
}

// El globito chico de arriba de la cabeza.
export function badge(state, x, y) {
  const col = ESTADO[state]
  if (state === 'work') return `<g transform="translate(${x} ${y})"><rect x="-13" y="-8" width="26" height="16" rx="8" fill="#ffffff" stroke="${O}" stroke-width="1.4"/><circle cx="-6" cy="0" r="2" fill="${col}"/><circle cx="0" cy="0" r="2" fill="${col}"/><circle cx="6" cy="0" r="2" fill="${col}"/></g>`
  if (state === 'problem') return `<g transform="translate(${x} ${y})"><circle r="9" fill="${col}" stroke="${O}" stroke-width="1.4"/><path d="M0 -4.5 V1" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><circle cy="4.2" r="1.3" fill="#ffffff"/></g>`
  if (state === 'break') return `<g transform="translate(${x} ${y})"><circle r="9" fill="${col}" stroke="${O}" stroke-width="1.4"/><path d="M-4 -3 H2.5 V1 A3 3 0 0 1 -0.5 4 A3 3 0 0 1 -4 1 Z M2.5 -2 H4.5 V1.5 H2.5" fill="#ffffff"/></g>`
  return `<g transform="translate(${x} ${y})" font-family="Inter, sans-serif" font-weight="700" fill="${col}"><text font-size="13">z</text><text x="8" y="-8" font-size="10">z</text></g>`
}

// ---------- Muebles ----------
export const chair = (x, floor) => `<g transform="translate(${x} ${floor})" stroke="${O}" stroke-width="${SW}"><rect x="-15" y="-98" width="30" height="46" rx="5" fill="#3a3a3a"/><rect x="-20" y="-54" width="40" height="5" rx="2" fill="#3a3a3a"/><path d="M0 -49 V-6 M-14 -3 H14" fill="none" stroke-width="2.4"/></g>`

export function desk(x, floor, w, mx, state) {
  const top = floor - 74
  const scr = state === 'work' ? ESTADO.work : state === 'problem' ? ESTADO.problem : '#d9d6cf'
  const s = [`<g stroke="${O}" stroke-width="${SW}">`]
  s.push(`<rect x="${mx}" y="${top - 38}" width="48" height="32" rx="3" fill="#2b2b2b"/>`)
  s.push(`<rect x="${mx + 3}" y="${top - 35}" width="42" height="26" rx="1.5" fill="${scr}" stroke="none"/>`)
  if (state === 'work') s.push(`<path d="M${mx + 9} ${top - 27} H${mx + 37} M${mx + 9} ${top - 21} H${mx + 31} M${mx + 9} ${top - 15} H${mx + 34}" stroke="#ffffff" stroke-width="1.6" opacity=".8"/>`)
  if (state === 'problem') s.push(`<path d="M${mx + 24} ${top - 30} V${top - 20}" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><circle cx="${mx + 24}" cy="${top - 14.5}" r="1.5" fill="#ffffff" stroke="none"/>`)
  s.push(`<path d="M${mx + 24} ${top - 6} V${top}" fill="none" stroke-width="2.4"/>`)
  s.push(`<rect x="${x}" y="${top}" width="${w}" height="5" rx="1.5" fill="#d9c4a5"/>`)
  s.push(`<path d="M${x + 6} ${top + 5} V${floor} M${x + w - 6} ${top + 5} V${floor}" fill="none" stroke-width="2.2"/>`)
  s.push('</g>')
  return s.join('')
}

export const sofaBack = (x, floor, w) => `<rect x="${x}" y="${floor - 96}" width="${w}" height="50" rx="10" fill="#cdd5cc" stroke="${O}" stroke-width="${SW}"/><rect x="${x - 6}" y="${floor - 52}" width="${w + 12}" height="22" rx="6" fill="#dde3dc" stroke="${O}" stroke-width="${SW}"/>`

export const sofaFront = (x, floor, w) => `<g stroke="${O}" stroke-width="${SW}"><rect x="${x - 16}" y="${floor - 74}" width="16" height="50" rx="6" fill="#cdd5cc"/><rect x="${x + w}" y="${floor - 74}" width="16" height="50" rx="6" fill="#cdd5cc"/><path d="M${x - 8} ${floor - 24} V${floor - 8} M${x + w + 8} ${floor - 24} V${floor - 8}" fill="none" stroke-width="2.6"/></g>`

// Los objetos de la pared y del piso (del archivo, con la posición como parámetro).
export const lamp = lx => `<path d="M${lx} 0 V150" stroke="${O}" stroke-width="1.5"/><path d="M${lx - 18} 166 A18 18 0 0 1 ${lx + 18} 166 Z" fill="${O}"/>`
export const cuadro1 = x => `<rect x="${x}" y="200" width="70" height="90" fill="#ffffff" stroke="${O}" stroke-width="1.6"/><circle cx="${x + 35}" cy="235" r="14" fill="#c9775a"/><path d="M${x + 12} 272 H${x + 58}" stroke="${O}" stroke-width="1.6"/>`
export const cuadro2 = x => `<rect x="${x}" y="210" width="60" height="70" fill="#ffffff" stroke="${O}" stroke-width="1.6"/><rect x="${x + 13}" y="224" width="34" height="34" fill="#9bb0a0"/>`
export const reloj = cx => `<circle cx="${cx}" cy="130" r="22" fill="#ffffff" stroke="${O}" stroke-width="1.6"/><path d="M${cx} 130 V116 M${cx} 130 L${cx + 9} 135" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/>`
export function estante(x) {
  const s = [`<path d="M${x} 250 H${x + 190}" stroke="${O}" stroke-width="1.6"/>`]
  for (const dx of [15, 33, 51]) s.push(`<rect x="${x + dx}" y="236" width="12" height="14" rx="2" fill="#ffffff" stroke="${O}" stroke-width="1.4"/>`)
  s.push(`<rect x="${x + 145}" y="220" width="30" height="30" rx="2" fill="#9bb0a0" stroke="${O}" stroke-width="1.4"/>`)
  return s.join('')
}
export const ventana = x => `<rect x="${x}" y="90" width="200" height="150" fill="#e3ecef" stroke="${O}" stroke-width="1.6"/><path d="M${x + 100} 90 V240" stroke="${O}" stroke-width="1.6"/>`
export const planta = (x, floor) => `<g stroke="${O}" stroke-width="1.6"><path d="M${x} ${floor - 40} C${x - 20} ${floor - 66} ${x - 18} ${floor - 92} ${x - 4} ${floor - 108} C${x + 6} ${floor - 90} ${x + 6} ${floor - 64} ${x} ${floor - 40} Z" fill="#7f9c86"/><path d="M${x} ${floor - 40} C${x + 18} ${floor - 60} ${x + 22} ${floor - 82} ${x + 14} ${floor - 98} C${x + 4} ${floor - 82} ${x + 2} ${floor - 60} ${x} ${floor - 40} Z" fill="#9bb0a0"/><path d="M${x - 14} ${floor - 40} H${x + 14} L${x + 10} ${floor} H${x - 10} Z" fill="#ffffff"/></g>`
// Cafetera negra con una luz naranja, sobre la mesada (top: y de la tapa de la mesada).
export const cafetera = (x, top) => `<g stroke="${O}" stroke-width="1.6"><rect x="${x}" y="${top - 42}" width="34" height="42" rx="3" fill="#2b2b2b"/><rect x="${x + 6}" y="${top - 36}" width="22" height="7" rx="1.5" fill="#e8973a" stroke="none"/></g>`
export const mesada = (x, top, w, floor) => `<g stroke="${O}" stroke-width="1.6"><rect x="${x + 4}" y="${top + 6}" width="${w - 8}" height="${floor - top - 6}" fill="#ffffff"/><rect x="${x}" y="${top}" width="${w}" height="7" rx="1.5" fill="#d9c4a5"/></g>`
