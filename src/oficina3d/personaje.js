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
// accesorio: el de ACCESORIOS en oficinaPlano.mjs (galera, corona, auriculares…), o null.
export function crearPersonaje({ ropa, v, accesorio = null }) {
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

  // Objetos que aparecen según dónde esté: una taza de café o una paleta de ping pong en la mano derecha (y en las
  // reuniones, el mate o una botella de agua).
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
  // El mate (calabaza con bombilla) y una botella de agua, para las reuniones.
  const mate = new THREE.Group()
  const calabaza = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), mat('#6b4a2e'))
  calabaza.scale.set(1, 1.15, 1)
  const borde = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.02, 12), mat('#c9a24a'))
  borde.position.y = 0.06
  const yerba = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 10), mat('#6f8f3a'))
  yerba.position.y = 0.071
  const bombilla = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), mat('#d6d3cd', { metalness: 0.7, roughness: 0.3 }))
  bombilla.position.set(0.012, 0.11, 0)
  bombilla.rotation.z = -0.25
  mate.add(calabaza, borde, yerba, bombilla)
  mate.position.set(0, -0.42, 0.05)
  mate.scale.setScalar(1.4)
  mate.visible = false
  brazoD.grupo.add(mate)
  const botella = new THREE.Group()
  const envase = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.17, 12), mat('#bfe3ef', { transparent: true, opacity: 0.75, roughness: 0.15 }))
  const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10), mat('#3f6b8f'))
  tapa.position.y = 0.1
  botella.add(envase, tapa)
  botella.position.set(0, -0.42, 0.05)
  botella.scale.setScalar(1.3)
  botella.visible = false
  brazoD.grupo.add(botella)

  if (accesorio) ponerAccesorio({ cabeza, cuerpo }, accesorio, v)
  return { grupo, cuerpo, piernaI, piernaD, brazoI: brazoI.grupo, brazoD: brazoD.grupo, cabeza, ojos, cejas, boca, taza, paleta, mate, botella, torso }
}

// ---------- Accesorios ----------
// La cabeza tiene radio 0.26 con el centro en el origen del grupo `cabeza`; el pecho está en y ≈ 0.8 de `cuerpo`.
const cil = (rArriba, rAbajo, alto, material, seg = 24) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rArriba, rAbajo, alto, seg), material); m.castShadow = true; return m }
const aro = (r, tubo, material, arco = Math.PI * 2) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, tubo, 10, 32, arco), material); m.castShadow = true; return m }
const en = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m }

