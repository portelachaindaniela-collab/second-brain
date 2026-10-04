// Pantalla de inicio de Second Brain: después del login se elige en qué app entrar.
const APPS = [
  { id: 'bs67', marca: 'BS67', nombre: 'BS67', detalle: 'Hoy, flujo, mail y calendario, trabajadores, eventos, métricas y proyectos.' },
  { id: 'up', marca: 'UP', nombre: 'UP', detalle: 'Publicaciones en LinkedIn, X e Instagram desde el calendario editorial.' },
]

export default function Inicio({ email, elegir, salir }) {
  return (
    <div className="login-screen">
      <div className="inicio">
        <h1>Second brain</h1>
        <div className="sub">{email}</div>
        <div className="inicio-apps">
          {APPS.map(a => (
            <button key={a.id} className="inicio-app card" onClick={() => elegir(a.id)}>
              <span className="brand-mark">{a.marca}</span>
              <strong>{a.nombre}</strong>
              <span>{a.detalle}</span>
            </button>
          ))}
        </div>
        <button type="button" className="login-alt" onClick={salir}>Salir</button>
      </div>
    </div>
  )
}
