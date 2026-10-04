// Marca en el texto los fragmentos que el revisor señaló.
export function conResaltados(texto, problemas) {
  const fragmentos = (problemas || []).map(p => p.fragmento).filter(f => f && texto.includes(f))
  if (!fragmentos.length) return texto
  const partes = texto.split(new RegExp(`(${fragmentos.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`))
  return partes.map((parte, i) => (fragmentos.includes(parte) ? <mark key={i}>{parte}</mark> : parte))
}