function ponerAccesorio({ cabeza, cuerpo }, tipo, v) {
  const oro = mat('#e2b552', { metalness: 0.6, roughness: 0.3, emissive: '#5a4310', emissiveIntensity: 0.25 })
  const negro = mat('#2a2236', { roughness: 0.5 })
  const sombrero = (color, banda, rAla = 0.31, alto = 0.17) => {
    const g = new THREE.Group()
    g.add(en(cil(rAla, rAla, 0.02, mat(color)), 0, 0.19, 0))
    g.add(en(cil(0.16, 0.19, alto, mat(color)), 0, 0.19 + alto / 2, 0))
    g.add(en(cil(0.195, 0.195, 0.04, mat(banda)), 0, 0.22, 0))
    return g
  }
  const anteojos = material => {
    const g = new THREE.Group()
    for (const x of [-0.09, 0.09]) g.add(en(aro(0.058, 0.011, material), x, 0.0, 0.258))
    g.add(en(caja(0.06, 0.012, 0.012, 0.004, material), 0, 0.01, 0.262))
    return g
  }
  switch (tipo) {
    case 'corona': {
      const g = new THREE.Group()
      g.add(en(cil(0.17, 0.16, 0.09, oro, 28), 0, 0.25, 0))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        const punta = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 10), oro)
        g.add(en(punta, Math.sin(a) * 0.155, 0.34, Math.cos(a) * 0.155))
        const gema = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), mat(['#e85d6a', '#6ea8ff', '#3fb878'][k % 3], { roughness: 0.2 }))
        g.add(en(gema, Math.sin(a) * 0.172, 0.25, Math.cos(a) * 0.172))
      }
      g.rotation.z = 0.08
      cabeza.add(g)
      break
    }
    case 'galera': { const g = sombrero('#2a2236', '#c8323f', 0.29, 0.3); cabeza.add(g); break }
    case 'sombrero': { const g = sombrero('#7a5a3a', '#3b2a22'); g.rotation.x = -0.08; cabeza.add(g); break }
    case 'safari': {
      const g = new THREE.Group()
      const copa = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e6cf9f'))
      copa.scale.y = 0.85; copa.castShadow = true
      g.add(en(copa, 0, 0.12, 0))
      g.add(en(cil(0.34, 0.34, 0.02, mat('#d9bf8a')), 0, 0.12, 0))
      g.add(en(cil(0.255, 0.255, 0.04, mat('#7a5a3a')), 0, 0.15, 0))
      cabeza.add(g)
      break
    }
    case 'gorra-canillita': {
      const g = new THREE.Group()
      const copa = new THREE.Mesh(new THREE.SphereGeometry(0.29, 24, 14), mat('#8a7a68'))
      copa.scale.set(1, 0.42, 1.05); copa.castShadow = true
      g.add(en(copa, 0, 0.17, -0.01))
      const visera = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), mat('#6f6252'))
      g.add(en(visera, 0, 0.13, 0.17, 0.15))
      g.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat('#6f6252')), 0, 0.29, 0))
      cabeza.add(g)
      break
    }
    case 'boina': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 14), mat('#a3303f'))
      b.scale.set(1, 0.32, 1); b.castShadow = true
      cabeza.add(en(b, 0.04, 0.2, -0.02, 0, 0, 0.25))
      cabeza.add(en(cil(0.012, 0.012, 0.05, mat('#a3303f')), 0.05, 0.3, -0.02))
      break
    }
    case 'gorro-lana': {
      const g = new THREE.Group()
      const copa = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d64550', { roughness: 0.95 }))
      copa.castShadow = true
      g.add(en(copa, 0, 0.05, 0))
      g.add(en(cil(0.285, 0.285, 0.08, mat('#fffaf3', { roughness: 0.95 })), 0, 0.06, 0))
      g.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), mat('#fffaf3', { roughness: 1 })), 0, 0.35, 0))
      g.rotation.x = -0.12
      cabeza.add(g)
      break
    }
    case 'gorro-fiesta': {
      const g = new THREE.Group()
      const cono = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 20), mat('#e86df2'))
      cono.castShadow = true
      g.add(en(cono, 0, 0.36, 0))
      g.add(en(aro(0.1, 0.018, mat('#f6dd8b')), 0, 0.3, 0, Math.PI / 2))
      g.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), mat('#f6dd8b')), 0, 0.53, 0))
      g.rotation.z = -0.2
      cabeza.add(g)
      break
    }
    case 'auriculares':
    case 'headset': {
      const color = mat(tipo === 'headset' ? '#3b3450' : '#6ea8ff', { roughness: 0.4 })
      cabeza.add(en(aro(0.285, 0.025, color, Math.PI), 0, 0.02, 0))
      for (const lado of [-1, 1]) cabeza.add(en(cil(0.075, 0.075, 0.06, color), 0.27 * lado, 0.0, 0, 0, 0, Math.PI / 2))
      if (tipo === 'headset') {
        cabeza.add(en(caja(0.015, 0.015, 0.2, 0.006, color), -0.24, -0.08, 0.12, 0.35, 0.6, 0))
        cabeza.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), negro), -0.17, -0.12, 0.22))
      }
      break
    }
    case 'vincha': {
      cabeza.add(en(aro(0.275, 0.022, mat('#ff7eb9'), Math.PI), 0, 0.03, -0.04, -0.25))
      for (const lado of [-1, 1]) cabeza.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat('#ff7eb9')), 0.11 + lado * 0.05, 0.25, 0.08))
      break
    }
    case 'visera': {
      const verde = mat('#3fb878', { transparent: true, opacity: 0.85 })
      cabeza.add(en(aro(0.265, 0.018, verde), 0, 0.1, 0, Math.PI / 2))
      const ala = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.015, 20, 1, false, -Math.PI / 2, Math.PI), verde)
      cabeza.add(en(ala, 0, 0.11, 0.16, 0.25))
      break
    }
    case 'lentes': cabeza.add(anteojos(mat('#5a3a8a', { roughness: 0.4 }))); break
    case 'lentes-sol': {
      const g = new THREE.Group()
      for (const x of [-0.09, 0.09]) g.add(en(caja(0.11, 0.075, 0.02, 0.02, mat('#1d1a26', { roughness: 0.15, metalness: 0.3 })), x, 0.0, 0.255))
      g.add(en(caja(0.07, 0.014, 0.014, 0.004, negro), 0, 0.02, 0.262))
      cabeza.add(g)
      break
    }
    case 'corbata': {
      const color = mat(v.colorPelo % 2 ? '#c8323f' : '#3b4a8a')
      cuerpo.add(en(caja(0.07, 0.06, 0.03, 0.01, color), 0, 0.8, 0.145))
      const tira = caja(0.075, 0.26, 0.02, 0.01, color)
      cuerpo.add(en(tira, 0, 0.65, 0.148))
      break
    }
    case 'monio': {
      const color = mat('#e85d6a')
      for (const lado of [-1, 1]) {
        const ala = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 4), color)
        cuerpo.add(en(ala, lado * 0.05, 0.8, 0.15, 0, 0, (lado * Math.PI) / 2))
      }
      cuerpo.add(en(new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), color), 0, 0.8, 0.16))
      break
    }
    case 'estrella': {
      // Broche de estrella dorada en el pecho: el de Daniela, la jefa de todos.
      const forma = new THREE.Shape()
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 0.035 : 0.08, ang = (k / 10) * Math.PI * 2 + Math.PI / 2
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r
        if (k) forma.lineTo(x, y); else forma.moveTo(x, y)
      }
      const estrella = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.02, bevelEnabled: false }), oro)
      cuerpo.add(en(estrella, -0.11, 0.74, 0.14))
      break
    }
    default: break
  }
}

