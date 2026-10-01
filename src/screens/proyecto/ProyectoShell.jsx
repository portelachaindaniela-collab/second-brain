import { useEffect, useState } from 'react'
import { supabase } from '../../supabase.js'
import { CabeceraPantalla, Bloques, Bloque, Pie } from '../../estructura.jsx'
import Resumen from './Resumen.jsx'
import Docs from './Docs.jsx'
import Archivos from './Archivos.jsx'
import Calendario from './Calendario.jsx'
import Bandeja from '../Bandeja.jsx'

const HOJAS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'archivosydocs', label: 'Archivos y docs' },
  { key: 'mailcal', label: 'Mail y calendario' },
]
const QUIETA_MS = 3 * 86_400_000

function textoFiltros({ busqueda, sinLeer }) {
  const partes = [sinLeer ? 'solo sin leer' : 'todos los mails del proyecto']
  if (busqueda.trim()) partes.push(`asunto con "${busqueda.trim()}"`)
  return partes.join(' · ')
}

// La cabecera es común a las tres hojas del proyecto; el menú de la izquierda es navegación y queda donde está.
export default function ProyectoShell({ proyecto, abrirMail, hoja, setHoja }) {
  const [cifras, setCifras] = useState(null)
  const [filtros, setFiltros] = useState({ busqueda: '', sinLeer: false })

  useEffect(() => {
    let vivo = true
    const ahora = Date.now()
    const contar = consulta => consulta.then(r => r.count ?? 0)
    const deProyecto = tabla => supabase.from(tabla).select('id', { count: 'exact', head: true }).eq('project_id', proyecto.id)
    Promise.all([
      contar(deProyecto('tasks').eq('done', false)),
      contar(deProyecto('tasks').eq('done', false).lt('touched_at', new Date(ahora - QUIETA_MS).toISOString())),
      contar(deProyecto('calendar_events').gte('starts_at', new Date(ahora).toISOString())),
      contar(deProyecto('assets')),
      contar(deProyecto('docs')),
    ]).then(([abiertas, quietas, eventos, archivos, docs]) => {
      if (vivo) setCifras({ abiertas, quietas, eventos, archivosYDocs: archivos + docs })
    })
    return () => { vivo = false }
  }, [proyecto.id, hoja])

  return (
    <div>
      <CabeceraPantalla sobretitulo="Proyecto" titulo={proyecto.name} subtitulo={proyecto.summary || 'Sin descripción'} cargando={!cifras}
        cifras={[
          { valor: cifras?.abiertas, etiqueta: 'tareas abiertas' },
          { valor: cifras?.quietas, etiqueta: 'quietas +3 días', nivel: cifras?.quietas ? 'aviso' : undefined },
          { valor: cifras?.eventos, etiqueta: 'próximos eventos' },
          { valor: cifras?.archivosYDocs, etiqueta: 'archivos y docs' },
        ]} />
      <div className="proyecto-layout">
        <nav className="proyecto-nav">
          {HOJAS.map(h => (
            <button key={h.key} className={`proyecto-nav-item${hoja === h.key ? ' active' : ''}`} onClick={() => setHoja(h.key)}>
              {h.label}
            </button>
          ))}
        </nav>
        <div className="proyecto-main">
          {hoja === 'resumen' && <Resumen proyecto={proyecto} irA={setHoja} />}
          {hoja === 'archivosydocs' && (
            <Bloques>
              <Archivos proyecto={proyecto} />
              <Docs proyecto={proyecto} />
            </Bloques>
          )}
          {hoja === 'mailcal' && <>
            <Bloques>
              <Calendario proyecto={proyecto} />
              <Bloque titulo="Mail">
                <Bandeja enBloque filtros={filtros} proyectoId={proyecto.id} abrirMail={abrirMail} />
              </Bloque>
            </Bloques>
            <Pie titulo="Filtros de mail" resumen={textoFiltros(filtros)} boton="Filtrar">
              <div className="action-row" style={{ marginBottom: 0 }}>
                <input aria-label="Buscar por asunto" placeholder="Buscar por asunto" value={filtros.busqueda} onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))} />
                <label className="check-label"><input type="checkbox" checked={filtros.sinLeer} onChange={e => setFiltros(f => ({ ...f, sinLeer: e.target.checked }))} />Solo sin leer</label>
              </div>
            </Pie>
          </>}
        </div>
      </div>
    </div>
  )
}
