import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { LogoRed } from './logos.jsx'
import { hoyIso, partesFecha, fechaLarga } from './fechas.js'

const ESTADOS = { pendiente: 'Pendiente', falta_info: 'Falta info', revision: 'En revisión', aprobado: 'Aprobado', publicado: 'Publicado', error: 'Error' }
const NOMBRE_RED = { linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram' }

// Marca en el texto los fragmentos que el revisor señaló.
function conResaltados(texto, problemas) {
  const fragmentos = (problemas || []).map(p => p.fragmento).filter(f => f && texto.includes(f))
  if (!fragmentos.length) return texto
  const partes = texto.split(new RegExp(`(${fragmentos.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`))
  return partes.map((parte, i) => (fragmentos.includes(parte) ? <mark key={i}>{parte}</mark> : parte))
}

// Una pieza del día con sus acciones: editar el texto, aprobar y marcar como publicada.
function Pieza({ red, pieza, principal, titulo, guardar }) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [ocupada, setOcupada] = useState(false)
  const texto = pieza?.texto || ''
  const parrafos = texto.split(/\n{2,}/).filter(Boolean)

  async function cambiar(cambios) {
    setOcupada(true)
    const ok = await guardar(pieza.id, cambios)
    setOcupada(false)
    if (ok) setEditando(false)
  }

  return (
    <article className={principal ? 'up-nota up-nota-principal' : 'up-nota'}>
      <div className="up-vol"><LogoRed red={red} />{NOMBRE_RED[red]}{pieza && <span className={`up-estado e-${pieza.estado}`}>{ESTADOS[pieza.estado]}</span>}</div>
      {titulo && (principal ? <h2 className="up-titular-1">{titulo}</h2> : <h3 className="up-titular-3">{titulo}</h3>)}
      {pieza?.estado === 'falta_info' && pieza.pregunta && <p className="up-aviso-nota"><b>Falta un dato.</b> {pieza.pregunta}</p>}
      {pieza?.estado === 'error' && <p className="up-aviso-nota up-aviso-error"><b>No se pudo generar.</b> {pieza.motivo_revision}</p>}
      {pieza?.estado === 'revision' && pieza.motivo_revision && (
        <div className="up-aviso-nota"><b>El revisor marcó{pieza.intentos_revision ? ` (después de ${pieza.intentos_revision} ${pieza.intentos_revision === 1 ? 'corrección' : 'correcciones'})` : ''}:</b>
          <ul>{pieza.motivo_revision.split('\n').map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
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
              <button className="up-btn up-btn-p" disabled={ocupada || !borrador.trim()} onClick={() => cambiar({ texto: borrador.trim(), estado: pieza.estado === 'aprobado' ? 'aprobado' : 'pendiente', problemas: null, motivo_revision: null })}>Guardar</button>
            </>
          ) : (
            <>
              <button className="up-btn" disabled={ocupada} onClick={() => { setBorrador(texto); setEditando(true) }}>Editar</button>
              {pieza.estado === 'aprobado'
                ? <button className="up-btn up-btn-p" disabled={ocupada} onClick={() => cambiar({ estado: 'publicado' })}>Publicado</button>
                : <button className="up-btn up-btn-p" disabled={ocupada} onClick={() => cambiar({ estado: 'aprobado' })}>Aprobar</button>}
            </>
          )}
        </div>
      )}
    </article>
  )
}

export default function Hoy({ abrirCalendario }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [generando, setGenerando] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    const hoy = hoyIso()
    const [cal, pie] = await Promise.all([
      supabase.from('up_calendario').select('id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,fotos_propias').order('fecha'),
      supabase.from('up_piezas').select('id,fecha,red,texto,estado,pregunta,motivo_revision,problemas,intentos_revision').or(`fecha.eq.${hoy},estado.eq.falta_info`),
    ])
    if (cal.error || pie.error) { setError('No se pudo cargar el día: ' + (cal.error || pie.error).message); return }
    setDatos({ dias: cal.data || [], piezas: pie.data || [] })
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function guardar(id, cambios) {
    const { data, error } = await supabase.from('up_piezas').update(cambios).eq('id', id).select('id,fecha,red,texto,estado,pregunta,motivo_revision,problemas,intentos_revision').single()
    if (error) { setAviso('No se pudo guardar: ' + error.message); return false }
    setAviso('')
    setDatos(d => ({ ...d, piezas: d.piezas.map(p => (p.id === id ? data : p)) }))
    return true
  }

  // Corre los agentes para hoy. "Generar" completa lo que falta; "Volver a generar" reescribe lo que todavía no aprobaste.
  async function generar(regenerar) {
    setGenerando(true); setAviso('')
    const { data, error } = await supabase.functions.invoke('up-pipeline', { body: { fecha: hoyIso(), regenerar } })
    let respuesta = data
    if (error?.context) { try { respuesta = await error.context.json() } catch { /* queda el error genérico */ } }
    setGenerando(false)
    if (error || respuesta?.error) setAviso(respuesta?.error || 'No se pudieron generar los borradores.')
    else if (respuesta?.cortado) setAviso(respuesta.mensaje)
    await cargar()
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
              <Pieza red="linkedin" principal titulo={dia.tema_dia} pieza={pieza('linkedin')} guardar={guardar} />
              <div className="up-portada-segunda">
                <Pieza red="x" pieza={pieza('x')} guardar={guardar} />
                {dia.redes.includes('instagram') && dia.formato_instagram !== 'ninguno' && (
                  <Pieza red="instagram" titulo={dia.tema_instagram} pieza={pieza('instagram')} guardar={guardar} />
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
          <div className="up-vol">Necesito que me cuentes</div>
          {preguntas.length === 0
            ? <p className="up-vacio">No hay preguntas pendientes.</p>
            : preguntas.map(p => <p key={p.id} className="up-pregunta"><b>{fechaLarga(p.fecha)}.</b> {p.pregunta}</p>)}
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
