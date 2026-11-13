// Por dónde puede caminar Daniela cuando hace doble click en la Oficina: una grilla del piso con las paredes, vidrios
// y muebles marcados (con las puertas libres) y el camino más corto que los esquiva (A*), suavizado para que vaya en
// línea recta donde puede. Las medidas de los muebles son las de oficina3d/mundo.js.
import {
  PISO, ZONAS, PUFS, MESA_REUNION, PUERTA_REUNION, DIRECCION, DANIELA, VISITA, ROBERTA, MUEBLES_DIRECCION, OFICINAS, DIVISOR,
  asientosReunion, LIVING, COCINA, MESA_CHICA_DANIELA, MESA_CHICA_MARIA, PLANTAS_DANIELA, mesaUp, mesaPdg, mesaAdmin, mesaSistemas, RINCON_ENTRADA, RINCON_TABLONES, EXPENDEDORAS, SALA_SERVIDORES, ARCHIVO, MACETONES, PIZARRONES, huellaPizarron,
} from './oficinaPlano.mjs'

export const CELDA = 0.25
const RADIO = 0.24 // lo que ocupa una persona: se agranda cada obstáculo esto

// Rectángulos que no se pueden pisar: { x0, x1, y0, y1 }. lugares: los de todos los agentes (oficinas y tablones).
// nUp, nPdg, nAdmin: cuántos hay en cada tablón (el largo de la mesa depende de eso).
export function obstaculos(lugares, nUp, nPdg = 0, nAdmin = 0, nSistemas = 0) {
  const r = []
  const rect = (x0, x1, y0, y1) => r.push({ x0, x1, y0, y1 })
  const circulo = (x, y, radio) => rect(x - radio, x + radio, y - radio, y + radio)
  const pared = 0.06
  // Oficinas (las de los trabajadores y la de María): paredes, frente de vidrio con puerta y pared del fondo.
  const oficinas = new Map()
  for (const l of lugares) if (l.oficina) oficinas.set(l.oficina.id, l.oficina)
  for (const o of oficinas.values()) {
    rect(o.x0 - pared, o.x0 + pared, o.y0, o.y1)
    rect(o.x1 - pared, o.x1 + pared, o.y0, o.y1)
    rect(o.x0, o.puerta.x - 0.5, o.y1 - pared, o.y1 + pared)
    rect(o.puerta.x + 0.5, o.x1, o.y1 - pared, o.y1 + pared)
    if (o.y0 > 0) rect(o.x0, o.x1, o.y0 - pared, o.y0 + pared)
    if (o.jefa) {
      const zona = o.x1 - 2.6
      rect(o.x0 + 0.2, o.x0 + 2.6, o.y0, o.y0 + 0.5)
      rect(zona, o.x1, o.y0 + 2.15, o.y0 + 3.55)
      circulo(zona - 0.55, o.y0 + 3.75, 0.38)
      circulo(o.x0 + MESA_CHICA_MARIA.dx, o.y0 + MESA_CHICA_MARIA.dy, 1.05)
    }
  }
  rect(OFICINAS.x0, OFICINAS.x1, OFICINAS.y0 - pared, OFICINAS.y0 + pared)
  for (const o of oficinas.values()) if (o.sofa) rect(o.sofa.x0, o.sofa.x1, o.sofa.y0, o.sofa.y1)
  const RT = RINCON_TABLONES
  circulo(RT.mesa.x, RT.mesa.y, RT.mesa.radio)
  for (const [x, y] of RT.banquetas) circulo(x, y, 0.2)
  rect(RT.pizarra.x0, RT.pizarra.x1, RT.pizarra.y - 0.15, RT.pizarra.y + 0.15)
  for (const [x, y] of RT.macetones) circulo(x, y, 0.4)
  for (const m of EXPENDEDORAS) rect(m.x0, m.x1, m.y0, m.y1)
  for (const p of PIZARRONES) { const h = huellaPizarron(p); rect(h.x0, h.x1, h.y0, h.y1) }
  // Escritorios y sillas de cada agente.
  for (const l of lugares) {
    if (l.escritorio) {
      const a = l.jefa ? 1.15 : 0.82, f = l.jefa ? 0.55 : 0.42
      rect(l.escritorio.x - a, l.escritorio.x + a, l.escritorio.y - f, l.escritorio.y + f)
    }
    circulo(l.sentado.x, l.sentado.y, 0.3)
  }
  // Tablones y la mampara (con su paso en el medio).
  for (const { mesa } of [mesaUp(nUp), mesaPdg(nPdg), mesaAdmin(nAdmin), mesaSistemas(nSistemas)]) rect(mesa.x0, mesa.x1, mesa.y0, mesa.y1)
  for (const c of RINCON_ENTRADA.sillones) circulo(c.x, c.y, 0.5)
  circulo(RINCON_ENTRADA.mesa.x, RINCON_ENTRADA.mesa.y, RINCON_ENTRADA.mesa.radio)
  // El Archivo: paredes (la puerta da al pasillo) y estanterías.
  const AR = ARCHIVO
  rect(AR.x0, AR.x1, AR.y0 - pared, AR.y0 + pared)
  rect(AR.x0, AR.x1, AR.y1 - pared, AR.y1 + pared)
  rect(AR.x0 - pared, AR.x0 + pared, AR.y0, AR.y1)
  rect(AR.x1 - pared, AR.x1 + pared, AR.y0, AR.puerta.y0)
  rect(AR.x1 - pared, AR.x1 + pared, AR.puerta.y1, AR.y1)
  for (const e of AR.estantes) rect(e.x0, e.x1, e.y0, e.y1)
  // La sala de servidores: vidrios (la puerta del lado de la entrada), racks y el aire acondicionado.
  const SV = SALA_SERVIDORES
  rect(SV.x0, SV.x1, SV.y0 - pared, SV.y0 + pared)
  rect(SV.x0, SV.x1, SV.y1 - pared, SV.y1 + pared)
  rect(SV.x1 - pared, SV.x1 + pared, SV.y0, SV.y1)
  rect(SV.x0 - pared, SV.x0 + pared, SV.y0, SV.puerta.y0)
  rect(SV.x0 - pared, SV.x0 + pared, SV.puerta.y1, SV.y1)
  for (const k of [...SV.racks, SV.aire]) rect(k.x0, k.x1, k.y0, k.y1)
  for (const [x, y] of MACETONES) circulo(x, y, 0.4)
  rect(DIVISOR.x0, DIVISOR.hueco[0], DIVISOR.y - 0.15, DIVISOR.y + 0.15)
  rect(DIVISOR.hueco[1], DIVISOR.x1, DIVISOR.y - 0.15, DIVISOR.y + 0.15)
  // Sala de reuniones: vidrios (la puerta, del lado de la pantalla), mesa redonda y sillas.
  const R = ZONAS.reuniones
  rect(R.x0, R.x1, R.y0 - pared, R.y0 + pared)
  rect(R.x0, R.x1, R.y1 - pared, R.y1 + pared)
  rect(R.x0 - pared, R.x0 + pared, R.y0, R.y1)
  rect(R.x1 - pared, R.x1 + pared, R.y0, PUERTA_REUNION.y - 0.5)
  rect(R.x1 - pared, R.x1 + pared, PUERTA_REUNION.y + 0.5, R.y1)
  circulo(MESA_REUNION.x, MESA_REUNION.y, MESA_REUNION.radio)
  for (const a of asientosReunion()) if (a.pose === 'sentado') circulo(a.x, a.y, 0.3)
  // Cafetería, comedor, ocio y ping pong.
  rect(1.0, 9.5, 8.3, 9.1)
  for (const x of [2.0, 3.6, 5.2, 6.8]) circulo(x, 9.9, 0.22)
  circulo(10.5, 11.9, 0.45)
  for (const [x0, x1] of [[1.5, 4.1], [5.8, 8.4]]) {
    rect(x0, x1, 15.5, 16.5)
    for (const x of [x0 + 0.65, x0 + 1.95]) { circulo(x, 14.85, 0.3); circulo(x, 17.15, 0.3) }
  }
  rect(COCINA.x0, COCINA.x1, COCINA.y0, COCINA.y1)
  rect(0.9, 5.3, 0.8, 2.2)
  rect(2.2, 4.0, 3.4, 4.2)
  for (const p of PUFS) circulo(p.x, p.y, 0.45)
  rect(8.6, 12.4, 3, 4.6)
  // La oficina de Daniela: pared con la de María, frente de vidrio (puerta al corredor), sus muebles y la camita.
  const Dd = DIRECCION, M = MUEBLES_DIRECCION
  rect(Dd.x0 - pared, Dd.x0 + pared, Dd.y0, Dd.y1)
  rect(Dd.x0, Dd.puerta.x - 0.5, Dd.y1 - pared, Dd.y1 + pared)
  rect(Dd.puerta.x + 0.5, Dd.x1, Dd.y1 - pared, Dd.y1 + pared)
  for (const b of [M.biblioteca, M.sillon, M.bano]) rect(b.x0, b.x1, b.y0, b.y1)
  rect(Dd.x0, Dd.x0 + 0.5, M.tele.y0, M.tele.y1)
  circulo(M.mesita.x, M.mesita.y, M.mesita.radio)
  rect(DANIELA.escritorio.x - 1.3, DANIELA.escritorio.x + 1.3, DANIELA.escritorio.y - 0.6, DANIELA.escritorio.y + 0.6)
  circulo(DANIELA.sentado.x, DANIELA.sentado.y, 0.35)
  circulo(VISITA.x, VISITA.y, 0.3)
  circulo(ROBERTA.cama.x, ROBERTA.cama.y, 0.35)
  circulo(MESA_CHICA_DANIELA.x, MESA_CHICA_DANIELA.y, 1.3)
  for (const p of PLANTAS_DANIELA) circulo(p.x, p.y, 0.3 * p.escala)
  for (const m of Object.values(LIVING)) rect(m.x0, m.x1, m.y0, m.y1)
  return r
}

