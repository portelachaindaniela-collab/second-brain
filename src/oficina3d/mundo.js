// El edificio de la Oficina en 3D. Coordenadas: x del plano = x, y del plano = z, altura = y.
// Las medidas y los lugares salen de oficinaPlano.mjs.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  PISO, ZONAS, PUFS, MESA_REUNION, PUERTA_REUNION, asientosReunion, DIRECCION, DANIELA, VISITA, asientosEspera, estiloDe, CUADROS_PDG,
  MUEBLES_DIRECCION, ROBERTA, EJECUTIVO, X0, OFICINAS, DIVISOR, ENTRADA, alturaPiso,
} from '../oficinaPlano.mjs'
import { texturaCuadro, texturaAlfombra } from './cuadros.js'

export const COLORES = {
  pared: '#e9e1f7', paredLado: '#dcd0f2', zocalo: '#b49fdc', tabique: '#efe8fb',
  lila: '#b9a2e8', lilaClaro: '#e8dffa', rosa: '#f6a5c0', rosaClaro: '#fcdce6', menta: '#8fd9bd', mentaClaro: '#d6f3e8',
  durazno: '#f7b98b', duraznoClaro: '#fde5d2', amarillo: '#f6dd8b', amarilloClaro: '#fbf1cc', blanco: '#fffaf3', celeste: '#bfe3ff',
  madera: '#d9b07a', maderaOscura: '#8a5a36', nogal: '#6e432a', gris: '#8f86a8', grisClaro: '#d9d6e4', negro: '#2f2a3d',
  hoja: '#5fb36a', hojaB: '#4a9a57', maceta: '#e39a72', dorado: '#e2b552', cuero: '#7a4a35',
  trabajando: '#3fb878', error: '#e85d6a',
}

const materiales = new Map()
export function mat(color, extra = {}) {
  const clave = color + JSON.stringify(extra)
  if (!materiales.has(clave)) materiales.set(clave, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra }))
  return materiales.get(clave)
}
export function vaciarMateriales() { for (const m of materiales.values()) { m.map?.dispose(); m.dispose() } materiales.clear() }
const VIDRIO = () => mat('#cdeff7', { transparent: true, opacity: 0.2, roughness: 0.05, depthWrite: false })

// Caja por sus bordes: x0..x1, y0..y1 (alto), z0..z1. r: redondeo.
export function caja(x0, x1, y0, y1, z0, z1, material, { r = 0, sombra = true, recibe = true } = {}) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0
  const geo = r ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d)
  const m = new THREE.Mesh(geo, material)
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  m.castShadow = sombra
  m.receiveShadow = recibe
  return m
}
const cilindro = (x, z, r, y0, y1, material, rTop = r, seg = 20) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, y1 - y0, seg), material)
  m.position.set(x, (y0 + y1) / 2, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// Texto como textura (carteles y piso).
export function textoTextura(texto, { ancho = 512, alto = 128, fondo = null, color = '#fff', tam = 64, peso = 800 } = {}) {
  const c = document.createElement('canvas')
  c.width = ancho; c.height = alto
  const g = c.getContext('2d')
  if (fondo) { g.fillStyle = fondo; g.beginPath(); g.roundRect(0, 0, ancho, alto, alto * 0.18); g.fill() }
  g.fillStyle = color
  g.font = `${peso} ${tam}px system-ui, -apple-system, "Segoe UI", sans-serif`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(texto, ancho / 2, alto / 2 + 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
function textoEnPiso(texto, x, z, ancho = texto.length * 0.3) {
  const t = new THREE.Mesh(new THREE.PlaneGeometry(ancho, 0.55), new THREE.MeshBasicMaterial({ map: textoTextura(texto, { color: 'rgba(59,47,79,.42)', tam: 70, ancho: 768 }), transparent: true }))
  t.rotation.x = -Math.PI / 2
  t.position.set(x, 0.03, z)
  return t
}

// Piso de tablas de madera dibujado en un canvas (vetas y juntas).
function texturaPiso() {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 1024
  const g = c.getContext('2d')
  const tablas = 8, alto = c.height / tablas
  let semilla = 7
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647 }
  for (let i = 0; i < tablas; i++) {
    let x = -azar() * 400
    while (x < c.width) {
      const largo = 260 + azar() * 260
      const tono = 224 + azar() * 16
      g.fillStyle = `rgb(${tono}, ${tono * 0.87}, ${tono * 0.72})`
      g.fillRect(x, i * alto, largo, alto)
      g.strokeStyle = 'rgba(150, 105, 60, .10)'
      for (let v = 0; v < 6; v++) {
        const y = i * alto + 8 + azar() * (alto - 16)
        g.beginPath(); g.moveTo(x, y)
        g.bezierCurveTo(x + largo * 0.3, y + (azar() - 0.5) * 10, x + largo * 0.7, y + (azar() - 0.5) * 10, x + largo, y)
        g.stroke()
      }
      g.fillStyle = 'rgba(120, 80, 45, .35)'
      g.fillRect(x, i * alto, 2, alto)
      x += largo
    }
    g.fillStyle = 'rgba(120, 80, 45, .30)'
    g.fillRect(0, i * alto, c.width, 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(PISO.ancho / 4, PISO.fondo / 4)
  t.anisotropy = 8
  return t
}

function planta(x, z, escala = 1) {
  const g = new THREE.Group()
  g.add(cilindro(0, 0, 0.2 * escala, 0, 0.4 * escala, mat(COLORES.maceta), 0.26 * escala))
  ;[[0, 0.75, 0, 0.3], [-0.18, 0.6, 0.08, 0.22], [0.18, 0.62, -0.05, 0.22], [0.05, 0.95, 0.1, 0.2], [-0.1, 0.9, -0.12, 0.2]].forEach(([hx, hy, hz, r], i) => {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(r * escala, 1), mat(i % 2 ? COLORES.hojaB : COLORES.hoja, { flatShading: true }))
    h.position.set(hx * escala, hy * escala, hz * escala)
    h.castShadow = true
    g.add(h)
  })
  g.position.set(x, 0, z)
  return g
}

function alfombra(x0, x1, z0, z1, color) {
  return caja(x0, x1, 0, 0.018, z0, z1, mat(color), { sombra: false, r: 0.008 })
}

// El vidrio de todas las ventanas es un solo material: la escena le cambia el color según la hora (cielo de día,
// naranja al atardecer, azul oscuro de noche).
export const vidrioVentana = () => mat('#d6eeff', { emissive: '#bfe3ff', emissiveIntensity: 0.5, roughness: 0.1 })

// Lámparas: un material propio por lámpara (no del caché) para prender cada una por separado.
const materialLampara = () => new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffcf7a', emissiveIntensity: 0, roughness: 0.5 })
function lamparaColgante(x, z, alto, material) {
  const g = new THREE.Group()
  g.add(cilindro(x, z, 0.01, alto + 0.25, 2.6, mat(COLORES.gris)))
  const pantalla = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 20, 1, true), mat(COLORES.blanco, { side: THREE.DoubleSide }))
  pantalla.position.set(x, alto + 0.15, z)
  g.add(pantalla)
  const foco = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), material)
  foco.position.set(x, alto + 0.06, z)
  g.add(foco)
  return g
}

