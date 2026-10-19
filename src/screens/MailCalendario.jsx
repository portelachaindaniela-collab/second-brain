import { useEffect, useRef, useState } from 'react'
import Agenda from './Agenda.jsx'
import { importarEventosComunidad, textoImportacion } from '../comunidadImportar.js'
import Bandeja from './Bandeja.jsx'
import { supabase, hora } from '../supabase.js'
import { unirRepetidos } from '../eventosUnicos.mjs'
import { EVENTOS_COMUNIDAD } from '../comunidadEventos.mjs'
import { CabeceraPantalla, Bloque, Pie } from '../estructura.jsx'
import { proximoEvento, cuandoFalta } from '../calendarioMes.mjs'

function mesActual() {
  const hoy = new Date()
  return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)]
}

const hora24 = iso => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// Lo que viene, siempre arriba de todo: para no tener que acordarse de mirar el calendario.
function LoProximo({ evento, cargando }) {
  if (cargando) return null
  if (!evento) return <div className="lo-proximo vacio"><span className="lo-proximo-etiqueta">Lo próximo</span><strong>No tenés nada agendado por delante.</strong></div>
  return <div className="lo-proximo">
    <span className="lo-proximo-etiqueta">Lo próximo · {cuandoFalta(evento)}</span>
    <strong>{!evento.all_day && <span className="lo-proximo-hora">{hora24(evento.starts_at)}</span>}{evento.title || '(sin título)'}</strong>
    {evento.location && <span className="lo-proximo-lugar">{evento.location}</span>}
  </div>
}

export default function MailCalendario({ tab, revision, proyectos, google, conectarGoogle, abrirMail, sincronizar, sincronizando, errorSync }) {
  const [filtros, setFiltros] = useState({ busqueda: '', sinLeer: false })
  const [extra, setExtra] = useState(0)
  const [cifras, setCifras] = useState({ sinLeer: null, mes: null, proximo: null })
  const [importando, setImportando] = useState(false)
  const [importacion, setImportacion] = useState(null)
  const bloqueCalendario = useRef(null)
  const bloqueMail = useRef(null)

  useEffect(() => {
    let vivo = true
    const [inicio, fin] = mesActual()
    const ayer = new Date(Date.now() - 86400000)
    Promise.all([
      supabase.from('emails').select('id', { count: 'exact', head: true }).eq('is_unread', true),
      supabase.from('calendar_events').select('id,title,starts_at,ends_at,all_day').gte('starts_at', inicio.toISOString()).lt('starts_at', fin.toISOString()),
      supabase.from('calendar_events').select('id,title,starts_at,ends_at,all_day,location').gte('starts_at', ayer.toISOString()).order('starts_at').limit(30),
    ]).then(([mails, eventos, siguientes]) => {
      if (vivo) setCifras({ sinLeer: mails.count ?? 0, mes: unirRepetidos(eventos.data || []).length, proximo: proximoEvento(unirRepetidos(siguientes.data || [])) })
    })
    return () => { vivo = false }
  }, [revision, extra])

  // "Ver calendario" / "Ver todos los mails" desde Hoy: el mail está debajo del mes, se lleva al pedido.
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
          { valor: cifras.mes, etiqueta: 'eventos del mes' },
        ]} />

      <LoProximo evento={cifras.proximo} cargando={sinLeer == null} />

      <div ref={bloqueCalendario}>
        <Agenda enBloque revision={revision + extra} proyectos={proyectos} debajo={ancho => <div key="mail" ref={bloqueMail} className={ancho === 'completo' ? 'bloque-completo' : undefined}>
          <Bloque titulo="Mail">
            <div className="action-row mail-filtros">
              <input aria-label="Buscar por asunto" placeholder="Buscar por asunto" value={filtros.busqueda} onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))} />
              <label className="check-label"><input type="checkbox" checked={filtros.sinLeer} onChange={e => setFiltros(f => ({ ...f, sinLeer: e.target.checked }))} />Solo sin leer</label>
            </div>
            <Bandeja enBloque filtros={filtros} revision={revision} abrirMail={abrirMail} />
          </Bloque>
        </div>} />
      </div>

      <Pie titulo="Google" resumen={pieGoogle.resumen} boton={pieGoogle.boton} onBoton={pieGoogle.onBoton} ocupado={sincronizando} nota={errorSync} />
      <Pie titulo="Comunidad" resumen={`${EVENTOS_COMUNIDAD.length} eventos de tu web para sumar al calendario`}
        boton={importando ? 'Importando…' : 'Importar'} onBoton={importar} ocupado={importando} nota={textoImportacion(importacion)} />
    </div>
  )
}
