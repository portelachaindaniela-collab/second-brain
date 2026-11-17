// Muebles de la oficina: los de Kenney (Furniture Kit, licencia CC0, en public/modelos/muebles).
// mueble(nombre) devuelve un grupo enseguida y le pone el modelo cuando termina de cargar. El modelo queda centrado en
// x y z, apoyado en el piso (y = 0) y a la escala de los personajes.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const ESCALA_MUEBLES = 1.75
const cargador = new GLTFLoader()
const cache = new Map()

function cargar(nombre) {
  if (!cache.has(nombre)) {
    cache.set(nombre, cargador.loadAsync(`${import.meta.env.BASE_URL}modelos/muebles/${nombre}.glb`).then(gltf => {
      const caja = new THREE.Box3().setFromObject(gltf.scene)
      const centro = caja.getCenter(new THREE.Vector3())
      return { escena: gltf.scene, desplazar: new THREE.Vector3(-centro.x, -caja.min.y, -centro.z), tam: caja.getSize(new THREE.Vector3()) }
    }))
  }
  return cache.get(nombre)
}

// opciones: escala (además de la general), color (tiñe todos los materiales; mezcla: cuánto, de 0 a 1), sombra.
export function mueble(nombre, { escala = 1, color = null, mezcla = 0.75, sombra = true, alCargar = null } = {}) {
  const grupo = new THREE.Group()
  cargar(nombre).then(({ escena, desplazar, tam }) => {
    const m = escena.clone(true)
    m.position.copy(desplazar)
    m.traverse(o => {
      if (!o.isMesh) return
      o.castShadow = sombra
      o.receiveShadow = true
      if (color) {
        o.material = o.material.clone()
        o.material.color.lerp(new THREE.Color(color), mezcla)
      }
    })
    const interno = new THREE.Group()
    interno.scale.setScalar(ESCALA_MUEBLES * escala)
    interno.add(m)
    grupo.add(interno)
    // Que el mueble herede a qué agente pertenece (para el click).
    if (grupo.userData.agenteId) grupo.traverse(o => { o.userData.agenteId = grupo.userData.agenteId })
    alCargar?.(interno, tam.clone().multiplyScalar(ESCALA_MUEBLES * escala))
  }).catch(() => {})
  return grupo
}
