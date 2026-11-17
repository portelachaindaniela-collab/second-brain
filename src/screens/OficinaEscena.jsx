import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { crearPersonaje, posar, liberar } from '../oficina3d/personaje.js'
import { mueble } from '../oficina3d/muebles.js'
import { planoOficina, poseDe, varianteDe, ACCESORIOS, PUESTO } from '../oficinaEscena.mjs'
import { EQUIPOS, ESTADOS } from '../oficina.mjs'
import './OficinaEscena.css'

// La oficina dibujada: un salón con una isla de escritorios por equipo y un rincón de descanso. Los muebles y los
// personajes son de Kenney (CC0). Cada agente está en su puesto haciendo lo que dice su estado: teclea si está
// trabajando, se agarra la cabeza si tiene un problema, duerme si está pausado y, si está libre, mira alrededor y cada
// tanto toma un café. Tocar a un agente (o su escritorio, o su cartel) abre su panel.
const COLOR_EQUIPO = { trabajadores: '#e2b552', up: '#d9734e', pdg: '#3fa98a', admin: '#8a7fc4', sistemas: '#4d6f8f', descanso: '#c9b79c' }
const ALTO_MESA = 0.665
const nombreCorto = n => String(n).split(' (')[0]
const reducido = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

function colorAgente(a) {
  const css = a.color ? getComputedStyle(document.documentElement).getPropertyValue(`--id-${a.color}`).trim() : ''
  return css || COLOR_EQUIPO[a.equipo] || '#8a7fc4'
}

function etiqueta(clase, texto, alClic) {
  const envoltorio = document.createElement('div')
  const el = document.createElement('div')
  el.className = clase
  if (texto != null) el.textContent = texto
  if (alClic) el.addEventListener('pointerup', ev => { ev.stopPropagation(); alClic() })
  envoltorio.appendChild(el)
  const obj = new CSS2DObject(envoltorio)
  obj.userData.el = el
  return obj
}

function poner(escena, objeto, x, z, giro = 0, y = 0) {
  objeto.position.set(x, y, z)
  objeto.rotation.y = giro
  escena.add(objeto)
  return objeto
}

