import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { fechaLarga } from './fechas.js'

// La redacción: qué hace cada agente y qué hizo. Todo sale de up_corridas (lo escribe la Edge Function up-pipeline).
const AGENTES = [
  { id: 'planificador', nombre: 'Planificador', rol: 'Lee el día del calendario y decide qué piezas van: LinkedIn y X siempre, Instagram cuando toca.' },
  { id: 'investigador', nombre: 'Investigador', rol: 'Elige de la ficha solo los datos del tema. Si falta algo que solo vos sabés, te lo pregunta.' },
  { id: 'redactor', nombre: 'Redactor', rol: 'Escribe LinkedIn largo, X corto o en hilo, y el texto de Instagram, solo con datos de la ficha.' },
  { id: 'revisor', nombre: 'Revisor', rol: 'Chequea datos, cámara y largo. Devuelve al redactor hasta dos veces; si sigue mal, te lo pasa.' },
  { id: 'disenador', nombre: 'Diseñador', rol: 'Arma las placas del carrusel y los reels.', fase: 4 },
  { id: 'publicador', nombre: 'Publicador', rol: 'Publica lo aprobado cuando llega el horario de cada red.', fase: 5 },
]
const ESTADO_CORRIDA = { corriendo: 'Trabajando', ok: 'Completa', cortado: 'Cortada por cuota', error: 'Con error' }
const DIAS_RESUMEN = 7

// Siempre en hora de Buenos Aires, que es la del calendario y la del cron.
function hora(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' })
}

