const esElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

export default function Pantalla({ pantalla }) {
  if (esElectron) {
    return (
      <webview
        src={pantalla.url}
        partition="persist:sb"
        allowpopups="true"
        style={{ flex: 1, minHeight: 0, width: '100%', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', display: 'flex' }}
      />
    )
  }
  return (
    <div style={{ padding: 24 }}>
      <p className="empty-state">
        Esta pantalla se embebe solo dentro de la app instalada (Electron).
        En el navegador de desarrollo, abrila en una pestaña aparte:
      </p>
      <a href={pantalla.url} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginTop: 12, display: 'inline-flex' }}>
        Abrir {pantalla.nombre}
      </a>
    </div>
  )
}
