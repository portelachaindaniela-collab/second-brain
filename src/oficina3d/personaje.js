// Personaje 3D de la Oficina: los muñequitos de Kenney (Mini Characters, licencia CC0, en public/modelos/personajes),
// con sus animaciones (caminar, sentarse, sostener algo) y encima los toques de cada agente: su accesorio, una
// credencial con su color y lo que lleva en la mano. Medidas en baldosas (1 = una baldosa del piso). El origen está en
// los pies y mira hacia +z.
// El modelo se carga solo (la primera vez tarda un instante): mientras tanto el personaje existe pero no se ve.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Con esta escala miden lo mismo que los muñequitos de antes (unas 1.35 baldosas).
const ESCALA = 1.75
const MUJERES = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e']
const HOMBRES = ['male-a', 'male-b', 'male-d', 'male-e', 'male-f']
// Dentro del hueso de la cabeza: el centro de la cabeza y la escala que hace que los accesorios de antes (pensados
// para una cabeza de radio 0.26) le calcen a esta cabeza cuadrada.
const CENTRO_CABEZA = new THREE.Vector3(0, 0.216, -0.04)
const ESCALA_CABEZA = new THREE.Vector3(0.88, 0.88, 0.97)
// Al sentarse, el modelo sube un poco: estas piernas son cortitas y la silla es más alta que ellas.
const SUBIR_SENTADO = 0.13

const cargador = new GLTFLoader()
const cache = new Map()
function cargar(nombre) {
  if (!cache.has(nombre)) cache.set(nombre, cargador.loadAsync(`${import.meta.env.BASE_URL}modelos/personajes/${nombre}.glb`))
  return cache.get(nombre)
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra })
const caja = (w, h, d, r, material) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material)
  m.castShadow = true
  return m
}

// Hacia dónde apunta cada brazo en reposo (los modelos vienen con los brazos estirados en cruz).
const BASE_BRAZO = { izq: new THREE.Vector3(1, 0, 0), der: new THREE.Vector3(-1, 0, 0) }
const _v = new THREE.Vector3()
// Apunta un brazo en una dirección (x hacia la izquierda del personaje si lado = 'izq'; el signo se espeja solo).
function apuntar(hueso, lado, x, y, z) {
  if (!hueso) return
  _v.set(lado === 'izq' ? x : -x, y, z).normalize()
  hueso.quaternion.setFromUnitVectors(BASE_BRAZO[lado], _v)
}