// Grilla: true = libre. Los bordes del piso no se pisan.
export function grilla(obs) {
  const cols = Math.ceil(PISO.ancho / CELDA), filas = Math.ceil(PISO.fondo / CELDA)
  const libre = new Uint8Array(cols * filas).fill(1)
  const marcar = (x0, x1, y0, y1) => {
    // Una celda queda ocupada si su centro cae dentro del obstáculo agrandado (así las puertas de 1 m quedan libres).
    const c0 = Math.max(0, Math.ceil((x0 - RADIO) / CELDA - 0.5)), c1 = Math.min(cols - 1, Math.floor((x1 + RADIO) / CELDA - 0.5))
    const f0 = Math.max(0, Math.ceil((y0 - RADIO) / CELDA - 0.5)), f1 = Math.min(filas - 1, Math.floor((y1 + RADIO) / CELDA - 0.5))
    for (let f = f0; f <= f1; f++) for (let c = c0; c <= c1; c++) libre[f * cols + c] = 0
  }
  for (const o of obs) marcar(o.x0, o.x1, o.y0, o.y1)
  marcar(-1, 0.05, -1, PISO.fondo + 1)
  marcar(-1, PISO.ancho + 1, -1, 0.05)
  marcar(PISO.ancho - 0.05, PISO.ancho + 1, -1, PISO.fondo + 1)
  marcar(-1, PISO.ancho + 1, PISO.fondo - 0.05, PISO.fondo + 1)
  return { cols, filas, libre }
}

