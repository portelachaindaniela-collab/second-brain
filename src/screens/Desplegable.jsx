// Lista desplegable de Postulaciones: una línea con el título y la cantidad; al tocarla se abre el contenido.
// Es el mismo patrón que tenía "Descartadas y cerradas" (estilos en Postulaciones.css).
export default function Desplegable({ titulo, cantidad, abierto, alternar, children }) {
  return <section className="postu-cerradas">
    <button className="postu-cerradas-cabecera" aria-expanded={abierto} onClick={alternar}>
      <span><strong>{titulo}</strong> · {cantidad}</span><span className="btn btn-sm">{abierto ? 'Ocultar' : 'Ver'}</span>
    </button>
    {abierto && children}
  </section>
}