// Ventana sobre una pared exterior: en la del fondo (z = 0) o la izquierda (x = 0), entre a y b.
function ventana(a, b, pared) {
  const g = new THREE.Group()
  const vidrio = vidrioVentana()
  const marco = mat(COLORES.blanco)
  const c = (a0, a1, y0, y1, p0, p1, m) => pared === 'fondo' ? caja(a0, a1, y0, y1, p0, p1, m, { sombra: false }) : caja(p0, p1, y0, y1, a0, a1, m, { sombra: false })
  g.add(c(a, b, 0.95, 2.05, 0.005, 0.03, vidrio))
  g.add(c(a - 0.06, b + 0.06, 0.9, 0.97, 0, 0.12, marco))
  g.add(c(a - 0.06, b + 0.06, 2.03, 2.1, 0, 0.08, marco))
  g.add(c((a + b) / 2 - 0.03, (a + b) / 2 + 0.03, 0.95, 2.05, 0, 0.06, marco))
  return g
}

// Cuadrito en la pared (a la altura de los ojos), de color.
function cuadro(x, z, color, pared = 'fondo') {
  const g = new THREE.Group()
  const marco = pared === 'fondo' ? caja(x - 0.3, x + 0.3, 1.3, 1.75, 0.0, 0.04, mat(COLORES.blanco), { sombra: false }) : caja(0.0, 0.04, 1.3, 1.75, z - 0.3, z + 0.3, mat(COLORES.blanco), { sombra: false })
  const lamina = pared === 'fondo' ? caja(x - 0.24, x + 0.24, 1.36, 1.69, 0.04, 0.05, mat(color), { sombra: false }) : caja(0.04, 0.05, 1.36, 1.69, z - 0.24, z + 0.24, mat(color), { sombra: false })
  g.add(marco, lamina)
  return g
}

// Pared de vidrio con marco, de a hasta b sobre una línea. eje 'x': va a lo largo de x en z = fijo; 'z': a lo largo de z en x = fijo.
// hueco: [desde, hasta] de la puerta (sin vidrio).
function vidriera(a, b, fijo, eje, alto, hueco = null) {
  const g = new THREE.Group()
  const tramos = hueco ? [[a, hueco[0]], [hueco[1], b]] : [[a, b]]
  const marco = mat('#a9a0c4', { roughness: 0.5 })
  const c = (a0, a1, y0, y1, grosor, m, op) => eje === 'x'
    ? caja(a0, a1, y0, y1, fijo - grosor, fijo + grosor, m, op)
    : caja(fijo - grosor, fijo + grosor, y0, y1, a0, a1, m, op)
  for (const [t0, t1] of tramos) {
    if (t1 - t0 < 0.05) continue
    g.add(c(t0, t1, 0, alto, 0.02, VIDRIO(), { sombra: false, recibe: false }))
    g.add(c(t0, t0 + 0.05, 0, alto, 0.04, marco, { sombra: false }))
    g.add(c(t1 - 0.05, t1, 0, alto, 0.04, marco, { sombra: false }))
  }
  g.add(c(a, b, alto - 0.05, alto + 0.03, 0.05, marco, { sombra: false }))
  g.add(c(a, b, 0, 0.06, 0.04, marco, { sombra: false }))
  return g
}

function silla(x, z, giro, color = COLORES.lila, ejecutiva = false) {
  const g = new THREE.Group()
  const ancho = ejecutiva ? 0.36 : 0.3
  g.add(cilindro(0, 0, 0.04, 0, 0.42, mat(COLORES.gris)))
  g.add(cilindro(0, 0, 0.26, 0, 0.03, mat(COLORES.gris)))
  g.add(caja(-ancho, ancho, 0.42, 0.52, -0.28, 0.28, mat(color), { r: 0.05 }))
  g.add(caja(-ancho, ancho, 0.52, ejecutiva ? 1.45 : 1.15, -0.36, -0.26, mat(color), { r: 0.05 }))
  if (ejecutiva) for (const lado of [-1, 1]) g.add(caja(lado * ancho - 0.05, lado * ancho + 0.05, 0.52, 0.72, -0.25, 0.2, mat(color), { r: 0.03 }))
  g.position.set(x, 0, z)
  g.rotation.y = giro
  return g
}

// Monitor de PC sobre una mesa, mirando a quien se sienta (local: la pantalla mira hacia -z).
function monitor(alto = 0.74) {
  const g = new THREE.Group()
  g.add(caja(-0.06, 0.06, alto, alto + 0.2, -0.04, 0.04, mat(COLORES.negro)))
  g.add(caja(-0.16, 0.16, alto, alto + 0.015, -0.1, 0.1, mat(COLORES.negro)))
  g.add(caja(-0.36, 0.36, alto + 0.16, alto + 0.6, -0.025, 0.025, mat(COLORES.negro), { r: 0.015 }))
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.38), new THREE.MeshStandardMaterial({ color: '#3a3550', emissive: '#000000' }))
  pantalla.position.set(0, alto + 0.38, -0.03)
  pantalla.rotation.y = Math.PI
  g.add(pantalla)
  g.add(caja(-0.25, 0.25, alto, alto + 0.02, -0.5, -0.32, mat(COLORES.grisClaro), { r: 0.006 }))
  return { grupo: g, pantalla }
}

