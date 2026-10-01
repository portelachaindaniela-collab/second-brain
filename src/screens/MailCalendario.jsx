import { useEffect, useRef, useState } from 'react'
import Agenda from './Agenda.jsx'
import { importarEventosComunidad, textoImportacion } from '../comunidadImportar.js'
import Bandeja from './Bandeja.jsx'
import { supabase, hora } from '../supabase.js'
import { unirRepetidos } from '../eventosUnicos.mjs'
import { EVENTOS_COMUNIDAD } from '../comunidadEventos.mjs'
import { CabeceraPantalla, Bloques, Bloque, Pie } from '../estructura.jsx'

// Semana de lunes a domingo, en la hora de la computadora.
function semanaActual() {
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7))
  const fin = new Date(inicio)
  fin.setDate(fin.getDate() + 7)
  return [inicio, fin]
}

function textoFiltros({ busqueda, sinLeer }) {
  const partes = [sinLeer ? 'solo sin leer' : 'todos los mails']
  if (busqueda.trim()) partes.push(`asunto con "${busqueda.trim()}"`)
  return partes.join(' · ')
}

export default function MailCalendario({ tab, revision, proyectos, google, conectarGoogle, abrirMail, sincronizar, sincronizando, errorSync }) {
  const [filtros, setFiltros] = useState({ busqueda: '', sinLeer: false })
  const [extra, setExtra] = useState(0)
  const [cifras, setCifras] = useState({ sinLeer: null, semana: null })
  const [importando, setImportando] = useState(false)
  const [importacion, setImportacion] = useState(null)
  const bloqueCalendario = useRef(null)
  const bloqueMail = useRef(null)

  useEffect(() => {
    let vivo = true
    const [inicio, fin] = semanaActual()
    Promise.all([
      supabase.from('emails').select('id', { count: 'exact', head: true }).eq('is_unread', true),
      supabase.from('calendar_events').select('id,title,starts_at,ends_at,all_day').gte('starts_at', inicio.toISOString()).lt('starts_at', fin.toISOString()),
    ]).then(([mails, eventos]) => {
      if (vivo) setCifras({ sinLeer: mails.count ?? 0, semana: unirRepetidos(eventos.data || []).length })
    })
    return () => { vivo = false }
  }, [revision, extra])

  // "Ver calendario" / "Ver todos los mails" desde Hoy: los dos bloques están a la vista, se lleva al pedido.
  // Al abrir la pantalla no se mueve: la cabecera va primero.
  const tabAnterior = useRef(tab)
  useEffect(() => {
    if (tabAnterior.current === tab) return
    tabAnterior.current = tab
    const destino = tab === 'mail' ? bloqueMail.current : bloqueCalendario.current
    destino?.scrollIntoView({ block: 'start' })
  }, [tab])

  async function importar() {
    setImportando(true); setImportacion(null)
    try {
      const r = await importarEventosComunidad()
      setImportacion(r)
      if (r.creados) setExtra(x => x + 1)
    } catch (e) { setImportacion({ error: e.message || 'No se pudo importar los eventos de Comunidad.' }) }
    finally { setImportando(false) }
  }

  const sinLeer = cifras.sinLeer
  const pieGoogle = google?.conectado
    ? { resumen: `conectado como ${google.cuenta}${google.sincronizado_at ? ` · sincronizado ${hora(google.sincronizado_at)}` : ''}`, boton: sincronizando ? 'Sincronizando…' : 'Sincronizar ahora', onBoton: sincronizar }
    : google
      ? { resumen: google.reconectar ? 'pide volver a conectar la cuenta' : 'sin conectar', boton: google.reconectar ? 'Reconectar Google' : 'Conectar Google', onBoton: conectarGoogle }
      : { resumen: 'consultando…', boton: null }

  return (
    <div>
      <CabeceraPantalla sobretitulo="Google" titulo="Mail y Calendario" cargando={sinLeer == null}
        cifras={[
          { valor: sinLeer, etiqueta: 'mails sin leer', nivel: sinLeer ? 'aviso' : undefined },
          { valor: cifras.semana, etiqueta: 'eventos de la semana' },
        ]} />

      <Bloques>
        <div ref={bloqueCalendario}>
          <Bloque titulo="Calendario">
            <Agenda enBloque revision={revision + extra} proyectos={proyectos} />
          </Bloque>
        </div>
        <div ref={bloqueMail}>
          <Bloque titulo="Mail">
            <Bandeja enBloque filtros={filtros} revision={revision} abrirMail={abrirMail} />
          </Bloque>
        </div>
      </Bloques>

      <Pie titulo="Google" resumen={pieGoogle.resumen} boton={pieGoogle.boton} onBoton={pieGoogle.onBoton} ocupado={sincronizando} nota={errorSync} />
      <Pie titulo="Filtros de mail" resumen={textoFiltros(filtros)} boton="Filtrar">
        <div className="action-row" style={{ marginBottom: 0 }}>
          <input aria-label="Buscar por asunto" placeholder="Buscar por asunto" value={filtros.busqueda} onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))} />
          <label className="check-label"><input type="checkbox" checked={filtros.sinLeer} onChange={e => setFiltros(f => ({ ...f, sinLeer: e.target.checked }))} />Solo sin leer</label>
        </div>
      </Pie>
      <Pie titulo="Comunidad" resumen={`${EVENTOS_COMUNIDAD.length} eventos de tu web para sumar al calendario`}
        boton={importando ? 'Importando…' : 'Importar'} onBoton={importar} ocupado={importando} nota={textoImportacion(importacion)} />
    </div>
  )
}
