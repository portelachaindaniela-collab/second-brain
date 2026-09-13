import Resumen from './Resumen.jsx'
import Docs from './Docs.jsx'
import Archivos from './Archivos.jsx'
import Mails from './Mails.jsx'
import Calendario from './Calendario.jsx'

const HOJAS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'archivosydocs', label: 'Archivos y docs' },
  { key: 'mailcal', label: 'Mail y calendario' },
]

export default function ProyectoShell({ proyecto, abrirMail, hoja, setHoja }) {

  return (
    <div className="proyecto-layout">
      <nav className="proyecto-nav">
        {HOJAS.map(h => (
          <button key={h.key} className={`proyecto-nav-item${hoja === h.key ? ' active' : ''}`} onClick={() => setHoja(h.key)}>
            {h.label}
          </button>
        ))}
      </nav>
      <div className="proyecto-main">
        <p className="page-sub" style={{ marginBottom: 16 }}>{proyecto.summary || 'Sin descripción'}</p>
        {hoja === 'resumen' && <Resumen proyecto={proyecto} irA={setHoja} />}
        {hoja === 'archivosydocs' && (
          <div className="proyecto-split">
            <div className="proyecto-split-half"><Archivos proyecto={proyecto} /></div>
            <div className="proyecto-split-half"><Docs proyecto={proyecto} /></div>
          </div>
        )}
        {hoja === 'mailcal' && (
          <div className="proyecto-split">
            <div className="proyecto-split-half"><Calendario proyecto={proyecto} /></div>
            <div className="proyecto-split-half"><Mails proyecto={proyecto} abrirMail={abrirMail} /></div>
          </div>
        )}
      </div>
    </div>
  )
}
