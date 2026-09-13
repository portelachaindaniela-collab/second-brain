// Service worker mínimo: solo existe para que el navegador considere la app instalable
// (ícono en la pantalla de inicio). No cachea nada a propósito, para no mostrar nunca
// una versión vieja — cada request va directo a la red.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