// Pose de cada cuadro. t: segundos. estado: el de la Oficina. pose: 'sentado' | 'caminando' | 'parado' | 'dormido'.
// fase: un número fijo por agente para que no se muevan todos sincronizados.
export function posar(p, { pose, estado, objeto = null, t, fase = 0, habla = false }) {
  const tt = t + fase
  p.taza.visible = objeto === 'taza'
  p.paleta.visible = objeto === 'paleta'
  p.mate.visible = objeto === 'mate'
  p.botella.visible = objeto === 'botella'
  const bebe = objeto === 'taza' || objeto === 'mate' || objeto === 'botella'
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
  } else if (pose === 'sentado' && bebe) {
    p.brazoD.rotation.x = -1.1 - Math.max(0, Math.sin(tt * 0.8)) * 0.8
  } else if (pose === 'sentado') {
    p.brazoI.rotation.x = -0.9
    p.brazoD.rotation.x = -0.9
    p.cabeza.rotation.y = Math.sin(tt * 0.5) * 0.18
  }
  if (pose === 'parado' && bebe) p.brazoD.rotation.x = -1.2 - Math.max(0, Math.sin(tt * 0.9)) * 0.7
  if (pose === 'parado' && objeto === 'paleta') {
    p.brazoD.rotation.x = -1.1
    p.brazoD.rotation.z = -0.5 + Math.sin(tt * 4.5) * 0.7
    p.cuerpo.rotation.y = Math.sin(tt * 4.5) * 0.15
  }
  if (pose === 'parado' && !objeto) p.cabeza.rotation.y = Math.sin(tt * 0.7) * 0.3
  // Hablando en la reunión: la boca se abre y cierra y acompaña con una mano.
  if (habla) {
    p.boca.rotation.z = Math.PI
    p.boca.position.y = -0.085
    p.boca.scale.set(1, 0.6 + Math.abs(Math.sin(tt * 11)) * 1.1, 1)
    p.brazoD.rotation.set(-1.0 + Math.sin(tt * 2.2) * 0.35, 0, -0.25 + Math.sin(tt * 1.7) * 0.2)
    p.cabeza.rotation.set(Math.sin(tt * 1.3) * 0.06, Math.sin(tt * 0.9) * 0.12, Math.sin(tt * 1.1) * 0.05)
  }
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