// Escritorio de una oficina: mesa, silla, PC. giro: hacia dónde mira el que se sienta (0 = hacia adelante).
// ejecutivo: el de la jefa (más grande, de nogal, silla de cuero).
export function crearEscritorio(x, z, giro, { ejecutivo = false, decoracion = 0 } = {}) {
  const g = new THREE.Group()
  const a = ejecutivo ? 1.15 : 0.82, f = ejecutivo ? 0.55 : 0.42
  const madera = mat(ejecutivo ? COLORES.nogal : COLORES.madera)
  g.add(caja(-a, a, 0.7, 0.76, -f, f, madera, { r: 0.025 }))
  if (ejecutivo) g.add(caja(-a + 0.05, a - 0.05, 0, 0.7, f - 0.12, f - 0.04, madera))
  for (const [dx, dz] of [[-a + 0.08, -f + 0.08], [a - 0.08, -f + 0.08], [-a + 0.08, f - 0.08], [a - 0.08, f - 0.08]]) g.add(cilindro(dx, dz, 0.035, 0, 0.7, mat(ejecutivo ? COLORES.nogal : COLORES.maderaOscura)))
  g.add(silla(0, -(ejecutivo ? 0.9 : 0.78), 0, ejecutivo ? COLORES.cuero : COLORES.lila, ejecutivo))
  const pc = monitor(0.76)
  pc.grupo.position.z = 0.12
  g.add(pc.grupo)
  if (decoracion % 2) g.add(cilindro(a - 0.25, 0.15, 0.06, 0.76, 0.88, mat(COLORES.rosa), 0.065))
  else {
    g.add(cilindro(a - 0.22, 0.12, 0.07, 0.76, 0.88, mat(COLORES.maceta), 0.08))
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), mat(COLORES.hoja, { flatShading: true }))
    h.position.set(a - 0.22, 0.97, 0.12); h.castShadow = true
    g.add(h)
  }
  if (ejecutivo) g.add(caja(-a + 0.2, -a + 0.5, 0.76, 0.8, -0.1, 0.2, mat(COLORES.dorado)))
  // Lámpara de escritorio: se prende de noche si el agente está en su lugar.
  const lampara = materialLampara()
  const lx = -a + 0.25, lz = 0.25
  g.add(cilindro(lx, lz, 0.08, 0.76, 0.79, mat(ejecutivo ? COLORES.dorado : COLORES.gris)))
  g.add(cilindro(lx, lz, 0.015, 0.79, 1.12, mat(ejecutivo ? COLORES.dorado : COLORES.gris)))
  const pantallaLampara = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.13, 18, 1, true), mat(ejecutivo ? COLORES.dorado : COLORES.lila, { side: THREE.DoubleSide }))
  pantallaLampara.position.set(lx, 1.15, lz)
  g.add(pantallaLampara)
  const foco = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), lampara)
  foco.position.set(lx, 1.1, lz)
  g.add(foco)
  g.position.set(x, 0, z)
  g.rotation.y = giro
  return { grupo: g, pantalla: pc.pantalla, lampara }
}

// Puesto en un tablón (UP o PDG): silla y PC (la mesa la arma crearSala).
export function crearPuestoMesa(x, z, giro, color = COLORES.durazno) {
  const g = new THREE.Group()
  g.add(silla(0, 0, 0, color))
  const pc = monitor(0.76)
  pc.grupo.position.z = 1.05
  g.add(pc.grupo)
  g.position.set(x, 0, z)
  g.rotation.y = giro
  return { grupo: g, pantalla: pc.pantalla }
}

// ---------- Decoración según el área (ESTILOS en oficinaPlano.mjs) ----------
function alfombraConEstilo(x0, x1, z0, z1, alfombra) {
  const t = texturaAlfombra(alfombra)
  if (alfombra.patron !== 'borde') t.repeat.set(Math.max(1, Math.round((x1 - x0) / 1.4)), Math.max(1, Math.round((z1 - z0) / 1.4)))
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }))
  m.rotation.x = -Math.PI / 2
  m.position.set((x0 + x1) / 2, 0.016, (z0 + z1) / 2)
  m.receiveShadow = true
  return m
}

// Un cuadro (o el tablero de estados, que brilla) colgado en una pared que mira hacia adelante (z fija): la del
// fondo o la del costado de las oficinas de PDG.
function cuadroDeArea(tipo, { x, y, z, w, h }) {
  const g = new THREE.Group()
  const marco = mat(tipo === 'corcho' ? '#8a5a36' : tipo === 'tablero' ? COLORES.negro : COLORES.blanco)
  const lamina = new THREE.MeshStandardMaterial({ map: texturaCuadro(tipo === 'corcho' ? 'notas' : tipo), roughness: 0.7,
    ...(tipo === 'tablero' ? { emissive: '#ffffff', emissiveMap: texturaCuadro('tablero'), emissiveIntensity: 0.55 } : {}) })
  const borde = 0.05
  g.add(caja(x - w / 2 - borde, x + w / 2 + borde, y - h / 2 - borde, y + h / 2 + borde, z, z + 0.04, marco, { sombra: false }))
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lamina)
  p.position.set(x, y, z + 0.045)
  g.add(p)
  return g
}

function mesitaConDiarios(x, z) {
  const g = new THREE.Group()
  g.add(cilindro(x, z, 0.3, 0.5, 0.55, mat(COLORES.madera)))
  g.add(cilindro(x, z, 0.04, 0, 0.5, mat(COLORES.maderaOscura)))
  for (let k = 0; k < 4; k++) {
    const d = caja(x - 0.2, x + 0.2, 0.55 + k * 0.025, 0.575 + k * 0.025, z - 0.14, z + 0.14, mat(k % 2 ? '#f4efe4' : '#e9e2d2'), { sombra: false })
    d.rotation.y = (k - 1.5) * 0.15
    g.add(d)
  }
  return g
}

function maletin(x, z) {
  const g = new THREE.Group()
  g.add(caja(x - 0.25, x + 0.25, 0, 0.34, z - 0.08, z + 0.08, mat('#a8744a'), { r: 0.03 }))
  g.add(caja(x - 0.08, x + 0.08, 0.34, 0.4, z - 0.02, z + 0.02, mat('#7a4f2c'), { r: 0.01 }))
  g.add(caja(x - 0.03, x + 0.03, 0.16, 0.22, z + 0.08, z + 0.09, mat(COLORES.dorado), { sombra: false }))
  return g
}

function globo(x, z) {
  const g = new THREE.Group()
  g.add(cilindro(x, z, 0.16, 0, 0.04, mat(COLORES.maderaOscura)))
  g.add(cilindro(x, z, 0.025, 0.04, 0.75, mat(COLORES.maderaOscura)))
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), new THREE.MeshStandardMaterial({ map: texturaCuadro('mapa', '#cfe9f5'), roughness: 0.5 }))
  esfera.position.set(x, 0.95, z)
  esfera.rotation.z = 0.4
  esfera.castShadow = true
  g.add(esfera)
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.012, 6, 30), mat(COLORES.dorado)))
  g.children.at(-1).position.set(x, 0.95, z)
  g.children.at(-1).rotation.set(0, Math.PI / 2, 0.4)
  return g
}