// ropa: color CSS (el color de identidad del agente: va en su credencial). v: { pelo, colorPelo, piel } de variante().
// accesorio: el de ACCESORIOS en oficinaPlano.mjs (galera, corona, auriculares…), o null. modelo: para elegir uno a mano.
export function crearPersonaje({ ropa, v, accesorio = null, modelo = null }) {
  const grupo = new THREE.Group()
  const cuerpo = new THREE.Group() // todo lo que se inclina (dormido en el puf)
  grupo.add(cuerpo)
  const mujer = v.pelo === 1 || v.pelo === 2
  const nombre = modelo ?? (mujer ? MUJERES : HOMBRES)[(v.colorPelo * 3 + v.piel) % 5]

  // La cabeza existe desde el principio (le cuelgan los carteles y la burbuja); cuando llega el modelo se muda al hueso.
  const cabeza = new THREE.Group()
  cabeza.position.set(0, 1.0, 0)
  cabeza.scale.copy(ESCALA_CABEZA).multiplyScalar(ESCALA)
  cuerpo.add(cabeza)
  // El pecho: ahí van la credencial, la corbata, el moño o la estrella.
  const pecho = new THREE.Group()
  const credencial = new THREE.Group()
  const cinta = caja(0.012, 0.075, 0.006, 0.002, mat(ropa))
  cinta.position.set(0, 0.035, 0)
  const tarjeta = caja(0.055, 0.04, 0.008, 0.006, mat('#fffaf3'))
  const franja = caja(0.056, 0.014, 0.01, 0.004, mat(ropa))
  franja.position.y = 0.012
  credencial.add(cinta, tarjeta, franja)
  credencial.position.set(0.035, 0.05, 0.083)
  // Lo que lleva en la mano derecha.
  const mano = new THREE.Group()
  mano.scale.setScalar(1.15 / ESCALA)

  const p = {
    grupo, cuerpo, cabeza, pecho, mano, modelo: null, mixer: null, acciones: {}, actual: null, huesos: {}, tPrevio: null,
    // Los de antes (ojos, cejas, boca) quedan como objetos vacíos: estos muñequitos tienen la cara pintada.
    ojos: new THREE.Object3D(), cejas: new THREE.Object3D(), boca: new THREE.Object3D(),
  }

  // Objetos que aparecen según dónde esté: una taza de café o una paleta de ping pong (y en las reuniones, el mate o
  // una botella de agua). Medidas de antes; la mano los escala.
  const taza = new THREE.Group()
  const cuerpoTaza = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 14), mat('#fffaf3'))
  const asa = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 10), mat('#fffaf3'))
  asa.position.x = 0.06
  taza.add(cuerpoTaza, asa)
  const paleta = new THREE.Group()
  const goma = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 18), mat('#e85d6a'))
  goma.rotation.x = Math.PI / 2
  goma.position.y = 0.16
  const mango = caja(0.04, 0.12, 0.03, 0.01, mat('#c49a6c'))
  mango.position.y = 0.04
  paleta.add(goma, mango)
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
  mate.scale.setScalar(1.4)
  const botella = new THREE.Group()
  const envase = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.17, 12), mat('#bfe3ef', { transparent: true, opacity: 0.75, roughness: 0.15 }))
  const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10), mat('#3f6b8f'))
  tapa.position.y = 0.1
  botella.add(envase, tapa)
  botella.scale.setScalar(1.3)
  for (const o of [taza, paleta, mate, botella]) { o.visible = false; o.traverse(m => { m.castShadow = true }); mano.add(o) }
  Object.assign(p, { taza, paleta, mate, botella })

  cargar(nombre).then(gltf => {
    const m = clonarEsqueleto(gltf.scene)
    m.scale.setScalar(ESCALA)
    m.traverse(o => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      o.frustumCulled = false
    })
    const h = {}
    for (const n of ['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right']) h[n] = m.getObjectByName(n)
    cabeza.position.copy(CENTRO_CABEZA)
    cabeza.scale.copy(ESCALA_CABEZA)
    h.head.add(cabeza)
    if (accesorio) ponerAccesorio({ cabeza, cuerpo: pecho }, accesorio, v)
    // El pecho en el hueso del torso: los objetos de antes (pensados para un cuerpo más grande) quedan a escala.
    pecho.scale.setScalar(0.36)
    pecho.position.set(0, 0.07 - 0.8 * 0.36, 0.083 - 0.145 * 0.36)
    h.torso.add(pecho, credencial)
    mano.position.set(-0.13, -0.005, 0.02)
    h['arm-right'].add(mano)
    p.mixer = new THREE.AnimationMixer(m)
    for (const clip of gltf.animations) {
      // Al sentarse no bajamos la cadera hasta el piso (la silla está más alta): sacamos el desplazamiento de la raíz.
      const c = clip.name === 'sit' ? new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter(t => !t.name.startsWith('root.'))) : clip
      p.acciones[clip.name] = p.mixer.clipAction(c)
    }
    p.huesos = h
    p.modelo = m
    // Que el modelo herede lo que tenía el grupo (por ejemplo, a qué agente pertenece para el click).
    const datos = grupo.userData
    cuerpo.add(m)
    if (datos.agenteId) grupo.traverse(o => { o.userData.agenteId = datos.agenteId })
  }).catch(() => {})

  return p
}

