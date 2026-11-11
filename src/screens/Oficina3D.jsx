import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { crearSala, crearOficina, crearEscritorio, crearPuestoMesa, vaciarMateriales, COLORES } from '../oficina3d/mundo.js'
import { crearPersonaje, posar, liberar } from '../oficina3d/personaje.js'
import { lugares, mesaUp, rutinas, camino, largo, puntoEn, momentoRutina, variante, agujas, FONDO_OFICINAS, ANCHO_OFICINAS_IZQ } from '../oficinaPlano.mjs'
import { ESTADOS } from '../oficina.mjs'
import './Oficina3D.css'

// La Oficina en 3D (three.js): cada trabajador y cada comercial de PDG en su oficina (la de María, la jefa, es la mejor),
// los de UP en un tablón compartido, y las salas comunes. Lo que hace cada uno sale de su estado real: trabajando
// teclea (y su pantalla brilla en verde), con un problema se agarra la cabeza (pantalla roja y "!"), libre trabaja y
// cada tanto sale a la cafetería, el comedor, el ocio o el ping pong y vuelve, pausado duerme en un puf.
// Se gira arrastrando, se acerca con la rueda o con dos dedos, y tocando un agente se abre su panel.
const ORDEN = ['trabajadores', 'up', 'pdg']
const ROPA_EQUIPO = { up: '#d9734e', pdg: '#3fa98a' }
const CENTRO = new THREE.Vector3(18, 0.4, 11)
const JEFA = 'maria'
const nombreCorto = n => String(n).split(' (')[0]

function colorRopa(a) {
  if (!a.color) return ROPA_EQUIPO[a.equipo] ?? COLORES.lila
  const css = getComputedStyle(document.documentElement).getPropertyValue(`--id-${a.color}`).trim()
  return css || COLORES.lila
}
const reducido = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

// El CSS2DRenderer ubica cada etiqueta con transform: lo visible (y animado) va en un elemento de adentro.
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