// Oficina (de uno, compartida o la de María): paredes, frente de vidrio con puerta, alfombra, decoración y, si es de un
// grupo, su cartel. o: el `oficina` de oficinaPlano.mjs.
export function crearOficina(o) {
  // Se arma en coordenadas propias (el fondo de la oficina en z = 0) y se ubica en su fila; las de la fila ejecutiva
  // (la de María) van sobre la tarima.
  const g = new THREE.Group()
  g.position.set(0, alturaPiso(o.x0 + 0.1, o.y0 + 0.1), o.y0)
  const D = o.y1 - o.y0
  const altoTabique = 2.1
  const estilo = estiloDe(o.id)
  const acento = mat(estilo.pared)
  {
    g.add(caja(o.x0, o.x0 + 0.08, 0, altoTabique, 0, D, mat(COLORES.tabique), { r: 0.02 }))
    g.add(caja(o.x1 - 0.08, o.x1, 0, altoTabique, 0, D, mat(COLORES.tabique), { r: 0.02 }))
    if (o.y0 > 0) g.add(caja(o.x0, o.x1, 0, altoTabique, -0.08, 0, mat(COLORES.tabique), { r: 0.02 }))
    g.add(vidriera(o.x0, o.x1, D, 'x', altoTabique, [o.puerta.x - 0.5, o.puerta.x + 0.5]))
    g.add(alfombraConEstilo(o.x0 + 0.3, o.x1 - 0.3, 0.3, D - 0.3, estilo.alfombra))
    g.add(caja(o.x0 + 0.08, o.x1 - 0.08, 0.15, altoTabique, 0.004, 0.012, acento, { sombra: false }))
    const cx = (o.x0 + o.x1) / 2
    if (o.y0 === 0) g.add(ventana(cx - 0.9, cx + 0.9, 'fondo'))
    if (o.nombre && !o.jefa) {
      const ancho = Math.min(o.x1 - o.x0 - 1.8, 0.24 * o.nombre.length + 0.6)
      const cartel = new THREE.Mesh(new THREE.PlaneGeometry(ancho, 0.34), new THREE.MeshStandardMaterial({ map: textoTextura(o.nombre, { fondo: COLORES.lila, tam: 60, ancho: 640 }), transparent: true }))
      cartel.position.set(o.x0 + 0.3 + ancho / 2, 1.85, D + 0.06)
      g.add(cartel)
    }
    if (!o.jefa) {
      g.add(planta(o.x1 - 0.45, 0.45, 0.8))
      g.add(caja(o.x0 + 0.15, o.x0 + 0.75, 0, 0.9, 0.1, 0.5, mat(COLORES.blanco), { r: 0.03 }))
      // Cuadros y objeto de pared en la pared del fondo, desde el centro hacia los costados.
      const piezas = [...estilo.cuadros.map(t => ({ t, w: 0.86, h: 0.64 })), ...(estilo.objeto === 'tablero' || estilo.objeto === 'corcho' ? [{ t: estilo.objeto, w: 1.1, h: 0.72 }] : [])]
      const libre = o.y0 === 0 ? 1.05 : 0.1
      let izq = cx - libre, der = cx + libre
      piezas.forEach((pz, k) => {
        const aIzq = k % 2 === 0
        const x = aIzq ? izq - pz.w / 2 : der + pz.w / 2
        if (x - pz.w / 2 < o.x0 + 0.85 || x + pz.w / 2 > o.x1 - 0.85) return
        g.add(cuadroDeArea(pz.t, { x, z: 0.02, w: pz.w, h: pz.h, y: pz.t === 'tablero' ? 1.45 : 1.5 }))
        if (aIzq) izq -= pz.w + 0.2; else der += pz.w + 0.2
      })
      if (estilo.objeto === 'diarios') g.add(mesitaConDiarios(o.x0 + 1.25, 0.4))
      if (estilo.objeto === 'maletin') g.add(maletin(o.x0 + 1.15, 0.45))
    }
  }
  if (o.jefa) {
    // La oficina de la jefa: biblioteca, sillón con mesita, plantas grandes y cartel de Dirección.
    const zona = o.x1 - 2.6
    g.add(caja(o.x0 + 0.2, o.x0 + 2.6, 0, 2.0, 0.08, 0.5, mat(COLORES.nogal), { r: 0.03 }))
    ;['#f6a5c0', '#8fd9bd', '#b9a2e8', '#f7b98b', '#f6dd8b', '#9fc5f8', '#e2b552'].forEach((c, k) => {
      for (const nivel of [0.45, 1.05, 1.6]) g.add(caja(o.x0 + 0.3 + k * 0.32, o.x0 + 0.52 + k * 0.32, nivel, nivel + 0.38 - (k % 3) * 0.05, 0.15, 0.45, mat(c)))
    })
    g.add(caja(zona, o.x1 - 0.2, 0, 0.45, 2.3, 3.4, mat(COLORES.cuero), { r: 0.12 }))
    g.add(caja(o.x1 - 0.55, o.x1 - 0.2, 0, 0.95, 2.3, 3.4, mat(COLORES.cuero), { r: 0.1 }))
    g.add(caja(zona, o.x1 - 0.2, 0, 0.7, 2.15, 2.4, mat(COLORES.cuero), { r: 0.08 }))
    g.add(caja(zona, o.x1 - 0.2, 0, 0.7, 3.3, 3.55, mat(COLORES.cuero), { r: 0.08 }))
    g.add(cilindro(zona - 0.55, 3.75, 0.38, 0.38, 0.44, mat(COLORES.blanco)))
    g.add(cilindro(zona - 0.55, 3.75, 0.05, 0, 0.38, mat(COLORES.dorado)))
    g.add(planta(o.x1 - 0.5, 0.5, 1.4))
    g.add(planta(zona - 0.3, 0.5, 1.1))
    g.add(cuadro(zona + 0.6, 0, COLORES.dorado))
    const cartel = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.36), new THREE.MeshStandardMaterial({ map: textoTextura('Dirección', { fondo: '#6e432a', color: '#f6dd8b', tam: 66 }), transparent: true }))
    cartel.position.set(o.puerta.x + 1.6, 1.85, D + 0.06)
    g.add(cartel)
    // Su oficina tiene luz propia de noche (la escena la prende si ella está).
    const luz = new THREE.PointLight('#ffcf8a', 0, 6, 1.6)
    luz.position.set((o.x0 + o.x1) / 2, 2.0, 2.2)
    g.add(luz)
    g.userData.luz = luz
  }
  return g
}

// Un tablón: la mesa larga con su travesaño y patas (los puestos los arma crearPuestoMesa).
function tablonMesa(g, mesa) {
  g.add(caja(mesa.x0, mesa.x1, 0.7, 0.76, mesa.y0, mesa.y1, mat(COLORES.madera), { r: 0.03 }))
  g.add(caja(mesa.x0 + 0.1, mesa.x1 - 0.1, 0.3, 0.36, (mesa.y0 + mesa.y1) / 2 - 0.08, (mesa.y0 + mesa.y1) / 2 + 0.08, mat(COLORES.maderaOscura)))
  for (const x of [mesa.x0 + 0.15, mesa.x1 - 0.15]) g.add(caja(x - 0.05, x + 0.05, 0, 0.7, mesa.y0 + 0.1, mesa.y1 - 0.1, mat(COLORES.maderaOscura)))
}

