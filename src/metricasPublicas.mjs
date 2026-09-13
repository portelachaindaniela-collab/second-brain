export function normalizarPublicacion(valor) {
  let url;
  try { url = new URL(valor.trim()); } catch { throw new Error('Pegá el enlace completo de una publicación de X.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname)) throw new Error('Por ahora se admiten publicaciones de X. Usá un enlace de x.com o twitter.com.');
  const partes = url.pathname.match(/^\/(?:[a-zA-Z0-9_]{1,15}|i\/web|i)\/status\/(\d{1,25})(?:\/(?:analytics|photo\/\d+|video\/\d+))?\/?$/);
  if (!partes) throw new Error('Ese enlace no corresponde a una publicación. Copiá el enlace que contiene /status/.');
  return { id: partes[1], enlace: `https://x.com/i/status/${partes[1]}` };
}

function recursoSeguro(valor) {
  try { const u = new URL(valor); return u.protocol === 'https:' && (u.hostname === 'pbs.twimg.com' || u.hostname === 'video.twimg.com') ? u.href : null; } catch { return null; }
}
const numero = valor => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : null;

export async function consultarPublicacion(enlace, consultar = fetch) {
  const { id } = normalizarPublicacion(enlace);
  const respuesta = await consultar(`https://api.fxtwitter.com/status/${id}`, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
  if (!respuesta.ok) throw new Error('No se pudo consultar la publicación. Probá actualizar en unos minutos.');
  const datos = await respuesta.json();
  if (datos.code !== 200 || !datos.tweet || datos.tweet.id !== id) throw new Error('La publicación no está disponible públicamente en este momento.');
  const p = datos.tweet;
  const autor = /^[a-zA-Z0-9_]{1,15}$/.test(p.author?.screen_name || '') ? p.author.screen_name : null;
  return {
    id, enlace: `https://x.com/${autor || 'i'}/status/${id}`, texto: p.text || '',
    autor: p.author?.name || autor || 'Publicación de X', usuario: autor,
    avatar: recursoSeguro(p.author?.avatar_url),
    imagen: recursoSeguro(p.media?.photos?.[0]?.url || p.media?.videos?.[0]?.thumbnail_url || p.card?.image?.url),
    tituloEnlace: p.card?.title || null,
    publicado: Number.isFinite(p.created_timestamp) ? new Date(p.created_timestamp * 1000).toISOString() : null,
    actualizado: new Date().toISOString(),
    metricas: { vistas: numero(p.views), likes: numero(p.likes), reposts: numero(p.retweets), respuestas: numero(p.replies), citas: numero(p.quotes), guardados: numero(p.bookmarks) }
  };
}
