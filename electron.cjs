const { app, BrowserWindow, shell } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { clasificarCambio } = require('./electron-updates.cjs')

const raiz = path.join(__dirname, 'dist')
const PUERTO = 3000
// La app de escritorio abre la misma versión que la web y el celular (GitHub Pages), así las tres se actualizan
// juntas con cada merge. Sin internet abre la copia local de dist/.
const URL_WEB = 'https://portelachaindaniela-collab.github.io/second-brain/'
const URL_LOCAL = 'http://localhost:' + PUERTO

const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
}

// Si el puerto está ocupado (la copia anterior todavía lo suelta al reiniciarse sola) reintenta unos segundos; si sigue
// ocupado, la ventana abre igual con la versión web. Antes la app se quedaba esperando para siempre, sin ventana.
function servidor(intentos = 10) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let url = decodeURIComponent(req.url.split('?')[0])
      let archivo = path.join(raiz, url)
      if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
        archivo = path.join(raiz, 'index.html')
      }
      const ext = path.extname(archivo).toLowerCase()
      res.writeHead(200, { 'Content-Type': tipos[ext] || 'application/octet-stream' })
      fs.createReadStream(archivo).pipe(res)
    })
    s.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && intentos > 1) setTimeout(() => servidor(intentos - 1).then(resolve), 500)
      else resolve()
    })
    s.listen(PUERTO, '127.0.0.1', () => resolve())
  })
}

// Si se edita el código en el disco y cambia `dist/` (o electron.cjs), la ventana se refresca sola. Con la versión
// web abierta, refrescar trae lo último publicado.
function observarActualizaciones(win) {
  let pendiente = null
  fs.watch(__dirname, { recursive: true }, (_evento, nombre) => {
    const tipo = clasificarCambio(nombre)
    if (!tipo) return
    clearTimeout(pendiente)
    pendiente = setTimeout(() => {
      if (tipo === 'nucleo') { app.relaunch(); app.exit(); return }
      if (!win.isDestroyed()) win.webContents.reloadIgnoringCache()
    }, 700)
  })
}

let win = null

async function ventana() {
  await servidor()
  win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 380,
    title: 'Second brain',
    backgroundColor: '#10161d',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, webviewTag: true, partition: 'persist:sb' }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-fail-load', (_evento, _codigo, _descripcion, url, esPrincipal) => {
    if (esPrincipal && url.startsWith(URL_WEB)) win.loadURL(URL_LOCAL)
  })
  win.loadURL(URL_WEB)
  observarActualizaciones(win)
}

// Una sola copia: un segundo doble clic trae al frente la ventana abierta en vez de quedar como proceso invisible.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  app.whenReady().then(ventana)
  app.on('window-all-closed', () => app.quit())
}
