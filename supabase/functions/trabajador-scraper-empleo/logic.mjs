export const TRABAJADOR = 'scraper_empleo';
export const URL_ULTIMA_CORRIDA = 'https://portelachaindaniela-collab.github.io/scraper-busquedas-laborales/ultima_corrida.json';

// El trabajador no juzga si la corrida está vieja ni si fallaron portales: solo copia los datos.
// Eso lo evalúa quien lee la tabla.
export function extraerResultado(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('El reporte del scraper no es un objeto JSON.');
  const fin = typeof datos.fin === 'string' ? datos.fin : null;
  const inicio = typeof datos.inicio === 'string' ? datos.inicio : null;
  if (!fin && !inicio) throw new Error('El reporte del scraper no tiene fecha de corrida.');
  const numero = (v) => (Number.isFinite(v) ? v : null);
  const publicados = numero(datos.publicados);
  const nuevosTotales = numero(datos.nuevos_totales);
  return {
    cantidad: publicados ?? nuevosTotales ?? 0,
    payload: {
      inicio,
      fin,
      publicados,
      nuevos_totales: nuevosTotales,
      portales: datos.portales && typeof datos.portales === 'object' ? datos.portales : null,
    },
  };
}

export function horasDesde(fecha, ahora = Date.now()) {
  if (typeof fecha !== 'string') return Infinity;
  const ms = Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(fecha) ? fecha : fecha + 'Z');
  return Number.isFinite(ms) ? (ahora - ms) / 3600_000 : Infinity;
}
