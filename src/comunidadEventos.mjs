export const MARCA_COMUNIDAD = 'Importado automáticamente de la página Comunidad (danielaportelachain.netlify.app/comunidad/).'

export const EVENTOS_COMUNIDAD = [
  { title: 'OpenAI Codex Community Meetup Buenos Aires', location: 'Facultad de Ingeniería, UBA — Paseo Colón 850', starts_at: '2026-08-13', ends_at: '2026-08-14' },
  { title: 'Startup Day · UCEMA', location: 'UCEMA', starts_at: '2026-09-11', ends_at: '2026-09-12' },
  { title: 'Nerdearla 2026', location: 'Ciudad Cultural Konex', starts_at: '2026-09-22', ends_at: '2026-09-27' },
  { title: 'Olé Summit Argentina 2026', location: 'Usina del Arte', starts_at: '2026-09-29', ends_at: '2026-10-01' },
  { title: 'Media Party Buenos Aires 2026', location: 'Ciudad Cultural Konex', starts_at: '2026-10-29', ends_at: '2026-11-01' },
].map(e => ({ ...e, description: MARCA_COMUNIDAD }))

export function eventosPendientes(titulosExistentes, catalogo = EVENTOS_COMUNIDAD) {
  const titulos = new Set(titulosExistentes)
  return catalogo.filter(e => !titulos.has(e.title))
}
