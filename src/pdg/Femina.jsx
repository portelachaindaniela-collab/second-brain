import { useState } from 'react'
import { supabase } from '../supabase.js'
import { NOMBRE_SEGMENTO } from './comercial.mjs'

const fecha = iso => new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const TIPO = { cambio_web: 'Cambio en su web', noticia: 'Noticia', prospecto: 'Prospecto' }

// Una novedad (cambio en la web o noticia) con su link y la opción de descartarla.
function Novedad({ h, cuenta, abrirCuenta, alCambiar }) {
  async function descartar() {
    await supabase.from('pdg_hallazgos').update({ estado: 'descartado' }).eq('id', h.id)
    alCambiar()
  }
  return (
    <li className="pdg-hallazgo">
      <div>
        <div className="pdg-rotulo">{TIPO[h.tipo]}{cuenta ? <> · {abrirCuenta ? <button className="pdg-link" onClick={() => abrirCuenta(h.cuenta_id)}>{cuenta}</button> : cuenta}</> : ''} · {fecha(h.created_at)}</div>
        <strong>{h.titulo}</strong>
        {h.detalle && <p>{h.detalle}</p>}
        {h.url && <a className="pdg-web" href={h.url} target="_blank" rel="noreferrer">Ver ↗</a>}
      </div>
      <button className="pdg-btn" onClick={descartar} title="No sirve: los agentes dejan de leerla">Descartar</button>
    </li>
  )
}

// Un prospecto que encontró Femina: se suma como cuenta (etapa Prospecto) o se descarta.
function Prospecto({ h, abrirCuenta, alCambiar }) {
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const d = h.datos || {}
  async function sumar() {
    setOcupado(true)
    const { data, error } = await supabase.from('pdg_cuentas').insert({
      nombre: d.nombre || h.titulo, segmento: d.segmento || 'otro', pais: d.pais || null, web: d.web || h.url || null,
      etapa: 'prospecto', notas: h.detalle ? `Sugerida por Femina: ${h.detalle}` : 'Sugerida por Femina.',
    }).select('id').single()
    if (error) { setAviso('No se pudo sumar: ' + error.message); setOcupado(false); return }
    await supabase.from('pdg_hallazgos').update({ estado: 'agregado', cuenta_id: data.id }).eq('id', h.id)
    await alCambiar()
    abrirCuenta?.(data.id)
  }
  async function descartar() {
    setOcupado(true)
    await supabase.from('pdg_hallazgos').update({ estado: 'descartado' }).eq('id', h.id)
    alCambiar()
  }
  return (
    <li className="pdg-hallazgo">
      <div>
        <div className="pdg-rotulo">{NOMBRE_SEGMENTO[d.segmento] || 'Otro'}{d.pais ? ` · ${d.pais}` : ''}</div>
        <strong>{h.titulo}</strong>
        {h.detalle && <p>{h.detalle}</p>}
        {h.url && <a className="pdg-web" href={h.url} target="_blank" rel="noreferrer">{h.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} ↗</a>}
        {aviso && <p role="alert" className="pdg-error">{aviso}</p>}
      </div>
      <div className="pdg-hallazgo-acc">
        <button className="pdg-btn pdg-btn-p" disabled={ocupado} onClick={sumar}>Sumar a cuentas</button>
        <button className="pdg-btn" disabled={ocupado} onClick={descartar}>Descartar</button>
      </div>
    </li>
  )
}