const celdaDe = (g, p) => ({ c: Math.min(g.cols - 1, Math.max(0, Math.floor(p.x / CELDA))), f: Math.min(g.filas - 1, Math.max(0, Math.floor(p.y / CELDA))) })
const centro = (c, f) => ({ x: (c + 0.5) * CELDA, y: (f + 0.5) * CELDA })
export const esLibre = (g, p) => { const { c, f } = celdaDe(g, p); return Boolean(g.libre[f * g.cols + c]) }

// La celda libre más cercana (por si hizo doble click sobre un mueble o una pared).
export function libreCercano(g, p, maxRadio = 12) {
  const { c, f } = celdaDe(g, p)
  if (g.libre[f * g.cols + c]) return centro(c, f)
  for (let r = 1; r <= maxRadio; r++) {
    let mejor = null, dMejor = Infinity
    for (let df = -r; df <= r; df++) for (let dc = -r; dc <= r; dc++) {
      if (Math.max(Math.abs(df), Math.abs(dc)) !== r) continue
      const cc = c + dc, ff = f + df
      if (cc < 0 || ff < 0 || cc >= g.cols || ff >= g.filas || !g.libre[ff * g.cols + cc]) continue
      const d = dc * dc + df * df
      if (d < dMejor) { dMejor = d; mejor = centro(cc, ff) }
    }
    if (mejor) return mejor
  }
  return null
}

