// Markdown mínimo para lo que escriben los agentes (títulos, listas, negrita, código), sin HTML crudo.
function enLinea(texto, k) {
  return String(texto).split(/(\*\*[^*]+\*\*|`[^`]+`|\[(?:A DEFINIR|DATO)\])/g).map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(p)) return <code key={`${k}-${i}`}>{p.slice(1, -1)}</code>
    if (/^\[(A DEFINIR|DATO)\]$/.test(p)) return <mark key={`${k}-${i}`}>{p}</mark>
    return p
  })
}

export default function Md({ texto }) {
  const bloques = []
  let lista = null
  String(texto || '').split('\n').forEach((linea, i) => {
    const t = linea.trimEnd()
    const item = t.match(/^\s*(?:[-*]|(\d+)[.)])\s+(.*)$/)
    if (item) {
      const tipo = item[1] ? 'ol' : 'ul'
      if (!lista || lista.tipo !== tipo) { lista = { tipo, items: [] }; bloques.push(lista) }
      lista.items.push(enLinea(item[2], i))
      return
    }
    lista = null
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) bloques.push({ tipo: `h${Math.min(h[1].length + 1, 5)}`, texto: enLinea(h[2], i) })
    else if (t.trim()) bloques.push({ tipo: 'p', texto: enLinea(t, i) })
  })
  return (
    <div className="pdg-md">
      {bloques.map((b, i) => {
        if (b.tipo === 'ul') return <ul key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>
        if (b.tipo === 'ol') return <ol key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ol>
        const T = b.tipo
        return <T key={i}>{b.texto}</T>
      })}
    </div>
  )
}
