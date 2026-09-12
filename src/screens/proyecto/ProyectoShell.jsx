import { useState } from 'react'
import Resumen from './Resumen.jsx'
import Docs from './Docs.jsx'
import Archivos from './Archivos.jsx'
import Metricas from './Metricas.jsx'
import Mails from './Mails.jsx'
import Calendario from './Calendario.jsx'

const HOJAS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'docs', label: 'Docs' },
  { key: 'archivos', label: 'Archivos' },
  { key: 'metricas', label: 'Métricas' },
  { key: 'mails', label: 'Mails' },
  { key: 'calendario', label: 'Calendario' },
]

export default function ProyectoShell({ proyecto, recargarProyectos }) {
  const [hoja, setHoja] = useState('resumen')

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
        {hoja === 'docs' && <Docs proyecto={proyecto} />}
        {hoja === 'archivos' && <Archivos proyecto={proyecto} />}
        {hoja === 'metricas' && <Metricas proyecto={proyecto} />}
        {hoja === 'mails' && <Mails proyecto={proyecto} />}
        {hoja === 'calendario' && <Calendario proyecto={proyecto} />}
      </div>
    </div>
  )
}
