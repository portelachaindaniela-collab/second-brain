// Quién es quién en la Oficina: lo que no está en la base (qué hace cada agente de UP y de PDG y con qué trabaja).
// Lo usan la pantalla Oficina (src/oficina.mjs) y la Edge Function oficina-chat, así los dos dicen lo mismo.
// Los trabajadores no están acá: su nombre y su descripción salen de la tabla `trabajadores`.

export const EQUIPOS = {
  trabajadores: { nombre: 'Trabajadores', descripcion: 'Corren solos en el servidor, cada uno con su horario.' },
  up: { nombre: 'UP', descripcion: 'Escriben, revisan, arman y publican los posts de UP.' },
  pdg: { nombre: 'PDG comercial', descripcion: 'Preparan la venta de Point Data Global, cuenta por cuenta.' },
}

// Agentes de UP, en el orden de la cadena (el mismo de src/up/estadisticas.mjs). Noruega es la madre: revisa a los demás.
export const AGENTES_UP = {
  planificador: {
    nombre: 'Planificador', rol: 'Arma el trabajo del día',
    descripcion: 'Cada mañana mira el calendario de UP y decide qué piezas hay que escribir: LinkedIn y X todos los días, Instagram según el formato del día.',
    herramientas: ['Calendario de UP', 'Planes de trabajo'],
  },
  investigador: {
    nombre: 'Investigador', rol: 'Junta los datos',
    descripcion: 'Elige qué datos de la ficha sirven para el tema del día. Si falta algo que solo vos sabés, te deja una pregunta y espera tu respuesta.',
    herramientas: ['Ficha de datos', 'Tus respuestas a sus preguntas'],
  },
  redactor: {
    nombre: 'Redactor', rol: 'Escribe los borradores',
    descripcion: 'Escribe el borrador de cada red con los datos que eligió el Investigador y las reglas de formato de cada red.',
    herramientas: ['IA (Gemini, con Groq de respaldo)', 'Reglas de formato por red'],
  },
  revisor: {
    nombre: 'Revisor', rol: 'Controla antes de que apruebes',
    descripcion: 'Lee cada borrador antes de que te llegue: largos, datos sin fuente y reglas. Si algo no pasa, lo devuelve al Redactor o lo marca para revisión.',
    herramientas: ['Reglas de UP', 'Control de largos', 'Ficha de datos'],
  },
  disenador: {
    nombre: 'Diseñador', rol: 'Arma las placas',
    descripcion: 'Arma las placas de los carruseles de Instagram desde una GitHub Action que corre cada 15 minutos y las guarda en la pieza.',
    herramientas: ['GitHub Action «UP · Diseñador»', 'Navegador para renderizar placas'],
  },
  publicador: {
    nombre: 'Publicador', rol: 'Publica lo aprobado',
    descripcion: 'Cada 15 minutos publica lo que aprobaste para hoy cuando llega su horario. Si una red falla, deja el motivo y no reintenta hasta que vos lo pidas.',
    herramientas: ['LinkedIn', 'X', 'Instagram', 'Horarios de publicación'],
  },
  noruega: {
    nombre: 'Noruega', rol: 'Agente madre de UP',
    descripcion: 'Cada 30 minutos revisa que la cadena funcione: borradores del día, corridas, placas del Diseñador y publicaciones.',
    herramientas: ['Registro de corridas de UP', 'Tareas programadas de UP', 'Estado de las piezas'],
  },
}
export const ORDEN_UP = ['planificador', 'investigador', 'redactor', 'revisor', 'disenador', 'publicador', 'noruega']

// Los agentes comerciales de PDG: el nombre y el rol salen de pdg_agentes; acá, con qué trabaja cada uno
// (lo que lee supabase/functions/pdg-agente).
const HERRAMIENTAS_PDG = ['Manual comercial de PDG', 'Ficha de la cuenta', 'Trabajos aprobados de la cuenta', 'IA']
export function herramientasPdg(clave) {
  return clave === 'prospector' || clave === 'demo' ? [...HERRAMIENTAS_PDG, 'Lee la web de la cuenta'] : HERRAMIENTAS_PDG
}

// Quiénes son mujeres (el resto habla en masculino). Lo usan los prompts de oficina-chat, los informes de las
// reuniones y el dibujo de cada personaje.
export const MUJERES = new Set([
  'trabajadores:maria', 'trabajadores:tareas_estancadas', 'trabajadores:google_sync', 'trabajadores:agenda_valentina', 'trabajadores:opera',
  'up:noruega', 'pdg:marketing', 'admin:agenda_dulce', 'admin:historial_up', 'admin:limpieza', 'sistemas:mesa_entrada',
])
export function generoDe(id) { return MUJERES.has(id) ? 'f' : 'm' }

// Supervisores: quién se encarga de que lo acordado en una reunión se cumpla en cada área (PDG, por ahora, María).
export const SUPERVISORES = { trabajadores: 'trabajadores:maria', up: 'up:noruega', pdg: 'trabajadores:maria', sistemas: 'sistemas:mesa_entrada', admin: 'trabajadores:maria' }
export const AREAS_TAREA = Object.keys(SUPERVISORES)

// Id de un agente en la Oficina: "<equipo>:<clave>".
export function idAgente(equipo, clave) { return `${equipo}:${clave}` }
export function partirId(id) {
  const m = /^(trabajadores|up|pdg):([a-z_]{1,40})$/.exec(String(id ?? ''))
  return m ? { equipo: m[1], clave: m[2] } : null
}
