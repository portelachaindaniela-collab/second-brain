// Publicador de UP: qué piezas aprobadas salen ahora y cómo se arma el post de LinkedIn.
// Solo publica lo aprobado del día, cuando llegó la hora elegida para esa red. Sin hora no sale nada solo.
// Si una publicación falla, la pieza sigue aprobada (el texto no se toca) con el motivo en error_publicacion, y no
// se reintenta sola: la dueña toca Reintentar.

export const REDES_AUTOMATICAS = ['linkedin']
export const LINKEDIN_VERSION_DEFAULT = '202609'
export const LINKEDIN_SCOPES = 'openid profile w_member_social'
export const DIAS_AVISO_VENCIMIENTO = 7

// Día de hoy en Buenos Aires (igual que en up-pipeline; copiado para no desplegar la lógica entera del pipeline).
export function hoyAR(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

// Hora de Buenos Aires en formato HH:MM (la del calendario y la de los horarios).
export function horaAR(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ahora)
}

export function tocaPublicar(pieza, hora, hoy, ahoraHM) {
  return pieza.estado === 'aprobado' && !pieza.error_publicacion && REDES_AUTOMATICAS.includes(pieza.red) && pieza.fecha === hoy
    && Boolean(hora) && ahoraHM >= String(hora).slice(0, 5)
}

// En el texto de un post de LinkedIn estos caracteres son reservados ("little text format"): sin barra
// invertida, LinkedIn corta o cambia el post.
export function escaparLinkedIn(texto) {
  return String(texto).replace(/[\\|{}@[\]()<>#*_~]/g, c => `\\${c}`)
}

export function cuerpoPostLinkedIn(autorId, texto) {
  return {
    author: `urn:li:person:${autorId}`,
    commentary: escaparLinkedIn(texto),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
}

export function urlPostLinkedIn(urn) {
  return urn ? `https://www.linkedin.com/feed/update/${urn}/` : null
}

// Mensaje para la dueña según lo que respondió LinkedIn.
export function motivoErrorLinkedIn(status, data) {
  if (status === 401) return 'La conexión con LinkedIn venció o se revocó. Reconectala en Redes y tocá Reintentar.'
  if (status === 403) return 'LinkedIn no dio permiso para publicar. Revisá que la app tenga "Share on LinkedIn" y reconectala en Redes.'
  if (status === 429) return 'LinkedIn pidió esperar (demasiadas publicaciones seguidas). Tocá Reintentar más tarde.'
  return `LinkedIn respondió ${status}: ${data?.message || 'error desconocido'}.`
}
