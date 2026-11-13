import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { crearSala, crearOficina, crearEscritorio, crearPuestoMesa, crearDireccion, crearPizarron, texturaPizarron, dibujarPizarron, vaciarMateriales, vidrioVentana, COLORES } from '../oficina3d/mundo.js'
import { crearPersonaje, posar, liberar } from '../oficina3d/personaje.js'
import { crearRoberta, moverRoberta } from '../oficina3d/roberta.js'
import {
  lugares, mesaUp, mesaPdg, mesaAdmin, mesaSistemas, rutinas, camino, largo, puntoEn, momentoRutina, variante, agujas, alturaPiso,
  ACCESORIOS, bebidaDe, luzDelDia, VELOCIDAD, PISO, asientosReunion, alPasillo, haciaPasillo, caminoReunion, asientosEspera,
  caminoEspera, caminoTurno, caminoVueltaTurno, DANIELA, DANIELA_SALA, DANIELA_OFICINA, asientosOficina, caminoOficina, VISITA, ROBERTA,
  PIZARRONES,
} from '../oficinaPlano.mjs'
import { obstaculos, grilla, buscarCamino, pasoAPie } from '../oficinaCaminar.mjs'
import { ESTADOS, mesOficina, hoyAR } from '../oficina.mjs'
import './Oficina3D.css'

// La Oficina en 3D (three.js), con jerarquía de la entrada al fondo: Administración (las tareas programadas en una
// mesa), la mampara, los tablones de UP y PDG comercial, las oficinas de los trabajadores (compartidas por tema) y,
// sobre la tarima del fondo, las oficinas de María y de Daniela, la jefa de todos.
// Lo que hace cada agente sale de su estado real: trabajando teclea (pantalla verde), con un problema se agarra la
// cabeza (pantalla roja y "!"), libre trabaja y cada tanto sale de descanso, pausado duerme en un puf.
// Además: la luz sigue la hora de Buenos Aires; al elegir un agente la cámara lo sigue; con doble click Daniela
// camina adonde quiera; y las reuniones (en la sala, todos juntos, o en su oficina, por turnos) se ven acá.
const ORDEN = ['trabajadores', 'up', 'pdg', 'admin', 'sistemas']
const ROPA_EQUIPO = { up: '#d9734e', pdg: '#3fa98a', admin: '#8a7fc4', sistemas: '#4d6f8f' }
const COLOR_PUESTO = { up: COLORES.durazno, pdg: COLORES.menta, admin: COLORES.lila, sistemas: COLORES.grisClaro }
const CENTRO = new THREE.Vector3(22.5, 0.4, 13.25)
// Videollamada: la cámara está arriba de la pantalla de la sala (el lado sin sillas) y ve el arco entero de frente.
const CAMARA_SALA = { pos: new THREE.Vector3(9.1, 4.9, 23.0), target: new THREE.Vector3(3.5, 0.75, 23.0), fov: 56 }
// Reunión en la oficina de Daniela: la cámara mira su mesa de reuniones desde arriba, del lado del vidrio.
const CAMARA_OFICINA = { pos: new THREE.Vector3(42.6, 3.9, 6.5), target: new THREE.Vector3(40.3, 0.9, 3.0), fov: 52 }
const CAMARA_DESPACHO = { pos: new THREE.Vector3(37.25, 1.92, 1.05), target: new THREE.Vector3(36.5, 1.12, 4.7), fov: 46 }
const nombreCorto = n => String(n).split(' (')[0]
const PIZARRON = '__pizarron__'
const FONDO_APIE = new THREE.Color('#e8e2d8')
const BRUMA_APIE = new THREE.Fog('#e8e2d8', 14, 46) // lo que devuelve el click sobre un pizarrón (en vez del id de un agente)
// Al costado de la silla de Daniela, del lado libre: por ahí se levanta y se vuelve a sentar.
const COSTADO_SILLA = { x: DANIELA.sentado.x + 1.7, y: DANIELA.sentado.y }
const reducido = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const suaveIn = x => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)

function colorRopa(a) {
  if (!a.color) return ROPA_EQUIPO[a.equipo] ?? COLORES.lila
  const css = getComputedStyle(document.documentElement).getPropertyValue(`--id-${a.color}`).trim()
  return css || COLORES.lila
}

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

