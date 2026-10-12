import { supabase } from '../supabase.js'
import { leerAgenteMd, primerDiaLibre, partirIdea, hoyISO } from './comercial.mjs'
import manualMd from '../../sales-system-pdg/00_context_pdg.md?raw'
import a1 from '../../sales-system-pdg/agent_01_prospector.md?raw'
import a2 from '../../sales-system-pdg/agent_02_demo_prep.md?raw'
import a3 from '../../sales-system-pdg/agent_03_battlecards.md?raw'
import a4 from '../../sales-system-pdg/agent_04_proposal_builder.md?raw'
import a5 from '../../sales-system-pdg/agent_05_marketing.md?raw'

export const AGENTES_POR_DEFECTO = [
  leerAgenteMd('prospector', a1, 1), leerAgenteMd('demo', a2, 2), leerAgenteMd('objeciones', a3, 3),
  leerAgenteMd('propuesta', a4, 4), leerAgenteMd('marketing', a5, 5),
]
export const MANUAL_POR_DEFECTO = manualMd.trim()

// La primera vez que se abre, carga el manual y los agentes de sales-system-pdg. Después manda lo editado en la app.
export async function asegurarSemilla() {
  const [m, a] = await Promise.all([
    supabase.from('pdg_manual').select('owner_id').maybeSingle(),
    supabase.from('pdg_agentes').select('clave'),
  ])
  if (m.error) throw m.error
  if (a.error) throw a.error
  if (!m.data) {
    const { error } = await supabase.from('pdg_manual').insert({ texto: MANUAL_POR_DEFECTO })
    if (error) throw error
  }
  const tiene = new Set((a.data || []).map(x => x.clave))
  const faltan = AGENTES_POR_DEFECTO.filter(x => !tiene.has(x.clave))
  if (faltan.length) {
    const { error } = await supabase.from('pdg_agentes').insert(faltan)
    if (error) throw error
  }
}

export async function correrAgente(agente, cuenta_id, pedido) {
  const { data, error } = await supabase.functions.invoke('pdg-agente', { body: { agente, cuenta_id, pedido } })
  let r = data
  if (error?.context) { try { r = await error.context.json() } catch { /* queda el error genérico */ } }
  if (error || r?.error) throw new Error(r?.error || 'El agente no pudo trabajar.')
  return r
}

// Manda una idea de marketing al calendario de UP, en el primer día libre, dentro del plan "PDG".
export async function mandarAUp(linea) {
  const { idea } = partirIdea(linea)
  let { data: plan, error } = await supabase.from('up_planes').select('id').eq('nombre', 'PDG').maybeSingle()
  if (error) throw error
  if (!plan) {
    ({ data: plan, error } = await supabase.from('up_planes').insert({ nombre: 'PDG', color: '#6D3BFF', orden: 99 }).select('id').single())
    if (error) throw error
  }
  const hoy = hoyISO()
  const { data: dias, error: e2 } = await supabase.from('up_calendario').select('fecha').gt('fecha', hoy)
  if (e2) throw e2
  const fecha = primerDiaLibre((dias || []).map(d => d.fecha), hoy)
  const { error: e3 } = await supabase.from('up_calendario').insert({ fecha, tema_semana: 'Point Data Global', tema_dia: idea, redes: ['linkedin', 'x'], plan_id: plan.id })
  if (e3) throw e3
  return fecha
}