// ¿Se puede ir en línea recta de a a b sin pisar nada?
function aLaVista(g, a, b) {
  const pasos = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELDA / 6))
  const e = 0.03 // también un poquito alrededor: así no roza las esquinas de los muebles
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
    for (const [dx, dy] of [[0, 0], [e, e], [-e, -e], [e, -e], [-e, e]]) if (!esLibre(g, { x: x + dx, y: y + dy })) return false
  }
  return true
}

// Camino de `desde` a `hasta` (en baldosas) esquivando obstáculos; null si no hay forma de llegar.
export function buscarCamino(g, desde, hasta) {
  const ini = libreCercano(g, desde), fin = libreCercano(g, hasta)
  if (!ini || !fin) return null
  const a = celdaDe(g, ini), b = celdaDe(g, fin)
  const idx = (c, f) => f * g.cols + c
  const n = g.cols * g.filas
  const costo = new Float32Array(n).fill(Infinity)
  const previo = new Int32Array(n).fill(-1)
  const cerrado = new Uint8Array(n)
  const h = (c, f) => { const dx = Math.abs(c - b.c), dy = Math.abs(f - b.f); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) }
  // Montículo binario simple de [prioridad, índice].
  const monticulo = []
  const meter = (p, i) => { monticulo.push([p, i]); let k = monticulo.length - 1; while (k > 0) { const m = (k - 1) >> 1; if (monticulo[m][0] <= monticulo[k][0]) break; [monticulo[m], monticulo[k]] = [monticulo[k], monticulo[m]]; k = m } }
  const sacar = () => {
    const top = monticulo[0], ult = monticulo.pop()
    if (monticulo.length) {
      monticulo[0] = ult
      let k = 0
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < monticulo.length && monticulo[l][0] < monticulo[m][0]) m = l; if (r < monticulo.length && monticulo[r][0] < monticulo[m][0]) m = r; if (m === k) break; [monticulo[m], monticulo[k]] = [monticulo[k], monticulo[m]]; k = m }
    }
    return top
  }
  costo[idx(a.c, a.f)] = 0
  meter(h(a.c, a.f), idx(a.c, a.f))
  const vecinos = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
  const meta = idx(b.c, b.f)
  while (monticulo.length) {
    const [, i] = sacar()
    if (cerrado[i]) continue
    if (i === meta) break
    cerrado[i] = 1
    const c = i % g.cols, f = (i / g.cols) | 0
    for (const [dc, df, paso] of vecinos) {
      const cc = c + dc, ff = f + df
      if (cc < 0 || ff < 0 || cc >= g.cols || ff >= g.filas) continue
      const j = idx(cc, ff)
      if (!g.libre[j] || cerrado[j]) continue
      if (dc && df && (!g.libre[idx(c + dc, f)] || !g.libre[idx(c, f + df)])) continue // no cortar esquinas
      const nuevo = costo[i] + paso
      if (nuevo < costo[j]) { costo[j] = nuevo; previo[j] = i; meter(nuevo + h(cc, ff), j) }
    }
  }
  if (!Number.isFinite(costo[meta])) return null
  const celdas = []
  for (let i = meta; i !== -1; i = previo[i]) celdas.push(centro(i % g.cols, (i / g.cols) | 0))
  celdas.reverse()
  celdas[0] = ini
  celdas[celdas.length - 1] = fin
  // Suavizado: de cada punto se salta al más lejano que se vea en línea recta.
  const suave = [celdas[0]]
  let k = 0
  while (k < celdas.length - 1) {
    let j = celdas.length - 1
    while (j > k + 1 && !aLaVista(g, celdas[k], celdas[j])) j--
    suave.push(celdas[j])
    k = j
  }
  return suave
}

// Un paso en la vista a pie: avanza d metros hacia donde mira (rumbo: 0 = hacia +y del plano, como el giro de los
// personajes). Si choca, prueba deslizarse por la pared (solo en x o solo en y); si tampoco puede, se queda donde está.
export function pasoAPie(g, pos, rumbo, d) {
  const dx = Math.sin(rumbo) * d, dy = Math.cos(rumbo) * d
  for (const p of [{ x: pos.x + dx, y: pos.y + dy }, { x: pos.x + dx, y: pos.y }, { x: pos.x, y: pos.y + dy }]) {
    if ((p.x !== pos.x || p.y !== pos.y) && esLibre(g, p)) return p
  }
  return { ...pos }
}