// Todo lo común: piso, paredes, tarima, salas comunes, tablones, mampara, Administración y entrada.
// mesas: { up, pdg, admin } con { x0, x1, y0, y1 } de cada tablón.
export function crearSala(mesas) {
  const g = new THREE.Group()
  const { ancho: W, fondo: D, pared: P } = PISO
  const Z = ZONAS

  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: texturaPiso(), roughness: 0.65 }))
  piso.rotation.x = -Math.PI / 2
  piso.position.set(W / 2, 0, D / 2)
  piso.receiveShadow = true
  g.add(piso)
  g.add(caja(-0.2, W, 0, P, -0.2, 0, mat(COLORES.pared), { sombra: false }))
  g.add(caja(-0.2, 0, 0, P, -0.2, D, mat(COLORES.paredLado), { sombra: false }))
  g.add(caja(0, W, 0, 0.14, 0, 0.04, mat(COLORES.zocalo), { sombra: false }))
  g.add(caja(0, 0.04, 0, 0.14, 0, D, mat(COLORES.zocalo), { sombra: false }))
  for (const [a, b] of [[14.5, 18.2], [20.2, 24]]) g.add(ventana(a, b, 'izquierda'))

  // La tarima de la fila ejecutiva (María y Daniela) con su escalón.
  g.add(caja(X0, W, 0, EJECUTIVO.tarima, EJECUTIVO.y0, EJECUTIVO.y1, mat('#e6cfa8'), { sombra: false }))
  g.add(caja(X0, W, 0, EJECUTIVO.tarima / 2, EJECUTIVO.y1, EJECUTIVO.y1 + 0.25, mat('#d8bd92'), { sombra: false }))
  // La pared del fondo de la fila de oficinas de los trabajadores (da al corredor de la fila ejecutiva).
  g.add(caja(OFICINAS.x0, OFICINAS.x1, 0, 2.1, OFICINAS.y0 - 0.08, OFICINAS.y0, mat(COLORES.tabique), { r: 0.02 }))

  // Reloj con la hora real, en la pared izquierda (cafetería).
  const reloj = new THREE.Group()
  reloj.position.set(0.05, 1.9, 10.5)
  reloj.rotation.y = Math.PI / 2
  const fondoReloj = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 32), mat('#ffffff'))
  fondoReloj.rotation.x = Math.PI / 2
  reloj.add(fondoReloj, new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 32), mat(COLORES.lila)))
  const aguja = (largo, grosor, color) => {
    const p = new THREE.Group()
    const m = new THREE.Mesh(new THREE.BoxGeometry(grosor, largo, 0.02), mat(color))
    m.position.y = largo / 2
    p.add(m)
    p.position.z = 0.04
    reloj.add(p)
    return p
  }
  const agujas = { hora: aguja(0.21, 0.05, '#3b2f4f'), minuto: aguja(0.31, 0.035, '#3b2f4f'), segundo: aguja(0.34, 0.015, COLORES.error) }
  g.add(reloj)

  // Carteles en el piso de cada zona.
  for (const [id, z] of Object.entries(Z)) {
    if (id === 'admin') g.add(textoEnPiso(z.nombre, 20, z.y1 - 0.45))
    else g.add(textoEnPiso(z.nombre, (z.x0 + z.x1) / 2, z.y1 - 0.45))
  }

  // Los tablones: UP y PDG comercial (un mismo sistema), y el panel del sistema comercial junto al de PDG.
  g.add(alfombra(Z.up.x0 + 0.4, Z.up.x1 - 0.4, Z.up.y0 + 0.4, Z.up.y1 - 0.9, COLORES.duraznoClaro))
  g.add(alfombra(Z.pdg.x0 + 0.4, Z.pdg.x1 - 0.4, Z.pdg.y0 + 0.4, Z.pdg.y1 - 0.9, COLORES.mentaClaro))
  tablonMesa(g, mesas.up)
  tablonMesa(g, mesas.pdg)
  const panel = { x0: 38.0, x1: 44.6, y: 14.85 }
  g.add(caja(panel.x0, panel.x1, 0, 1.75, panel.y - 0.05, panel.y + 0.02, mat(COLORES.blanco), { r: 0.02 }))
  for (const x of [panel.x0 + 0.1, panel.x1 - 0.1]) g.add(caja(x - 0.04, x + 0.04, 0, 1.75, panel.y - 0.12, panel.y + 0.06, mat(COLORES.gris)))
  CUADROS_PDG.forEach((tipo, k) => g.add(cuadroDeArea(tipo, { x: panel.x0 + 0.75 + k * 1.27, y: 1.05, z: panel.y + 0.02, w: 0.95, h: 0.7 })))
  const ventasPdg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.38), new THREE.MeshStandardMaterial({ map: textoTextura('Ventas PDG', { fondo: COLORES.menta, tam: 62 }), transparent: true }))
  ventasPdg.position.set((panel.x0 + panel.x1) / 2, 1.6, panel.y + 0.03)
  g.add(ventasPdg)
  g.add(globo(44.4, 19.8))
  g.add(planta(Z.up.x0 + 0.5, Z.up.y0 + 0.5, 1.0))

  // La mampara: maceteros con plantas y vidrio esmerilado arriba, con un paso en el medio.
  for (const [x0, x1] of [[DIVISOR.x0, DIVISOR.hueco[0]], [DIVISOR.hueco[1], DIVISOR.x1]]) {
    g.add(caja(x0, x1, 0, 0.5, DIVISOR.y - 0.18, DIVISOR.y + 0.18, mat(COLORES.madera), { r: 0.04 }))
    g.add(caja(x0 + 0.05, x1 - 0.05, 0.5, 1.45, DIVISOR.y - 0.03, DIVISOR.y + 0.03, mat('#eef6f8', { transparent: true, opacity: 0.55, roughness: 0.3 }), { sombra: false }))
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.4) {
      const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), mat(COLORES.hoja, { flatShading: true }))
      h.position.set(x, 0.66, DIVISOR.y)
      h.castShadow = true
      g.add(h)
    }
  }

  // Administración: su mesa, un archivero, la impresora y la entrada.
  const A = Z.admin
  g.add(alfombra(A.x0 + 0.4, 27.6, A.y0 + 0.5, A.y1 - 0.4, COLORES.lilaClaro))
  tablonMesa(g, mesas.admin)
  g.add(caja(25.2, 26.0, 0, 1.3, 25.2, 26.1, mat('#c9c3d9'), { r: 0.03 }))
  for (const y of [0.35, 0.75, 1.15]) g.add(caja(25.18, 25.2, y - 0.03, y + 0.03, 25.4, 25.9, mat(COLORES.gris), { sombra: false }))
  g.add(caja(24.0, 24.9, 0, 0.75, 25.4, 26.1, mat(COLORES.blanco), { r: 0.03 }))
  g.add(caja(24.1, 24.8, 0.75, 1.0, 25.5, 26.0, mat('#e9e6f0'), { r: 0.04 }))
  g.add(caja(ENTRADA.x - 0.9, ENTRADA.x + 0.9, 0, 0.02, ENTRADA.y - 1.0, ENTRADA.y - 0.1, mat('#8a5a36', { roughness: 1 }), { sombra: false }))
  g.add(textoEnPiso('Entrada', ENTRADA.x, ENTRADA.y - 1.6))
  g.add(planta(ENTRADA.x - 1.4, ENTRADA.y - 0.5, 1.2))
  g.add(planta(ENTRADA.x + 1.4, ENTRADA.y - 0.5, 1.2))
  g.add(planta(44.4, 25.8, 1.1))

  // Sala de reuniones: vidriada, mesa redonda con sillas en herradura y pantalla con cámara (del lado de la puerta).
  const R = Z.reuniones
  g.add(alfombra(R.x0 + 0.2, R.x1 - 0.2, R.y0 + 0.2, R.y1 - 0.2, COLORES.lilaClaro))
  g.add(vidriera(R.x0, R.x1, R.y0, 'x', 2.1))
  g.add(vidriera(R.x0, R.x1, R.y1, 'x', 2.1))
  g.add(vidriera(R.y0, R.y1, R.x0, 'z', 2.1))
  g.add(vidriera(R.y0, R.y1, R.x1, 'z', 2.1, [PUERTA_REUNION.y - 0.5, PUERTA_REUNION.y + 0.5]))
  const MR = MESA_REUNION
  g.add(cilindro(MR.x, MR.y, MR.radio, 0.7, 0.76, mat(COLORES.blanco), MR.radio, 48))
  g.add(cilindro(MR.x, MR.y, 0.14, 0, 0.7, mat(COLORES.gris)))
  g.add(cilindro(MR.x, MR.y, 0.55, 0, 0.05, mat(COLORES.gris)))
  g.add(cilindro(MR.x, MR.y, 0.32, 0.76, 0.79, mat(COLORES.mentaClaro), 0.32, 32))
  for (const a of asientosReunion()) if (a.pose === 'sentado') g.add(silla(a.x, a.y, a.mira, COLORES.menta))
  const xp = R.x1 - 0.1
  g.add(caja(xp - 0.08, xp, 0, 1.05, MR.y - 0.15, MR.y + 0.15, mat(COLORES.gris)))
  g.add(caja(xp - 0.12, xp, 1.05, 1.85, MR.y - 0.7, MR.y + 0.7, mat(COLORES.negro), { r: 0.02 }))
  g.add(caja(xp - 0.15, xp - 0.12, 1.1, 1.8, MR.y - 0.64, MR.y + 0.64, mat('#2a3550', { emissive: '#3a5a9a', emissiveIntensity: 0.4 }), { sombra: false }))
  g.add(cilindro(xp - 0.08, MR.y, 0.04, 1.86, 1.94, mat(COLORES.negro)))
  g.add(planta(R.x0 + 0.45, R.y1 - 0.45, 0.9))

  // Cafetería: barra con cafetera, vitrina y banquetas; mesa alta.
  const C = Z.cafeteria
  g.add(alfombra(C.x0 + 0.3, C.x1 - 0.3, C.y0 + 0.2, C.y1 - 0.3, COLORES.rosaClaro))
  g.add(caja(1.0, 9.5, 0, 1.0, 8.3, 9.1, mat(COLORES.rosa), { r: 0.04 }))
  g.add(caja(0.95, 9.55, 1.0, 1.07, 8.25, 9.15, mat(COLORES.blanco)))
  g.add(caja(1.3, 2.1, 1.07, 1.6, 8.4, 8.9, mat('#6d6383'), { r: 0.05 }))
  const luzCafetera = caja(1.65, 1.75, 1.4, 1.46, 8.9, 8.92, new THREE.MeshStandardMaterial({ color: '#ff7a7a', emissive: '#ff4d4d', emissiveIntensity: 1.2 }), { sombra: false })
  g.add(luzCafetera)
  g.add(caja(6.8, 8.8, 1.07, 1.5, 8.4, 9.0, mat('#e9f6ff', { transparent: true, opacity: 0.45 }), { sombra: false }))
  for (const [x, c] of [[7.2, '#e8b15b'], [7.8, '#f6a5c0'], [8.4, '#c98a4b']]) g.add(cilindro(x, 8.7, 0.14, 1.1, 1.2, mat(c)))
  for (const x of [2.0, 3.6, 5.2, 6.8]) { g.add(cilindro(x, 9.9, 0.04, 0, 0.62, mat(COLORES.gris))); g.add(cilindro(x, 9.9, 0.22, 0.62, 0.68, mat(COLORES.amarillo))) }
  g.add(cilindro(10.5, 11.9, 0.05, 0, 1.05, mat(COLORES.gris)))
  g.add(cilindro(10.5, 11.9, 0.45, 1.05, 1.1, mat(COLORES.blanco)))
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: textoTextura('Cafetería', { fondo: COLORES.rosa, tam: 64 }), transparent: true }))
  menu.position.set(5.2, 2.0, 8.25)
  g.add(menu)

  // Comedor: dos mesas con sillas y platos.
  for (const [x0, x1] of [[1.5, 4.1], [5.8, 8.4]]) {
    g.add(caja(x0, x1, 0.7, 0.76, 15.5, 16.5, mat(COLORES.madera), { r: 0.03 }))
    for (const x of [x0 + 0.1, x1 - 0.1]) g.add(caja(x - 0.05, x + 0.05, 0, 0.7, 15.6, 16.4, mat(COLORES.maderaOscura)))
    for (const x of [x0 + 0.65, x0 + 1.95]) {
      g.add(silla(x, 14.85, 0, COLORES.menta))
      g.add(silla(x, 17.15, Math.PI, COLORES.menta))
      for (const z of [15.75, 16.25]) g.add(cilindro(x, z, 0.16, 0.76, 0.79, mat('#ffffff')))
    }
    g.add(cilindro((x0 + x1) / 2, 16.0, 0.08, 0.76, 1.0, mat('#bfe3ff', { transparent: true, opacity: 0.75 })))
  }
  g.add(alfombra(Z.comedor.x0 + 0.4, 9.2, 14.4, 18.4, COLORES.amarilloClaro))
  g.add(planta(11.8, 18.2, 1.1))

  // Ocio: sillón, mesita, pufs y planta grande.
  const O = Z.ocio
  g.add(alfombra(O.x0 + 0.3, O.x1 - 0.2, O.y0 + 0.2, O.y1 - 0.6, COLORES.lilaClaro))
  g.add(caja(0.9, 5.3, 0, 1.05, 19.8, 20.2, mat(COLORES.rosa), { r: 0.12 }))
  g.add(caja(1.1, 5.1, 0, 0.42, 20.15, 21.2, mat(COLORES.rosaClaro), { r: 0.1 }))
  g.add(caja(0.75, 1.15, 0, 0.7, 19.8, 21.2, mat(COLORES.rosa), { r: 0.1 }))
  g.add(caja(5.05, 5.45, 0, 0.7, 19.8, 21.2, mat(COLORES.rosa), { r: 0.1 }))
  for (const x of [1.75, 3.1, 4.45]) {
    const a = caja(x - 0.32, x + 0.32, 0.42, 0.86, 20.15, 20.35, mat(COLORES.amarillo), { r: 0.08 })
    a.rotation.x = -0.15
    g.add(a)
  }
  g.add(caja(2.2, 4.0, 0.36, 0.42, 22.4, 23.2, mat(COLORES.blanco), { r: 0.05 }))
  for (const [x, z] of [[2.35, 22.55], [3.85, 22.55], [2.35, 23.05], [3.85, 23.05]]) g.add(cilindro(x, z, 0.03, 0, 0.36, mat(COLORES.gris)))
  PUFS.forEach((p, k) => {
    const puf = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), mat([COLORES.amarillo, COLORES.menta, COLORES.durazno][k % 3]))
    puf.scale.set(1, 0.55, 1)
    puf.position.set(p.x, 0.25, p.y)
    puf.castShadow = true; puf.receiveShadow = true
    g.add(puf)
  })
  g.add(planta(0.8, 25.6, 1.4))

  // Ping pong.
  const Gp = Z.ping
  g.add(alfombra(Gp.x0 + 0.3, Gp.x1 - 0.3, 20.6, 25.4, COLORES.mentaClaro))
  g.add(caja(8.6, 12.4, 0.66, 0.72, 22.0, 23.6, mat('#9f86df'), { r: 0.01 }))
  g.add(caja(8.62, 12.38, 0.725, 0.727, 22.78, 22.82, mat('#ffffff'), { sombra: false }))
  for (const [x, z] of [[8.8, 22.15], [12.2, 22.15], [8.8, 23.45], [12.2, 23.45]]) g.add(cilindro(x, z, 0.05, 0, 0.66, mat(COLORES.gris)))
  g.add(caja(10.48, 10.52, 0.72, 0.9, 21.95, 23.65, mat('#ffffff', { transparent: true, opacity: 0.75 }), { sombra: false }))

  // Lámparas colgantes y una luz cálida por sala (se prenden de noche).
  const lamparas = materialLampara()
  const luces = []
  const sala = (x, z, focos) => {
    for (const [fx, fz] of focos) g.add(lamparaColgante(fx, fz, 1.9, lamparas))
    const luz = new THREE.PointLight('#ffd59a', 0, 9, 1.5)
    luz.position.set(x, 2.1, z)
    g.add(luz)
    luces.push(luz)
  }
  const centro = m => ({ x: (m.x0 + m.x1) / 2, y: (m.y0 + m.y1) / 2 })
  for (const m of [mesas.up, mesas.pdg, mesas.admin]) { const c = centro(m); sala(c.x, c.y, [[m.x0 + 1.0, c.y], [m.x1 - 1.0, c.y]]) }
  sala(MR.x, MR.y, [[MR.x, MR.y]])
  sala(5.5, 10.5, [[3.6, 9.9], [6.8, 9.9], [10.5, 11.9]])
  sala(5.0, 16.0, [[2.8, 16.0], [7.1, 16.0]])
  sala(6.5, 22.5, [[3.1, 22.8], [10.5, 22.8]])

  return { grupo: g, agujas, luzCafetera, lamparas, luces }
}

