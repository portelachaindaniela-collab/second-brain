import { useCallback, useEffect, useState } from 'react'
import { supabase, abrirEnlaceOAuth } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { NOMBRE_RED, REDES_AUTOMATICAS } from './pipeline.js'

// Dónde y cuándo sale lo aprobado: la cuenta conectada de cada red y su horario. Los tokens no llegan a la app:
// up_mis_conexiones devuelve solo el nombre de la cuenta y cuándo vence.
const REDES = ['linkedin', 'x', 'instagram']
const NOTA_MANUAL = {
  x: 'La publicación automática en X llega después (necesita crédito cargado en la API de X).',
  instagram: 'La publicación automática en Instagram llega después.',
}
const DIAS_AVISO = 7

// Al volver de LinkedIn, la Edge Function up-linkedin trae el resultado en la URL.
function leerVuelta() {
  const q = new URLSearchParams(window.location.search)
  const r = q.get('up_redes')
  return r ? { ok: r === 'ok', detalle: q.get('detalle') || '' } : null
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
}

async function llamarLinkedIn(accion) {
  const { data, error } = await supabase.functions.invoke('up-linkedin', { body: { accion } })
  let respuesta = data
  if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || respuesta?.error) return { error: respuesta?.error || 'No se pudo hablar con LinkedIn.' }
  return respuesta
}

function Red({ red, conexion, hora, recargar, ahora }) {
  const [valor, setValor] = useState(hora || '')
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState('')
  const automatica = REDES_AUTOMATICAS.includes(red)
  const dias = conexion?.expira_at ? (Date.parse(conexion.expira_at) - ahora) / 86_400_000 : null

  async function conectar() {
    setOcupado('conectar'); setAviso('')
    const r = await llamarLinkedIn('conectar')
    if (r.error) { setOcupado(''); setAviso(r.error); return }
    abrirEnlaceOAuth(r.url)
  }

  async function desconectar() {
    if (!window.confirm(`¿Desconectar ${NOMBRE_RED[red]}? Lo aprobado deja de salir solo.`)) return
    setOcupado('desconectar'); setAviso('')
    const r = await llamarLinkedIn('desconectar')
    setOcupado('')
    if (r.error) { setAviso(r.error); return }
    recargar()
  }

  async function guardarHora() {
    setOcupado('hora'); setAviso('')
    const { error } = valor
      ? await supabase.from('up_horarios').upsert({ red, hora: valor }, { onConflict: 'owner_id,red' })
      : await supabase.from('up_horarios').delete().eq('red', red)
    setOcupado('')
    if (error) { setAviso('No se pudo guardar el horario: ' + error.message); return }
    recargar()
  }

  return (
    <section className="up-bloque up-red">
      <div className="up-vol"><LogoRed red={red} apagado={!automatica} />{NOMBRE_RED[red]}</div>
      <div className="up-red-cols">
        <div>
          <div className="up-antetitulo">Cuenta</div>
          {!automatica ? <p className="up-red-texto">{NOTA_MANUAL[red]}</p> : conexion ? (
            <>
              <p className="up-red-texto">Conectada{conexion.nombre ? ` como ${conexion.nombre}` : ''}.{conexion.expira_at && ` La conexión vence el ${fechaCorta(conexion.expira_at)}.`}</p>
              {dias !== null && dias < DIAS_AVISO && <p className="up-aviso-nota up-aviso-error">{dias <= 0 ? 'La conexión venció: tocá Reconectar.' : 'Vence pronto: tocá Reconectar para que no se corte.'}</p>}
              <div className="up-acciones up-acciones-izq">
                <button className="up-btn" disabled={!!ocupado} onClick={desconectar}>Desconectar</button>
                <button className="up-btn up-btn-p" disabled={!!ocupado} onClick={conectar}>{ocupado === 'conectar' ? 'Abriendo…' : 'Reconectar'}</button>
              </div>
            </>
          ) : (
            <>
              <p className="up-red-texto">No conectada. Hasta que la conectes, lo aprobado lo publicás vos.</p>
              <div className="up-acciones up-acciones-izq">
                <button className="up-btn up-btn-p" disabled={!!ocupado} onClick={conectar}>{ocupado === 'conectar' ? 'Abriendo…' : `Conectar ${NOMBRE_RED[red]}`}</button>
              </div>
            </>
          )}
        </div>
        <div>
          <div className="up-antetitulo">Horario</div>
          <p className="up-red-texto">{hora ? `Lo aprobado del día sale a las ${hora}.` : 'Sin horario: no sale nada solo.'}</p>
          <div className="up-red-hora">
            <input className="up-campo" type="time" value={valor} onChange={e => setValor(e.target.value)} aria-label={`Horario de ${NOMBRE_RED[red]}`} />
            <button className="up-btn" disabled={!!ocupado || valor === (hora || '')} onClick={guardarHora}>{!valor && hora ? 'Quitar' : 'Guardar'}</button>
          </div>
        </div>
      </div>
      {aviso && <p role="alert" className="up-error">{aviso}</p>}
    </section>
  )
}

export default function Redes() {
  const [vuelta] = useState(leerVuelta)
  const [ahora] = useState(() => Date.now())
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const [hor, con] = await Promise.all([supabase.from('up_horarios').select('red,hora'), supabase.rpc('up_mis_conexiones')])
    if (hor.error || con.error) { setError('No se pudieron cargar las redes: ' + (hor.error || con.error).message); return }
    setDatos({ horarios: hor.data || [], conexiones: con.data || [] })
  }, [])

  useEffect(() => { cargar() }, [cargar])
  // El resultado de LinkedIn se muestra una vez y se saca de la URL.
  useEffect(() => { if (vuelta) window.history.replaceState(null, '', window.location.pathname) }, [vuelta])

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo">Redes · cuentas y horarios</div>
        <h2 className="up-titular-1">Cuándo y dónde sale lo que aprobás</h2>
        <p className="up-bajada">Lo aprobado sale solo el día que le toca, a la hora de cada red. Sin cuenta conectada o sin horario, lo publicás vos y tocás Publicado en Hoy.</p>
        {vuelta && <p role="status" className={`up-aviso-nota ${vuelta.ok ? 'up-aviso-ok' : 'up-aviso-error'}`}>{vuelta.detalle}</p>}
      </div>
      <div className="up-redes">
        {REDES.map(red => (
          <Red key={red} red={red} recargar={cargar} ahora={ahora}
            conexion={datos.conexiones.find(c => c.red === red)}
            hora={datos.horarios.find(h => h.red === red)?.hora?.slice(0, 5) ?? null} />
        ))}
      </div>
    </>
  )
}