export default function OficinaEscena({ agentes, elegidoId = null, abrir }) {
  const caja = useRef(null)
  const datos = useRef(null)
  // Cada render deja a mano lo último (va antes del efecto de la escena, que lo lee al armarse).
  useEffect(() => { datos.current = { agentes, elegidoId, abrir } })
  const firma = agentes.map(a => `${a.id}:${a.equipo}`).join('|')

  useEffect(() => {
    const contenedor = caja.current
    if (!contenedor) return
    const sinMovimiento = reducido()
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    contenedor.appendChild(renderer.domElement)
    const textos = new CSS2DRenderer()
    textos.domElement.className = 'oe-textos'
    contenedor.appendChild(textos.domElement)

    const inicial = datos.current.agentes
    const plano = planoOficina(inicial)
    const centro = new THREE.Vector3(plano.ancho / 2, 0, plano.fondo / 2)
    const escena = new THREE.Scene()

    // Luces: cielo, sol con sombras suaves y un relleno.
    escena.add(new THREE.HemisphereLight('#ffffff', '#d9cbb6', 1.4))
    const sol = new THREE.DirectionalLight('#fff1dc', 2.2)
    sol.position.set(centro.x - 8, 18, centro.z + 10)
    sol.target.position.copy(centro)
    sol.castShadow = true
    sol.shadow.mapSize.set(2048, 2048)
    const r = Math.hypot(plano.ancho, plano.fondo) / 2 + 3
    Object.assign(sol.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 60 })
    sol.shadow.bias = -0.0005
    sol.shadow.normalBias = 0.03
    escena.add(sol, sol.target)
    const relleno = new THREE.DirectionalLight('#dfe9ff', 0.5)
    relleno.position.set(centro.x + 12, 10, centro.z + 16)
    escena.add(relleno)

    // Piso de madera clara con un borde apenas más oscuro.
    const borde = 1.2
    const piso = new THREE.Mesh(new THREE.BoxGeometry(plano.ancho + borde * 2, 0.12, plano.fondo + borde * 2),
      new THREE.MeshStandardMaterial({ color: '#efe3cf', roughness: 0.9 }))
    piso.position.set(centro.x, -0.06, centro.z)
    piso.receiveShadow = true
    escena.add(piso)
    const zocalo = new THREE.Mesh(new THREE.BoxGeometry(plano.ancho + borde * 2 + 0.3, 0.1, plano.fondo + borde * 2 + 0.3),
      new THREE.MeshStandardMaterial({ color: '#cdbb9f', roughness: 0.9 }))
    zocalo.position.set(centro.x, -0.12, centro.z)
    escena.add(zocalo)

    // Paredes del fondo y de la izquierda, con ventanas cada tanto.
    const PASO = 1.75
    const x0 = -borde, z0 = -borde
    for (let i = 0, x = x0 + PASO / 2; x < plano.ancho + borde; i++, x += PASO) poner(escena, mueble(i % 3 === 1 ? 'wallWindow' : 'wall'), x, z0, 0)
    for (let i = 0, z = z0 + PASO / 2; z < plano.fondo + borde; i++, z += PASO) poner(escena, mueble(i % 3 === 1 ? 'wallWindow' : 'wall'), x0, z, Math.PI / 2)

    const actores = new Map()
    const clicables = []
    const pantallas = []

    // Cada zona: una alfombra del color del equipo, su cartel y plantas en las esquinas de atrás.
    for (const zona of plano.zonas) {
      const color = COLOR_EQUIPO[zona.equipo] ?? '#c9b79c'
      const alfombra = new THREE.Mesh(new THREE.BoxGeometry(zona.ancho - 0.3, 0.02, zona.fondo - 0.3),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.62), roughness: 1 }))
      alfombra.position.set(zona.x + zona.ancho / 2, 0.01, zona.z + zona.fondo / 2)
      alfombra.receiveShadow = true
      escena.add(alfombra)
      const n = inicial.filter(a => a.equipo === zona.equipo).length
      const titulo = zona.equipo === 'descanso' ? '☕ Descanso' : `${EQUIPOS[zona.equipo]?.nombre ?? zona.equipo} · ${n}`
      const cartel = etiqueta('oe-equipo', titulo)
      cartel.userData.el.style.setProperty('--equipo', color)
      cartel.position.set(zona.x + zona.ancho / 2, 0.05, zona.z + zona.fondo - 0.45)
      escena.add(cartel)
      if (zona.equipo === 'descanso') continue
      poner(escena, mueble('pottedPlant'), zona.x + 0.45, zona.z + 0.45)
      poner(escena, mueble('plantSmall1'), zona.x + zona.ancho - 0.45, zona.z + 0.45)
    }

    // El rincón de descanso: barra con la cafetera, un sillón con mesa ratona y dos sillones chicos, una lámpara,
    // la biblioteca y plantas.
    const descanso = plano.zonas.find(z => z.equipo === 'descanso')
    if (descanso) {
      const { x, z, ancho, fondo } = descanso
      const cx = x + ancho / 2
      poner(escena, mueble('kitchenBar'), cx - 0.38, z + 0.55)
      poner(escena, mueble('kitchenBar'), cx + 0.38, z + 0.55)
      poner(escena, mueble('kitchenCoffeeMachine'), cx - 0.4, z + 0.5, 0, 0.735)
      poner(escena, mueble('bookcaseOpen'), x + 0.55, z + 0.4)
      poner(escena, mueble('bookcaseOpen'), x + ancho - 0.55, z + 0.4)
      poner(escena, mueble('loungeSofa'), cx, z + 2.1)
      poner(escena, mueble('tableCoffee'), cx, z + 3.0)
      poner(escena, mueble('loungeChair'), cx - 1.45, z + 3.1, Math.PI / 2)
      poner(escena, mueble('loungeChair'), cx + 1.45, z + 3.1, -Math.PI / 2)
      poner(escena, mueble('lampRoundFloor'), cx + 1.35, z + 1.9)
      poner(escena, mueble('pottedPlant'), x + 0.45, z + fondo - 1.1)
      poner(escena, mueble('plantSmall2'), x + ancho - 0.45, z + fondo - 1.1)
    }

    // Los puestos: silla, escritorio, monitor (con la pantalla prendida según el estado), teclado y el agente.
    inicial.forEach((a, i) => {
      const pu = plano.puestos.find(p => p.id === a.id)
      if (!pu) return
      const puesto = new THREE.Group()
      puesto.position.set(pu.x, 0, pu.z)
      puesto.rotation.y = pu.mira
      escena.add(puesto)
      poner(puesto, mueble('chairDesk'), 0, -0.08)
      poner(puesto, mueble('desk'), 0, PUESTO.escritorio, Math.PI)
      const brillo = new THREE.MeshStandardMaterial({ color: '#1d2230', emissive: '#000000', roughness: 0.4 })
      pantallas.push(brillo)
      const monitor = mueble('computerScreen', {
        alCargar: (interno, tam) => {
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(tam.x * 0.88, tam.y * 0.6), brillo)
          panel.position.set(0, tam.y * 0.6, tam.z / 2 + 0.006)
          monitor.add(panel)
        },
      })
      poner(puesto, monitor, 0, PUESTO.escritorio + 0.22, Math.PI, ALTO_MESA)
      poner(puesto, mueble('computerKeyboard'), 0, PUESTO.escritorio - 0.2, Math.PI, ALTO_MESA)
      if (i % 3 === 0) poner(puesto, mueble('plantSmall2', { escala: 0.6 }), 0.5, PUESTO.escritorio + 0.25, 0, ALTO_MESA)

      const p = crearPersonaje({ ropa: colorAgente(a), v: varianteDe(a.id), accesorio: ACCESORIOS[a.id] ?? null })
      puesto.add(p.grupo)
      puesto.traverse(o => { o.userData.agenteId = a.id })
      puesto.userData.agenteId = a.id
      clicables.push(puesto)
      const chip = etiqueta('oe-agente', null, () => datos.current.abrir(a.id))
      chip.position.set(0, 0.62, 0)
      p.cabeza.add(chip)
      actores.set(a.id, { p, chip, brillo, puesto, fase: (i * 1.37) % 5 })
    })

    // El aro bajo el agente elegido.
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.64, 40), new THREE.MeshBasicMaterial({ color: '#f0a63c', transparent: true, opacity: 0.9, side: THREE.DoubleSide }))
    aro.rotation.x = -Math.PI / 2
    aro.visible = false
    escena.add(aro)

    // Cámara: mira la oficina desde adelante y un poco a la derecha. Se acerca con la rueda (o dos dedos), se mueve
    // arrastrando y gira apenas con el botón derecho.
    const camara = new THREE.PerspectiveCamera(32, 1, 0.3, 200)
    const controles = new OrbitControls(camara, renderer.domElement)
    controles.target.copy(centro)
    controles.enableDamping = true
    controles.dampingFactor = 0.08
    controles.screenSpacePanning = false
    controles.minPolarAngle = 0.35
    controles.maxPolarAngle = 1.2
    controles.minAzimuthAngle = -0.7
    controles.maxAzimuthAngle = 0.9
    controles.minDistance = 4
    controles.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    controles.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN }
    renderer.domElement.style.touchAction = 'pan-y'
    let distanciaLejos = 20
    const radio = Math.hypot(plano.ancho + 2 * borde, plano.fondo + 2 * borde) / 2
    const encuadrar = () => {
      const w = contenedor.clientWidth || 1, h = contenedor.clientHeight || 1
      camara.aspect = w / h
      camara.updateProjectionMatrix()
      renderer.setSize(w, h)
      textos.setSize(w, h)
      // Que entre todo el salón: la distancia sale del ancho o del alto visible, lo que pida más.
      const vertical = THREE.MathUtils.degToRad(camara.fov) / 2
      const horizontal = Math.atan(Math.tan(vertical) * camara.aspect)
      const d = radio / Math.sin(Math.min(vertical, horizontal)) * 0.62
      controles.maxDistance = d * 1.4
      distanciaLejos = d * 0.8
      return d
    }
    const inicio = () => {
      const d = encuadrar()
      const dir = new THREE.Vector3(0.28, 0.82, 0.78).normalize()
      controles.target.copy(centro)
      camara.position.copy(centro).addScaledVector(dir, d)
      controles.update()
    }
    inicio()
    const observador = new ResizeObserver(() => encuadrar())
    observador.observe(contenedor)

    // Tocar un agente (o su escritorio) abre su panel. Un arrastre no cuenta como toque.
    const raycaster = new THREE.Raycaster()
    const puntero = new THREE.Vector2()
    let bajada = null
    const agenteBajo = ev => {
      const rect = renderer.domElement.getBoundingClientRect()
      puntero.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(puntero, camara)
      for (const hit of raycaster.intersectObjects(clicables, true)) if (hit.object.userData.agenteId) return hit.object.userData.agenteId
      return null
    }
    const alBajar = ev => { bajada = { x: ev.clientX, y: ev.clientY } }
    const alSubir = ev => {
      if (!bajada || Math.hypot(ev.clientX - bajada.x, ev.clientY - bajada.y) > 6) return
      const id = agenteBajo(ev)
      if (id) datos.current.abrir(id)
    }
    let ultimoMover = 0
    const alMover = ev => {
      const ahora = performance.now()
      if (ahora - ultimoMover < 80 || ev.buttons) return
      ultimoMover = ahora
      renderer.domElement.style.cursor = agenteBajo(ev) ? 'pointer' : ''
    }
    renderer.domElement.addEventListener('pointerdown', alBajar)
    renderer.domElement.addEventListener('pointerup', alSubir)
    renderer.domElement.addEventListener('pointermove', alMover)

    // Botones: acercar, alejar y volver a ver todo.
    const botones = document.createElement('div')
    botones.className = 'oe-botones'
    for (const [texto, titulo, accion] of [
      ['+', 'Acercar', () => { camara.position.lerp(controles.target, 0.25); controles.update() }],
      ['−', 'Alejar', () => { camara.position.sub(controles.target).multiplyScalar(1.3).add(controles.target); controles.update() }],
      ['⌂', 'Ver toda la oficina', inicio],
    ]) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = texto
      b.title = titulo
      b.setAttribute('aria-label', titulo)
      b.addEventListener('click', accion)
      botones.appendChild(b)
    }
    contenedor.appendChild(botones)

    // Solo se anima cuando se ve.
    let visible = true
    const visibilidad = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    visibilidad.observe(contenedor)
    let antes = performance.now()
    let t = 0
    let cuadroId = 0
    const cuadro = () => {
      cuadroId = requestAnimationFrame(cuadro)
      const ahora = performance.now()
      const dt = Math.min(0.1, (ahora - antes) / 1000)
      antes = ahora
      if (!visible || document.hidden) return
      t += dt
      const D = datos.current
      const porId = new Map(D.agentes.map(a => [a.id, a]))
      for (const [id, ac] of actores) {
        const a = porId.get(id)
        if (!a) { ac.p.grupo.visible = false; continue }
        const { estado, objeto } = poseDe(a.estado, t, ac.fase)
        posar(ac.p, { pose: 'sentado', estado, objeto, t: sinMovimiento ? 0 : t, fase: ac.fase })
        // La pantalla: verde trabajando, roja con un problema, azulada si está libre, apagada si duerme.
        const luz = estado === 'trabajando' ? ['#3fb878', 0.9 + Math.sin(t * 6 + ac.fase) * 0.15] : estado === 'error' ? ['#e85d6a', 0.7 + Math.max(0, Math.sin(t * 5)) * 0.6] : estado === 'pausado' ? ['#000000', 0] : ['#6ea8ff', 0.45]
        ac.brillo.emissive.set(luz[0])
        ac.brillo.emissiveIntensity = luz[1]
        const el = ac.chip.userData.el
        const clase = `oe-agente estado-${a.estado}${id === D.elegidoId ? ' is-elegido' : ''}`
        if (el.className !== clase) el.className = clase
        const texto = `${a.estado === 'error' ? '! ' : a.estado === 'pausado' ? 'z z ' : ''}${nombreCorto(a.nombre)}`
        if (el.textContent !== texto) el.textContent = texto
        el.title = `${a.nombre}: ${ESTADOS[a.estado] ?? a.estado}${a.ahora ? `. ${a.ahora}` : ''}`
      }
      const elegido = actores.get(D.elegidoId)
      aro.visible = Boolean(elegido)
      if (elegido) aro.position.set(elegido.puesto.position.x, 0.03, elegido.puesto.position.z)
      controles.update()
      // De lejos solo se ven los puntitos de estado (y el nombre de los que tienen un problema); de cerca, los nombres.
      contenedor.classList.toggle('oe-lejos', camara.position.distanceTo(controles.target) > distanciaLejos)
      renderer.render(escena, camara)
      textos.render(escena, camara)
    }
    cuadroId = requestAnimationFrame(cuadro)

    return () => {
      cancelAnimationFrame(cuadroId)
      observador.disconnect()
      visibilidad.disconnect()
      renderer.domElement.removeEventListener('pointerdown', alBajar)
      renderer.domElement.removeEventListener('pointerup', alSubir)
      renderer.domElement.removeEventListener('pointermove', alMover)
      controles.dispose()
      liberar(escena)
      renderer.dispose()
      renderer.domElement.remove()
      textos.domElement.remove()
      botones.remove()
    }
  }, [firma]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="oficina-escena" ref={caja} role="img"
    aria-label="La oficina dibujada: cada equipo en su isla de escritorios y el rincón de descanso. Los agentes también están en la lista de abajo." />
}
