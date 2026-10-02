import { sites as SITIOS_DEFECTO } from '../maria-agent/checks.mjs'

export const TRABAJADOR = 'monitor_sitios'

// Los sitios salen de trabajadores.parametros.sitios: [{ nombre, url, extras? }]. Solo http(s).
export function leerSitios(parametros) {
  const lista = Array.isArray(parametros?.sitios) ? parametros.sitios : SITIOS_DEFECTO
  return lista
    .filter(s => s && typeof s.nombre === 'string' && s.nombre.trim() && typeof s.url === 'string' && /^https?:\/\//i.test(s.url))
    .map(s => ({ nombre: s.nombre.trim(), url: s.url, ...(s.extras ? { extras: true } : {}) }))
}

// El trabajador no juzga: copia lo que encontró. Que un sitio esté caído es un resultado, no una falla de la corrida.
export function resultadoSitios(monitoreo) {
  return { estado: 'ok', cantidad: monitoreo?.resumen?.sitios ?? 0, payload: monitoreo }
}
