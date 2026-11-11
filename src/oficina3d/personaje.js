// Personaje 3D de la Oficina: un muñequito con piernas y brazos articulados, cabeza grande, pelo, ojos y boca.
// Medidas en baldosas (1 = una baldosa del piso). El origen está en los pies y mira hacia +z.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export const PIELES = ['#f3cfb0', '#d9a67c', '#a9714b']
export const PELOS = ['#3b2a22', '#7a4527', '#d9a94a', '#2e2a40', '#9d72c9']
const PANTALON = '#5a5277'
const ZAPATO = '#3b3450'

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra })
const caja = (w, h, d, r, material) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material)
  m.castShadow = true
  return m
}
const esfera = (r, material, seg = 20) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), material)
  m.castShadow = true
  return m
}

// ropa: color CSS (los trabajadores, su color de identidad). v: { pelo, colorPelo, piel } de variante().
export function crearPersonaje({ ropa, v }) {
  const grupo = new THREE.Group()
  const cuerpo = new THREE.Group() // todo lo que se balancea al caminar
  grupo.add(cuerpo)
  const mPiel = mat(PIELES[v.piel])
  const mRopa = mat(ropa)
  const mPelo = mat(PELOS[v.colorPelo], { roughness: 0.9 })
  const mPantalon = mat(PANTALON)

  const pierna = lado => {
    const p = new THREE.Group()
    p.position.set(0.1 * lado, 0.42, 0)
    const m = caja(0.17, 0.4, 0.19, 0.06, mPantalon)
    m.position.y = -0.2
    const zapato = caja(0.18, 0.08, 0.25, 0.035, mat(ZAPATO))
    zapato.position.set(0, -0.38, 0.03)
    p.add(m, zapato)
    cuerpo.add(p)
    return p
  }
  const piernaI = pierna(-1)
  const piernaD = pierna(1)

  const torso = caja(0.46, 0.42, 0.28, 0.1, mRopa)
  torso.position.y = 0.63
  cuerpo.add(torso)

  const brazo = lado => {
    const b = new THREE.Group()
    b.position.set(0.29 * lado, 0.79, 0)
    const m = caja(0.13, 0.34, 0.15, 0.06, mRopa)
    m.position.y = -0.15
    const mano = esfera(0.068, mPiel, 14)
    mano.position.y = -0.34
    b.add(m, mano)
    cuerpo.add(b)
    return { grupo: b, mano }
  }
  const brazoI = brazo(-1)
  const brazoD = brazo(1)

  const cabeza = new THREE.Group()
  cabeza.position.y = 1.1
  cuerpo.add(cabeza)
  const craneo = esfera(0.26, mPiel, 28)
  craneo.scale.set(1, 0.94, 0.95)
  cabeza.add(craneo)

  // Pelo según la variante.
  const casco = new THREE.Mesh(new THREE.SphereGeometry(0.272, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52), mPelo)
  casco.rotation.x = -0.32
  casco.castShadow = true
  cabeza.add(casco)
  if (v.pelo === 1) { const rodete = esfera(0.11, mPelo); rodete.position.set(0, 0.27, -0.08); cabeza.add(rodete) }
  if (v.pelo === 2) {
    const largo = caja(0.5, 0.42, 0.14, 0.06, mPelo)
    largo.position.set(0, -0.1, -0.16)
    cabeza.add(largo)
  }
  if (v.pelo === 3) {
    for (const [x, y, z] of [[-0.2, 0.12, 0.05], [-0.1, 0.22, 0.02], [0.06, 0.24, 0], [0.19, 0.14, 0.02], [0, 0.16, -0.18], [-0.18, 0.02, -0.12], [0.18, 0.02, -0.12]]) {
      const rulo = esfera(0.1, mPelo, 12)
      rulo.position.set(x, y, z)
      cabeza.add(rulo)
    }
  }

  // Cara: ojos con brillo, cejas, mejillas y boca.
  const mNegro = mat('#2a2236', { roughness: 0.4 })
  const ojos = new THREE.Group()
  for (const lado of [-1, 1]) {
    const ojo = esfera(0.038, mNegro, 12)
    ojo.scale.set(1, 1.25, 0.6)
    ojo.position.set(0.09 * lado, 0.0, 0.235)
    const brillo = esfera(0.012, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), 8)
    brillo.position.set(0.09 * lado + 0.012, 0.018, 0.255)
    ojos.add(ojo, brillo)
  }
  cabeza.add(ojos)
  const cejas = new THREE.Group()
  for (const lado of [-1, 1]) {
    const ceja = caja(0.07, 0.014, 0.02, 0.006, mNegro)
    ceja.position.set(0.09 * lado, 0.075, 0.235)
    ceja.userData.lado = lado
    cejas.add(ceja)
  }
  cabeza.add(cejas)
  for (const lado of [-1, 1]) {
    const mejilla = esfera(0.04, mat('#f59ab0', { transparent: true, opacity: 0.55 }), 10)
    mejilla.scale.set(1, 0.6, 0.3)
    mejilla.position.set(0.15 * lado, -0.06, 0.215)
    cabeza.add(mejilla)
  }
  const boca = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), mNegro)
  boca.position.set(0, -0.085, 0.236)
  cabeza.add(boca)

  // Objetos que aparecen según dónde esté: una taza de café o una paleta de ping pong en la mano derecha.
  const taza = new THREE.Group()
  const cuerpoTaza = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 14), mat('#fffaf3'))
  const asa = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 10), mat('#fffaf3'))
  asa.position.x = 0.06
  taza.add(cuerpoTaza, asa)
  taza.position.set(0, -0.4, 0.05)
  taza.visible = false
  brazoD.grupo.add(taza)
  const paleta = new THREE.Group()
  const goma = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 18), mat('#e85d6a'))
  goma.rotation.x = Math.PI / 2
  goma.position.y = -0.12
  const mango = caja(0.04, 0.12, 0.03, 0.01, mat('#c49a6c'))
  paleta.add(goma, mango)
  paleta.position.set(0, -0.42, 0.04)
  paleta.visible = false
  brazoD.grupo.add(paleta)

  return { grupo, cuerpo, piernaI, piernaD, brazoI: brazoI.grupo, brazoD: brazoD.grupo, cabeza, ojos, cejas, boca, taza, paleta, torso }
}

