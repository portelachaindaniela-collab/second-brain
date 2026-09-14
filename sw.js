// Service worker mínimo: solo existe para que el navegador considere la app instalable
// (ícono en la pantalla de inicio). No cachea nada a propósito, para no mostrar nunca
// una versión vieja — cada request va directo a la red.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

// Resumen diario: recibe el texto ya armado del lado del servidor (Supabase) y lo muestra como
// notificación; al abrirla, si la app ya está abierta le pasamos el texto por postMessage para que
// lo lea en voz alta, y si no, la abrimos con el texto en la URL (App.jsx lo detecta al montar).
self.addEventListener('push', (event) => {
  let datos = {}
  try { datos = event.data ? event.data.json() : {} } catch { datos = { texto: event.data ? event.data.text() : '' } }
  const titulo = datos.titulo || 'Tu resumen del día'
  const texto = datos.texto || ''
  event.waitUntil(self.registration.showNotification(titulo, {
    body: texto,
    icon: 'pwa/icon-192.png',
    badge: 'pwa/icon-192.png',
    data: { texto },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const texto = event.notification.data?.texto || ''
  const url = self.registration.scope + '?resumen=' + encodeURIComponent(texto)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ('focus' in cliente) { cliente.postMessage({ tipo: 'leer-resumen', texto }); return cliente.focus() }
      }
      return self.clients.openWindow(url)
    })
  )
})
