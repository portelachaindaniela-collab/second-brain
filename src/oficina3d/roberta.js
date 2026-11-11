// Roberta, la perra de Daniela: color canela, hocico negro y la puntita de la cola blanca.
// Origen en el piso, mirando hacia +z. Medidas en baldosas.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const CANELA = '#c98a4b'
const CANELA_OSCURO = '#a86d34'
const NEGRO = '#2a2236'
const BLANCO = '#fffaf3'
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra })
const conSombra = m => { m.castShadow = true; return m }

export function crearRoberta() {
  const grupo = new THREE.Group()
  const cuerpo = new THREE.Group()
  grupo.add(cuerpo)
  const pelaje = mat(CANELA)
  const tronco = conSombra(new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.26, 0.62, 3, 0.11), pelaje))
  tronco.position.set(0, 0.36, 0)
  cuerpo.add(tronco)

  // Patas: dos adelante y dos atrás, que se mueven al caminar.
  const patas = []
  for (const [x, z] of [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]]) {
    const pata = new THREE.Group()
    pata.position.set(x, 0.3, z)
    const m = conSombra(new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.3, 0.09, 2, 0.035), pelaje))
    m.position.y = -0.15
    pata.add(m)
    cuerpo.add(pata)
    patas.push(pata)
  }

  // Cabeza: canela, con orejas caídas más oscuras, hocico negro y ojos.
  const cabeza = new THREE.Group()
  cabeza.position.set(0, 0.56, 0.33)
  cuerpo.add(cabeza)
  const craneo = conSombra(new THREE.Mesh(new THREE.SphereGeometry(0.15, 22, 16), pelaje))
  craneo.scale.set(1, 0.95, 1.05)
  cabeza.add(craneo)
  const hocico = conSombra(new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.1, 0.14, 2, 0.04), mat(NEGRO, { roughness: 0.6 })))
  hocico.position.set(0, -0.04, 0.14)
  cabeza.add(hocico)
  const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), mat('#111018', { roughness: 0.3 }))
  nariz.position.set(0, -0.01, 0.215)
  cabeza.add(nariz)
  for (const lado of [-1, 1]) {
    const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat('#111018', { roughness: 0.3 }))
    ojo.position.set(0.065 * lado, 0.04, 0.12)
    cabeza.add(ojo)
    const oreja = conSombra(new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.16, 0.1, 2, 0.03), mat(CANELA_OSCURO)))
    oreja.position.set(0.13 * lado, -0.02, -0.01)
    oreja.rotation.z = 0.35 * lado
    cabeza.add(oreja)
  }
  // Collar.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 20), mat('#e85d6a'))
  collar.position.set(0, 0.47, 0.25)
  collar.rotation.x = Math.PI / 2 - 0.5
  cuerpo.add(collar)

  // Cola: canela con la puntita blanca. Se mueve de un lado a otro.
  const cola = new THREE.Group()
  cola.position.set(0, 0.45, -0.3)
  cola.rotation.x = -0.8
  const tramo = conSombra(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 10), pelaje))
  tramo.position.y = 0.11
  const punta = conSombra(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(BLANCO)))
  punta.position.y = 0.23
  cola.add(tramo, punta)
  cuerpo.add(cola)

  return { grupo, cuerpo, cabeza, cola, patas }
}

// pose: 'echada' (en su camita), 'sentada' o 'caminando'. t en segundos.
export function moverRoberta(r, { pose, t }) {
  r.cola.rotation.z = Math.sin(t * (pose === 'caminando' ? 14 : 7)) * 0.6
  r.cabeza.rotation.set(0, Math.sin(t * 0.6) * 0.3, 0)
  r.cuerpo.position.y = 0
  r.cuerpo.rotation.set(0, 0, 0)
  for (const [k, p] of r.patas.entries()) p.rotation.set(pose === 'caminando' ? Math.sin(t * 12 + (k % 2 ? Math.PI : 0) + (k > 1 ? Math.PI : 0)) * 0.6 : 0, 0, 0)
  if (pose === 'caminando') r.cuerpo.position.y = Math.abs(Math.sin(t * 12)) * 0.025
  if (pose === 'echada') {
    r.cuerpo.position.y = -0.2
    for (const [k, p] of r.patas.entries()) p.rotation.x = k < 2 ? -1.45 : 1.45
    r.cabeza.rotation.x = 0.25 + Math.sin(t * 0.4) * 0.05
  }
  if (pose === 'sentada') {
    r.cuerpo.rotation.x = -0.45
    r.cuerpo.position.y = -0.06
    r.patas[2].rotation.x = r.patas[3].rotation.x = 1.2
  }
}