// Pose de cada cuadro. t: segundos. estado: el de la Oficina. pose: 'sentado' | 'caminando' | 'parado' | 'dormido'.
// fase: un número fijo por agente para que no se muevan todos sincronizados.
export function posar(p, { pose, estado, objeto = null, t, fase = 0 }) {
  const tt = t + fase
  p.taza.visible = objeto === 'taza'
  p.paleta.visible = objeto === 'paleta'
  p.cuerpo.position.set(0, 0, 0)
  p.cuerpo.rotation.set(0, 0, 0)
  p.cabeza.rotation.set(0, 0, 0)
  p.brazoI.rotation.set(0, 0, 0.06)
  p.brazoD.rotation.set(0, 0, -0.06)
  p.piernaI.rotation.set(0, 0, 0)
  p.piernaD.rotation.set(0, 0, 0)

  // Respira y parpadea siempre (salvo dormido, que tiene los ojos cerrados).
  p.cuerpo.position.y = Math.sin(tt * 2) * 0.006
  const parpadeo = (tt % 4.3) < 0.13
  p.ojos.scale.y = pose === 'dormido' ? 0.12 : parpadeo ? 0.1 : 1

  // Boca y cejas según cómo está.
  const preocupado = estado === 'error'
  p.boca.rotation.z = preocupado ? 0 : Math.PI
  p.boca.position.y = preocupado ? -0.105 : -0.085
  p.boca.scale.set(estado === 'trabajando' ? 0.7 : 1, estado === 'trabajando' ? 0.4 : 1, 1)
  for (const c of p.cejas.children) c.rotation.z = preocupado ? -0.35 * c.userData.lado : 0

  if (pose === 'sentado' || pose === 'dormido') {
    p.piernaI.rotation.x = -Math.PI / 2
    p.piernaD.rotation.x = -Math.PI / 2
  }
  if (pose === 'caminando') {
    const paso = Math.sin(tt * 8.5)
    p.piernaI.rotation.x = paso * 0.55
    p.piernaD.rotation.x = -paso * 0.55
    p.brazoI.rotation.x = -paso * 0.5
    p.brazoD.rotation.x = objeto ? -0.9 : paso * 0.5
    p.cuerpo.position.y = Math.abs(Math.cos(tt * 8.5)) * 0.035
  }
  if (pose === 'sentado' && estado === 'trabajando') {
    // Tecleando: brazos adelante y las manos que suben y bajan.
    p.brazoI.rotation.x = -1.25 + Math.sin(tt * 18) * 0.08
    p.brazoD.rotation.x = -1.25 + Math.sin(tt * 18 + 1.6) * 0.08
    p.cabeza.rotation.x = 0.12
  } else if (pose === 'sentado' && preocupado) {
    // Con un problema: una mano en la cabeza y la cabeza que niega.
    p.brazoD.rotation.set(-2.6, 0, -0.5)
    p.cabeza.rotation.y = Math.sin(tt * 5) * 0.25
    p.cabeza.rotation.x = 0.1
  } else if (pose === 'sentado' && objeto === 'taza') {
    p.brazoD.rotation.x = -1.1 - Math.max(0, Math.sin(tt * 0.8)) * 0.8
  } else if (pose === 'sentado') {
    p.brazoI.rotation.x = -0.9
    p.brazoD.rotation.x = -0.9
    p.cabeza.rotation.y = Math.sin(tt * 0.5) * 0.18
  }
  if (pose === 'parado' && objeto === 'taza') p.brazoD.rotation.x = -1.2 - Math.max(0, Math.sin(tt * 0.9)) * 0.7
  if (pose === 'parado' && objeto === 'paleta') {
    p.brazoD.rotation.x = -1.1
    p.brazoD.rotation.z = -0.5 + Math.sin(tt * 4.5) * 0.7
    p.cuerpo.rotation.y = Math.sin(tt * 4.5) * 0.15
  }
  if (pose === 'parado' && !objeto) p.cabeza.rotation.y = Math.sin(tt * 0.7) * 0.3
  if (pose === 'dormido') {
    p.cuerpo.rotation.x = -1.05
    p.cuerpo.position.set(0, 0.12, -0.25)
    p.cabeza.rotation.z = 0.25
    p.cuerpo.position.y += Math.sin(tt * 1.1) * 0.01
  }
}

// Libera la memoria de la GPU al cerrar la escena.
export function liberar(objeto) {
  objeto.traverse(o => {
    o.geometry?.dispose()
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of ms) { m.map?.dispose(); m.dispose() }
  })
}