export default function Oficina3D({ agentes, elegidoId, abrir }) {
  const marco = useRef(null)
  const datos = useRef({ agentes, elegidoId, abrir, rut: rutinas(agentes) })
  // Cada render deja a mano lo último (estados, elegido, abrir): el cuadro de animación lo lee sin rearmar la escena.
  useEffect(() => { datos.current = { agentes, elegidoId, abrir, rut: rutinas(agentes) } })
  // La escena se arma de nuevo solo si cambia quiénes están (no cuando cambia su estado).
  const firma = agentes.map(a => `${a.id}`).join('|')

  useEffect(() => {
    const contenedor = marco.current
    if (!contenedor) return
    const sinMovimiento = reducido()
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    contenedor.appendChild(renderer.domElement)
    const textos = new CSS2DRenderer()
    textos.domElement.className = 'o3-textos'
    contenedor.appendChild(textos.domElement)

    const escena = new THREE.Scene()
    escena.add(new THREE.HemisphereLight('#ffffff', '#cbb9ee', 1.35))
    const sol = new THREE.DirectionalLight('#fff3df', 2.3)
    sol.position.set(42, 34, 30)
    sol.target.position.copy(CENTRO)
    sol.castShadow = true
    sol.shadow.mapSize.set(2048, 2048)
    Object.assign(sol.shadow.camera, { left: -27, right: 27, top: 22, bottom: -22, near: 5, far: 110 })
    sol.shadow.bias = -0.0004
    sol.shadow.normalBias = 0.03
    escena.add(sol, sol.target)
    const relleno = new THREE.DirectionalLight('#dfe9ff', 0.55)
    relleno.position.set(-10, 12, 30)
    escena.add(relleno)

    const camara = new THREE.PerspectiveCamera(30, 1, 0.5, 200)
    const controles = new OrbitControls(camara, renderer.domElement)
    controles.target.copy(CENTRO)
    controles.enableDamping = true
    controles.dampingFactor = 0.08
    controles.minDistance = 10
    controles.maxDistance = 70
    controles.minPolarAngle = 0.35
    controles.maxPolarAngle = 1.22
    controles.minAzimuthAngle = 0.12
    controles.maxAzimuthAngle = 1.45
    controles.cursor.copy(CENTRO)
    controles.maxTargetRadius = 11
    // Celular: un dedo hace scroll de la página; dos dedos giran y acercan.
    controles.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE }
    renderer.domElement.style.touchAction = 'pan-y'

    const inicial = datos.current.agentes
    const sala = crearSala(mesaUp(inicial.filter(a => a.equipo === 'up').length).mesa)
    escena.add(sala.grupo)

    // Lugares y actores.
    const actores = new Map()
    const clicables = []
    for (const e of ORDEN) {
      const del = inicial.filter(a => a.equipo === e)
      lugares(e, del.length, del.findIndex(a => a.clave === JEFA)).forEach((lugar, i) => {
        const a = del[i]
        let mueble
        if (lugar.tipo === 'oficina') {
          escena.add(crearOficina(lugar, i))
          mueble = crearEscritorio(lugar.escritorio.x, lugar.escritorio.y, lugar.mira, { ejecutivo: lugar.jefa, decoracion: i })
        } else mueble = crearPuestoMesa(lugar.sentado.x, lugar.sentado.y, lugar.mira)
        mueble.sentado = { x: lugar.sentado.x, y: 0.08, z: lugar.sentado.y }
        const p = crearPersonaje({ ropa: colorRopa(a), v: variante(a.id) })
        escena.add(mueble.grupo, p.grupo)
        for (const o of [mueble.grupo, p.grupo]) { o.traverse(m => { m.userData.agenteId = a.id }); clicables.push(o) }
        // El nombre en la puerta de su oficina (o junto a su lugar en el tablón).
        const cartel = etiqueta(`o3-cartel${lugar.jefa ? ' o3-jefa' : ''}`, lugar.jefa ? `★ ${nombreCorto(a.nombre)}` : nombreCorto(a.nombre), () => datos.current.abrir(a.id))
        if (lugar.lado === 'fondo') cartel.position.set(lugar.puerta.x, 2.25, FONDO_OFICINAS)
        else if (lugar.lado === 'izquierda') cartel.position.set(ANCHO_OFICINAS_IZQ, 2.25, lugar.puerta.y)
        else cartel.position.set(lugar.sentado.x, 0.05, lugar.sentado.y + (lugar.mira === 0 ? -0.55 : lugar.mira === Math.PI ? 0.6 : 0))
        if (lugar.cabecera) cartel.position.set(lugar.sentado.x + 0.6, 0.05, lugar.sentado.y)
        escena.add(cartel)
        const burbuja = etiqueta('o3-burbuja', null, () => datos.current.abrir(a.id))
        burbuja.position.set(0, 0.55, 0)
        p.cabeza.add(burbuja)
        const zetas = etiqueta('o3-zetas', 'z z z')
        zetas.position.set(0.25, 0.5, 0)
        p.cabeza.add(zetas)
        actores.set(a.id, { lugar, mueble, p, cartel, burbuja, zetas, fase: (i * 1.7) % 5, camino: null, descansoId: null })
      })
    }

    // Aro bajo el agente elegido y pelota de ping pong.
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 40), new THREE.MeshBasicMaterial({ color: '#f0a63c', transparent: true, opacity: 0.9, side: THREE.DoubleSide }))
    aro.rotation.x = -Math.PI / 2
    aro.visible = false
    escena.add(aro)
    const pelota = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.2 }))
    pelota.castShadow = true
    pelota.visible = false
    escena.add(pelota)

    // Tamaño: el ancho del recuadro; la altura sigue la proporción (más alta en el celular).
    let ancho = 0
    let encuadrada = false
    const medir = () => {
      const w = contenedor.clientWidth
      if (!w || w === ancho) return
      ancho = w
      const h = Math.round(Math.min(620, Math.max(340, w < 640 ? w * 0.9 : w * 0.58)))
      renderer.setSize(w, h)
      textos.setSize(w, h)
      camara.aspect = w / h
      camara.updateProjectionMatrix()
      // Encuadre inicial: más lejos si la pantalla es angosta, para que entre toda la oficina.
      if (!encuadrada) {
        const lejos = 53 * Math.min(1.5, Math.max(1, 1.6 / camara.aspect))
        camara.position.copy(CENTRO).add(new THREE.Vector3(0.62, 0.62, 0.48).normalize().multiplyScalar(lejos))
        encuadrada = true
      }
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(contenedor)

    // Clic o toque en un agente: abre su panel. El cursor cambia al pasar por encima.
    const rayo = new THREE.Raycaster()
    const puntero = new THREE.Vector2()
    let bajada = null
    const agenteBajo = ev => {
      const r = renderer.domElement.getBoundingClientRect()
      puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      rayo.setFromCamera(puntero, camara)
      const hit = rayo.intersectObjects(clicables, true).find(h => h.object.visible)
      return hit?.object.userData.agenteId ?? null
    }
    const alBajar = ev => { bajada = { x: ev.clientX, y: ev.clientY } }
    const alSubir = ev => {
      if (!bajada || Math.hypot(ev.clientX - bajada.x, ev.clientY - bajada.y) > 6) return
      const id = agenteBajo(ev)
      if (id) datos.current.abrir(id)
    }
    const alMover = ev => { if (ev.pointerType === 'mouse' && !ev.buttons) renderer.domElement.style.cursor = agenteBajo(ev) ? 'pointer' : 'grab' }
    renderer.domElement.addEventListener('pointerdown', alBajar)
    renderer.domElement.addEventListener('pointerup', alSubir)
    renderer.domElement.addEventListener('pointermove', alMover)

    // Solo se anima mientras se ve (la pantalla queda montada oculta cuando vas a otra).
    let visible = true
    let cuadroId = 0
    const visibilidad = new IntersectionObserver(([e]) => {
      const antes = visible
      visible = e.isIntersecting
      if (visible && !antes) cuadroId = requestAnimationFrame(cuadro)
    })
    visibilidad.observe(contenedor)

    const pantallaColor = (pantalla, estado, presente, t) => {
      const m = pantalla.material
      if (!presente) { m.emissive.set('#000000'); m.color.set('#3a3550'); return }
      if (estado === 'trabajando') { m.color.set('#bff3d6'); m.emissive.set(COLORES.trabajando); m.emissiveIntensity = 0.9 + Math.sin(t * 7) * 0.15 }
      else if (estado === 'error') { m.color.set('#ffd0d4'); m.emissive.set(COLORES.error); m.emissiveIntensity = 0.7 + Math.max(0, Math.sin(t * 5)) * 0.6 }
      else { m.color.set('#cfe0ff'); m.emissive.set('#7fa6ff'); m.emissiveIntensity = 0.35 }
    }

    function cuadro() {
      if (!visible) return
      const t = performance.now() / 1000
      const { agentes: lista, elegidoId: elegido, rut } = datos.current
      const porId = new Map(lista.map(a => [a.id, a]))
      const enDescanso = []
      for (const [id, ac] of actores) {
        const a = porId.get(id)
        if (!a) continue
        const r = rut[id] ?? { tipo: 'escritorio' }
        const { p, lugar, mueble } = ac
        let pose = 'sentado', objeto = null, pos = mueble.sentado, giro = lugar.mira ?? 0, presente = true, aLaVista = true
        if (r.tipo === 'siesta') {
          presente = false
          if (r.puf) { pose = 'dormido'; pos = { x: r.puf.x, y: 0.22, z: r.puf.y }; giro = -0.5 } else aLaVista = false
        } else if (r.tipo === 'rutina' && !sinMovimiento) {
          if (ac.descansoId !== r.descanso.id) { ac.camino = camino(lugar, r.descanso); ac.largo = largo(ac.camino); ac.descansoId = r.descanso.id }
          const m = momentoRutina(t + r.retraso, ac.largo)
          if (m.fase !== 'sentado') {
            presente = false
            const d = r.descanso
            if (m.fase === 'descanso') {
              enDescanso.push(d.id)
              pose = d.pose
              objeto = d.objeto
              pos = { x: d.x, y: d.altura, z: d.y }
              giro = d.mira
            } else {
              const pt = puntoEn(ac.camino, m.d)
              pose = 'caminando'
              objeto = m.fase === 'volviendo' ? d.objeto : null
              pos = { x: pt.x, y: 0, z: pt.y }
              giro = m.fase === 'yendo' ? Math.atan2(pt.dx, pt.dy) : Math.atan2(-pt.dx, -pt.dy)
            }
          }
        }
        p.grupo.visible = aLaVista
        p.grupo.position.set(pos.x, pos.y, pos.z)
        p.grupo.rotation.y = giro
        posar(p, { pose, estado: presente ? a.estado : 'libre', objeto, t: sinMovimiento ? 0 : t, fase: ac.fase })
        if (mueble.pantalla) pantallaColor(mueble.pantalla, a.estado, presente, t)
        // Burbuja sobre la cabeza: trabajando o con un problema, solo mientras está en su lugar.
        const tipoBurbuja = presente && (a.estado === 'trabajando' || a.estado === 'error') ? a.estado : null
        ac.burbuja.userData.el.className = `o3-burbuja${tipoBurbuja ? ` estado-${tipoBurbuja}` : ''}`
        ac.burbuja.userData.el.textContent = tipoBurbuja === 'error' ? '!' : ''
        ac.burbuja.visible = Boolean(tipoBurbuja)
        ac.zetas.visible = pose === 'dormido'
        ac.cartel.userData.el.className = `o3-cartel${lugar.jefa ? ' o3-jefa' : ''} estado-${a.estado}${id === elegido ? ' is-elegido' : ''}`
        ac.cartel.userData.el.title = `${a.nombre}: ${ESTADOS[a.estado]}. ${a.ahora}`
        if (id === elegido) { aro.visible = aLaVista; aro.position.set(pos.x, 0.03, pos.z) }
      }
      if (!elegido || !actores.has(elegido)) aro.visible = false
      // La pelota va y viene solo si los dos jugadores de ping pong están en la mesa.
      const jugando = enDescanso.includes('ping-1') && enDescanso.includes('ping-2')
      pelota.visible = jugando
      if (jugando) {
        const f = (Math.sin(t * 4.5) + 1) / 2
        pelota.position.set(29.3 + f * 4.8, 0.85 + Math.abs(Math.sin(t * 9)) * 0.35, 17.8)
      }
      const { hora, minuto } = agujas(Date.now())
      sala.agujas.hora.rotation.z = -THREE.MathUtils.degToRad(hora)
      sala.agujas.minuto.rotation.z = -THREE.MathUtils.degToRad(minuto)
      sala.agujas.segundo.rotation.z = -((Date.now() / 1000) % 60) * (Math.PI / 30)
      sala.luzCafetera.material.emissiveIntensity = 0.6 + Math.max(0, Math.sin(t * 3)) * 0.9
      controles.update()
      // Los nombres solo se muestran de cerca (de lejos se encimarían); el del elegido, siempre.
      contenedor.classList.toggle('o3-lejos', camara.position.distanceTo(controles.target) > 56)
      renderer.render(escena, camara)
      textos.render(escena, camara)
      cuadroId = requestAnimationFrame(cuadro)
    }
    cuadroId = requestAnimationFrame(cuadro)

    return () => {
      cancelAnimationFrame(cuadroId)
      visible = false
      observador.disconnect()
      visibilidad.disconnect()
      renderer.domElement.removeEventListener('pointerdown', alBajar)
      renderer.domElement.removeEventListener('pointerup', alSubir)
      renderer.domElement.removeEventListener('pointermove', alMover)
      controles.dispose()
      liberar(escena)
      vaciarMateriales()
      renderer.dispose()
      renderer.domElement.remove()
      textos.domElement.remove()
    }
  }, [firma])

  return <div className="oficina-3d" ref={marco} role="img"
    aria-label="La oficina en 3D: Trabajadores y UP en sus escritorios, la sala de reuniones de PDG, la cocina y el living. Los agentes también están en la lista de abajo." />
}