function haceCuanto(iso, ahora) {
  const min = Math.round((ahora - Date.parse(iso)) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

// El cron corre a los minutos 2, 12, 22… de las 9 y las 10 UTC (06:02 a 07:52 de Buenos Aires).
function proximaCorrida(ahora) {
  const t = new Date(ahora)
  t.setUTCSeconds(0, 0)
  t.setUTCMinutes(t.getUTCMinutes() + ((12 - (t.getUTCMinutes() % 10)) % 10 || 10))
  for (let i = 0; i < 300; i++, t.setUTCMinutes(t.getUTCMinutes() + 10)) {
    if (t.getUTCHours() === 9 || t.getUTCHours() === 10) return t
  }
  return null
}

function cuandoEs(fecha, ahora) {
  const dia = d => new Date(d).toDateString()
  if (dia(fecha) === dia(ahora)) return 'hoy'
  if (dia(fecha) === dia(ahora + 86_400_000)) return 'mañana'
  return new Date(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function plural(n, uno, varios) { return n === 1 ? uno : varios }

function resumen(agente, pasos) {
  const de = pasos.filter(p => p.agente === agente)
  const cuenta = f => de.filter(f).length
  switch (agente) {
    case 'planificador': return { cifra: de.length, texto: plural(de.length, 'día planificado', 'días planificados') }
    case 'investigador': {
      const n = cuenta(p => p.accion.startsWith('eligió')), q = cuenta(p => p.accion === 'preguntó')
      return { cifra: n, texto: plural(n, 'investigación', 'investigaciones'), extra: `${q} ${plural(q, 'pregunta', 'preguntas')} para vos` }
    }
    case 'redactor': {
      const n = cuenta(p => p.accion === 'escribió'), c = cuenta(p => p.accion.startsWith('corrigió'))
      return { cifra: n, texto: plural(n, 'borrador', 'borradores'), extra: `${c} ${plural(c, 'corrección', 'correcciones')}` }
    }
    case 'revisor': {
      const n = cuenta(p => p.accion === 'aprobó'), m = cuenta(p => p.accion === 'marcó'), r = cuenta(p => p.accion === 'pasó a revisión')
      return { cifra: n, texto: plural(n, 'aprobado', 'aprobados'), extra: `${m} ${plural(m, 'marcado', 'marcados')} · ${r} ${plural(r, 'pasó', 'pasaron')} a revisión` }
    }
    default: return null
  }
}

function Corrida({ corrida, abierta, alternar }) {
  const pasos = corrida.pasos || []
  return (
    <li className={`up-corrida${abierta ? ' abierta' : ''}`}>
      <button className="up-corrida-fila" onClick={alternar} aria-expanded={abierta}>
        <span className="up-corrida-hora">{new Date(corrida.iniciado_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} · {hora(corrida.iniciado_at)}</span>
        <span className="up-corrida-titulo">Borradores del {fechaLarga(corrida.fecha).toLowerCase()}<small>{corrida.origen === 'cron' ? 'Corrida automática' : 'La pediste vos'} · {pasos.length} pasos</small></span>
        <span className={`up-estado c-${corrida.estado}`}>{ESTADO_CORRIDA[corrida.estado]}</span>
      </button>
      {abierta && (
        <ol className="up-pasos">
          {pasos.map((p, i) => (
            <li key={i}>
              <span className="up-paso-hora">{hora(p.at)}</span>
              <span className="up-paso-agente">{AGENTES.find(a => a.id === p.agente)?.nombre || 'Sistema'}</span>
              <span className="up-paso-texto">{p.red && <LogoRed red={p.red} />}<b>{p.accion}</b>{p.detalle && <span> — {p.detalle}</span>}</span>
            </li>
          ))}
          {corrida.error && <li className="up-paso-error"><span className="up-paso-hora" /><span className="up-paso-agente">Error</span><span className="up-paso-texto">{corrida.error}</span></li>}
        </ol>
      )}
    </li>
  )
}

export default function Agentes() {
  const [corridas, setCorridas] = useState(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [ahora, setAhora] = useState(() => Date.now())

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('up_corridas').select('*').order('iniciado_at', { ascending: false }).limit(40)
    if (error) { setError('No se pudo cargar el trabajo de los agentes: ' + error.message); return }
    setCorridas(data || [])
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // En vivo: cada paso que escribe la Edge Function llega acá sin recargar.
  useEffect(() => {
    const canal = supabase.channel('up-corridas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'up_corridas' }, p => {
        if (!p.new?.id) return
        setCorridas(cs => [p.new, ...(cs || []).filter(c => c.id !== p.new.id)].sort((a, b) => b.iniciado_at.localeCompare(a.iniciado_at)))
      })
      .subscribe()
    const reloj = setInterval(() => setAhora(Date.now()), 30_000)
    return () => { supabase.removeChannel(canal); clearInterval(reloj) }
  }, [])

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!corridas) return <p className="up-vacio">Cargando…</p>

  const enCurso = corridas.find(c => c.estado === 'corriendo')
  const desde = ahora - DIAS_RESUMEN * 86_400_000
  const pasosRecientes = corridas.filter(c => Date.parse(c.iniciado_at) >= desde).flatMap(c => c.pasos || [])
  const todosLosPasos = corridas.flatMap(c => (c.pasos || []).map(p => ({ ...p, corrida: c })))
  const ultimoDe = agente => todosLosPasos.filter(p => p.agente === agente).sort((a, b) => b.at.localeCompare(a.at))[0]
  const proxima = proximaCorrida(ahora)
  const ultima = corridas[0]

  return (
    <>
      <div className="up-enc">
        <div className="up-antetitulo">Agentes · la redacción de UP</div>
        <h2 className="up-titular-1">
          {enCurso ? `Los agentes están trabajando en el ${fechaLarga(enCurso.fecha).toLowerCase()}`
            : ultima ? `Último turno ${haceCuanto(ultima.iniciado_at, ahora)}: ${ESTADO_CORRIDA[ultima.estado].toLowerCase()}`
              : 'Los agentes todavía no trabajaron'}
        </h2>
        <p className="up-bajada">
          {proxima && <>Próxima corrida: {cuandoEs(proxima, ahora)} a las {hora(proxima.toISOString())}. </>}
          Corren cada mañana entre las 06:02 y las 07:52, cada 10 minutos, con Gemini (cuota gratuita compartida con BS67).
        </p>
      </div>

      <section className="up-redaccion">
        {AGENTES.map(a => {
          const ultimo = ultimoDe(a.id)
          const r = resumen(a.id, pasosRecientes)
          const trabajando = enCurso && (enCurso.pasos || []).at(-1)?.agente === a.id
          return (
            <article key={a.id} className={`up-agente${a.fase ? ' futuro' : ''}`}>
              <div className="up-vol">{a.fase ? `Fase ${a.fase}` : trabajando ? 'Trabajando ahora' : ultimo ? 'Listo' : 'Esperando'}{trabajando && <span className="up-latido" aria-hidden="true" />}</div>
              <h3 className="up-titular-3">{a.nombre}</h3>
              <p className="up-agente-rol">{a.rol}</p>
              {r && <div className="up-cifra">{r.cifra}<span>{r.texto} · {DIAS_RESUMEN} días</span></div>}
              {r?.extra && <p className="up-agente-extra">{r.extra}</p>}
              {!a.fase && <p className="up-agente-ultimo">{ultimo ? <><b>{ultimo.accion}</b> {haceCuanto(ultimo.at, ahora)}</> : 'Sin trabajo todavía.'}</p>}
              {a.fase && <p className="up-agente-ultimo">Se suma cuando lleguemos a la fase {a.fase}.</p>}
            </article>
          )
        })}
      </section>

      <section className="up-bloque">
        <div className="up-vol up-vol-grande">Registro de corridas<span>{corridas.length} {corridas.length === 1 ? 'corrida' : 'corridas'}</span></div>
        {corridas.length === 0
          ? <p className="up-vacio">Cuando los agentes trabajen, acá vas a ver cada paso: qué datos eligieron, qué escribieron y qué marcó el revisor.</p>
          : <ul className="up-corridas">{corridas.map(c => <Corrida key={c.id} corrida={c} abierta={abierta === c.id || (abierta === null && c === enCurso)} alternar={() => setAbierta(abierta === c.id ? '' : c.id)} />)}</ul>}
      </section>
    </>
  )
}
