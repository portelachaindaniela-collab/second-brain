import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { asegurarSemilla } from './datos.js'
import Tablero from './Tablero.jsx'
import Cuentas from './Cuentas.jsx'
import Marketing from './Marketing.jsx'
import Manual from './Manual.jsx'

const PANTALLAS = [
  { id: 'tablero', label: 'Tablero' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'marketing', label: 'Marketing y archivo' },
  { id: 'manual', label: 'Manual' },
]

// PDG comercial: el departamento de ventas y marketing de Point Data Global dentro de Second Brain.
export default function PdgApp({ email, volver }) {
  const [pantalla, setPantalla] = useState('tablero')
  const [cuentas, setCuentas] = useState(null)
  const [trabajos, setTrabajos] = useState([])
  const [agentes, setAgentes] = useState([])
  const [abrirId, setAbrirId] = useState(null)
  const [error, setError] = useState('')

  const recargar = useCallback(async () => {
    const [c, t, a] = await Promise.all([
      supabase.from('pdg_cuentas').select('*').order('updated_at', { ascending: false }),
      supabase.from('pdg_trabajos').select('*').order('created_at', { ascending: false }).limit(80),
      supabase.from('pdg_agentes').select('clave,nombre,rol,instrucciones,orden').order('orden'),
    ])
    const e = c.error || t.error || a.error
    if (e) { setError('No se pudo cargar: ' + e.message); return }
    setCuentas(c.data); setTrabajos(t.data); setAgentes(a.data)
  }, [])

  useEffect(() => {
    asegurarSemilla().then(recargar).catch(e => setError('No se pudo preparar el departamento: ' + e.message))
  }, [recargar])

  function irA(id) { setAbrirId(null); setPantalla(id) }
  function abrirCuenta(id) { setAbrirId(id); setPantalla('cuentas') }

  return (
    <div className="pdg">
      <header className="pdg-top">
        <div className="pdg-top-in">
          <button className="pdg-logo" onClick={() => irA('tablero')}><span className="pdg-marca">pdg</span><span>pointdataglobal <em>comercial</em></span></button>
          <nav className="pdg-nav">
            {PANTALLAS.map(p => <button key={p.id} className={pantalla === p.id ? 'on' : ''} onClick={() => irA(p.id)}>{p.label}</button>)}
          </nav>
          <span className="pdg-sp" />
          <span className="pdg-email">{email}</span>
          <button className="pdg-salir" onClick={volver}>‹ Inicio</button>
        </div>
      </header>
      <main className="pdg-main">
        {error && <p role="alert" className="pdg-error">{error}</p>}
        {!cuentas ? (!error && <p className="pdg-vacio">Cargando…</p>) : (
          <>
            {pantalla === 'tablero' && <Tablero cuentas={cuentas} trabajos={trabajos} agentes={agentes} abrirCuenta={abrirCuenta} irA={irA} recargar={recargar} />}
            {pantalla === 'cuentas' && <Cuentas cuentas={cuentas} agentes={agentes} recargar={recargar} abrirId={abrirId} setAbrirId={setAbrirId} />}
            {pantalla === 'marketing' && <Marketing agentes={agentes} trabajos={trabajos} cuentas={cuentas} recargar={recargar} />}
            {pantalla === 'manual' && <Manual agentes={agentes} recargar={recargar} />}
          </>
        )}
      </main>
    </div>
  )
}
