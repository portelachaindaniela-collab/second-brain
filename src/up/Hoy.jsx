import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso, partesFecha, fechaLarga } from './fechas.js'
import { correrPipeline, ESTADOS, NOMBRE_RED, REDES_AUTOMATICAS, estadoVisible } from './pipeline.js'
import { conResaltados } from './resaltar.jsx'

const CAMPOS_PIEZA = 'id,fecha,red,texto,estado,pregunta,motivo_revision,problemas,intentos_revision,assets,assets_texto,url_publicada,error_publicacion,formato:contenido->>formato'

// Las placas del carrusel. El diseñador las arma con la plantilla cada 15 minutos; si el texto cambió, las vuelve a armar.
function Placas({ pieza }) {
  if (pieza.formato !== 'carrusel' || !pieza.texto) return null
  if (pieza.assets_texto !== pieza.texto) return <p className="up-aviso-nota">El diseñador está armando las placas con este texto. Volvé a esta pantalla en unos minutos para verlas.</p>
  if (!pieza.assets?.length) return <p className="up-aviso-nota up-aviso-error">El diseñador no encontró placas en el texto. Cada una tiene que empezar con «Placa 1.», «Placa 2.»…</p>
  return (
    <div className="up-placas">
      {pieza.assets.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Placa ${i + 1} de ${pieza.assets.length}`} loading="lazy" /></a>)}
    </div>
  )
}

// Qué pasa con una pieza aprobada: si sale sola y cuándo, o qué falta para que salga.
function cuandoSale(red, pieza, envio) {
  if (!REDES_AUTOMATICAS.includes(red)) return `La publicación automática en ${NOMBRE_RED[red]} llega más adelante: publicalo vos y tocá Publicado.`
  if (pieza.fecha !== hoyIso()) return 'Ese día ya pasó, así que no sale solo: publicalo vos y tocá Publicado.'
  if (!envio?.conectada) return `Para que salga solo, conectá ${NOMBRE_RED[red]} en Redes.`
  if (!envio.hora) return `Para que salga solo, elegí un horario para ${NOMBRE_RED[red]} en Redes.`
  return `Sale solo hoy a las ${envio.hora} en ${NOMBRE_RED[red]}.`
}

// Una pieza del día con sus acciones: editar el texto, aprobar y marcar como publicada.
function Pieza({ red, pieza, principal, titulo, guardar, envio }) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [ocupada, setOcupada] = useState(false)
  const texto = pieza?.texto || ''
  // Con las placas armadas, el texto de cada placa ya se lee en las imágenes: abajo va solo el caption.
  const placasListas = pieza?.formato === 'carrusel' && pieza.assets?.length > 0 && pieza.assets_texto === texto && !pieza.problemas?.length
  const parrafos = (placasListas ? texto.split(/^Caption:[ \t]*$/m)[1] || '' : texto).split(/\n{2,}/).filter(Boolean)

  async function cambiar(cambios) {
    setOcupada(true)
    const ok = await guardar(pieza.id, cambios)
    setOcupada(false)
    if (ok) setEditando(false)
  }

  return (
    <article className={principal ? 'up-nota up-nota-principal' : 'up-nota'}>
      <div className="up-vol"><LogoRed red={red} />{NOMBRE_RED[red]}{pieza && <span className={`up-estado e-${estadoVisible(pieza)}`}>{ESTADOS[estadoVisible(pieza)]}</span>}</div>
      {titulo && (principal ? <h2 className="up-titular-1">{titulo}</h2> : <h3 className="up-titular-3">{titulo}</h3>)}
      {pieza?.estado === 'falta_info' && pieza.pregunta && <p className="up-aviso-nota"><b>Falta un dato.</b> {pieza.pregunta}</p>}
      {pieza?.estado === 'error' && <p className="up-aviso-nota up-aviso-error"><b>No se pudo generar.</b> {pieza.motivo_revision}</p>}
      {pieza?.error_publicacion && <p className="up-aviso-nota up-aviso-error"><b>No se pudo publicar.</b> {pieza.error_publicacion}</p>}
      {pieza?.estado === 'aprobado' && !pieza.error_publicacion && <p className="up-aviso-nota up-aviso-ok">{cuandoSale(red, pieza, envio)}</p>}
      {pieza?.estado === 'publicado' && pieza.url_publicada && <p className="up-aviso-nota up-aviso-ok">Publicado. <a href={pieza.url_publicada} target="_blank" rel="noreferrer">Ver en {NOMBRE_RED[red]}</a></p>}
      {pieza?.estado === 'revision' && pieza.motivo_revision && (
        <div className="up-aviso-nota"><b>El revisor marcó{pieza.intentos_revision ? ` (después de ${pieza.intentos_revision} ${pieza.intentos_revision === 1 ? 'corrección' : 'correcciones'})` : ''}:</b>
          <ul>{pieza.motivo_revision.split('\n').map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {pieza && !editando && <Placas pieza={pieza} />}
      {editando ? (
        <textarea className="up-editor" value={borrador} onChange={e => setBorrador(e.target.value)} rows={Math.max(8, borrador.split('\n').length + 2)} aria-label={`Texto de ${NOMBRE_RED[red]}`} />
      ) : parrafos.length > 0 ? (
        <div className={principal ? 'up-cuerpo-nota capital' : 'up-cuerpo-nota'}>{parrafos.map((p, i) => <p key={i}>{conResaltados(p, pieza.problemas)}</p>)}</div>
      ) : pieza?.estado !== 'falta_info' && pieza?.estado !== 'error' && (
        <p className="up-vacio">Todavía no hay borrador para {NOMBRE_RED[red]}. Los agentes lo escriben cada mañana.</p>
      )}
      {pieza && (texto || editando) && pieza.estado !== 'publicado' && (
        <div className="up-acciones">
          {editando ? (
            <>
              <button className="up-btn" disabled={ocupada} onClick={() => setEditando(false)}>Cancelar</button>
              <button className="up-btn up-btn-p" disabled={ocupada || !borrador.trim()} onClick={() => cambiar({ texto: borrador.trim(), estado: pieza.estado === 'aprobado' ? 'aprobado' : 'pendiente', problemas: null, motivo_revision: null, error_publicacion: null })}>Guardar</button>
            </>
          ) : (
            <>
              <button className="up-btn" disabled={ocupada} onClick={() => { setBorrador(texto); setEditando(true) }}>Editar</button>
              {pieza.estado === 'aprobado'
                ? <button className={pieza.error_publicacion ? 'up-btn' : 'up-btn up-btn-p'} disabled={ocupada} onClick={() => cambiar({ estado: 'publicado', error_publicacion: null })}>Publicado</button>
                : <button className="up-btn up-btn-p" disabled={ocupada} onClick={() => cambiar({ estado: 'aprobado' })}>Aprobar</button>}
              {pieza.error_publicacion && <button className="up-btn up-btn-p" disabled={ocupada} onClick={() => cambiar({ error_publicacion: null })}>Reintentar</button>}
            </>
          )}
        </div>
      )}
    </article>
  )
}

export default function Hoy({ abrirCalendario, abrirPreguntas, alCambiar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [generando, setGenerando] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    const hoy = hoyIso()
    const [cal, pie, hor, con] = await Promise.all([
      supabase.from('up_calendario').select('id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias').order('fecha'),
      supabase.from('up_piezas').select(CAMPOS_PIEZA).or(`fecha.eq.${hoy},estado.eq.falta_info`),
      supabase.from('up_horarios').select('red,hora'),
      supabase.rpc('up_mis_conexiones'),
    ])
    if (cal.error || pie.error) { setError('No se pudo cargar el día: ' + (cal.error || pie.error).message); return }
    // Para cada red: si está conectada y a qué hora sale lo aprobado (lo configura la pantalla Redes).
    const envio = {}
    for (const red of REDES_AUTOMATICAS) {
      envio[red] = { conectada: (con.data || []).some(c => c.red === red), hora: (hor.data || []).find(h => h.red === red)?.hora?.slice(0, 5) ?? null }
    }
    setDatos({ dias: cal.data || [], piezas: pie.data || [], envio })
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function guardar(id, cambios) {
    const { data, error } = await supabase.from('up_piezas').update(cambios).eq('id', id).select(CAMPOS_PIEZA).single()
    if (error) { setAviso('No se pudo guardar: ' + error.message); return false }
    setAviso('')
    setDatos(d => ({ ...d, piezas: d.piezas.map(p => (p.id === id ? data : p)) }))
    alCambiar?.()
    return true
  }

  // Corre los agentes para hoy. "Generar" completa lo que falta; "Volver a generar" reescribe lo que todavía no aprobaste.
  async function generar(regenerar) {
    setGenerando(true); setAviso('')
    const mensaje = await correrPipeline(hoyIso(), regenerar)
    setGenerando(false)
    setAviso(mensaje)
    await cargar()
    alCambiar?.()
  }

  if (error) return <p role="alert" className="up-error">{error}</p>
  if (!datos) return <p className="up-vacio">Cargando…</p>

  const hoy = hoyIso()
  const dia = datos.dias.find(d => d.fecha === hoy)
  const proximos = datos.dias.filter(d => d.fecha > hoy).slice(0, 4)
  const piezasHoy = datos.piezas.filter(p => p.fecha === hoy)
  const preguntas = datos.piezas.filter(p => p.estado === 'falta_info' && p.pregunta)
  const pasados = datos.dias.filter(d => d.fecha <= hoy).length
  const pieza = red => piezasHoy.find(p => p.red === red)

  return (
    <div className="up-portada">
      <div className="up-portada-principal">
        {dia ? (
          <>
            <div className="up-antetitulo up-antetitulo-acciones">{fechaLarga(hoy)} · Semana «{dia.tema_semana}»
              <button className="up-btn" disabled={generando} onClick={() => generar(piezasHoy.some(p => p.texto))}>{generando ? 'Generando…' : piezasHoy.some(p => p.texto) ? 'Volver a generar' : 'Generar borradores'}</button>
            </div>
            {aviso && <p role="alert" className="up-error">{aviso}</p>}
            <div className="up-portada-notas">
              <Pieza red="linkedin" principal titulo={dia.tema_dia} pieza={pieza('linkedin')} guardar={guardar} envio={datos.envio.linkedin} />
              <div className="up-portada-segunda">
                <Pieza red="x" pieza={pieza('x')} guardar={guardar} envio={datos.envio.x} />
                {dia.redes.includes('instagram') && dia.formato_instagram !== 'ninguno' && (
                  <Pieza red="instagram" titulo={dia.tema_instagram} pieza={pieza('instagram')} guardar={guardar} envio={datos.envio.instagram} />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="up-enc">
            <div className="up-antetitulo">{fechaLarga(hoy)}</div>
            <h2 className="up-titular-1">Hoy no hay publicación en el calendario</h2>
            {proximos[0] && <p className="up-bajada">La próxima es el {fechaLarga(proximos[0].fecha).toLowerCase()}: {proximos[0].tema_dia}.</p>}
          </div>
        )}
      </div>

      <aside className="up-portada-lateral">
        <section className="up-recuadro">
          <div className="up-vol">Necesito que me cuentes{preguntas.length > 0 && <button className="up-link" onClick={abrirPreguntas}>Responder</button>}</div>
          {preguntas.length === 0
            ? <p className="up-vacio">No hay preguntas pendientes.</p>
            : [...new Map(preguntas.map(p => [p.fecha, p])).values()].map(p => <p key={p.id} className="up-pregunta"><b>{fechaLarga(p.fecha)}.</b> {p.pregunta}</p>)}
        </section>
        <section className="up-recuadro">
          <div className="up-vol">Avance del calendario</div>
          <div className="up-cifra">{pasados}<span>de {datos.dias.length} días ya pasaron</span></div>
          <div className="up-barra"><i style={{ width: `${datos.dias.length ? Math.round(pasados * 100 / datos.dias.length) : 0}%` }} /></div>
        </section>
        <section className="up-recuadro">
          <div className="up-vol">Próximos días<button className="up-link" onClick={abrirCalendario}>Calendario</button></div>
          {proximos.length === 0 ? <p className="up-vacio">No hay más días cargados.</p> : proximos.map(d => {
            const f = partesFecha(d.fecha)
            return (
              <div key={d.id} className="up-breve">
                <div className="up-breve-fecha">{f.dia}<b>{f.numero}</b></div>
                <div>
                  <h4>{d.tema_dia}</h4>
                  <div className="up-breve-redes"><LogoRed red="linkedin" /><LogoRed red="x" /><LogoRed red="instagram" apagado={!d.redes.includes('instagram')} /></div>
                </div>
              </div>
            )
          })}
        </section>
      </aside>
    </div>
  )
}
