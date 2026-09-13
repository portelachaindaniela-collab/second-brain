const { app, BrowserWindow, shell } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { clasificarCambio } = require('./electron-updates.cjs')

const raiz = path.join(__dirname, 'dist')
const PUERTO = 3000

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

function servidor() {
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
    s.listen(PUERTO, '127.0.0.1', () => resolve())
  })
}

// Actualización automática sin preguntar: acá se edita el código directo en el disco de la usuaria
// (no hay un servidor de builds aparte), así que "actualizarse sola" significa notar que `dist/`
// cambió y refrescarse — no hace falta descargar nada de internet.
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

async function ventana() {
  await servidor()
  const win = new BrowserWindow({
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
  win.loadURL('http://localhost:' + PUERTO)
  observarActualizaciones(win)
}

app.whenReady().then(ventana)
app.on('window-all-closed', () => app.quit())