// reunion: null o { id, modo: 'sala' | 'oficina' | 'turnos', estado: 'convocada' | 'en_curso' | 'volviendo', asistentes: [ids],
//   inicio, vuelta, turnos: { [id]: { llamado, fin } } }. hablando: id del que habla en la reunión.
// pantallaCompleta: la vista tipo videollamada (la arma Oficina.jsx con children encima de la escena).
export default function Oficina3D({ agentes, elegidoId, abrir, reunion = null, hablando = null, alPlanificar, alVolvieron,
  volverDaniela = 0, alMoverDaniela, pantallaCompleta = false, reloj = Date.now, calendario = [], alTocarPizarron = null, children }) {
  const marco = useRef(null)
  const pizarron = useRef(null) // la textura del calendario que comparten los pizarrones
  const escenario = useRef(null)
  const datos = useRef(null)
  datos.current ??= { agentes, elegidoId, abrir, rut: rutinas(agentes), reunion, hablando, alPlanificar, alVolvieron, volverDaniela, alMoverDaniela, reloj, calendario }
  // Cada render deja a mano lo último: el cuadro de animación lo lee sin rearmar la escena.
  useEffect(() => {
    datos.current = { agentes, elegidoId, abrir, rut: rutinas(agentes), reunion, hablando, alPlanificar, alVolvieron, volverDaniela, alMoverDaniela, reloj, alTocarPizarron, calendario }
  })
  // Los pizarrones muestran el mes actual con lo que pasa en la oficina: se redibujan cuando cambia el calendario.
  const firmaCalendario = calendario.map(e => `${e.id}${e.tipo}${e.fecha}`).join('|')
  useEffect(() => {
    if (!pizarron.current) return
    const hoy = hoyAR()
    dibujarPizarron(pizarron.current, mesOficina(hoy.slice(0, 7), calendario, hoy))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaCalendario])
  // La escena se arma de nuevo solo si cambia quiénes están (no cuando cambia su estado).
  const firma = agentes.map(a => a.id).join('|')

  useEffect(() => {
    const contenedor = marco.current
    const caja = escenario.current
    if (!contenedor || !caja) return
    const sinMovimiento = reducido()
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.tabIndex = 0
    caja.appendChild(renderer.domElement)
    const textos = new CSS2DRenderer()
    textos.domElement.className = 'o3-textos'
    caja.appendChild(textos.domElement)

    // Luces: cielo, sol (se mueve con la hora) y un relleno suave.
    const escena = new THREE.Scene()
    const cielo = new THREE.HemisphereLight('#ffffff', '#d8cfc2', 1.35)
    escena.add(cielo)
    const sol = new THREE.DirectionalLight('#fff3df', 2.3)
    sol.target.position.copy(CENTRO)
    sol.castShadow = true
    sol.shadow.mapSize.set(2048, 2048)
    Object.assign(sol.shadow.camera, { left: -32, right: 32, top: 24, bottom: -24, near: 5, far: 130 })
    sol.shadow.bias = -0.0004
    sol.shadow.normalBias = 0.03
    escena.add(sol, sol.target)
    const relleno = new THREE.DirectionalLight('#dfe9ff', 0.55)
    relleno.position.set(-10, 12, 34)
    escena.add(relleno)

    // Cámara: se desplaza arrastrando (botón izquierdo), gira con el derecho, acerca con la rueda;
    // en el celular, dos dedos desplazan y acercan (un dedo sigue moviendo la página).
    const camara = new THREE.PerspectiveCamera(30, 1, 0.3, 220)
    const controles = new OrbitControls(camara, renderer.domElement)
    controles.target.copy(CENTRO)
    controles.enableDamping = true
    controles.dampingFactor = 0.08
    controles.minDistance = 4
    controles.maxDistance = 80
    controles.minPolarAngle = 0.3
    controles.maxPolarAngle = 1.3
    controles.minAzimuthAngle = 0.05
    controles.maxAzimuthAngle = 1.5
    controles.screenSpacePanning = false
    controles.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    controles.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN }
    controles.cursor.copy(CENTRO)
    controles.maxTargetRadius = 22
    controles.keyPanSpeed = 20
    controles.listenToKeyEvents(renderer.domElement)
    renderer.domElement.style.touchAction = 'pan-y'

    const inicial = datos.current.agentes
    const nUp = inicial.filter(a => a.equipo === 'up').length
    const nPdg = inicial.filter(a => a.equipo === 'pdg').length
    const nAdmin = inicial.filter(a => a.equipo === 'admin').length
    const nSistemas = inicial.filter(a => a.equipo === 'sistemas').length
    const sala = crearSala({ up: mesaUp(nUp).mesa, pdg: mesaPdg(nPdg).mesa, admin: mesaAdmin(nAdmin).mesa, sistemas: mesaSistemas(nSistemas).mesa })
    escena.add(sala.grupo)
    const direccion = crearDireccion()
    escena.add(direccion.grupo)

    // Lugares y actores.
    const actores = new Map()
    const clicables = []
    // Los pizarrones con rueditas: el calendario de la oficina. Tocarlos lleva al calendario de abajo.
    const texPizarron = texturaPizarron()
    pizarron.current = texPizarron
    { const hoy = hoyAR(); dibujarPizarron(texPizarron, mesOficina(hoy.slice(0, 7), datos.current.calendario ?? [], hoy)) }
    for (const p of PIZARRONES) {
      const pz = crearPizarron(p, texPizarron)
      pz.traverse(m => { m.userData.agenteId = PIZARRON })
      escena.add(pz)
      clicables.push(pz)
    }
    const todosLosLugares = []
    const construidas = new Set()
    let luzMaria = null
    for (const e of ORDEN) {
      const del = inicial.filter(a => a.equipo === e)
      lugares(e, del.map(a => a.clave)).forEach((lugar, i) => {
        const a = del[i]
        todosLosLugares.push(lugar)
        let mueble
        if (lugar.tipo === 'oficina') {
          if (!construidas.has(lugar.oficina.id)) {
            const of = crearOficina(lugar.oficina)
            escena.add(of)
            if (of.userData.luz) luzMaria = of.userData.luz
            construidas.add(lugar.oficina.id)
          }
          mueble = crearEscritorio(lugar.escritorio.x, lugar.escritorio.y, lugar.mira, { ejecutivo: lugar.jefa, decoracion: i })
        } else mueble = crearPuestoMesa(lugar.sentado.x, lugar.sentado.y, lugar.mira, COLOR_PUESTO[e])
        mueble.grupo.position.y = alturaPiso(lugar.sentado.x, lugar.sentado.y)
        mueble.sentado = { x: lugar.sentado.x, y: 0.08, z: lugar.sentado.y }
        const p = crearPersonaje({ ropa: colorRopa(a), v: variante(a.id), accesorio: ACCESORIOS[a.id] ?? null })
        escena.add(mueble.grupo, p.grupo)
        for (const o of [mueble.grupo, p.grupo]) { o.traverse(m => { m.userData.agenteId = a.id }); clicables.push(o) }
        // El nombre sobre el vidrio de su oficina, a la altura de su escritorio (el de enfrente, un poco más arriba para que
        // no se pisen), o detrás de su silla en el tablón.
        const cartel = etiqueta(`o3-cartel${lugar.jefa ? ' o3-jefa' : ''}`, lugar.jefa ? `★ ${nombreCorto(a.nombre)}` : nombreCorto(a.nombre), () => datos.current.abrir(a.id))
        if (lugar.tipo === 'oficina') cartel.position.set(lugar.jefa ? lugar.puerta.x : lugar.escritorio.x, 2.25 + (lugar.mira === Math.PI ? 0.34 : 0) + alturaPiso(lugar.puerta.x, lugar.oficina.y1 - 0.1), lugar.oficina.y1)
        else cartel.position.set(lugar.sentado.x - Math.sin(lugar.mira) * 0.6, 0.05, lugar.sentado.y - Math.cos(lugar.mira) * 0.6)
        escena.add(cartel)
        const burbuja = etiqueta('o3-burbuja', null, () => datos.current.abrir(a.id))
        burbuja.position.set(0, 0.55, 0)
        p.cabeza.add(burbuja)
        const zetas = etiqueta('o3-zetas', 'z z z')
        zetas.position.set(0.25, 0.5, 0)
        p.cabeza.add(zetas)
        actores.set(a.id, { a, lugar, mueble, p, cartel, burbuja, zetas, bebida: bebidaDe(a.id), fase: (i * 1.7) % 5, camino: null, descansoId: null, desfase: 0, pos: { x: lugar.sentado.x, y: 0, z: lugar.sentado.y } })
      })
    }

    // Daniela: su personaje, sentada en su escritorio hasta que hace doble click en algún lugar.
    const yo = crearPersonaje({ ropa: COLORES.dorado, v: { pelo: 2, colorPelo: 0, piel: 0 }, accesorio: 'estrella' })
    escena.add(yo.grupo)
    const cartelYo = etiqueta('o3-cartel o3-yo', '★ Daniela (vos)')
    cartelYo.position.set(0, 0.62, 0)
    yo.cabeza.add(cartelYo)
    const daniela = { sentada: true, ruta: null, d: 0, pos: { x: DANIELA.sentado.x, y: DANIELA.sentado.y }, giro: DANIELA.mira, volverAlLlegar: false, avisoLejos: false, volverVisto: datos.current.volverDaniela }
    const mapa = grilla(obstaculos(todosLosLugares, nUp, nPdg, nAdmin, nSistemas))
    const caminarA = (destino, sentarse = false, exacto = false) => {
      const desde = daniela.sentada ? COSTADO_SILLA : daniela.pos
      const ruta = buscarCamino(mapa, desde, destino)
      if (!ruta) return
      daniela.ruta = daniela.sentada ? [{ ...daniela.pos }, ...ruta] : [{ ...daniela.pos }, ...ruta.slice(1)]
      daniela.d = 0
      daniela.sentada = false
      daniela.enSala = false
      daniela.irASala = false
      daniela.volverAlLlegar = sentarse
      if (sentarse) daniela.ruta.push({ x: DANIELA.sentado.x, y: DANIELA.sentado.y })
      else if (exacto) daniela.ruta.push({ x: destino.x, y: destino.y })
    }
    const volverAlEscritorio = () => caminarA(COSTADO_SILLA, true)

    // Vista a pie (como Street View): la cámara va a la altura de los ojos de Daniela. Se mira arrastrando y se camina
    // con las flechas (o W A S D, o los botones de la pantalla) o con doble click en el piso. rumbo: hacia dónde mira
    // (como el giro de los personajes); cabeceo: arriba o abajo.
    const aPie = { activo: false, rumbo: 0, cabeceo: -0.08, teclas: new Set(), ultimo: null }
    const ojoAPie = new THREE.Vector3(), miraAPie = new THREE.Vector3()
    const TECLAS = { ArrowUp: 'adelante', w: 'adelante', W: 'adelante', ArrowDown: 'atras', s: 'atras', S: 'atras', ArrowLeft: 'izquierda', a: 'izquierda', A: 'izquierda', ArrowRight: 'derecha', d: 'derecha', D: 'derecha' }
    const escribiendo = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    const alTecla = ev => {
      if (!aPie.activo || escribiendo(ev.target) || !TECLAS[ev.key]) return
      ev.preventDefault()
      if (ev.type === 'keydown') aPie.teclas.add(TECLAS[ev.key]); else aPie.teclas.delete(TECLAS[ev.key])
    }
    window.addEventListener('keydown', alTecla)
    window.addEventListener('keyup', alTecla)

    // Roberta, su perra: echada en su camita; cuando Daniela camina, la sigue por el mismo rastro (así no atraviesa
    // paredes) y se sienta cerca; cuando Daniela vuelve a sentarse, vuelve a su camita.
    const perra = crearRoberta()
    escena.add(perra.grupo)
    const cartelPerra = etiqueta('o3-cartel o3-roberta', `🐾 ${ROBERTA.nombre}`)
    cartelPerra.position.set(0, 0.85, 0)
    perra.grupo.add(cartelPerra)
    const roberta = { pos: { ...ROBERTA.cama }, giro: 0.8, idx: 0, rastro: [] }

    // Aro bajo el agente elegido y pelota de ping pong.
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 40), new THREE.MeshBasicMaterial({ color: '#f0a63c', transparent: true, opacity: 0.9, side: THREE.DoubleSide }))
    aro.rotation.x = -Math.PI / 2
    aro.visible = false
    escena.add(aro)
    const pelota = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.2 }))
    pelota.castShadow = true
    pelota.visible = false
    escena.add(pelota)

    // Tamaño: el ancho del recuadro; la altura sigue la proporción. En pantalla completa, todo el espacio disponible.
    let medida = ''
    const general = { pos: new THREE.Vector3(), target: CENTRO.clone(), fov: 30 }
    let encuadrada = false
    let pedirEntrada = false
    const medir = () => {
      const completa = contenedor.classList.contains('o3-completa')
      const w = caja.clientWidth
      const h = completa ? caja.clientHeight : Math.round(Math.min(640, Math.max(340, w < 640 ? w * 0.9 : w * 0.58)))
      if (!w || !h || `${w}x${h}` === medida) return
      medida = `${w}x${h}`
      if (!completa) caja.style.height = `${h}px`
      renderer.setSize(w, h)
      textos.setSize(w, h)
      camara.aspect = w / h
      camara.updateProjectionMatrix()
      if (!encuadrada) {
        const lejos = 60 * Math.min(1.45, Math.max(1, 1.6 / camara.aspect))
        camara.position.copy(CENTRO).add(new THREE.Vector3(0.62, 0.62, 0.48).normalize().multiplyScalar(lejos))
        general.pos.copy(camara.position)
        encuadrada = true
        // Al abrir, la cámara entra recorriendo la oficina: arranca alta, del lado de la entrada, y baja a la vista general.
        if (!sinMovimiento) {
          camara.position.set(CENTRO.x + 8, lejos * 0.95, PISO.fondo + lejos * 0.55)
          pedirEntrada = true
        }
      }
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(caja)
    observador.observe(contenedor)

    // Clic en un agente: abre su panel. Doble click en el piso: Daniela camina hasta ahí.
    const rayo = new THREE.Raycaster()
    const puntero = new THREE.Vector2()
    const piso = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    let bajada = null
    let clicPendiente = 0
    const apuntar = ev => {
      const r = renderer.domElement.getBoundingClientRect()
      puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      rayo.setFromCamera(puntero, camara)
    }
    const agenteBajo = ev => {
      apuntar(ev)
      const hit = rayo.intersectObjects(clicables, true).find(h => h.object.visible)
      return hit?.object.userData.agenteId ?? null
    }
    const alBajar = ev => { bajada = { x: ev.clientX, y: ev.clientY }; aPie.ultimo = { x: ev.clientX, y: ev.clientY } }
    // A pie, arrastrar mueve la vista como en Street View (arrastrás la escena: a la derecha, mirás a la izquierda).
    const alArrastrarAPie = ev => {
      if (!aPie.activo || !ev.buttons || !aPie.ultimo) return
      aPie.rumbo += (ev.clientX - aPie.ultimo.x) * 0.005
      aPie.cabeceo = Math.max(-0.7, Math.min(0.55, aPie.cabeceo + (ev.clientY - aPie.ultimo.y) * 0.004))
      aPie.ultimo = { x: ev.clientX, y: ev.clientY }
    }
    renderer.domElement.addEventListener('pointermove', alArrastrarAPie)
    const alSubir = ev => {
      if (!bajada || Math.hypot(ev.clientX - bajada.x, ev.clientY - bajada.y) > 6) return
      const id = agenteBajo(ev)
      clearTimeout(clicPendiente)
      if (id === PIZARRON) { datos.current.alTocarPizarron?.(); return }
      // Se espera un instante por si es un doble click (ese mueve a Daniela, no abre el panel).
      if (id) clicPendiente = setTimeout(() => datos.current.abrir(id), 260)
    }
    const enReunionVisible = () => { const R = datos.current.reunion; return Boolean(R && R.estado === 'en_curso') }
    const alDobleClic = ev => {
      clearTimeout(clicPendiente)
      if (enReunionVisible()) return
      apuntar(ev)
      const punto = new THREE.Vector3()
      if (!rayo.ray.intersectPlane(piso, punto)) return
      if (punto.x < 0 || punto.z < 0 || punto.x > PISO.ancho || punto.z > PISO.fondo) return
      const enSuSilla = Math.hypot(punto.x - DANIELA.sentado.x, punto.z - DANIELA.sentado.y) < 1.1
      if (enSuSilla) volverAlEscritorio()
      else caminarA({ x: punto.x, y: punto.z })
    }
    const alMover = ev => { if (ev.pointerType === 'mouse' && !ev.buttons) renderer.domElement.style.cursor = agenteBajo(ev) ? 'pointer' : 'grab' }
    renderer.domElement.addEventListener('pointerdown', alBajar)
    renderer.domElement.addEventListener('pointerup', alSubir)
    renderer.domElement.addEventListener('pointermove', alMover)
    renderer.domElement.addEventListener('dblclick', alDobleClic)

    // Botones de cámara (girar, acercar, centrar): sirven en el celular y para quien no usa el mouse derecho.
    const girar = ang => {
      if (aPie.activo) { aPie.rumbo -= ang * 1.6; return }
      const off = camara.position.clone().sub(controles.target)
      const s = new THREE.Spherical().setFromVector3(off)
      s.theta = Math.min(controles.maxAzimuthAngle, Math.max(controles.minAzimuthAngle, s.theta + ang))
      camara.position.copy(controles.target).add(off.setFromSpherical(s))
    }
    const acercar = f => {
      if (aPie.activo) return
      const off = camara.position.clone().sub(controles.target)
      const l = Math.min(controles.maxDistance, Math.max(controles.minDistance, off.length() * f))
      camara.position.copy(controles.target).add(off.setLength(l))
    }
    let pedirGeneral = false
    const botones = document.createElement('div')
    botones.className = 'o3-botones'
    for (const [texto, titulo, accion] of [['⟲', 'Girar a la izquierda', () => girar(-0.25)], ['⟳', 'Girar a la derecha', () => girar(0.25)],
      ['+', 'Acercar', () => acercar(0.8)], ['−', 'Alejar', () => acercar(1.25)], ['⌂', 'Ver toda la oficina', () => { pedirGeneral = true }]]) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = texto
      b.title = titulo
      b.setAttribute('aria-label', titulo)
      b.addEventListener('click', accion)
      botones.appendChild(b)
    }
    const botonAPie = document.createElement('button')
    botonAPie.type = 'button'
    botonAPie.textContent = '🚶'
    botonAPie.title = 'Recorrer a pie (como Street View)'
    botonAPie.setAttribute('aria-label', botonAPie.title)
    botonAPie.setAttribute('aria-pressed', 'false')
    botones.prepend(botonAPie)
    const cruz = document.createElement('div')
    cruz.className = 'o3-cruz'
    for (const [texto, accion, titulo] of [['↑', 'adelante', 'Caminar'], ['←', 'izquierda', 'Girar a la izquierda'], ['↓', 'atras', 'Retroceder'], ['→', 'derecha', 'Girar a la derecha']]) {
      const b = document.createElement('button')
      b.type = 'button'; b.textContent = texto; b.title = titulo; b.setAttribute('aria-label', titulo); b.dataset.accion = accion
      const soltar = () => aPie.teclas.delete(accion)
      b.addEventListener('pointerdown', ev => { ev.preventDefault(); aPie.teclas.add(accion) })
      b.addEventListener('pointerup', soltar); b.addEventListener('pointerleave', soltar); b.addEventListener('pointercancel', soltar)
      cruz.appendChild(b)
    }
    const ayudaAPie = document.createElement('p')
    ayudaAPie.className = 'o3-apie-ayuda'
    ayudaAPie.textContent = 'A pie: arrastrá para mirar · flechas para caminar · 🚶 para salir'
    caja.appendChild(botones)
    caja.appendChild(cruz)
    caja.appendChild(ayudaAPie)
    const ponerAPie = activo => {
      if (activo === aPie.activo) return
      aPie.activo = activo
      aPie.teclas.clear()
      botonAPie.setAttribute('aria-pressed', String(activo))
      contenedor.classList.toggle('o3-apie', activo)
      renderer.domElement.style.touchAction = activo ? 'none' : 'pan-y'
      // Las paredes son bajas (vista de casita): a la altura de los ojos se ve un cielo claro con bruma, no el fondo oscuro.
      escena.background = activo ? FONDO_APIE : null
      escena.fog = activo ? BRUMA_APIE : null
      if (activo) {
        // Si estaba sentada, se para al costado de su silla mirando hacia la puerta.
        if (daniela.sentada) { daniela.sentada = false; daniela.pos = { ...COSTADO_SILLA }; daniela.giro = DANIELA.mira }
        aPie.rumbo = daniela.giro
        aPie.cabeceo = -0.08
      }
    }
    botonAPie.addEventListener('click', () => ponerAPie(!aPie.activo))

    // Solo se anima mientras se ve (la pantalla queda montada oculta cuando vas a otra).
    let visible = true
    let cuadroId = 0
    let ultimo = performance.now()
    const visibilidad = new IntersectionObserver(([e]) => {
      const antes = visible
      visible = e.isIntersecting
      if (visible && !antes) { ultimo = performance.now(); cuadroId = requestAnimationFrame(cuadro) }
    })
    visibilidad.observe(contenedor)

    const pantallaColor = (pantalla, estado, presente, t) => {
      const m = pantalla.material
      if (!presente) { m.emissive.set('#000000'); m.color.set('#3a3550'); return }
      if (estado === 'trabajando') { m.color.set('#bff3d6'); m.emissive.set(COLORES.trabajando); m.emissiveIntensity = 0.9 + Math.sin(t * 7) * 0.15 }
      else if (estado === 'error') { m.color.set('#ffd0d4'); m.emissive.set(COLORES.error); m.emissiveIntensity = 0.7 + Math.max(0, Math.sin(t * 5)) * 0.6 }
      else { m.color.set('#cfe0ff'); m.emissive.set('#7fa6ff'); m.emissiveIntensity = 0.35 }
    }

    // ---------- Reuniones ----------
    // Al convocar, cada asistente arma su camino desde donde esté; se avisa cuándo llega cada uno.
    let plan = null
    let reunionUp = null
    const situacion = (ac, r, t) => {
      if (r?.tipo === 'rutina' && !sinMovimiento) {
        if (ac.descansoId !== r.descanso.id) { ac.camino = camino(ac.lugar, r.descanso); ac.largo = largo(ac.camino); ac.descansoId = r.descanso.id }
        const m = momentoRutina(t + r.retraso + ac.desfase, ac.largo)
        if (m.fase === 'descanso') return [...r.descanso.llegada].reverse()
        if (m.fase !== 'sentado') return haciaPasillo(ac.camino, m.d)
      }
      return alPasillo(ac.lugar)
    }
    const planificar = (R, t) => {
      const asientos = R.modo === 'turnos' ? asientosEspera() : R.modo === 'oficina' ? asientosOficina() : asientosReunion()
      const ir = R.modo === 'turnos' ? caminoEspera : R.modo === 'oficina' ? caminoOficina : caminoReunion
      const p = { id: R.id, modo: R.modo, por: new Map(), avisado: false }
      const llegadas = {}
      R.asistentes.forEach((id, k) => {
        const ac = actores.get(id)
        if (!ac) return
        const asiento = asientos[k % asientos.length]
        const desde = situacion(ac, datos.current.rut[id], t)
        const ruta = ir(desde, asiento)
        const espera = ac.a.estado === 'trabajando' ? 8 + k * 0.4 : k * 0.9
        const vuelta = ir(alPasillo(ac.lugar), asiento).reverse()
        const turnoIda = R.modo === 'turnos' ? caminoTurno(asiento) : null
        const turnoVuelta = R.modo === 'turnos' ? caminoVueltaTurno(ac.lugar) : null
        const item = { asiento, ruta, largo: largo(ruta), espera, vuelta, largoVuelta: largo(vuelta), turnoIda, largoIda: turnoIda ? largo(turnoIda) : 0, turnoVuelta, largoTurnoVuelta: turnoVuelta ? largo(turnoVuelta) : 0, listo: false, numero: k + 1 }
        p.por.set(id, item)
        llegadas[id] = Math.round(espera + item.largo / VELOCIDAD)
      })
      if (!R.propia) datos.current.alPlanificar?.(R.id, llegadas)
      return p
    }

    // ---------- Cámara: modos y vuelos ----------
    let modo = 'general'
    let claveEncuadre = ''
    let camaraReunion = CAMARA_SALA.pos.clone()
    // Busca la distancia más corta (en la dirección de siempre) desde la que entran todos los lugares ocupados, de los
    // pies a la cabeza, con un margen, para el tamaño actual de la pantalla.
    const prueba = new THREE.PerspectiveCamera()
    const encuadrar = (cual, lugares) => {
      const base = cual === 'oficina' ? CAMARA_OFICINA : CAMARA_SALA
      const dir = base.pos.clone().sub(base.target).normalize()
      const pts = lugares.flatMap(l => { const y0 = alturaPiso(l.x, l.y); return [new THREE.Vector3(l.x, y0 + 0.05, l.y), new THREE.Vector3(l.x, y0 + 1.5, l.y)] })
      if (!pts.length) return { pos: base.pos, target: base.target, fov: base.fov }
      const centro = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length)
      const target = new THREE.Vector3(centro.x, 0.8 + alturaPiso(centro.x, centro.z), centro.z)
      prueba.fov = base.fov
      prueba.aspect = camara.aspect
      prueba.near = 0.1; prueba.far = 200
      prueba.updateProjectionMatrix()
      let d = 2
      for (; d < 30; d += 0.2) {
        prueba.position.copy(target).addScaledVector(dir, d)
        prueba.lookAt(target)
        prueba.updateMatrixWorld()
        if (pts.every(p => { const v = p.clone().project(prueba); return Math.abs(v.x) < 0.86 && Math.abs(v.y) < 0.82 && v.z < 1 })) break
      }
      return { pos: target.clone().addScaledVector(dir, d), target, fov: base.fov }
    }
    // Dónde están los ojos de Daniela y hacia dónde mira (para la vista a pie).
    const calcularOjo = () => {
      const alto = (daniela.sentada ? 1.15 : 1.55) + alturaPiso(daniela.pos.x, daniela.pos.y)
      ojoAPie.set(daniela.pos.x, alto, daniela.pos.y)
      const c = Math.cos(aPie.cabeceo)
      miraAPie.set(daniela.pos.x + Math.sin(aPie.rumbo) * c, alto + Math.sin(aPie.cabeceo), daniela.pos.y + Math.cos(aPie.rumbo) * c)
    }
    let vuelo = null
    let desvio = 0
    const volar = (pos, target, fov, dur = 1.3) => {
      vuelo = { t0: performance.now() / 1000, dur, desdeP: camara.position.clone(), desdeT: controles.target.clone(), desdeF: camara.fov, pos: pos.clone(), target: target.clone(), fov }
    }
    const seguir = (x, z, alto = 0.9) => {
      const delta = new THREE.Vector3(x, alto, z).sub(controles.target).multiplyScalar(0.08)
      controles.target.add(delta)
      camara.position.add(delta)
    }

    // ---------- Luz según la hora ----------
    const ventanas = vidrioVentana()
    let ultimaLuz = -1
    let luz = luzDelDia(datos.current.reloj())
    const colorDia = new THREE.Color('#fff3df'), colorCalido = new THREE.Color('#ffb070'), colorLuna = new THREE.Color('#9fb4ff')
    const aplicarLuz = () => {
      luz = luzDelDia(datos.current.reloj())
      sol.position.set(luz.sol.x, Math.max(6, luz.sol.y), luz.sol.z)
      sol.color.copy(colorDia).lerp(colorCalido, Math.min(1, luz.calido)).lerp(colorLuna, luz.noche)
      sol.intensity = 0.35 + 2.1 * luz.luz
      cielo.intensity = 0.55 + 0.85 * luz.luz
      cielo.color.set(luz.noche > 0.5 ? '#9aa3d8' : '#ffffff')
      relleno.intensity = 0.25 + 0.3 * luz.luz
      if (luz.fase === 'noche') { ventanas.color.set('#283160'); ventanas.emissive.set('#1b2250'); ventanas.emissiveIntensity = 0.35 }
      else if (luz.fase === 'atardecer' || luz.fase === 'amanecer') { ventanas.color.set('#ffd2b0'); ventanas.emissive.set('#ff9a5c'); ventanas.emissiveIntensity = 0.55 }
      else { ventanas.color.set('#d6eeff'); ventanas.emissive.set('#bfe3ff'); ventanas.emissiveIntensity = 0.5 }
      sala.lamparas.emissiveIntensity = 1.8 * luz.noche
      for (const l of sala.luces) l.intensity = 5 * luz.noche
      contenedor.dataset.fase = luz.fase
    }
    aplicarLuz()

    function cuadro() {
      if (!visible) return
      const ahoraMs = performance.now()
      const dt = Math.min(0.1, (ahoraMs - ultimo) / 1000)
      ultimo = ahoraMs
      const t = ahoraMs / 1000
      const D = datos.current
      const { agentes: lista, elegidoId: elegido, rut } = D
      // Cuando corre la cadena de UP (dos o más de sus agentes trabajando), se juntan solos en la sala de reuniones;
      // cuando terminan, vuelven a sus puestos. Si Daniela convoca una reunión, manda la suya.
      const upTrabajando = lista.filter(a => a.equipo === 'up' && a.estado === 'trabajando').map(a => a.id)
      if (D.reunion) reunionUp = null
      else if (!reunionUp && upTrabajando.length >= 2 && !sinMovimiento) reunionUp = { id: `up-${Date.now()}`, propia: true, modo: 'sala', estado: 'convocada', inicio: Date.now(), asistentes: upTrabajando }
      else if (reunionUp && reunionUp.estado !== 'volviendo' && upTrabajando.length < 2) reunionUp = { ...reunionUp, estado: 'volviendo', vuelta: Date.now() }
      const R = D.reunion ?? reunionUp
      if (t - ultimaLuz > 2) { aplicarLuz(); ultimaLuz = t }
      if (R && (!plan || plan.id !== R.id)) plan = planificar(R, t)
      if (!R && plan) plan = null
      const relojS = Date.now() / 1000
      const porId = new Map(lista.map(a => [a.id, a]))
      const enDescanso = []
      let todosVolvieron = Boolean(R && R.estado === 'volviendo')
      for (const [id, ac] of actores) {
        const a = porId.get(id)
        if (!a) continue
        ac.a = a
        const r = rut[id] ?? { tipo: 'escritorio' }
        const { p, lugar, mueble } = ac
        let pose = 'sentado', objeto = null, pos = mueble.sentado, giro = lugar.mira ?? 0, presente = true, aLaVista = true, habla = false, numero = null
        const pr = plan?.por.get(id)
        let enReunion = false
        if (pr && !pr.listo) {
          enReunion = true
          presente = false
          objeto = ac.bebida // a la reunión cada uno va con lo suyo: mate, café, agua o nada
          const caminar = ruta => {
            const pt = puntoEn(ruta.pts, ruta.d)
            pose = 'caminando'
            pos = { x: pt.x, y: 0, z: pt.y }
            giro = Math.atan2(pt.dx, pt.dy)
          }
          const terminar = () => { pr.listo = true; ac.desfase = -(t + (r.retraso ?? 0)); enReunion = false; presente = true; pose = 'sentado'; objeto = null; pos = mueble.sentado; giro = lugar.mira ?? 0 }
          const tu = R.turnos?.[id]
          const e = relojS - R.inicio / 1000
          if (R.modo === 'turnos' && tu?.fin) {
            const d = (relojS - tu.fin / 1000) * VELOCIDAD
            if (d < pr.largoTurnoVuelta) caminar({ pts: pr.turnoVuelta, d }); else terminar()
          } else if (R.modo === 'turnos' && tu?.llamado) {
            const d = (relojS - tu.llamado / 1000) * VELOCIDAD
            if (d < pr.largoIda) caminar({ pts: pr.turnoIda, d })
            else { pose = 'sentado'; pos = { x: VISITA.x, y: 0.08, z: VISITA.y }; giro = VISITA.mira; habla = D.hablando === id }
          } else if (R.estado === 'volviendo') {
            const d = (relojS - (R.vuelta ?? Date.now()) / 1000) * VELOCIDAD
            if (d < pr.largoVuelta) caminar({ pts: pr.vuelta, d }); else terminar()
          } else if (e < pr.espera) {
            const ini = pr.ruta[0]
            if (ini.x === lugar.sentado.x && ini.y === lugar.sentado.y) { enReunion = false; presente = true }
            else { pose = 'parado'; pos = { x: ini.x, y: 0, z: ini.y } }
          } else {
            const d = (e - pr.espera) * VELOCIDAD
            if (d < pr.largo) caminar({ pts: pr.ruta, d })
            else {
              const s = pr.asiento
              pose = s.pose
              pos = { x: s.x, y: s.pose === 'sentado' ? 0.08 : 0, z: s.y }
              giro = R.estado === 'en_curso' && R.modo === 'sala' ? Math.atan2(camaraReunion.x - s.x, camaraReunion.z - s.y) : s.mira
              habla = R.estado === 'en_curso' && D.hablando === id
              if (R.modo === 'turnos') numero = pr.numero
            }
          }
          if (!pr.listo && R.estado === 'volviendo') todosVolvieron = false
        }
        if (!enReunion) {
          if (r.tipo === 'siesta') {
            presente = false
            if (r.puf) { pose = 'dormido'; pos = { x: r.puf.x, y: 0.22, z: r.puf.y }; giro = -0.5 } else aLaVista = false
          } else if (r.tipo === 'rutina' && !sinMovimiento && !(pr && !pr.listo)) {
            if (ac.descansoId !== r.descanso.id) { ac.camino = camino(lugar, r.descanso); ac.largo = largo(ac.camino); ac.descansoId = r.descanso.id }
            const m = momentoRutina(t + r.retraso + ac.desfase, ac.largo)
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
        }
        ac.pos = pos
        p.grupo.visible = aLaVista
        p.grupo.position.set(pos.x, pos.y + alturaPiso(pos.x, pos.z), pos.z)
        p.grupo.rotation.y = giro
        posar(p, { pose, estado: presente ? a.estado : 'libre', objeto, t: sinMovimiento ? 0 : t, fase: ac.fase, habla })
        if (mueble.pantalla) pantallaColor(mueble.pantalla, a.estado, presente, t)
        if (mueble.lampara) mueble.lampara.emissiveIntensity = presente ? 2.2 * luz.noche : 0
        if (lugar.jefa && luzMaria) luzMaria.intensity = presente ? 4 * luz.noche : 0
        // Burbuja: trabajando o con un problema en su lugar; en reunión, el que habla; en la espera, su número.
        let tipo = presente && (a.estado === 'trabajando' || a.estado === 'error') ? a.estado : null
        let texto = tipo === 'error' ? '!' : ''
        if (habla) { tipo = 'habla'; texto = '🗣' }
        else if (numero) { tipo = 'turno'; texto = `Turno ${numero}` }
        ac.burbuja.userData.el.className = `o3-burbuja${tipo ? ` estado-${tipo}` : ''}`
        ac.burbuja.userData.el.textContent = texto
        ac.burbuja.visible = Boolean(tipo)
        ac.zetas.visible = pose === 'dormido'
        ac.cartel.userData.el.className = `o3-cartel${lugar.jefa ? ' o3-jefa' : ''} estado-${a.estado}${id === elegido ? ' is-elegido' : ''}`
        ac.cartel.userData.el.title = `${a.nombre}: ${ESTADOS[a.estado]}. ${a.ahora}`
        if (id === elegido) { aro.visible = aLaVista; aro.position.set(pos.x, 0.03 + alturaPiso(pos.x, pos.z), pos.z) }
      }
      if (!elegido || !actores.has(elegido)) aro.visible = false
      if (todosVolvieron && plan && !plan.avisado) { plan.avisado = true; if (R.propia) reunionUp = null; else D.alVolvieron?.(R.id) }

      // Daniela: camina por su ruta; en una reunión por turnos la esperan sentada en su escritorio.
      if (D.volverDaniela !== daniela.volverVisto) { daniela.volverVisto = D.volverDaniela; volverAlEscritorio() }
      // Cuando convocás una reunión en la sala (o en tu mesa), vas caminando a tu lugar; al terminar, volvés.
      const reunionEnSala = Boolean(R && !R.propia && (R.modo === 'sala' || R.modo === 'oficina') && R.estado !== 'volviendo')
      if (reunionEnSala && daniela.reunionId !== R.id) {
        daniela.reunionId = R.id
        daniela.lugarReunion = R.modo === 'oficina' ? DANIELA_OFICINA : DANIELA_SALA
        caminarA(daniela.lugarReunion, false, R.modo === 'oficina')
        daniela.irASala = true
      }
      else if (!reunionEnSala && daniela.reunionId) { daniela.reunionId = null; volverAlEscritorio() }
      if (R?.modo === 'turnos' && R.estado === 'en_curso' && !daniela.sentada) {
        daniela.ruta = null; daniela.sentada = true; daniela.pos = { x: DANIELA.sentado.x, y: DANIELA.sentado.y }; daniela.giro = DANIELA.mira
      }
      // A pie: girar y caminar con las teclas (o la cruz); si va por un doble click, la vista acompaña su camino.
      if (aPie.activo && R?.estado === 'en_curso') ponerAPie(false)
      let caminandoAPie = false
      if (aPie.activo) {
        const tc = aPie.teclas
        if (tc.has('izquierda')) aPie.rumbo += 1.9 * dt
        if (tc.has('derecha')) aPie.rumbo -= 1.9 * dt
        const sentido = (tc.has('adelante') ? 1 : 0) - (tc.has('atras') ? 1 : 0)
        if (sentido) {
          daniela.ruta = null; daniela.sentada = false; daniela.enSala = false
          daniela.pos = pasoAPie(mapa, daniela.pos, aPie.rumbo + (sentido < 0 ? Math.PI : 0), VELOCIDAD * 1.4 * dt)
          daniela.giro = aPie.rumbo
          caminandoAPie = true
        } else if (daniela.ruta) {
          const dif = Math.atan2(Math.sin(daniela.giro - aPie.rumbo), Math.cos(daniela.giro - aPie.rumbo))
          aPie.rumbo += dif * Math.min(1, dt * 4)
        }
      }
      yo.grupo.visible = !aPie.activo
      cartelYo.visible = !aPie.activo
      let poseYo = 'sentado'
      if (daniela.ruta) {
        daniela.d += VELOCIDAD * 1.15 * dt
        const total = largo(daniela.ruta)
        const pt = puntoEn(daniela.ruta, daniela.d)
        daniela.pos = { x: pt.x, y: pt.y }
        daniela.giro = Math.atan2(pt.dx, pt.dy)
        poseYo = 'caminando'
        if (daniela.d >= total) {
          daniela.ruta = null
          if (daniela.volverAlLlegar) { daniela.sentada = true; daniela.giro = DANIELA.mira }
          else if (daniela.irASala) { daniela.irASala = false; daniela.enSala = true }
        }
      }
      if (!daniela.ruta && !daniela.sentada) poseYo = daniela.enSala ? 'sentado' : 'parado'
      if (caminandoAPie) poseYo = 'caminando'
      const sentadaYo = daniela.sentada || (daniela.enSala && !daniela.ruta)
      yo.grupo.position.set(daniela.pos.x, (sentadaYo ? 0.08 : 0) + alturaPiso(daniela.pos.x, daniela.pos.y), daniela.pos.y)
      yo.grupo.rotation.y = daniela.sentada ? DANIELA.mira : daniela.enSala && !daniela.ruta ? (daniela.lugarReunion ?? DANIELA_SALA).mira : daniela.giro
      posar(yo, { pose: poseYo, estado: 'libre', t: sinMovimiento ? 0 : t, fase: 2.2 })
      pantallaColor(direccion.escritorio.pantalla, 'libre', daniela.sentada, t)
      direccion.escritorio.lampara.emissiveIntensity = daniela.sentada ? 2.2 * luz.noche : 0
      direccion.luz.intensity = 4.5 * luz.noche
      const lejos = !daniela.sentada
      if (lejos !== daniela.avisoLejos) { daniela.avisoLejos = lejos; D.alMoverDaniela?.(lejos) }

      // Roberta: sigue el rastro de Daniela.
      if (daniela.ruta || !daniela.sentada) {
        const u = roberta.rastro.at(-1)
        if (!u || Math.hypot(u.x - daniela.pos.x, u.y - daniela.pos.y) > 0.15) roberta.rastro.push({ ...daniela.pos })
      }
      let posePerra = 'echada'
      const irA = (meta, velocidad = 2.6) => {
        const dx = meta.x - roberta.pos.x, dy = meta.y - roberta.pos.y
        const d = Math.hypot(dx, dy)
        const paso = Math.min(d, velocidad * dt)
        if (d > 1e-6) { roberta.pos.x += (dx / d) * paso; roberta.pos.y += (dy / d) * paso; roberta.giro = Math.atan2(dx, dy) }
        return d - paso
      }
      const aDaniela = Math.hypot(daniela.pos.x - roberta.pos.x, daniela.pos.y - roberta.pos.y)
      if (!daniela.sentada && aDaniela < 1.1) {
        posePerra = 'sentada'
        roberta.giro = Math.atan2(daniela.pos.x - roberta.pos.x, daniela.pos.y - roberta.pos.y)
        while (roberta.idx < roberta.rastro.length - 1 && Math.hypot(roberta.rastro[roberta.idx].x - roberta.pos.x, roberta.rastro[roberta.idx].y - roberta.pos.y) < 1.2) roberta.idx++
      } else if (roberta.idx < roberta.rastro.length) {
        posePerra = 'caminando'
        if (irA(roberta.rastro[roberta.idx]) < 0.1) roberta.idx++
      } else if (daniela.sentada) {
        if (irA(ROBERTA.cama, 1.6) > 0.05) posePerra = 'caminando'
        else { roberta.rastro = []; roberta.idx = 0; roberta.giro = 0.8 }
      } else posePerra = 'sentada'
      perra.grupo.position.set(roberta.pos.x, (posePerra === 'echada' ? 0.06 : 0) + alturaPiso(roberta.pos.x, roberta.pos.y), roberta.pos.y)
      perra.grupo.rotation.y = roberta.giro
      moverRoberta(perra, { pose: posePerra, t: sinMovimiento ? 0 : t })

      // La pelota va y viene solo si los dos jugadores de ping pong están en la mesa.
      const jugando = enDescanso.includes('ping-1') && enDescanso.includes('ping-2')
      pelota.visible = jugando
      if (jugando) {
        const f = (Math.sin(t * 4.5) + 1) / 2
        pelota.position.set(8.9 + f * 3.2, 0.85 + Math.abs(Math.sin(t * 9)) * 0.35, 3.8)
      }
      const { hora, minuto } = agujas(Date.now())
      sala.agujas.hora.rotation.z = -THREE.MathUtils.degToRad(hora)
      sala.agujas.minuto.rotation.z = -THREE.MathUtils.degToRad(minuto)
      sala.agujas.segundo.rotation.z = -((Date.now() / 1000) % 60) * (Math.PI / 30)
      sala.luzCafetera.material.emissiveIntensity = 0.6 + Math.max(0, Math.sin(t * 3)) * 0.9

      // Cámara: videollamada de la sala, despacho de Daniela (turnos), seguir al elegido, seguir a Daniela o general.
      const nuevoModo = R?.estado === 'en_curso' && R.modo === 'sala' ? 'sala'
        : R?.estado === 'en_curso' && R.modo === 'oficina' ? 'oficina'
        : R?.estado === 'en_curso' && R.modo === 'turnos' ? 'despacho'
          : aPie.activo ? 'apie'
          : elegido && actores.has(elegido) ? `agente:${elegido}`
            : daniela.ruta ? 'daniela' : 'general'
      if (pedirEntrada) { pedirEntrada = false; volar(general.pos, CENTRO, 30, 2.8) }
      if (pedirGeneral) { pedirGeneral = false; if (modo === 'general' || modo === 'daniela') volar(general.pos, general.target, 30) }
      if (nuevoModo !== modo) {
        if (modo === 'general') { general.pos.copy(camara.position); general.target.copy(controles.target) }
        if (nuevoModo === 'sala' || nuevoModo === 'oficina') claveEncuadre = '' // lo encuadra abajo, según quiénes vinieron y la pantalla
        else if (nuevoModo === 'despacho') volar(CAMARA_DESPACHO.pos, CAMARA_DESPACHO.target, CAMARA_DESPACHO.fov)
        else if (nuevoModo === 'general') volar(general.pos, general.target, 30)
        else if (nuevoModo === 'apie') { calcularOjo(); volar(ojoAPie, miraAPie, 70, 0.9) }
        else {
          const quien = nuevoModo === 'daniela' ? { x: daniela.pos.x, z: daniela.pos.y } : actores.get(elegido).pos
          const target = new THREE.Vector3(quien.x, 0.9, quien.z)
          const dir = camara.position.clone().sub(controles.target).setY(0)
          if (dir.lengthSq() < 0.1) dir.set(0.7, 0, 0.7)
          dir.normalize()
          volar(target.clone().add(dir.multiplyScalar(9)).setY(7.5), target, 30)
        }
        modo = nuevoModo
      }
      // En la videollamada la cámara se acomoda para que se vea a todos los que vinieron, sea cual sea el tamaño de la
      // pantalla: se vuelve a calcular si cambia el tamaño (por ejemplo, al pasar a pantalla completa).
      if ((modo === 'sala' || modo === 'oficina') && plan) {
        const clave = `${modo}|${plan.id}|${medida}`
        if (clave !== claveEncuadre) {
          const primera = claveEncuadre === ''
          claveEncuadre = clave
          const e = encuadrar(modo, [...plan.por.values()].map(x => x.asiento))
          camaraReunion = e.pos
          volar(e.pos, e.target, e.fov, primera ? 1.3 : 0.6)
        }
      }
      controles.enabled = modo !== 'sala' && modo !== 'despacho' && modo !== 'oficina' && modo !== 'apie'
      if (vuelo) {
        const f = Math.min(1, (t - vuelo.t0) / vuelo.dur)
        const k = suaveIn(f)
        camara.position.lerpVectors(vuelo.desdeP, vuelo.pos, k)
        controles.target.lerpVectors(vuelo.desdeT, vuelo.target, k)
        camara.fov = vuelo.desdeF + (vuelo.fov - vuelo.desdeF) * k
        camara.updateProjectionMatrix()
        if (f >= 1) vuelo = null
      } else if (modo.startsWith('agente:')) {
        const q = actores.get(elegido)?.pos
        if (q) seguir(q.x, q.z)
      } else if (modo === 'daniela') seguir(daniela.pos.x, daniela.pos.y)
      else if (modo === 'apie') { calcularOjo(); camara.position.copy(ojoAPie); controles.target.copy(miraAPie) }
      // Con el panel del agente abierto (a la derecha en pantalla ancha), la escena se corre un poco a la izquierda.
      const quiereDesvio = modo.startsWith('agente:') && window.innerWidth > 780 && !contenedor.classList.contains('o3-completa') ? 0.16 : 0
      desvio += (quiereDesvio - desvio) * 0.08
      const [w, h] = medida.split('x').map(Number)
      if (Math.abs(desvio) > 0.002 && w && h) camara.setViewOffset(w, h, w * desvio, 0, w, h)
      else if (camara.view) camara.clearViewOffset()

      if (controles.enabled) controles.update()
      else camara.lookAt(controles.target)
      contenedor.classList.toggle('o3-lejos', camara.position.distanceTo(controles.target) > 60)
      contenedor.classList.toggle('o3-en-reunion', modo === 'sala' || modo === 'despacho' || modo === 'oficina')
      renderer.render(escena, camara)
      textos.render(escena, camara)
      cuadroId = requestAnimationFrame(cuadro)
    }
    cuadroId = requestAnimationFrame(cuadro)

    return () => {
      cancelAnimationFrame(cuadroId)
      clearTimeout(clicPendiente)
      visible = false
      observador.disconnect()
      visibilidad.disconnect()
      renderer.domElement.removeEventListener('pointerdown', alBajar)
      renderer.domElement.removeEventListener('pointerup', alSubir)
      renderer.domElement.removeEventListener('pointermove', alMover)
      renderer.domElement.removeEventListener('dblclick', alDobleClic)
      renderer.domElement.removeEventListener('pointermove', alArrastrarAPie)
      window.removeEventListener('keydown', alTecla)
      window.removeEventListener('keyup', alTecla)
      controles.dispose()
      liberar(escena)
      texPizarron.dispose()
      pizarron.current = null
      vaciarMateriales()
      renderer.dispose()
      renderer.domElement.remove()
      textos.domElement.remove()
      botones.remove()
      caja.style.height = ''
    }
  }, [firma])

  return <div className={`oficina-3d${pantallaCompleta ? ' o3-completa' : ''}`} ref={marco}>
    <div className="o3-escenario" ref={escenario} role="img"
      aria-label="La oficina en 3D: las oficinas de los trabajadores, los tablones de UP y de PDG comercial, la sala de reuniones, la cafetería, el comedor, el ocio, el ping pong y tu oficina de Dirección. Los agentes también están en la lista de abajo." />
    {children}
  </div>
}
