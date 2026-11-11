// El edificio de la Oficina en 3D. Coordenadas: x del plano = x, y del plano = z, altura = y.
// Las medidas y los lugares salen de oficinaPlano.mjs.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PISO, ZONAS, PUFS, FONDO_OFICINAS, MESA_REUNION, PUERTA_REUNION, asientosReunion, DIRECCION, DANIELA, VISITA, asientosEspera, estiloDe, CUADROS_PDG, MUEBLES_DIRECCION, ROBERTA } from '../oficinaPlano.mjs'
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

// Oficina del fondo (de uno o compartida): paredes, frente de vidrio con puerta, ventana, alfombra, decoración y, si
// es de un grupo, su cartel. o: el `oficina` de oficinaPlano.mjs.
export function crearOficina(o) {
  const g = new THREE.Group()
  const altoTabique = 2.1
  const estilo = estiloDe(o.id)
  const acento = mat(estilo.pared)
  {
    g.add(caja(o.x0, o.x0 + 0.08, 0, altoTabique, 0, FONDO_OFICINAS, mat(COLORES.tabique), { r: 0.02 }))
    g.add(caja(o.x1 - 0.08, o.x1, 0, altoTabique, 0, FONDO_OFICINAS, mat(COLORES.tabique), { r: 0.02 }))
    g.add(vidriera(o.x0, o.x1, FONDO_OFICINAS, 'x', altoTabique, [o.puerta.x - 0.5, o.puerta.x + 0.5]))
    g.add(alfombraConEstilo(o.x0 + 0.3, o.x1 - 0.3, 0.3, FONDO_OFICINAS - 0.3, estilo.alfombra))
    g.add(caja(o.x0 + 0.08, o.x1 - 0.08, 0.15, altoTabique, 0.004, 0.012, acento, { sombra: false }))
    const cx = (o.x0 + o.x1) / 2
    g.add(ventana(cx - 0.9, cx + 0.9, 'fondo'))
    if (o.nombre && !o.jefa) {
      const ancho = Math.min(o.x1 - o.x0 - 1.8, 0.24 * o.nombre.length + 0.6)
      const cartel = new THREE.Mesh(new THREE.PlaneGeometry(ancho, 0.34), new THREE.MeshStandardMaterial({ map: textoTextura(o.nombre, { fondo: COLORES.lila, tam: 60, ancho: 640 }), transparent: true }))
      cartel.position.set(o.x0 + 0.3 + ancho / 2, 1.85, FONDO_OFICINAS + 0.06)
      g.add(cartel)
    }
    if (!o.jefa) {
      g.add(planta(o.x1 - 0.45, 0.45, 0.8))
      g.add(caja(o.x0 + 0.15, o.x0 + 0.75, 0, 0.9, 0.1, 0.5, mat(COLORES.blanco), { r: 0.03 }))
      // Cuadros y objeto de pared a los costados de la ventana, de adentro hacia afuera.
      const piezas = [...estilo.cuadros.map(t => ({ t, w: 0.86, h: 0.64 })), ...(estilo.objeto === 'tablero' || estilo.objeto === 'corcho' ? [{ t: estilo.objeto, w: 1.1, h: 0.72 }] : [])]
      let izq = cx - 1.05, der = cx + 1.05
      piezas.forEach((pz, k) => {
        const aIzq = k % 2 === 0
        const x = aIzq ? izq - pz.w / 2 : der + pz.w / 2
        if (x - pz.w / 2 < o.x0 + 0.2 || x + pz.w / 2 > o.x1 - 0.2) return
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
    cartel.position.set(o.puerta.x + 1.6, 1.85, FONDO_OFICINAS + 0.06)
    g.add(cartel)
    // Su oficina tiene luz propia de noche (la escena la prende si ella está).
    const luz = new THREE.PointLight('#ffcf8a', 0, 6, 1.6)
    luz.position.set((o.x0 + o.x1) / 2, 2.0, 2.2)
    g.add(luz)
    g.userData.luz = luz
  }
  return g
}

// Todo lo común: piso, paredes, tablones y salas. mesa / mesaP: { x0, x1, y0, y1 } de los tablones de UP y de PDG.
export function crearSala(mesa, mesaP) {
  const g = new THREE.Group()
  const { ancho: W, fondo: D, pared: P } = PISO

  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: texturaPiso(), roughness: 0.65 }))
  piso.rotation.x = -Math.PI / 2
  piso.position.set(W / 2, 0, D / 2)
  piso.receiveShadow = true
  g.add(piso)
  g.add(caja(-0.2, W, 0, P, -0.2, 0, mat(COLORES.pared), { sombra: false }))
  g.add(caja(-0.2, 0, 0, P, -0.2, D, mat(COLORES.paredLado), { sombra: false }))
  g.add(caja(0, W, 0, 0.14, 0, 0.04, mat(COLORES.zocalo), { sombra: false }))
  g.add(caja(0, 0.04, 0, 0.14, 0, D, mat(COLORES.zocalo), { sombra: false }))

  // Reloj con la hora real, en la pared izquierda del corredor.
  const reloj = new THREE.Group()
  reloj.position.set(0.05, 1.7, 5.5)
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
  const Z = ZONAS
  for (const z of Object.values(Z)) g.add(textoEnPiso(z.nombre, (z.x0 + z.x1) / 2, z.y1 - 0.45))

  // UP: el tablón con las PC enfrentadas.
  g.add(alfombra(Z.up.x0 + 0.3, Z.up.x1 - 0.3, Z.up.y0 + 0.6, Z.up.y1 - 0.9, COLORES.duraznoClaro))
  g.add(caja(mesa.x0, mesa.x1, 0.7, 0.76, mesa.y0, mesa.y1, mat(COLORES.madera), { r: 0.03 }))
  g.add(caja(mesa.x0 + 0.1, mesa.x1 - 0.1, 0.3, 0.36, (mesa.y0 + mesa.y1) / 2 - 0.08, (mesa.y0 + mesa.y1) / 2 + 0.08, mat(COLORES.maderaOscura)))
  for (const x of [mesa.x0 + 0.15, mesa.x1 - 0.15]) g.add(caja(x - 0.05, x + 0.05, 0, 0.7, mesa.y0 + 0.1, mesa.y1 - 0.1, mat(COLORES.maderaOscura)))
  g.add(planta(Z.up.x0 + 0.5, Z.up.y0 + 0.5, 1.1))
  g.add(planta(Z.up.x1 - 0.5, Z.up.y0 + 0.5, 0.9))

  // PDG comercial: su tablón a lo largo de la pared izquierda y, en la pared, el sistema de punta a punta.
  const Pz = Z.pdg
  g.add(alfombra(Pz.x0 + 0.25, Pz.x1 - 0.4, Pz.y0 + 0.9, Math.min(Pz.y1 - 1.0, mesaP.y1 + 1.6), COLORES.mentaClaro))
  g.add(caja(mesaP.x0, mesaP.x1, 0.7, 0.76, mesaP.y0, mesaP.y1, mat(COLORES.madera), { r: 0.03 }))
  g.add(caja((mesaP.x0 + mesaP.x1) / 2 - 0.08, (mesaP.x0 + mesaP.x1) / 2 + 0.08, 0.3, 0.36, mesaP.y0 + 0.1, mesaP.y1 - 0.1, mat(COLORES.maderaOscura)))
  for (const z of [mesaP.y0 + 0.15, mesaP.y1 - 0.15]) g.add(caja(mesaP.x0 + 0.1, mesaP.x1 - 0.1, 0, 0.7, z - 0.05, z + 0.05, mat(COLORES.maderaOscura)))
  const paso = (mesaP.y1 - mesaP.y0 + 2.2) / CUADROS_PDG.length
  CUADROS_PDG.forEach((tipo, k) => {
    const marco = cuadroDeArea(tipo, { x: 0, y: 1.55, z: 0, w: 0.9, h: 0.66 })
    marco.rotation.y = Math.PI / 2
    marco.position.set(0.02, 0, mesaP.y0 - 0.9 + paso * (k + 0.5))
    g.add(marco)
  })
  const ventasPdg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.4), new THREE.MeshStandardMaterial({ map: textoTextura('Ventas PDG', { fondo: COLORES.menta, tam: 62 }), transparent: true }))
  ventasPdg.rotation.y = Math.PI / 2
  ventasPdg.position.set(0.03, 2.2, (mesaP.y0 + mesaP.y1) / 2)
  g.add(ventasPdg)
  g.add(ventana(16.5, 20.5, 'izquierda'))
  g.add(globo(0.6, Pz.y1 - 2.2))
  g.add(planta(4.4, Pz.y1 - 0.6, 1.2))
  g.add(planta(0.6, Pz.y1 - 0.6, 1.0))

  // Sala de reuniones: vidriada, mesa redonda con sillas en herradura y pantalla con cámara.
  const R = Z.reuniones
  g.add(alfombra(R.x0 + 0.2, R.x1 - 0.2, R.y0 + 0.2, R.y1 - 0.2, COLORES.lilaClaro))
  g.add(vidriera(R.x0, R.x1, R.y0, 'x', 2.1))
  g.add(vidriera(R.x0, R.x1, R.y1, 'x', 2.1, [PUERTA_REUNION.x - 0.5, PUERTA_REUNION.x + 0.5]))
  g.add(vidriera(R.y0, R.y1, R.x0, 'z', 2.1))
  g.add(vidriera(R.y0, R.y1, R.x1, 'z', 2.1))
  const MR = MESA_REUNION
  // Mesa redonda: tapa, pie central y base; las sillas en herradura mirando a la mesa (el lado de la pantalla, libre).
  g.add(cilindro(MR.x, MR.y, MR.radio, 0.7, 0.76, mat(COLORES.blanco), MR.radio, 48))
  g.add(cilindro(MR.x, MR.y, 0.14, 0, 0.7, mat(COLORES.gris)))
  g.add(cilindro(MR.x, MR.y, 0.55, 0, 0.05, mat(COLORES.gris)))
  g.add(cilindro(MR.x, MR.y, 0.32, 0.76, 0.79, mat(COLORES.mentaClaro), 0.32, 32))
  for (const a of asientosReunion()) if (a.pose === 'sentado') g.add(silla(a.x, a.y, a.mira, COLORES.menta))
  // Pantalla con cámara en la cabecera: desde ahí los ves cuando hay reunión.
  g.add(caja(25.55, 25.65, 0, 1.05, 9.85, 10.15, mat(COLORES.gris)))
  g.add(caja(25.5, 25.62, 1.05, 1.85, 9.3, 10.7, mat(COLORES.negro), { r: 0.02 }))
  g.add(caja(25.47, 25.5, 1.1, 1.8, 9.36, 10.64, mat('#2a3550', { emissive: '#3a5a9a', emissiveIntensity: 0.4 }), { sombra: false }))
  g.add(cilindro(25.52, 10, 0.04, 1.86, 1.94, mat(COLORES.negro)))
  g.add(planta(R.x0 + 0.45, R.y1 - 0.45, 0.9))

  // Cafetería: barra con cafetera, vitrina y banquetas; mesa alta.
  const C = Z.cafeteria
  g.add(alfombra(C.x0 + 0.3, C.x1 - 0.3, C.y0 + 0.9, C.y1 - 0.9, COLORES.rosaClaro))
  g.add(caja(28.3, 35.7, 0, 1.0, 7.0, 7.8, mat(COLORES.rosa), { r: 0.04 }))
  g.add(caja(28.2, 35.8, 1.0, 1.07, 6.95, 7.9, mat(COLORES.blanco)))
  g.add(caja(28.6, 29.4, 1.07, 1.6, 7.1, 7.6, mat('#6d6383'), { r: 0.05 }))
  const luzCafetera = caja(28.95, 29.05, 1.4, 1.46, 7.6, 7.62, new THREE.MeshStandardMaterial({ color: '#ff7a7a', emissive: '#ff4d4d', emissiveIntensity: 1.2 }), { sombra: false })
  g.add(luzCafetera)
  g.add(caja(33.2, 35.2, 1.07, 1.5, 7.1, 7.7, mat('#e9f6ff', { transparent: true, opacity: 0.45 }), { sombra: false }))
  for (const [x, c] of [[33.6, '#e8b15b'], [34.1, '#f6a5c0'], [34.6, '#c98a4b']]) g.add(cilindro(x, 7.4, 0.14, 1.1, 1.2, mat(c)))
  for (const x of [29.3, 30.9, 32.5, 34.1]) { g.add(cilindro(x, 8.6, 0.04, 0, 0.62, mat(COLORES.gris))); g.add(cilindro(x, 8.6, 0.22, 0.62, 0.68, mat(COLORES.amarillo))) }
  g.add(cilindro(31.7, 11.3, 0.05, 0, 1.05, mat(COLORES.gris)))
  g.add(cilindro(31.7, 11.3, 0.45, 1.05, 1.1, mat(COLORES.blanco)))
  g.add(planta(C.x1 - 0.5, C.y1 - 0.9, 1))
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: textoTextura('Cafetería', { fondo: COLORES.rosa, tam: 64 }), transparent: true }))
  menu.position.set(32, 2.0, 7.0)
  g.add(menu)

  // Comedor: dos mesas con sillas y platos.
  const M = Z.comedor
  g.add(alfombra(M.x0 + 0.4, M.x1 - 0.4, M.y0 + 0.6, M.y1 - 1.0, COLORES.amarilloClaro))
  for (const [x0, x1] of [[8.4, 11.0], [12.4, 15.0]]) {
    g.add(caja(x0, x1, 0.7, 0.76, 16.4, 17.4, mat(COLORES.madera), { r: 0.03 }))
    for (const x of [x0 + 0.1, x1 - 0.1]) g.add(caja(x - 0.05, x + 0.05, 0, 0.7, 16.5, 17.3, mat(COLORES.maderaOscura)))
    for (const x of [x0 + 0.65, x0 + 1.95]) {
      g.add(silla(x, 15.75, 0, COLORES.menta))
      g.add(silla(x, 18.05, Math.PI, COLORES.menta))
      for (const z of [16.65, 17.15]) g.add(cilindro(x, z, 0.16, 0.76, 0.79, mat('#ffffff')))
    }
    g.add(cilindro((x0 + x1) / 2, 16.9, 0.08, 0.76, 1.0, mat('#bfe3ff', { transparent: true, opacity: 0.75 })))
  }
  g.add(planta(M.x0 + 0.5, M.y1 - 0.6, 1.1))

  // Ocio: sillón, mesita, pufs, biblioteca baja y planta grande.
  const O = Z.ocio
  g.add(alfombra(O.x0 + 0.5, O.x1 - 0.5, O.y0 + 0.5, O.y1 - 0.8, COLORES.lilaClaro))
  g.add(caja(19.4, 23.6, 0, 1.05, 15.2, 15.6, mat(COLORES.rosa), { r: 0.12 }))
  g.add(caja(19.6, 23.4, 0, 0.42, 15.55, 16.6, mat(COLORES.rosaClaro), { r: 0.1 }))
  g.add(caja(19.25, 19.65, 0, 0.7, 15.2, 16.6, mat(COLORES.rosa), { r: 0.1 }))
  g.add(caja(23.35, 23.75, 0, 0.7, 15.2, 16.6, mat(COLORES.rosa), { r: 0.1 }))
  for (const x of [20.1, 21.5, 22.9]) {
    const a = caja(x - 0.32, x + 0.32, 0.42, 0.86, 15.55, 15.75, mat(COLORES.amarillo), { r: 0.08 })
    a.rotation.x = -0.15
    g.add(a)
  }
  g.add(caja(20.6, 22.4, 0.36, 0.42, 17.8, 18.6, mat(COLORES.blanco), { r: 0.05 }))
  for (const [x, z] of [[20.75, 17.95], [22.25, 17.95], [20.75, 18.45], [22.25, 18.45]]) g.add(cilindro(x, z, 0.03, 0, 0.36, mat(COLORES.gris)))
  PUFS.forEach((p, k) => {
    const puf = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), mat([COLORES.amarillo, COLORES.menta, COLORES.durazno][k % 3]))
    puf.scale.set(1, 0.55, 1)
    puf.position.set(p.x, 0.25, p.y)
    puf.castShadow = true; puf.receiveShadow = true
    g.add(puf)
  })
  g.add(caja(O.x1 - 0.6, O.x1 - 0.2, 0, 1.2, 15.2, 17.6, mat(COLORES.madera), { r: 0.03 }))
  ;['#f6a5c0', '#8fd9bd', '#b9a2e8', '#f7b98b'].forEach((c, k) => g.add(caja(O.x1 - 0.55, O.x1 - 0.25, 0.75, 1.1, 15.4 + k * 0.5, 15.7 + k * 0.5, mat(c))))
  g.add(planta(O.x0 + 0.6, O.y1 - 0.9, 1.4))

  // Ping pong.
  const G = Z.ping
  g.add(alfombra(G.x0 + 0.4, G.x1 - 0.4, G.y0 + 1.2, G.y1 - 1.4, COLORES.mentaClaro))
  g.add(caja(29.6, 33.8, 0.66, 0.72, 17.0, 18.6, mat('#9f86df'), { r: 0.01 }))
  g.add(caja(29.62, 33.78, 0.725, 0.727, 17.78, 17.82, mat('#ffffff'), { sombra: false }))
  for (const [x, z] of [[29.8, 17.15], [33.6, 17.15], [29.8, 18.45], [33.6, 18.45]]) g.add(cilindro(x, z, 0.05, 0, 0.66, mat(COLORES.gris)))
  g.add(caja(31.68, 31.72, 0.72, 0.9, 16.95, 18.65, mat('#ffffff', { transparent: true, opacity: 0.75 }), { sombra: false }))
  g.add(planta(G.x1 - 0.5, G.y0 + 0.7, 1.1))
  g.add(planta(G.x0 + 0.5, G.y1 - 0.7, 0.9))

  // Lámparas colgantes de las salas comunes y una luz cálida por sala (se prenden de noche).
  const lamparas = materialLampara()
  const luces = []
  const sala = (x, z, focos) => {
    for (const [fx, fz] of focos) g.add(lamparaColgante(fx, fz, 1.9, lamparas))
    const luz = new THREE.PointLight('#ffd59a', 0, 9, 1.5)
    luz.position.set(x, 2.1, z)
    g.add(luz)
    luces.push(luz)
  }
  const medio = (mesa.x0 + mesa.x1) / 2
  sala(medio, 10.4, [[mesa.x0 + 1.2, 10.4], [medio, 10.4], [mesa.x1 - 1.2, 10.4]])
  sala(22.25, 10, [[21.2, 10], [23.3, 10]])
  sala(31.8, 9.5, [[29.9, 8.4], [32.5, 8.4], [31.7, 11.3]])
  sala(11.7, 17.4, [[9.7, 16.9], [13.7, 16.9]])
  sala(22, 17.5, [[21.5, 18.2]])
  sala(31.7, 17.8, [[30.6, 17.8], [32.8, 17.8]])

  return { grupo: g, agujas, luzCafetera, lamparas, luces }
}

