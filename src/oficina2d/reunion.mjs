// Lo que usan las reuniones y no depende del dibujo (antes vivía en el plano 3D).
export const MAX_ASISTENTES = 24 // los que entran en la sala
export const MAX_OFICINA = 5 // los que entran en tu mesa de reuniones
export const ESPERA_TURNOS = 11 // lugares en la sala de espera (reunión por turnos)
export const PLAZO_REUNION_S = 120 // a los 2 minutos de convocar, la reunión arranca con los que llegaron

// La voz de cada agente en las reuniones (tono y velocidad): fija, sale de su id.
export function vozDe(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { tono: 0.8 + ((h >>> 3) % 5) * 0.12, ritmo: 1.0 + ((h >>> 7) % 3) * 0.05 }
}