// La oficina de Daniela (la más grande del edificio, sobre la tarima, con balcón) y la sala de espera frente a su
// puerta. Devuelve su escritorio (pantalla y lámpara) y la luz de su oficina para la escena.
export function crearDireccion() {
  const raiz = new THREE.Group()
  const g = new THREE.Group()
  g.position.y = EJECUTIVO.tarima
  raiz.add(g)
  const D = DIRECCION
  const M = MUEBLES_DIRECCION
  g.add(alfombraConEstilo(31.8, 41.8, 1.2, 6.5, { patron: 'borde', colores: ['#f3e6c4', '#c9a24a'] }))
  g.add(caja(D.x0 - 0.05, D.x0 + 0.05, 0, 2.1, D.y0, D.y1, mat(COLORES.tabique), { r: 0.02 }))
  g.add(vidriera(D.x0, D.x1, D.y1, 'x', 2.1, [D.puerta.x - 0.5, D.puerta.x + 0.5]))
  // Escritorio ejecutivo mirando a la puerta y la silla de las visitas enfrente.
  const escritorio = crearEscritorio(DANIELA.escritorio.x, DANIELA.escritorio.y, DANIELA.mira, { ejecutivo: true })
  g.add(escritorio.grupo)
  g.add(silla(VISITA.x, VISITA.y, VISITA.mira, COLORES.cuero))

  // Biblioteca de piso a techo en toda la pared del fondo, llena de libros.
  const B = M.biblioteca
  const nogal = mat(COLORES.nogal)
  g.add(caja(B.x0, B.x1, 0, 2.55, 0.02, 0.08, nogal, { sombra: false }))
  for (const y of [0, 0.62, 1.22, 1.82, 2.5]) g.add(caja(B.x0, B.x1, y, y + 0.05, 0.02, B.y1, nogal))
  const tramoB = (B.x1 - B.x0) / 9
  for (let k = 0; k <= 9; k++) { const x = B.x0 + k * tramoB; g.add(caja(x - 0.03, x + 0.03, 0, 2.55, 0.02, B.y1, nogal)) }
  const tonos = ['#f6a5c0', '#8fd9bd', '#b9a2e8', '#f7b98b', '#f6dd8b', '#9fc5f8', '#e2b552', '#e86df2', '#c8323f', '#3b4a8a', '#6fb07a', '#e9e2d2']
  let semilla = 11
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647 }
  for (const base of [0.05, 0.67, 1.27, 1.87]) {
    let x = B.x0 + 0.08
    while (x < B.x1 - 0.1) {
      if (Math.abs(((x - B.x0) / tramoB) % 1) < 0.04) { x += 0.07; continue }
      const ancho = 0.05 + azar() * 0.05, alto = 0.36 + azar() * 0.16
      if (azar() < 0.06) {
        g.add(caja(x, x + 0.3, base, base + 0.12, 0.12, 0.42, mat(tonos[Math.floor(azar() * tonos.length)])))
        x += 0.36
        continue
      }
      g.add(caja(x, x + ancho, base, base + alto, 0.1, 0.44, mat(tonos[Math.floor(azar() * tonos.length)]), { sombra: false }))
      x += ancho + 0.006
    }
  }

  // Tele en la pared izquierda, con el sillón y la mesita enfrente.
  const T = M.tele
  g.add(caja(D.x0 + 0.05, D.x0 + 0.12, 0.85, 1.95, T.y0, T.y1, mat(COLORES.negro), { r: 0.02 }))
  g.add(caja(D.x0 + 0.12, D.x0 + 0.13, 0.9, 1.9, T.y0 + 0.06, T.y1 - 0.06, mat('#2a3550', { emissive: '#4a6ab0', emissiveIntensity: 0.45 }), { sombra: false }))
  g.add(caja(D.x0 + 0.05, D.x0 + 0.5, 0, 0.45, T.y0 + 0.1, T.y1 - 0.1, mat(COLORES.nogal), { r: 0.03 }))
  const S = M.sillon
  g.add(caja(S.x1 - 0.32, S.x1, 0, 1.0, S.y0, S.y1, mat(COLORES.lila), { r: 0.1 }))
  g.add(caja(S.x0, S.x1 - 0.3, 0, 0.45, S.y0 + 0.2, S.y1 - 0.2, mat(COLORES.lilaClaro), { r: 0.1 }))
  for (const z of [S.y0, S.y1 - 0.22]) g.add(caja(S.x0, S.x1, 0, 0.68, z, z + 0.22, mat(COLORES.lila), { r: 0.08 }))
  for (const z of [3.4, 4.0, 4.6]) g.add(caja(S.x1 - 0.42, S.x1 - 0.22, 0.45, 0.85, z - 0.25, z + 0.25, mat(COLORES.amarillo), { r: 0.08 }))
  g.add(cilindro(M.mesita.x, M.mesita.y, M.mesita.radio, 0.38, 0.43, mat(COLORES.blanco), M.mesita.radio, 28))
  g.add(cilindro(M.mesita.x, M.mesita.y, 0.04, 0, 0.38, mat(COLORES.dorado)))

  // Baño privado en el rincón: paredes, puerta entreabierta, inodoro, lavatorio y espejo.
  const Wb = M.bano
  g.add(caja(Wb.x0, Wb.x1, 0, 2.1, Wb.y0, Wb.y0 + 0.08, mat(COLORES.tabique), { r: 0.02 }))
  g.add(caja(Wb.x0, Wb.x0 + 0.08, 0, 2.1, Wb.y0, Wb.puerta.y0, mat(COLORES.tabique)))
  g.add(caja(Wb.x0, Wb.x0 + 0.08, 0, 2.1, Wb.puerta.y1, Wb.y1, mat(COLORES.tabique)))
  g.add(caja(Wb.x0, Wb.x0 + 0.08, 1.95, 2.1, Wb.puerta.y0, Wb.puerta.y1, mat(COLORES.tabique)))
  const puerta = caja(0, 0.05, 0, 1.95, 0, Wb.puerta.y1 - Wb.puerta.y0, mat(COLORES.blanco))
  const bisagra = new THREE.Group()
  bisagra.position.set(Wb.x0, 0, Wb.puerta.y0)
  puerta.position.set(-0.025, 0.975, (Wb.puerta.y1 - Wb.puerta.y0) / 2)
  bisagra.add(puerta)
  bisagra.rotation.y = 0.6
  g.add(bisagra)
  g.add(caja(Wb.x0 + 0.1, Wb.x1 - 0.05, 0.005, 0.012, Wb.y0 + 0.1, Wb.y1 - 0.05, mat('#e3f1f7'), { sombra: false }))
  g.add(cilindro(44.4, 6.4, 0.2, 0, 0.42, mat('#ffffff'), 0.22))
  g.add(caja(44.65, 44.9, 0.4, 0.9, 6.2, 6.6, mat('#ffffff'), { r: 0.04 }))
  g.add(caja(44.45, 44.9, 0.75, 0.85, 5.15, 5.75, mat('#ffffff'), { r: 0.04 }))
  g.add(caja(44.89, 44.92, 1.1, 1.75, 5.2, 5.7, mat('#cfe8f5', { roughness: 0.1, metalness: 0.3 }), { sombra: false }))

  // Balcón del lado abierto: ventanal corredizo, piso de madera, baranda de vidrio, plantas y dos sillitas.
  const L = M.balcon
  g.add(vidriera(D.y0 + 0.3, Wb.y0, D.x1, 'z', 2.1, [L.puerta.y0, L.puerta.y1]))
  g.add(caja(L.x0, L.x1, -EJECUTIVO.tarima, 0.0, L.y0, L.y1, mat(COLORES.madera), { r: 0.02 }))
  const baranda = mat('#a9a0c4', { roughness: 0.4 })
  g.add(caja(L.x1 - 0.04, L.x1, 0, 1.0, L.y0, L.y1, VIDRIO(), { sombra: false, recibe: false }))
  g.add(caja(L.x0, L.x1, 0, 1.0, L.y0, L.y0 + 0.04, VIDRIO(), { sombra: false, recibe: false }))
  g.add(caja(L.x0, L.x1, 0, 1.0, L.y1 - 0.04, L.y1, VIDRIO(), { sombra: false, recibe: false }))
  for (const [x0, x1, z0, z1] of [[L.x1 - 0.06, L.x1, L.y0, L.y1], [L.x0, L.x1, L.y0, L.y0 + 0.06], [L.x0, L.x1, L.y1 - 0.06, L.y1]]) g.add(caja(x0, x1, 0.98, 1.04, z0, z1, baranda))
  g.add(planta(L.x1 - 0.4, L.y0 + 0.4, 1.1))
  g.add(planta(L.x1 - 0.4, L.y1 - 0.4, 1.0))
  for (const z of [2.2, 3.0]) g.add(silla(46.1, z, -Math.PI / 2, COLORES.amarillo))
  g.add(cilindro(45.6, 2.6, 0.25, 0.5, 0.54, mat(COLORES.blanco)))
  g.add(cilindro(45.6, 2.6, 0.03, 0, 0.5, mat(COLORES.gris)))

  // Plantas grandes y la camita de Roberta.
  g.add(planta(31.0, 6.4, 1.3))
  g.add(planta(41.6, 6.4, 1.1))
  const cama = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 12, 28), mat('#e86df2', { roughness: 0.95 }))
  cama.rotation.x = Math.PI / 2
  cama.position.set(ROBERTA.cama.x, 0.1, ROBERTA.cama.y)
  cama.castShadow = true
  g.add(cama)
  g.add(cilindro(ROBERTA.cama.x, ROBERTA.cama.y, 0.3, 0.02, 0.08, mat('#f6c6ef', { roughness: 1 })))
  const cartel = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.42), new THREE.MeshStandardMaterial({ map: textoTextura('Dirección general · Daniela', { fondo: '#3b2f4f', color: '#f6dd8b', tam: 50, ancho: 900 }), transparent: true }))
  cartel.position.set(D.puerta.x - 2.6, 1.85, D.y1 + 0.06)
  g.add(cartel)
  const luz = new THREE.PointLight('#ffd08a', 0, 8, 1.5)
  luz.position.set(36.5, 2.1, 3.5)
  g.add(luz)

  // Sala de espera (a nivel del piso, frente a su puerta): las sillas miran a su oficina.
  const E = ZONAS.espera
  raiz.add(alfombra(E.x0 + 0.1, E.x1 - 0.2, E.y0 + 0.4, E.y1 - 0.2, COLORES.lilaClaro))
  for (const a of asientosEspera()) if (a.pose === 'sentado') raiz.add(silla(a.x, a.y, a.mira, COLORES.menta))
  raiz.add(planta(44.6, 12.6, 0.9))
  return { grupo: raiz, escritorio, luz }
}