function estadoCorrida(c) {
  if (!c) return 'Todavía no salió a buscar. Sale sola todos los días a las 8:23.'
  if (c.estado === 'corriendo') return `Está buscando desde las ${new Date(c.iniciada_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}…`
  if (c.estado === 'error') return `La última vez (${fecha(c.iniciada_at)}) no pudo terminar: ${c.error}`
  const r = c.resumen || {}
  const partes = [`Última vuelta: ${fecha(c.iniciada_at)}`, `miró ${r.webs?.miradas ?? 0} webs`]
  if (r.prospectos != null) partes.push(`buscó prospectos (${r.prospectos})`)
  if (r.noticias_de?.length) partes.push(`noticias de ${r.noticias_de.join(', ')}`)
  partes.push(`${r.nuevos ?? 0} ${r.nuevos === 1 ? 'novedad' : 'novedades'}`)
  return partes.join(' · ') + (r.errores?.length ? `. Avisos: ${r.errores.join(' · ')}` : '')
}

// Bloque de Femina en el Tablero: prospectos para revisar y novedades de las cuentas.
export default function Femina({ hallazgos, corrida, cuentas, abrirCuenta, recargar }) {
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState('')
  const nombre = Object.fromEntries(cuentas.map(c => [c.id, c.nombre]))
  const prospectos = hallazgos.filter(h => h.tipo === 'prospecto' && h.estado === 'nuevo')
  const novedades = hallazgos.filter(h => h.tipo !== 'prospecto' && h.estado === 'nuevo').slice(0, 8)

  async function buscarAhora() {
    setBuscando(true); setAviso('')
    const { data, error } = await supabase.functions.invoke('pdg-femina', { body: {} })
    let r = data
    if (error?.context) { try { r = await error.context.json() } catch { /* queda el genérico */ } }
    if (error || r?.error) setAviso(r?.error || 'Femina no pudo salir a buscar.')
    setBuscando(false)
    recargar()
  }

  return (
    <section className="pdg-seccion pdg-femina">
      <div className="pdg-femina-cab">
        <h3 className="pdg-h3">Femina encontró</h3>
        <button className="pdg-btn" disabled={buscando || corrida?.estado === 'corriendo'} onClick={buscarAhora}>{buscando ? 'Buscando… (puede tardar 2 minutos)' : 'Buscar ahora'}</button>
      </div>
      <p className="pdg-nota">{estadoCorrida(corrida)}</p>
      {aviso && <p role="alert" className="pdg-error">{aviso}</p>}
      <div className="pdg-dos">
        <div>
          <div className="pdg-rotulo">Prospectos para revisar {prospectos.length > 0 && <span>· {prospectos.length}</span>}</div>
          {prospectos.length === 0 ? <p className="pdg-vacio">Nada para revisar. Busca prospectos nuevos una vez por semana.</p>
            : <ul className="pdg-hallazgos">{prospectos.map(h => <Prospecto key={h.id} h={h} abrirCuenta={abrirCuenta} alCambiar={recargar} />)}</ul>}
        </div>
        <div>
          <div className="pdg-rotulo">Novedades de tus cuentas</div>
          {novedades.length === 0 ? <p className="pdg-vacio">Sin novedades. Mira las webs y las noticias de tus cuentas todos los días.</p>
            : <ul className="pdg-hallazgos">{novedades.map(h => <Novedad key={h.id} h={h} cuenta={nombre[h.cuenta_id]} abrirCuenta={abrirCuenta} alCambiar={recargar} />)}</ul>}
        </div>
      </div>
    </section>
  )
}

// En la ficha de una cuenta: lo que Femina encontró de ella (lo leen Prospector, Objeciones y los demás).
export function NovedadesCuenta({ hallazgos, cuentaId, recargar }) {
  const suyas = hallazgos.filter(h => h.cuenta_id === cuentaId && h.tipo !== 'prospecto' && h.estado !== 'descartado')
  if (!suyas.length) return null
  return (
    <section className="pdg-seccion">
      <h3 className="pdg-h3">Novedades de Femina <span>{suyas.length}</span></h3>
      <p className="pdg-nota">Los agentes las leen cuando trabajan con esta cuenta. Descartá las que no sirvan.</p>
      <ul className="pdg-hallazgos">{suyas.map(h => <Novedad key={h.id} h={h} alCambiar={recargar} />)}</ul>
    </section>
  )
}
