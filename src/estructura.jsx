import { useEffect, useId, useRef, useState } from 'react'

// Estructura común de todas las pantallas (referencia: home de Point Data Global).
// 1. CabeceraPantalla: sobretítulo + título a la izquierda, 2 a 4 cifras a la derecha.
// 2. Bloques / Bloque: el contenido en bloques, dos columnas en pantalla ancha.
// 3. Pie: configuración y ajustes al final, en una línea con un botón que despliega el detalle.
// Una pantalla nueva arma su estructura con estos componentes; no copia estilos.

// cifra: { valor, etiqueta, nivel?: 'aviso' | 'error' }. Sin nivel va en el color normal: solo lo que pide
// atención cambia de color.
export function CabeceraPantalla({ sobretitulo, titulo, subtitulo, cifras = [], cargando = false }) {
  return <header className="pantalla-cabecera">
    <div className="pantalla-titulos">
      {sobretitulo && <p className="pantalla-sobretitulo">{sobretitulo}</p>}
      <h1>{titulo}</h1>
      {subtitulo && <p className="pantalla-subtitulo">{subtitulo}</p>}
    </div>
    {cifras.length > 0 && <dl className="pantalla-cifras" style={{ '--columnas': Math.min(cifras.length, 4) }}>
      {cifras.slice(0, 4).map(c => <div key={c.etiqueta} className={c.nivel ? `cifra-${c.nivel}` : undefined}>
        <dt>{c.etiqueta}</dt>
        <dd>{cargando ? '—' : c.valor}</dd>
      </div>)}
    </dl>}
  </header>
}

export function Bloques({ children }) {
  return <div className="pantalla-bloques">{children}</div>
}

// ancho: 'completo' ocupa las dos columnas.
export function Bloque({ titulo, accion, ancho, onClick, children }) {
  return <section className={`pantalla-bloque${ancho === 'completo' ? ' bloque-completo' : ''}${onClick ? ' clickable' : ''}`} onClick={onClick}>
    <div className="bloque-cabecera">
      <h2>{titulo}</h2>
      {accion}
    </div>
    {children}
  </section>
}

// resumen: la línea que se ve siempre. Dos usos:
// - con children: el botón despliega el detalle (configuración, filtros) debajo de la línea.
// - con onBoton: el botón hace una acción directa (sincronizar, importar); nota muestra su resultado.
// Sin boton ni children es solo una línea de información. Varios Pie seguidos se apilan sin repetir el separador.
export function Pie({ titulo, resumen, boton = 'Configurar', onBoton, ocupado = false, nota, children }) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  const detalle = useRef(null)
  // Está al final de la página: al abrirlo se trae a la vista. El detalle suele cargar datos y crecer
  // después de abrirse, así que se lo acompaña mientras crece durante el primer segundo y medio.
  useEffect(() => {
    const nodo = detalle.current
    if (!abierto || !nodo) return
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const mostrar = () => nodo.scrollIntoView({ block: 'nearest', behavior: quieto ? 'auto' : 'smooth' })
    mostrar()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(mostrar)
    observador.observe(nodo)
    const corte = setTimeout(() => observador.disconnect(), 1500)
    return () => { clearTimeout(corte); observador.disconnect() }
  }, [abierto])

  const desplegable = !onBoton && children
  return <footer className="pantalla-pie">
    <div className="pie-linea">
      <span><strong>{titulo}</strong>{resumen && <span className="pie-resumen"> · {resumen}</span>}</span>
      {onBoton && boton && <button className="btn btn-sm" disabled={ocupado} onClick={onBoton}>{boton}</button>}
      {desplegable && <button className="btn btn-sm" aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto(x => !x)}>{abierto ? 'Cerrar' : boton}</button>}
    </div>
    {nota && <p className="pie-nota" role="status">{nota}</p>}
    {desplegable && abierto && <div id={id} ref={detalle} className="pie-detalle">{children}</div>}
  </footer>
}