// ---------- Accesorios ----------
// Pensados para una cabeza de radio 0.26 con el centro en el origen del grupo `cabeza` (crearPersonaje la escala para
// que calcen) y un pecho en y ≈ 0.8 del grupo `cuerpo` (acá es el grupo del pecho, también escalado).
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
// La base es una animación del modelo (caminar, quieto, sentado, con algo en la mano); encima se acomodan los brazos y
// la cabeza según lo que esté haciendo: teclear, agarrarse la cabeza, tomar algo, hablar.
export function posar(p, { pose, estado, objeto = null, t, fase = 0, habla = false }) {
  const tt = t + fase
  p.taza.visible = objeto === 'taza'
  p.paleta.visible = objeto === 'paleta'
  p.mate.visible = objeto === 'mate'
  p.botella.visible = objeto === 'botella'
  const bebe = objeto === 'taza' || objeto === 'mate' || objeto === 'botella'
  p.cuerpo.position.set(0, 0, 0)
  p.cuerpo.rotation.set(0, 0, 0)
  const dt = p.tPrevio == null ? 0 : Math.min(0.1, Math.max(0, t - p.tPrevio))
  p.tPrevio = t
  if (!p.modelo) return
  const h = p.huesos
  const sentado = pose === 'sentado' || pose === 'dormido'
  p.modelo.position.y = sentado ? SUBIR_SENTADO : 0

  // La animación de base, con un fundido corto al cambiar.
  const clip = sentado ? 'sit' : pose === 'caminando' ? 'walk' : objeto ? 'holding-right' : 'idle'
  const accion = p.acciones[clip]
  if (accion && p.actual !== accion) {
    accion.reset().play()
    accion.time = (fase * 0.37) % accion.getClip().duration
    if (p.actual) p.actual.crossFadeTo(accion, dt ? 0.25 : 0, false)
    p.actual = accion
  }
  for (const n of ['torso', 'head']) h[n]?.quaternion.identity()
  p.mixer.update(dt)

  const preocupado = estado === 'error'
  // Respira (el torso sube y baja apenas).
  if (pose !== 'caminando') h.torso.rotation.x = Math.sin(tt * 2) * 0.02

  if (pose === 'caminando' && objeto) apuntar(h['arm-right'], 'der', 0.25, -0.35, 0.9)
  if (pose === 'sentado' && estado === 'trabajando' && !habla) {
    // Tecleando: los dos brazos adelante y las manos que suben y bajan.
    apuntar(h['arm-left'], 'izq', 0.2, -0.45 + Math.sin(tt * 18) * 0.12, 0.9)
    apuntar(h['arm-right'], 'der', 0.2, -0.45 + Math.sin(tt * 18 + 1.6) * 0.12, 0.9)
    h.head.rotation.x = 0.15
  } else if (pose === 'sentado' && preocupado && !habla) {
    // Con un problema: una mano en la cabeza y la cabeza que niega.
    apuntar(h['arm-right'], 'der', 0.2, 1, 0.15)
    h.head.rotation.set(0.1, Math.sin(tt * 5) * 0.25, 0)
  } else if (bebe && pose !== 'caminando') {
    // Tomando algo: lleva la mano a la boca cada tanto.
    const sorbo = Math.max(0, Math.sin(tt * 0.85))
    apuntar(h['arm-right'], 'der', 0.35 - sorbo * 0.25, -0.35 + sorbo * 1.1, 0.85)
    h.head.rotation.x = -sorbo * 0.15
  } else if (pose === 'sentado' && estado === 'pausado') {
    // Pausado: se quedó dormido sobre el escritorio, con los brazos de almohada.
    apuntar(h['arm-left'], 'izq', 0.1, -0.15, 0.95)
    apuntar(h['arm-right'], 'der', 0.1, -0.15, 0.95)
    h.torso.rotation.x = 0.35
    h.head.rotation.x = 0.45 + Math.sin(tt * 1.1) * 0.03
  } else if (pose === 'sentado') {
    // Sentado sin hacer nada: los brazos apoyados en la mesa y mira alrededor.
    apuntar(h['arm-left'], 'izq', 0.3, -0.55, 0.8)
    apuntar(h['arm-right'], 'der', 0.3, -0.55, 0.8)
    h.head.rotation.y = Math.sin(tt * 0.5) * 0.2
  }
  if (pose === 'parado' && objeto === 'paleta') {
    // Ping pong: la paleta va y viene, y el cuerpo acompaña.
    const golpe = Math.sin(tt * 4.5)
    apuntar(h['arm-right'], 'der', 0.6 + golpe * 0.5, -0.1, 0.8 - Math.abs(golpe) * 0.3)
    h.torso.rotation.y = golpe * 0.15
  }
  if (pose === 'parado' && !objeto) h.head.rotation.y = Math.sin(tt * 0.7) * 0.3
  // Hablando en la reunión: acompaña con una mano y mueve la cabeza.
  if (habla) {
    apuntar(h['arm-right'], 'der', 0.45 + Math.sin(tt * 1.7) * 0.2, -0.1 + Math.sin(tt * 2.2) * 0.3, 0.85)
    h.head.rotation.set(Math.sin(tt * 1.3) * 0.08, Math.sin(tt * 0.9) * 0.15, Math.sin(tt * 1.1) * 0.06)
  }
  if (pose === 'dormido') {
    p.cuerpo.rotation.x = -0.9
    p.cuerpo.position.set(0, 0.05, -0.2)
    h.head.rotation.z = 0.25
    p.cuerpo.position.y += Math.sin(tt * 1.1) * 0.01
  }
}

// Libera la memoria de la GPU al cerrar la escena. Los modelos cargados se comparten entre escenas: su geometría y su
// textura se vuelven a subir solas si la escena se arma de nuevo.
export function liberar(objeto) {
  objeto.traverse(o => {
    o.geometry?.dispose()
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of ms) { m.map?.dispose(); m.dispose() }
  })
}
