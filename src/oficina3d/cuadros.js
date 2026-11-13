// Cuadros y alfombras de las oficinas, dibujados en un canvas: ilustraciones simples que tienen que ver con lo que
// hace cada área (ver ESTILOS en oficinaPlano.mjs). Se dibujan una vez por oficina.
import * as THREE from 'three'

const TINTA = '#3b2f4f'
const PALETA = { verde: '#3fb878', rojo: '#e85d6a', azul: '#6ea8ff', ambar: '#e8b25a', lila: '#9f86df', rosa: '#f6a5c0', papel: '#fffaf3', gris: '#cfc8dd' }

function lienzo(ancho, alto) {
  const c = document.createElement('canvas')
  c.width = ancho; c.height = alto
  return [c, c.getContext('2d')]
}
function textura(c) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
const linea = (g, pts, color, ancho = 6) => {
  g.strokeStyle = color; g.lineWidth = ancho; g.lineCap = 'round'; g.lineJoin = 'round'
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke()
}
const circulo = (g, x, y, r, color) => { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill() }
const rect = (g, x, y, w, h, color, r = 0) => { g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill() }
const texto = (g, t, x, y, tam, color = TINTA, peso = 800) => { g.fillStyle = color; g.font = `${peso} ${tam}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y) }

// Cada dibujo ocupa un lienzo de 320 x 240 con fondo claro.
const DIBUJOS = {
  grafico(g) {
    for (let k = 0; k < 4; k++) linea(g, [[40, 60 + k * 40], [280, 60 + k * 40]], '#ece6f6', 2)
    ;[60, 110, 80, 140, 120, 170].forEach((h, k) => rect(g, 50 + k * 38, 200 - h, 24, h, k % 2 ? PALETA.lila : PALETA.azul, 4))
    linea(g, [[50, 150], [100, 120], [150, 135], [200, 80], [260, 55]], PALETA.verde, 7)
    circulo(g, 260, 55, 9, PALETA.verde)
  },
  mapa(g) {
    g.fillStyle = '#cfe9f5'; g.fillRect(20, 20, 280, 200)
    g.fillStyle = '#9fd3a6'
    for (const [x, y, rx, ry] of [[90, 90, 55, 35], [110, 160, 30, 40], [200, 80, 60, 30], [230, 150, 40, 30], [270, 190, 20, 12]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2); g.fill() }
    for (const [x, y, c] of [[100, 85, PALETA.rojo], [210, 75, PALETA.ambar], [235, 150, PALETA.rojo], [115, 165, PALETA.verde]]) {
      circulo(g, x, y - 14, 11, c); g.fillStyle = c; g.beginPath(); g.moveTo(x - 8, y - 10); g.lineTo(x + 8, y - 10); g.lineTo(x, y + 6); g.fill(); circulo(g, x, y - 14, 4, '#fff')
    }
  },
  tablero(g) {
    g.fillStyle = '#1f1d2b'; g.fillRect(0, 0, 320, 240)
    texto(g, 'ESTADO', 160, 30, 26, '#e9e4d8')
    for (let f = 0; f < 4; f++) for (let c = 0; c < 6; c++) {
      const color = (f * 6 + c) % 7 === 3 ? PALETA.ambar : (f * 6 + c) % 11 === 5 ? PALETA.rojo : PALETA.verde
      circulo(g, 50 + c * 44, 75 + f * 42, 13, color)
    }
  },
  calendario(g) {
    rect(g, 30, 25, 260, 195, PALETA.papel, 10)
    rect(g, 30, 25, 260, 40, PALETA.rojo, 10)
    texto(g, 'NOVIEMBRE', 160, 46, 24, '#fff')
    for (let f = 0; f < 5; f++) for (let c = 0; c < 7; c++) {
      const x = 52 + c * 36, y = 88 + f * 27
      const marcado = [[1, 2], [2, 5], [3, 1], [0, 4]].some(([ff, cc]) => ff === f && cc === c)
      if (marcado) circulo(g, x, y, 12, f === 1 ? PALETA.azul : PALETA.rosa)
      texto(g, String(f * 7 + c + 1), x, y, 15, marcado ? '#fff' : TINTA, 700)
    }
  },
  sobre(g) {
    rect(g, 50, 60, 220, 140, PALETA.papel, 8)
    g.strokeStyle = '#b9a2e8'; g.lineWidth = 6; g.strokeRect(50, 60, 220, 140)
    linea(g, [[50, 60], [160, 140], [270, 60]], '#b9a2e8', 6)
    circulo(g, 255, 70, 22, PALETA.rojo)
    texto(g, '3', 255, 71, 24, '#fff')
  },
  notas(g) {
    g.fillStyle = '#c99a63'; g.fillRect(0, 0, 320, 240)
    ;[[30, 30, '#f6dd8b', -0.08], [130, 25, '#f6a5c0', 0.06], [225, 40, '#8fd9bd', -0.05], [45, 130, '#9fc5f8', 0.05], [150, 125, '#f6dd8b', -0.04], [235, 140, '#f7b98b', 0.07]].forEach(([x, y, c, r]) => {
      g.save(); g.translate(x + 35, y + 35); g.rotate(r); rect(g, -35, -35, 70, 70, c, 3)
      for (let k = 0; k < 3; k++) linea(g, [[-22, -12 + k * 14], [22, -12 + k * 14]], 'rgba(59,47,79,.35)', 3)
      circulo(g, 0, -30, 5, PALETA.rojo); g.restore()
    })
  },
  diario(g) {
    rect(g, 30, 15, 260, 210, PALETA.papel, 4)
    texto(g, 'EL DIARIO', 160, 45, 32, TINTA, 900)
    linea(g, [[45, 68], [275, 68]], TINTA, 3)
    rect(g, 45, 80, 120, 70, '#cfc8dd')
    for (let k = 0; k < 6; k++) linea(g, [[180, 85 + k * 12], [275, 85 + k * 12]], '#a9a0c4', 4)
    for (let c = 0; c < 3; c++) for (let k = 0; k < 5; k++) linea(g, [[45 + c * 80, 165 + k * 11], [110 + c * 80, 165 + k * 11]], '#a9a0c4', 4)
  },
  mascaras(g) {
    const mascara = (x, y, color, triste, r) => {
      g.save(); g.translate(x, y); g.rotate(r)
      g.fillStyle = color; g.beginPath(); g.ellipse(0, 0, 50, 62, 0, 0, Math.PI * 2); g.fill()
      circulo(g, -18, -12, 9, TINTA); circulo(g, 18, -12, 9, TINTA)
      g.strokeStyle = TINTA; g.lineWidth = 6; g.beginPath()
      if (triste) g.arc(0, 38, 20, Math.PI * 1.15, Math.PI * 1.85); else g.arc(0, 14, 20, Math.PI * 0.15, Math.PI * 0.85)
      g.stroke(); g.restore()
    }
    mascara(120, 120, '#f6dd8b', false, -0.2)
    mascara(205, 125, '#b9a2e8', true, 0.2)
  },
  entrada(g) {
    g.save(); g.translate(160, 120); g.rotate(-0.12)
    rect(g, -120, -60, 240, 120, PALETA.rosa, 12)
    circulo(g, -120, 0, 18, '#fff'); circulo(g, 120, 0, 18, '#fff')
    linea(g, [[60, -55], [60, 55]], '#fff', 3)
    texto(g, 'EVENTO', -15, -18, 30, '#fff', 900)
    texto(g, 'ADMITE 1', -15, 20, 18, '#fff', 700)
    texto(g, '★', 90, 0, 34, '#fff')
    g.restore()
  },
  maletin(g) {
    rect(g, 70, 85, 180, 115, '#a8744a', 14)
    g.strokeStyle = '#7a4f2c'; g.lineWidth = 10; g.strokeRect(125, 60, 70, 30)
    rect(g, 70, 130, 180, 10, '#7a4f2c')
    rect(g, 150, 122, 20, 26, PALETA.ambar, 4)
  },
  busqueda(g) {
    for (let k = 0; k < 3; k++) {
      rect(g, 40 + k * 15, 40 + k * 18, 150, 95, PALETA.papel, 8)
      for (let l = 0; l < 3; l++) linea(g, [[55 + k * 15, 62 + k * 18 + l * 18], [170 + k * 15, 62 + k * 18 + l * 18]], '#cfc8dd', 6)
    }
    g.strokeStyle = TINTA; g.lineWidth = 14; g.beginPath(); g.arc(205, 140, 45, 0, Math.PI * 2); g.stroke()
    circulo(g, 205, 140, 38, 'rgba(159,197,248,.45)')
    linea(g, [[238, 173], [280, 215]], TINTA, 18)
  },
  brujula(g) {
    circulo(g, 160, 120, 95, '#e2b552'); circulo(g, 160, 120, 82, PALETA.papel)
    g.fillStyle = PALETA.rojo; g.beginPath(); g.moveTo(160, 50); g.lineTo(175, 120); g.lineTo(145, 120); g.fill()
    g.fillStyle = '#9f96b8'; g.beginPath(); g.moveTo(160, 190); g.lineTo(175, 120); g.lineTo(145, 120); g.fill()
    circulo(g, 160, 120, 8, TINTA)
    texto(g, 'N', 160, 30, 20)
  },
  presentacion(g) {
    rect(g, 40, 30, 240, 150, PALETA.papel, 6)
    g.strokeStyle = '#cfc8dd'; g.lineWidth = 4; g.strokeRect(40, 30, 240, 150)
    texto(g, 'DEMO', 110, 58, 22, TINTA, 900)
    g.fillStyle = PALETA.azul; g.beginPath(); g.moveTo(200, 120); g.arc(200, 120, 45, -Math.PI / 2, Math.PI * 0.8); g.fill()
    g.fillStyle = PALETA.verde; g.beginPath(); g.moveTo(200, 120); g.arc(200, 120, 45, Math.PI * 0.8, Math.PI * 1.5); g.fill()
    for (let k = 0; k < 3; k++) linea(g, [[65, 95 + k * 22], [135, 95 + k * 22]], '#a9a0c4', 6)
    linea(g, [[160, 180], [160, 222]], '#8f86a8', 6); linea(g, [[120, 222], [200, 222]], '#8f86a8', 6)
  },
  escudo(g) {
    g.fillStyle = PALETA.lila; g.beginPath(); g.moveTo(160, 30); g.lineTo(245, 60); g.quadraticCurveTo(240, 170, 160, 215); g.quadraticCurveTo(80, 170, 75, 60); g.closePath(); g.fill()
    linea(g, [[118, 120], [150, 152], [205, 90]], '#fff', 16)
  },
  documento(g) {
    g.save(); g.translate(160, 120); g.rotate(0.06)
    rect(g, -80, -100, 160, 200, PALETA.papel, 6)
    texto(g, 'PROPUESTA', 0, -75, 18, TINTA, 900)
    for (let k = 0; k < 6; k++) linea(g, [[-60, -45 + k * 18], [60 - (k % 2) * 25, -45 + k * 18]], '#cfc8dd', 6)
    linea(g, [[-50, 75], [-30, 60], [-15, 78], [5, 58], [25, 76], [55, 64]], PALETA.azul, 4)
    g.restore()
  },
  megafono(g) {
    g.fillStyle = PALETA.rojo; g.beginPath(); g.moveTo(90, 100); g.lineTo(220, 50); g.lineTo(220, 190); g.lineTo(90, 140); g.closePath(); g.fill()
    rect(g, 60, 98, 34, 44, '#c8323f', 6)
    rect(g, 110, 140, 22, 45, '#8f86a8', 6)
    for (const r of [30, 52]) { g.strokeStyle = PALETA.ambar; g.lineWidth = 7; g.beginPath(); g.arc(225, 120, r, -0.6, 0.6); g.stroke() }
  },
}

// Textura de un cuadro (con un passepartout blanco; el marco lo pone el 3D).
export function texturaCuadro(tipo, fondo = '#f4eefb') {
  const [c, g] = lienzo(320, 240)
  g.fillStyle = tipo === 'tablero' ? '#1f1d2b' : fondo
  g.fillRect(0, 0, 320, 240)
  ;(DIBUJOS[tipo] ?? DIBUJOS.grafico)(g)
  return textura(c)
}
export const TIPOS_CUADRO = Object.keys(DIBUJOS)

// Textura de una alfombra: dos colores y un dibujo. repetir: cuántas veces se repite en cada lado.
export function texturaAlfombra({ patron, colores: [base, dibujo] }) {
  const [c, g] = lienzo(256, 256)
  g.fillStyle = base; g.fillRect(0, 0, 256, 256)
  g.fillStyle = dibujo; g.strokeStyle = dibujo
  if (patron === 'rayas') for (let k = 0; k < 256; k += 64) g.fillRect(0, k, 256, 26)
  else if (patron === 'cuadros') { g.globalAlpha = 0.55; for (let k = 0; k < 256; k += 64) { g.fillRect(k, 0, 22, 256); g.fillRect(0, k, 256, 22) } }
  else if (patron === 'puntos') for (let y = 32; y < 256; y += 64) for (let x = 32; x < 256; x += 64) circulo(g, x + ((y / 64) % 2) * 32, y, 11, dibujo)
  else if (patron === 'rombos') for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { g.beginPath(); g.moveTo(x + 32, y + 6); g.lineTo(x + 58, y + 32); g.lineTo(x + 32, y + 58); g.lineTo(x + 6, y + 32); g.fill() }
  else { g.lineWidth = 18; g.strokeRect(16, 16, 224, 224); g.lineWidth = 5; g.strokeRect(44, 44, 168, 168) }
  const t = textura(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// Camiseta enmarcada, vista de espalda: el color del club, el apellido y el número.
// club: { cuerpo, detalle, letras, contorno, franja? } (franja: banda diagonal, como la de River).
export function texturaCamiseta({ cuerpo, detalle, letras, contorno, franja = null, apellido, numero, manga = 'corta' }) {
  const [c, g] = lienzo(300, 360)
  g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, 300, 360)
  g.save()
  g.beginPath()
  if (manga === 'musculosa') {
    g.moveTo(95, 40); g.lineTo(125, 40); g.quadraticCurveTo(150, 62, 175, 40); g.lineTo(205, 40)
    g.quadraticCurveTo(210, 110, 240, 125); g.lineTo(240, 330); g.lineTo(60, 330); g.lineTo(60, 125)
    g.quadraticCurveTo(90, 110, 95, 40)
  } else {
    g.moveTo(105, 38); g.lineTo(125, 34); g.quadraticCurveTo(150, 48, 175, 34); g.lineTo(195, 38)
    g.lineTo(268, 82); g.lineTo(246, 140); g.lineTo(222, 128); g.lineTo(222, 330); g.lineTo(78, 330)
    g.lineTo(78, 128); g.lineTo(54, 140); g.lineTo(32, 82); g.closePath()
  }
  g.closePath()
  g.fillStyle = cuerpo; g.fill()
  g.clip()
  if (franja) {
    g.fillStyle = franja
    g.beginPath(); g.moveTo(20, 60); g.lineTo(80, 20); g.lineTo(300, 300); g.lineTo(240, 340); g.closePath(); g.fill()
  }
  g.restore()
  g.lineWidth = 8; g.strokeStyle = detalle
  g.beginPath()
  if (manga === 'musculosa') { g.moveTo(125, 40); g.quadraticCurveTo(150, 62, 175, 40); g.moveTo(95, 42); g.quadraticCurveTo(90, 110, 62, 125); g.moveTo(205, 42); g.quadraticCurveTo(210, 110, 238, 125) }
  else { g.moveTo(125, 36); g.quadraticCurveTo(150, 48, 175, 36) }
  g.stroke()
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'
  const escribir = (texto, y, tam) => {
    g.font = `900 ${tam}px system-ui, sans-serif`
    g.lineWidth = Math.max(4, tam / 9); g.strokeStyle = contorno; g.strokeText(texto, 150, y)
    g.fillStyle = letras; g.fillText(texto, 150, y)
  }
  escribir(apellido, 112, apellido.length > 6 ? 30 : 36)
  escribir(String(numero), 210, 120)
  return textura(c)
}

// Póster de Oasis (la banda): letras grandes sobre fondo oscuro.
export function texturaPosterOasis() {
  const [c, g] = lienzo(360, 260)
  const fondo = g.createLinearGradient(0, 0, 0, 260)
  fondo.addColorStop(0, '#1d1c1a'); fondo.addColorStop(1, '#2e2b27')
  g.fillStyle = fondo; g.fillRect(0, 0, 360, 260)
  g.fillStyle = '#f4f1ea'; g.fillRect(60, 78, 240, 92)
  g.fillStyle = '#1d1c1a'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = '900 72px system-ui, sans-serif'
  g.fillText('oasis', 180, 126)
  g.fillStyle = '#c9a24a'; g.font = '700 16px system-ui, sans-serif'
  g.fillText('MANCHESTER · 1991', 180, 206)
  return textura(c)
}

// Pelotas: la de básquet (naranja con costuras negras) y la de fútbol (blanca con parches negros).
export function texturaPelota(tipo) {
  const [c, g] = lienzo(256, 128)
  if (tipo === 'basquet') {
    g.fillStyle = '#d9772b'; g.fillRect(0, 0, 256, 128)
    g.strokeStyle = '#2a1d14'; g.lineWidth = 3
    for (const x of [0, 64, 128, 192]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke() }
    g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke()
  } else {
    g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, 256, 128)
    g.fillStyle = '#1d1c1a'
    for (let fila = 0; fila < 4; fila++) for (let k = 0; k < 6; k++) {
      const x = k * 44 + (fila % 2) * 22 + 10, y = fila * 34 + 14
      g.beginPath()
      for (let v = 0; v < 5; v++) { const a = (v / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9) }
      g.closePath(); g.fill()
    }
  }
  return textura(c)
}

// El calendario de la oficina dibujado en el pizarrón con rueditas: el mes con sus días y, en cada uno, marcas de
// colores (reunión, agendada, por aprobar, vence) con el texto que entra. mes: lo que devuelve mesOficina().
const COLOR_EVENTO = { reunion: '#3f6fd6', agendada: '#2f9e5e', propuesta: '#d9902a', vence: '#d4483b', hecha: '#a8a29a' }
export function texturaPizarron() {
  const [c] = lienzo(1600, 1000)
  return textura(c)
}
export function dibujarPizarron(tex, mes) {
  const c = tex.image, g = c.getContext('2d'), W = c.width, H = c.height
  g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, W, H)
  // Título a marcador y días de la semana.
  g.fillStyle = '#2b3a55'; g.font = '800 64px system-ui, -apple-system, "Segoe UI", sans-serif'; g.textBaseline = 'top'; g.textAlign = 'left'
  g.fillText(`📅 ${mes.nombre}`, 40, 26)
  g.font = '700 26px system-ui, sans-serif'; g.fillStyle = '#6b6f7a'
  const ley = [['reunion', 'reunión'], ['agendada', 'agendada'], ['propuesta', 'por aprobar'], ['vence', 'vence']]
  let lx = W - 40; g.textAlign = 'right'
  for (const [t, nombre] of [...ley].reverse()) { g.fillText(nombre, lx, 48); lx -= g.measureText(nombre).width + 12; g.fillStyle = COLOR_EVENTO[t]; g.fillRect(lx - 22, 50, 22, 22); g.fillStyle = '#6b6f7a'; lx -= 46 }
  const x0 = 30, y0 = 140, cw = (W - 60) / 7, filas = mes.semanas.length, ch = (H - y0 - 30) / filas
  g.textAlign = 'center'; g.font = '700 28px system-ui, sans-serif'; g.fillStyle = '#8b8f99'
  ;['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].forEach((d, i) => g.fillText(d, x0 + cw * i + cw / 2, y0 - 40))
  g.strokeStyle = '#d6d3cc'; g.lineWidth = 2
  mes.semanas.forEach((sem, f) => sem.forEach((cel, i) => {
    const x = x0 + cw * i, y = y0 + ch * f
    g.strokeRect(x, y, cw, ch)
    if (!cel) return
    if (cel.hoy) { g.fillStyle = 'rgba(240,166,60,0.18)'; g.fillRect(x + 1, y + 1, cw - 2, ch - 2); g.strokeStyle = '#f0a63c'; g.lineWidth = 5; g.strokeRect(x + 3, y + 3, cw - 6, ch - 6); g.strokeStyle = '#d6d3cc'; g.lineWidth = 2 }
    g.fillStyle = cel.pasado ? '#b3b0aa' : '#2b3a55'; g.font = '800 30px system-ui, sans-serif'; g.textAlign = 'left'
    g.fillText(String(cel.dia), x + 10, y + 8)
    const maxLineas = Math.max(0, Math.floor((ch - 48) / 30))
    cel.eventos.slice(0, maxLineas).forEach((e, k) => {
      const yy = y + 46 + k * 30
      g.fillStyle = COLOR_EVENTO[e.tipo] ?? '#888'; g.fillRect(x + 8, yy + 2, 8, 22)
      g.fillStyle = '#33363d'; g.font = '600 20px system-ui, sans-serif'
      let t = e.texto
      while (t.length > 2 && g.measureText(t).width > cw - 32) t = t.slice(0, -2)
      g.fillText(t === e.texto ? t : `${t}…`, x + 22, yy + 2)
    })
    if (cel.eventos.length > maxLineas && maxLineas > 0) { g.fillStyle = '#6b6f7a'; g.font = '700 20px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(`+${cel.eventos.length - maxLineas}`, x + cw - 8, y + 10) }
  }))
  tex.needsUpdate = true
}
