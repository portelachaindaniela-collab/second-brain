import { useState } from 'react'
import { supabase } from '../supabase.js'
import { NOMBRE_RED } from './pipeline.js'
import { fechaLarga } from './fechas.js'
import { tablaDesdeTexto, tablaDesdeXlsx, diasDesdeTabla, clavePublicacion, PLANTILLA } from './importar.mjs'
import { colorLibre } from './planes.mjs'

const sinTildes = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function nombreDesdeArchivo(nombre) {
  return nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60)
}

// Importar un calendario armado afuera (una planilla, un CSV o una tabla de un chat o un doc) como días de UP.
export default function Importar({ planes, dias, hoy, cerrar, listo }) {
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState('')
  const [resultado, setResultado] = useState(null) // { dias, errores }
  const [destino, setDestino] = useState('nuevo') // 'nuevo' | id de un plan
  const [nombrePlan, setNombrePlan] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')

  const yaCargadas = new Set(dias.map(clavePublicacion))
  const ocupados = new Set(dias.map(d => d.fecha))
  const conPlanPropio = resultado?.dias.some(d => d.plan)

  function analizar(tabla, nombre) {
    const r = diasDesdeTabla(tabla, hoy)
    setResultado(r); setAviso('')
    if (!nombrePlan) setNombrePlan(nombre || `Calendario importado ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })}`)
  }

  async function subir(file) {
    if (!file) return
    setArchivo(file.name); setAviso('')
    try {
      if (/\.xlsx$/i.test(file.name)) analizar(await tablaDesdeXlsx(await file.arrayBuffer()), nombreDesdeArchivo(file.name))
      else if (/\.(csv|tsv|txt|md)$/i.test(file.name) || file.type.startsWith('text/')) analizar(tablaDesdeTexto(await file.text()), nombreDesdeArchivo(file.name))
      else setAviso('Ese tipo de archivo no lo puedo leer. Usá .xlsx, .csv, .tsv, .txt o .md (o pegá la tabla).')
    } catch (e) { setAviso(e.message || 'No pude leer el archivo.') }
  }

  function bajarPlantilla() {
    const url = URL.createObjectURL(new Blob(['﻿' + PLANTILLA], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'plantilla-calendario-up.csv' })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Qué pasa con cada fila: entra nueva (sola o sumada a otras de ese día) o se saltea si ya está cargada igual.
  function destinoDe(d) {
    if (yaCargadas.has(clavePublicacion(d))) return 'repetida'
    return ocupados.has(d.fecha) ? 'suma' : 'nuevo'
  }
  const ETIQUETA = { nuevo: 'Nueva', suma: 'Nueva · se suma a ese día', repetida: 'Ya está cargada: se saltea' }
  const aImportar = resultado ? resultado.dias.filter(d => destinoDe(d) !== 'repetida') : []

  async function importar() {
    if (destino === 'nuevo' && !nombrePlan.trim() && !conPlanPropio) { setAviso('Poné un nombre para el plan nuevo.'); return }
    setOcupado(true); setAviso('')
    try {
      // Los planes: el elegido, o por nombre si la planilla trae columna "plan" (los que no existen se crean).
      const todos = [...planes]
      async function planPorNombre(nombre) {
        const ya = todos.find(p => sinTildes(p.nombre) === sinTildes(nombre))
        if (ya) return ya.id
        const { data, error } = await supabase.from('up_planes').insert({ nombre, color: colorLibre(todos), orden: Math.max(0, ...todos.map(p => p.orden + 1)) }).select('id,nombre,color,orden').single()
        if (error) throw new Error('No se pudo crear el plan: ' + error.message)
        todos.push(data)
        return data.id
      }
      const elegido = destino === 'nuevo' ? (aImportar.some(d => !d.plan) ? await planPorNombre(nombrePlan.trim()) : null) : destino
      const filas = []
      for (const d of aImportar) {
        filas.push({
          fecha: d.fecha, tema_dia: d.tema_dia, tema_semana: d.tema_semana || 'Sin semana', redes: d.redes,
          formato_instagram: d.formato_instagram, tema_instagram: d.tema_instagram, fotos_propias: false, salteado: false,
          plan_id: d.plan ? await planPorNombre(d.plan) : elegido,
        })
      }
      const { error } = await supabase.from('up_calendario').insert(filas)
      if (error) throw new Error(error.message)
      const repetidas = resultado.dias.length - aImportar.length
      listo(`Importé ${filas.length} ${filas.length === 1 ? 'publicación' : 'publicaciones'}.${repetidas ? ` ${repetidas} ya estaban cargadas y no se duplicaron.` : ''}${resultado.errores.length ? ` ${resultado.errores.length} filas tenían problemas y no entraron.` : ''}`, filas[0]?.fecha)
    } catch (e) {
      setAviso(e.message || 'No se pudo importar.')
      setOcupado(false)
    }
  }

  return (
    <section className="up-importar" aria-label="Importar calendario">
      <div className="up-vol up-vol-grande">Importar un calendario<span><button className="up-link" onClick={cerrar}>Cerrar</button></span></div>

      {!resultado ? (
        <>
          <p className="up-importar-intro">Subí la planilla o pegá la tabla del plan que armaste (en Sheets, Excel, un doc o un chat). Cada fila es un día; la primera fila tiene los títulos.</p>
          <div className="up-importar-entradas">
            <label className="up-importar-caja"
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); subir(e.dataTransfer.files?.[0]) }}>
              <input type="file" accept=".xlsx,.csv,.tsv,.txt,.md,text/csv,text/plain" onChange={e => { subir(e.target.files?.[0]); e.target.value = '' }} />
              <strong>Elegí un archivo</strong>
              <span>o arrastralo acá · Excel (.xlsx), CSV o texto</span>
              {archivo && <small>{archivo}</small>}
            </label>
            <div className="up-importar-pegar">
              <textarea className="up-editor" rows={7} value={texto} onChange={e => setTexto(e.target.value)} placeholder={'O pegá la tabla acá (copiada de Sheets, Excel o un doc):\n\nfecha\tidea\tredes\n3/11\tQué aprendí en ReporTV\tlinkedin, x'} aria-label="Pegar la tabla" />
              <button className="up-btn up-btn-p" disabled={!texto.trim()} onClick={() => analizar(tablaDesdeTexto(texto), '')}>Leer la tabla</button>
            </div>
          </div>
          <div className="up-importar-ayuda">
            <p><b>Columnas:</b> <code>fecha</code> e <code>idea</code> son obligatorias. Opcionales: <code>semana</code> (tema de la semana), <code>redes</code> (LinkedIn, X, Instagram o «todas»; si no está, LinkedIn y X), <code>instagram</code> (carrusel o reel), <code>tema_instagram</code> y <code>plan</code> (para repartir los días en varios planes).</p>
            <p>Fechas como 2026-11-03, 3/11/2026, 3/11 o «lunes 3 de noviembre». Los títulos pueden variar («Tema del día», «Día», «Formato IG»…).</p>
            <button className="up-link" onClick={bajarPlantilla}>Bajar plantilla (CSV)</button>
          </div>
        </>
      ) : (
        <>
          <p className="up-importar-intro">
            {archivo ? <b>{archivo}: </b> : null}{resultado.dias.length} {resultado.dias.length === 1 ? 'publicación lista' : 'publicaciones listas'}
            {resultado.errores.length > 0 && <>, {resultado.errores.length} {resultado.errores.length === 1 ? 'fila con problemas' : 'filas con problemas'}</>}.
            {' '}<button className="up-link" onClick={() => { setResultado(null); setArchivo(''); setNombrePlan('') }}>Elegir otro</button>
          </p>

          {resultado.errores.length > 0 && (
            <ul className="up-importar-errores">
              {resultado.errores.map(e => <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>)}
            </ul>
          )}

          {resultado.dias.length > 0 && (
            <>
              <div className="up-importar-opciones">
                <fieldset className="up-campo-l">
                  <legend>{conPlanPropio ? 'Plan para las filas sin plan' : '¿En qué plan?'}</legend>
                  <select className="up-campo" value={destino} onChange={e => setDestino(e.target.value)}>
                    <option value="nuevo">Plan nuevo…</option>
                    {planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  {destino === 'nuevo' && <input className="up-campo" value={nombrePlan} onChange={e => setNombrePlan(e.target.value)} placeholder="Nombre del plan nuevo" aria-label="Nombre del plan nuevo" maxLength={60} />}
                </fieldset>
              </div>

              <div className="up-importar-tabla" role="table" aria-label="Días a importar">
                {resultado.dias.map(d => {
                  const que = destinoDe(d)
                  return (
                    <div key={d.fila} role="row" className={`up-importar-fila i-${que}`}>
                      <span role="cell" className="up-importar-fecha">{fechaLarga(d.fecha)}</span>
                      <span role="cell" className="up-importar-idea">{d.tema_dia}{(d.tema_semana || d.plan) && <small>{[d.plan && `Plan «${d.plan}»`, d.tema_semana].filter(Boolean).join(' · ')}</small>}</span>
                      <span role="cell" className="up-importar-redes">{d.redes.map(r => NOMBRE_RED[r]).join(', ')}{d.redes.includes('instagram') ? ` (${d.formato_instagram})` : ''}</span>
                      <span role="cell" className="up-importar-que">{ETIQUETA[que]}{d.fecha < hoy && que !== 'repetida' ? ' · ya pasó' : ''}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {aviso && <p role="alert" className="up-error">{aviso}</p>}
          <div className="up-acciones">
            <button className="up-btn" disabled={ocupado} onClick={cerrar}>Cancelar</button>
            <button className="up-btn up-btn-p" disabled={ocupado || !aImportar.length} onClick={importar}>
              {ocupado ? 'Importando…' : aImportar.length ? `Importar ${aImportar.length} ${aImportar.length === 1 ? 'publicación' : 'publicaciones'}` : 'No hay nada nuevo para importar'}
            </button>
          </div>
        </>
      )}
      {!resultado && aviso && <p role="alert" className="up-error">{aviso}</p>}
    </section>
  )
}