// El ala de Dirección: la oficina de Daniela (la más grande del edificio), la sala de espera y un jardín.
// Devuelve su escritorio (pantalla y lámpara) y la luz de su oficina para la escena.
export function crearDireccion() {
  const g = new THREE.Group()
  const D = DIRECCION
  const M = MUEBLES_DIRECCION
  g.add(alfombraConEstilo(37.4, 44.2, 1.4, 8.3, { patron: 'borde', colores: ['#f3e6c4', '#c9a24a'] }))
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
  for (let x = B.x0; x <= B.x1 + 1e-6; x += (B.x1 - B.x0) / 8) g.add(caja(x - 0.03, x + 0.03, 0, 2.55, 0.02, B.y1, nogal))
  const tonos = ['#f6a5c0', '#8fd9bd', '#b9a2e8', '#f7b98b', '#f6dd8b', '#9fc5f8', '#e2b552', '#e86df2', '#c8323f', '#3b4a8a', '#6fb07a', '#e9e2d2']
  let semilla = 11
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647 }
  for (const base of [0.05, 0.67, 1.27, 1.87]) {
    let x = B.x0 + 0.08
    while (x < B.x1 - 0.1) {
      if (Math.abs(((x - B.x0) / ((B.x1 - B.x0) / 8)) % 1) < 0.04) { x += 0.07; continue }
      const ancho = 0.05 + azar() * 0.05, alto = 0.36 + azar() * 0.16
      if (azar() < 0.06) { // de vez en cuando, libros acostados o un adorno
        g.add(caja(x, x + 0.3, base, base + 0.12, 0.12, 0.42, mat(tonos[Math.floor(azar() * tonos.length)])))
        x += 0.36
        continue
      }
      g.add(caja(x, x + ancho, base, base + alto, 0.1, 0.44, mat(tonos[Math.floor(azar() * tonos.length)]), { sombra: false }))
      x += ancho + 0.006
    }
  }

  // Tele en la pared izquierda, con el sillón y la mesita enfrente.
  g.add(caja(D.x0 + 0.05, D.x0 + 0.12, 0.85, 1.95, 4.5, 6.5, mat(COLORES.negro), { r: 0.02 }))
  g.add(caja(D.x0 + 0.12, D.x0 + 0.13, 0.9, 1.9, 4.56, 6.44, mat('#2a3550', { emissive: '#4a6ab0', emissiveIntensity: 0.45 }), { sombra: false }))
  g.add(caja(D.x0 + 0.05, D.x0 + 0.5, 0, 0.45, 4.6, 6.4, mat(COLORES.nogal), { r: 0.03 }))
  const S = M.sillon
  g.add(caja(S.x1 - 0.32, S.x1, 0, 1.0, S.y0, S.y1, mat(COLORES.lila), { r: 0.1 }))
  g.add(caja(S.x0, S.x1 - 0.3, 0, 0.45, S.y0 + 0.2, S.y1 - 0.2, mat(COLORES.lilaClaro), { r: 0.1 }))
  for (const z of [S.y0, S.y1 - 0.22]) g.add(caja(S.x0, S.x1, 0, 0.68, z, z + 0.22, mat(COLORES.lila), { r: 0.08 }))
  for (const z of [4.9, 5.5, 6.1]) g.add(caja(S.x1 - 0.42, S.x1 - 0.22, 0.45, 0.85, z - 0.25, z + 0.25, mat(COLORES.amarillo), { r: 0.08 }))
  g.add(cilindro(M.mesita.x, M.mesita.y, M.mesita.radio, 0.38, 0.43, mat(COLORES.blanco), M.mesita.radio, 28))
  g.add(cilindro(M.mesita.x, M.mesita.y, 0.04, 0, 0.38, mat(COLORES.dorado)))

  // Baño privado en el rincón: paredes, puerta entreabierta, inodoro, lavatorio y espejo.
  const W = M.bano
  const azulejo = mat('#e3f1f7')
  g.add(caja(W.x0, W.x1, 0, 2.1, W.y0, W.y0 + 0.08, mat(COLORES.tabique), { r: 0.02 }))
  g.add(caja(W.x1 - 0.08, W.x1, 0, 2.1, W.y0, W.puerta.y0, mat(COLORES.tabique)))
  g.add(caja(W.x1 - 0.08, W.x1, 0, 2.1, W.puerta.y1, W.y1, mat(COLORES.tabique)))
  g.add(caja(W.x1 - 0.08, W.x1, 1.95, 2.1, W.puerta.y0, W.puerta.y1, mat(COLORES.tabique)))
  const puerta = caja(0, 0.05, 0, 1.95, 0, W.puerta.y1 - W.puerta.y0, mat(COLORES.blanco))
  const bisagra = new THREE.Group()
  bisagra.position.set(W.x1, 0, W.puerta.y0)
  puerta.position.set(0.025, 0.975, (W.puerta.y1 - W.puerta.y0) / 2)
  bisagra.add(puerta)
  bisagra.rotation.y = -0.6
  g.add(bisagra)
  g.add(caja(W.x0 + 0.05, W.x1 - 0.1, 0.005, 0.012, W.y0 + 0.1, W.y1 - 0.05, azulejo, { sombra: false }))
  g.add(cilindro(36.55, 8.4, 0.2, 0, 0.42, mat('#ffffff'), 0.22))
  g.add(caja(36.1, 36.35, 0.4, 0.9, 8.2, 8.6, mat('#ffffff'), { r: 0.04 }))
  g.add(caja(36.1, 36.55, 0.75, 0.85, 7.3, 7.9, mat('#ffffff'), { r: 0.04 }))
  g.add(caja(36.08, 36.11, 1.1, 1.75, 7.35, 7.85, mat('#cfe8f5', { roughness: 0.1, metalness: 0.3 }), { sombra: false }))
  g.add(planta(38.15, 8.6, 0.6))

  // Balcón del lado abierto: ventanal corredizo, piso de madera, baranda, plantas y dos sillitas.
  const L = M.balcon
  g.add(vidriera(D.y0 + 0.3, D.y1 - 0.3, D.x1, 'z', 2.1, [L.puerta.y0, L.puerta.y1]))
  g.add(caja(L.x0, L.x1, -0.12, 0.0, L.y0, L.y1, mat(COLORES.madera), { r: 0.02 }))
  const baranda = mat('#a9a0c4', { roughness: 0.4 })
  g.add(caja(L.x1 - 0.04, L.x1, 0, 1.0, L.y0, L.y1, VIDRIO(), { sombra: false, recibe: false }))
  g.add(caja(L.x0, L.x1, 0, 1.0, L.y0, L.y0 + 0.04, VIDRIO(), { sombra: false, recibe: false }))
  g.add(caja(L.x0, L.x1, 0, 1.0, L.y1 - 0.04, L.y1, VIDRIO(), { sombra: false, recibe: false }))
  for (const [x0, x1, z0, z1] of [[L.x1 - 0.06, L.x1, L.y0, L.y1], [L.x0, L.x1, L.y0, L.y0 + 0.06], [L.x0, L.x1, L.y1 - 0.06, L.y1]]) g.add(caja(x0, x1, 0.98, 1.04, z0, z1, baranda))
  g.add(planta(L.x1 - 0.4, L.y0 + 0.4, 1.1))
  g.add(planta(L.x1 - 0.4, L.y1 - 0.4, 1.0))
  for (const z of [4.9, 5.7]) g.add(silla(46.1, z, -Math.PI / 2, COLORES.amarillo))
  g.add(cilindro(45.6, 5.3, 0.25, 0.5, 0.54, mat(COLORES.blanco)))
  g.add(cilindro(45.6, 5.3, 0.03, 0, 0.5, mat(COLORES.gris)))

  // Plantas grandes y la camita de Roberta.
  g.add(planta(44.5, 8.5, 1.4))
  g.add(planta(44.5, 0.85, 1.2))
  const cama = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 12, 28), mat('#e86df2', { roughness: 0.95 }))
  cama.rotation.x = Math.PI / 2
  cama.position.set(ROBERTA.cama.x, 0.1, ROBERTA.cama.y)
  cama.castShadow = true
  g.add(cama)
  g.add(cilindro(ROBERTA.cama.x, ROBERTA.cama.y, 0.3, 0.02, 0.08, mat('#f6c6ef', { roughness: 1 })))
  const cartel = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.42), new THREE.MeshStandardMaterial({ map: textoTextura('Dirección general · Daniela', { fondo: '#3b2f4f', color: '#f6dd8b', tam: 50, ancho: 900 }), transparent: true }))
  cartel.position.set(38.2, 1.85, D.y1 + 0.06)
  g.add(cartel)
  // Su luz: la escena la prende de noche.
  const luz = new THREE.PointLight('#ffd08a', 0, 8, 1.5)
  luz.position.set(40.5, 2.1, 4.5)
  g.add(luz)
  // Sala de espera: las sillas miran a su oficina; mesita con revistas y planta.
  g.add(alfombra(36.6, 44.6, 9.9, 12.6, COLORES.lilaClaro))
  for (const a of asientosEspera()) if (a.pose === 'sentado') g.add(silla(a.x, a.y, a.mira, COLORES.menta))
  g.add(textoEnPiso('Sala de espera', 40.5, 13.0))
  g.add(planta(44.5, 12.2, 0.9))
  // Jardín.
  g.add(alfombra(36.6, 44.6, 14.6, 21.6, '#cfeccb'))
  for (const [x, z, e] of [[37.4, 15.4, 1.3], [44.1, 15.6, 1.1], [38.2, 20.8, 1.5], [43.6, 20.6, 1.2], [40.8, 18.1, 1.7]]) g.add(planta(x, z, e))
  for (const [x0, x1, z] of [[38.4, 40.0, 16.8], [41.4, 43.0, 19.4]]) {
    g.add(caja(x0, x1, 0.38, 0.46, z - 0.25, z + 0.25, mat(COLORES.madera), { r: 0.03 }))
    for (const x of [x0 + 0.15, x1 - 0.15]) g.add(caja(x - 0.05, x + 0.05, 0, 0.38, z - 0.2, z + 0.2, mat(COLORES.maderaOscura)))
  }
  g.add(textoEnPiso('Jardín', 40.5, 21.5))
  return { grupo: g, escritorio, luz }
}
