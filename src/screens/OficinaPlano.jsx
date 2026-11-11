import { useEffect, useRef, useState } from 'react'
import { colorIdentidad } from '../tablero.mjs'
import { ESTADOS } from '../oficina.mjs'
import { BALDOSA, PISO, ZONAS, iso, puntos, puestos, rutinas, retrasoAnimacion, variante, agujas, CICLO_S } from '../oficinaPlano.mjs'
import './OficinaPlano.css'

// La Oficina dibujada: un piso isométrico con los agentes como dibujitos. Lo que hace cada uno sale de su estado real
// (ver oficinaPlano.mjs): trabajando teclea en su escritorio, con un problema se preocupa, libre se va de descanso a la
// cocina o al living y vuelve, pausado duerme en un puf. Las animaciones son solo CSS.
const { ancho: W, fondo: D, pared: P } = PISO
const ORDEN = ['trabajadores', 'up', 'pdg']
const PIELES = ['#f7d7bc', '#e3b58e', '#b98157']
const PELOS = ['#3b2a22', '#7a4527', '#e2b552', '#2e2a40', '#a77bd1']
const ROPA_EQUIPO = { up: 'var(--op-durazno)', pdg: 'var(--op-menta)' }

const nombreCorto = n => String(n).split(' (')[0]
const ropaDe = a => (a.color ? colorIdentidad(a.color) : ROPA_EQUIPO[a.equipo])
const caraDe = estado => (estado === 'trabajando' ? 'concentrado' : estado === 'error' ? 'preocupado' : 'feliz')

// ---------- Piezas ----------
function Caja({ x0, y0, x1, y1, z0 = 0, z1, clase }) {
  return <g className={clase}>
    <polygon className="op-frente" points={puntos([iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)])} />
    <polygon className="op-costado" points={puntos([iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)])} />
    <polygon className="op-tapa" points={puntos([iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)])} />
  </g>
}

// Superficies: sobre la pared del fondo (plano y = 0), la pared izquierda (x = 0) y el piso.
const enParedFondo = (x, z) => { const p = iso(x, 0, z); return `matrix(0.866 0.5 0 1 ${p.x} ${p.y})` }
const enParedIzquierda = (y, z) => { const p = iso(0, y, z); return `matrix(0.866 -0.5 0 1 ${p.x} ${p.y})` }
const enPiso = (x, y) => { const p = iso(x, y); return `matrix(0.866 0.5 -0.866 0.5 ${p.x} ${p.y})` }
const L = BALDOSA // largo de una baldosa en esas superficies

// ---------- El dibujito ----------
// Origen en los pies. pose: 'escritorio' (sentado detrás del escritorio: solo se ve de la cintura para arriba),
// 'parado', 'sentado' o 'dormido'. caminante: además de la pose tiene las piernas de caminar (el CSS elige cuál se ve).
function Chibi({ v, ropa, cara = 'feliz', pose = 'parado', objeto = null, caminante = false }) {
  const piel = PIELES[v.piel]
  const pelo = PELOS[v.colorPelo]
  const piernasPose = pose === 'sentado' || pose === 'dormido'
    ? <g className="op-pantalon"><rect x="-7" y="-10" width="6" height="5" rx="2.5" /><rect x="1" y="-10" width="6" height="5" rx="2.5" /><rect x="-7" y="-7" width="4.5" height="7" rx="2" /><rect x="2.5" y="-7" width="4.5" height="7" rx="2" /></g>
    : <g className="op-pantalon"><rect x="-5.5" y="-11" width="4.6" height="11" rx="2.2" /><rect x="0.9" y="-11" width="4.6" height="11" rx="2.2" /></g>
  return <g className={`op-chibi cara-${cara}`}>
    {pose !== 'escritorio' && <ellipse className="op-sombra" cx="0" cy="0" rx="10" ry="3.2" />}
    {pose !== 'escritorio' && (caminante
      ? <>
        <g className="op-piernas-caminar op-pantalon">
          <rect className="op-pierna-a" x="-5.5" y="-11" width="4.6" height="11" rx="2.2" />
          <rect className="op-pierna-b" x="0.9" y="-11" width="4.6" height="11" rx="2.2" />
        </g>
        <g className="op-piernas-pose">{piernasPose}</g>
      </>
      : piernasPose)}
    <g className="op-torso">
      <path d="M-8.5 -9 Q-9.5 -20 -6 -22.5 Q0 -25.5 6 -22.5 Q9.5 -20 8.5 -9 Z" style={{ fill: ropa }} className="op-remera" />
      {pose === 'escritorio'
        ? <g className="op-brazos-tecleo">
          <circle className="op-mano-a" cx="-5" cy="-12.5" r="2.4" fill={piel} />
          <circle className="op-mano-b" cx="5" cy="-12.5" r="2.4" fill={piel} />
        </g>
        : <>
          <rect x="-11" y="-21.5" width="4.2" height="10" rx="2.1" style={{ fill: ropa }} className="op-remera" />
          <circle cx="-8.9" cy="-11.2" r="2.3" fill={piel} />
          {objeto === 'taza' && <g className="op-taza">
            <rect x="7" y="-21" width="5.5" height="5.5" rx="1" className="op-taza-cuerpo" />
            <path d="M12.5 -19.5 q2.5 0 2.5 1.7 t-2.5 1.7" className="op-taza-asa" />
            <path d="M8.5 -23 q1.5 -2 0 -4 M11 -23 q1.5 -2 0 -4" className="op-vapor" />
            <circle cx="8.6" cy="-17.5" r="2.3" fill={piel} />
          </g>}
          {objeto === 'paleta' && <g className="op-paleta">
            <rect x="8" y="-21" width="1.8" height="7" rx="0.9" className="op-paleta-mango" />
            <circle cx="9" cy="-24" r="4.2" className="op-paleta-goma" />
            <circle cx="8.9" cy="-15" r="2.3" fill={piel} />
          </g>}
          {!objeto && <><rect x="6.8" y="-21.5" width="4.2" height="10" rx="2.1" style={{ fill: ropa }} className="op-remera" /><circle cx="8.9" cy="-11.2" r="2.3" fill={piel} /></>}
        </>}
    </g>
    <g className="op-cabeza">
      {v.pelo === 2 && <path d="M-11 -33 Q-12.8 -21 -8 -18.5 L-6.5 -31 Z M11 -33 Q12.8 -21 8 -18.5 L6.5 -31 Z" fill={pelo} />}
      <circle cx="0" cy="-32" r="10.5" fill={piel} />
      {v.pelo === 3
        ? <g fill={pelo}>{[[-8.5, -37], [-4, -41.5], [1.5, -42.5], [6.5, -40], [9.5, -35], [-10.5, -32]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4.4" />)}</g>
        : <path d="M-10.9 -31 C-11.8 -45.5 11.8 -45.5 10.9 -31 C8.5 -37.5 -1 -40 -10.9 -31 Z" fill={pelo} />}
      {v.pelo === 1 && <circle cx="0" cy="-45" r="4.8" fill={pelo} />}
      <ellipse className="op-rubor" cx="-6.8" cy="-28.4" rx="2.1" ry="1.3" />
      <ellipse className="op-rubor" cx="6.8" cy="-28.4" rx="2.1" ry="1.3" />
      {cara === 'dormido'
        ? <><path className="op-trazo" d="M-5.6 -31.5 Q-3.8 -29.8 -2 -31.5 M2 -31.5 Q3.8 -29.8 5.6 -31.5" /><circle cx="0" cy="-26.4" r="1.2" className="op-boca-o" /></>
        : <>
          <g className="op-ojos">
            <ellipse cx="-3.8" cy="-31" rx="1.55" ry="2.1" /><ellipse cx="3.8" cy="-31" rx="1.55" ry="2.1" />
            <circle cx="-3.3" cy="-31.8" r="0.55" className="op-brillo" /><circle cx="4.3" cy="-31.8" r="0.55" className="op-brillo" />
          </g>
          {cara === 'feliz' && <path className="op-trazo" d="M-2.6 -26.8 Q0 -24.2 2.6 -26.8" />}
          {cara === 'concentrado' && <path className="op-trazo" d="M-1.8 -26 L1.8 -26" />}
          {cara === 'preocupado' && <>
            <path className="op-trazo" d="M-2.6 -24.9 Q0 -27.2 2.6 -24.9 M-6.2 -35.6 L-2.3 -34.3 M6.2 -35.6 L2.3 -34.3" />
            <path className="op-gota" d="M10.5 -40 q2.2 3 0 4.4 q-2.2 -1.4 0 -4.4 Z" />
          </>}
        </>}
    </g>
  </g>
}

// ---------- Escritorio con su agente ----------
function Escritorio({ a, x, y, rutina, elegido, abrir, reloj }) {
  const v = variante(a.id)
  const enSilla = rutina.tipo !== 'siesta'
  const sentado = iso(x, y - 0.72, 0.28)
  const estiloRutina = rutina.tipo === 'rutina' ? { '--retraso': `${retrasoAnimacion(rutina.retraso, reloj)}s`, '--ciclo': `${CICLO_S}s` } : undefined
  const etiqueta = `${a.nombre}: ${ESTADOS[a.estado]}. ${a.ahora}`
  const teclear = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(a.id) } }
  return <g className={`op-puesto estado-${a.estado}${elegido ? ' is-elegido' : ''}`} role="button" tabIndex={0} aria-label={etiqueta}
    onClick={() => abrir(a.id)} onKeyDown={teclear}>
    <title>{etiqueta}</title>
    <ellipse className="op-aro" cx={iso(x, y - 0.2).x} cy={iso(x, y - 0.2).y} rx="40" ry="22" />
    <Caja clase="op-silla" x0={x - 0.32} x1={x + 0.32} y0={y - 1.05} y1={y - 0.5} z1={0.4} />
    <Caja clase="op-silla" x0={x - 0.32} x1={x + 0.32} y0={y - 1.14} y1={y - 1.04} z0={0.4} z1={1.15} />
    {enSilla && <g className={rutina.tipo === 'rutina' ? 'op-sentado-rutina' : 'op-sentado-fijo'} style={estiloRutina} transform={`translate(${sentado.x} ${sentado.y})`}>
      <Chibi v={v} ropa={ropaDe(a)} cara={caraDe(a.estado)} pose="escritorio" />
    </g>}
    <Caja clase="op-mesa" x0={x - 0.82} x1={x + 0.82} y0={y - 0.42} y1={y + 0.42} z1={0.72} />
    {/* Notebook: la tapa da la espalda; se ilumina cuando el agente trabaja. */}
    <Caja clase="op-notebook" x0={x - 0.32} x1={x + 0.32} y0={y - 0.2} y1={y + 0.15} z0={0.72} z1={0.75} />
    <polygon className="op-tapa-notebook" points={puntos([iso(x - 0.32, y - 0.2, 0.75), iso(x + 0.32, y - 0.2, 0.75), iso(x + 0.32, y - 0.2, 1.12), iso(x - 0.32, y - 0.2, 1.12)])} />
    {v.piel === 0 ? <Caja clase="op-taza-escritorio" x0={x + 0.5} x1={x + 0.66} y0={y} y1={y + 0.16} z0={0.72} z1={0.86} />
      : <Maceta x={x + 0.58} y={y + 0.05} z={0.72} chica />}
  </g>
}

function Maceta({ x, y, z = 0, chica = false }) {
  const t = chica ? 0.12 : 0.3
  const p = iso(x, y, z + (chica ? 0.22 : 0.55))
  return <g className="op-planta">
    <Caja clase="op-maceta" x0={x - t} x1={x + t} y0={y - t} y1={y + t} z0={z} z1={z + (chica ? 0.16 : 0.45)} />
    {(chica ? [[0, -4, 4], [-3, -1, 3], [3, -1, 3]] : [[0, -14, 9], [-8, -6, 7], [8, -6, 7], [-3, -22, 7], [5, -20, 6]]).map(([dx, dy, r], i) =>
      <circle key={i} cx={p.x + dx} cy={p.y + dy} r={r} className={i % 2 ? 'op-hoja-b' : 'op-hoja'} />)}
  </g>
}

// PDG: los comerciales sentados del otro lado de la mesa de reuniones.
function AsientoReunion({ a, x, y, rutina, elegido, abrir, reloj }) {
  const v = variante(a.id)
  const estiloRutina = rutina.tipo === 'rutina' ? { '--retraso': `${retrasoAnimacion(rutina.retraso, reloj)}s`, '--ciclo': `${CICLO_S}s` } : undefined
  const sentado = iso(x, y, 0.3)
  const etiqueta = `${a.nombre}: ${ESTADOS[a.estado]}. ${a.ahora}`
  return <g className={`op-puesto estado-${a.estado}${elegido ? ' is-elegido' : ''}`} role="button" tabIndex={0} aria-label={etiqueta}
    onClick={() => abrir(a.id)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(a.id) } }}>
    <title>{etiqueta}</title>
    <ellipse className="op-aro" cx={iso(x, y + 0.6).x} cy={iso(x, y + 0.6).y} rx="26" ry="15" />
    <Caja clase="op-silla-reunion" x0={x - 0.3} x1={x + 0.3} y0={y - 0.42} y1={y - 0.32} z0={0.4} z1={1.1} />
    <Caja clase="op-silla-reunion" x0={x - 0.3} x1={x + 0.3} y0={y - 0.32} y1={y + 0.22} z1={0.4} />
    {rutina.tipo !== 'siesta' && <g className={rutina.tipo === 'rutina' ? 'op-sentado-rutina' : 'op-sentado-fijo'} style={estiloRutina} transform={`translate(${sentado.x} ${sentado.y})`}>
      <Chibi v={v} ropa={ropaDe(a)} cara={caraDe(a.estado)} pose="escritorio" />
    </g>}
  </g>
}

// El agente en su descanso: aparece al lado de su lugar, camina hasta la cocina o el living, se queda y vuelve.
function Paseante({ a, desde, rutina, reloj, abrir }) {
  const d = rutina.descanso
  const zDescanso = d.id.startsWith('banqueta') ? 0.62 : d.id.startsWith('sillon') ? 0.3 : 0
  const A = iso(desde.x + 1.05, desde.y - 0.2)
  const B = iso(d.x, d.y, zDescanso)
  const estilo = {
    '--ax': `${A.x}px`, '--ay': `${A.y}px`, '--bx': `${B.x}px`, '--by': `${B.y}px`,
    '--retraso': `${retrasoAnimacion(rutina.retraso, reloj)}s`, '--ciclo': `${CICLO_S}s`,
  }
  return <g className={`op-paseante pose-${d.pose}`} style={estilo} onClick={() => abrir(a.id)} aria-hidden="true">
    <title>{`${a.nombre}: en su descanso`}</title>
    <Chibi v={variante(a.id)} ropa={ropaDe(a)} pose={d.pose} objeto={d.objeto} caminante />
  </g>
}

function Dormido({ a, puf, abrir }) {
  const p = iso(puf.x, puf.y, 0.25)
  return <g className="op-dormido" transform={`translate(${p.x} ${p.y})`} onClick={() => abrir(a.id)} aria-hidden="true">
    <title>{`${a.nombre}: pausado, durmiendo`}</title>
    <g transform="rotate(-14)"><Chibi v={variante(a.id)} ropa={ropaDe(a)} pose="dormido" cara="dormido" /></g>
    {[0, 1, 2].map(i => <text key={i} className={`op-zeta op-zeta-${i}`} x={12 + i * 5} y={-40 - i * 7}>z</text>)}
  </g>
}

function Burbuja({ estado, x, y }) {
  // La posición va en un grupo aparte: la animación de latido usa transform y pisaría el translate.
  return <g transform={`translate(${x} ${y})`}><g className={`op-burbuja estado-${estado}`}>
    <rect x="-13" y="-10" width="26" height="18" rx="9" />
    <path d="M-6 7 L-9 13 L-1 8 Z" />
    {estado === 'trabajando'
      ? [-6, 0, 6].map((dx, i) => <circle key={dx} cx={dx} cy="-1" r="2" className={`op-punto op-punto-${i}`} />)
      : <text x="0" y="3.5" textAnchor="middle">!</text>}
  </g></g>
}

function Cartel({ x, y, texto, estado }) {
  const t = texto.length > 18 ? `${texto.slice(0, 17)}…` : texto
  const ancho = t.length * 5.6 + 14
  return <g className={`op-cartel estado-${estado}`}>
    <rect x={x - ancho / 2} y={y - 9} width={ancho} height="15" rx="7.5" />
    <text x={x} y={y + 2} textAnchor="middle">{t}</text>
  </g>
}

// ---------- El piso ----------
function Estructura({ reloj }) {
  const { hora, minuto } = agujas(reloj)
  const z = (zona, inset = 0.25) => puntos([iso(zona.x0 + inset, zona.y0 + inset), iso(zona.x1 - inset, zona.y0 + inset), iso(zona.x1 - inset, zona.y1 - inset), iso(zona.x0 + inset, zona.y1 - inset)])
  const ventanaFondo = (x0, x1) => <g key={x0} className="op-ventana">
    <polygon className="op-cielo" points={puntos([iso(x0, 0, 0.95), iso(x1, 0, 0.95), iso(x1, 0, 2.0), iso(x0, 0, 2.0)])} />
    <polygon className="op-nube" points={puntos([iso(x0 + 0.5, 0, 1.6), iso(x0 + 1.4, 0, 1.6), iso(x0 + 1.4, 0, 1.75), iso(x0 + 0.5, 0, 1.75)])} />
    <line className="op-marco" x1={iso((x0 + x1) / 2, 0, 0.95).x} y1={iso((x0 + x1) / 2, 0, 0.95).y} x2={iso((x0 + x1) / 2, 0, 2).x} y2={iso((x0 + x1) / 2, 0, 2).y} />
    <polygon className="op-marco-borde" points={puntos([iso(x0, 0, 0.95), iso(x1, 0, 0.95), iso(x1, 0, 2.0), iso(x0, 0, 2.0)])} />
  </g>
  return <g className="op-estructura">
    <polygon className="op-pared-fondo" points={puntos([iso(0, 0), iso(W, 0), iso(W, 0, P), iso(0, 0, P)])} />
    <polygon className="op-pared-izquierda" points={puntos([iso(0, 0), iso(0, D), iso(0, D, P), iso(0, 0, P)])} />
    <polygon className="op-zocalo" points={puntos([iso(0, 0), iso(W, 0), iso(W, 0, 0.15), iso(0, 0, 0.15)])} />
    <polygon className="op-zocalo-lado" points={puntos([iso(0, 0), iso(0, D), iso(0, D, 0.15), iso(0, 0, 0.15)])} />
    <polygon className="op-piso" points={puntos([iso(0, 0), iso(W, 0), iso(W, D), iso(0, D)])} />
    {Array.from({ length: W - 1 }, (_, i) => <line key={i} className="op-tabla" x1={iso(i + 1, 0).x} y1={iso(i + 1, 0).y} x2={iso(i + 1, D).x} y2={iso(i + 1, D).y} />)}
    <polygon className="op-alfombra alfombra-trabajadores" points={z(ZONAS.trabajadores, 0.5)} />
    <polygon className="op-alfombra alfombra-up" points={z(ZONAS.up, 0.5)} />
    <polygon className="op-alfombra alfombra-pdg" points={z(ZONAS.pdg, 0.6)} />
    <polygon className="op-alfombra alfombra-cocina" points={z({ x0: 10.6, y0: 11.2, x1: 17.4, y1: 15.3 }, 0)} />
    <polygon className="op-alfombra alfombra-living" points={z({ x0: 19.6, y0: 11.8, x1: 27.6, y1: 15.6 }, 0)} />
    {ventanaFondo(2.2, 5.4)}{ventanaFondo(11.4, 14.6)}{ventanaFondo(19.4, 23)}
    <polygon className="op-cielo" points={puntos([iso(0, 10, 0.95), iso(0, 14, 0.95), iso(0, 14, 2.0), iso(0, 10, 2.0)])} />
    <polygon className="op-marco-borde" points={puntos([iso(0, 10, 0.95), iso(0, 14, 0.95), iso(0, 14, 2.0), iso(0, 10, 2.0)])} />
    {/* Carteles en la pared del fondo. */}
    <g transform={enParedFondo(6.6, 1.85)}>
      <rect className="op-letrero" width={3.8 * L} height={0.7 * L} rx="5" />
      <text className="op-letrero-texto" x={1.9 * L} y={0.35 * L + 5} textAnchor="middle">Trabajadores</text>
    </g>
    <g transform={enParedFondo(24.2, 1.85)}>
      <rect className="op-letrero letrero-up" width={2.4 * L} height={0.7 * L} rx="5" />
      <text className="op-letrero-texto" x={1.2 * L} y={0.35 * L + 5} textAnchor="middle">UP</text>
    </g>
    <g transform={enParedIzquierda(13.6, 1.75)}>
      <rect className="op-pizarra" width={3.2 * L} height={0.95 * L} rx="3" />
      <text className="op-pizarra-texto" x="10" y="17">Ventas PDG</text>
      <polyline className="op-pizarra-linea" points={`10,${0.95 * L - 6} 30,${0.95 * L - 12} 48,${0.95 * L - 9} 70,${0.95 * L - 20}`} />
    </g>
    {/* Reloj con la hora de Buenos Aires. */}
    <g transform={enParedFondo(16, 1.55)}>
      <circle className="op-reloj" r="13" />
      <line className="op-aguja-hora" x2="0" y2="-7" transform={`rotate(${hora})`} />
      <line className="op-aguja-minuto" x2="0" y2="-10" transform={`rotate(${minuto})`} />
      <line className="op-aguja-segundo" x2="0" y2="-11" />
      <circle r="1.4" className="op-reloj-centro" />
    </g>
    {/* Carteles en el piso de las zonas de abajo. */}
    {[[0.9, 9.4, 'PDG comercial'], [11, 15.6, 'Cocina'], [20.2, 15.9, 'Living']].map(([x, y, t]) =>
      <text key={t} className="op-piso-texto" transform={enPiso(x, y)}>{t}</text>)}
  </g>
}

function mobiliario() {
  return {
    arriba: <>
      <Caja clase="op-biblioteca" x0={0.05} x1={0.55} y0={1} y1={3.4} z1={1.9} />
      {[[1.2, '#f6a5c0'], [1.6, '#9edfc6'], [2.0, '#b9a2e8'], [2.4, '#f7b98b'], [2.8, '#f6dd8b']].map(([y, c]) =>
        <polygon key={y} fill={c} points={puntos([iso(0.55, y, 1.25), iso(0.55, y + 0.3, 1.25), iso(0.55, y + 0.3, 1.7), iso(0.55, y, 1.7)])} />)}
      <Caja clase="op-tabique" x0={16.9} x1={17.1} y0={0} y1={5.6} z1={1.05} />
      <Maceta x={16.3} y={0.8} />
      <Maceta x={0.8} y={7.2} />
      <Caja clase="op-dispenser" x0={27.2} x1={27.7} y0={0.4} y1={0.9} z1={1.2} />
      <Caja clase="op-bidon" x0={27.3} x1={27.6} y0={0.5} y1={0.8} z0={1.2} z1={1.6} />
    </>,
    cocina: <>
      <Caja clase="op-heladera" x0={10} x1={11.2} y0={8.3} y1={9.4} z1={2.05} />
      <line className="op-manija" x1={iso(11.2, 9.25, 1.0).x} y1={iso(11.2, 9.25, 1.0).y} x2={iso(11.2, 9.25, 1.6).x} y2={iso(11.2, 9.25, 1.6).y} />
      <Caja clase="op-mesada" x0={11.2} x1={17.6} y0={8.4} y1={9.3} z1={0.92} />
      <Caja clase="op-microondas" x0={12.6} x1={13.7} y0={8.5} y1={9.1} z0={0.92} z1={1.35} />
      <Caja clase="op-cafetera" x0={15.2} x1={15.8} y0={8.5} y1={8.95} z0={0.92} z1={1.45} />
      <circle className="op-luz-cafetera" cx={iso(15.8, 8.8, 1.3).x - 2} cy={iso(15.8, 8.8, 1.3).y} r="1.6" />
      <Caja clase="op-isla" x0={11.4} x1={16.6} y0={12.1} y1={13.2} z1={0.95} />
      <circle className="op-fruta" cx={iso(14, 12.6, 0.95).x} cy={iso(14, 12.6, 0.95).y - 4} r="5" />
      <circle className="op-fruta-b" cx={iso(14.3, 12.6, 0.95).x + 3} cy={iso(14.3, 12.6, 0.95).y - 6} r="3.5" />
      {[12.4, 14.1, 15.8].map(x => <Caja key={x} clase="op-banqueta" x0={x - 0.24} x1={x + 0.24} y0={14.06} y1={14.54} z1={0.6} />)}
      <Maceta x={17.9} y={15.4} />
    </>,
    living: <>
      <Caja clase="op-sillon" x0={20.2} x1={25.3} y0={9.0} y1={9.45} z1={1.05} />
      <Caja clase="op-sillon" x0={20.2} x1={20.55} y0={9.45} y1={10.5} z1={0.7} />
      <Caja clase="op-sillon-asiento" x0={20.55} x1={24.95} y0={9.45} y1={10.5} z1={0.42} />
      <Caja clase="op-sillon" x0={24.95} x1={25.3} y0={9.45} y1={10.5} z1={0.7} />
      {[21.3, 22.6, 23.9].map(x => <Caja key={x} clase="op-almohadon" x0={x - 0.35} x1={x + 0.35} y0={9.45} y1={9.65} z0={0.42} z1={0.85} />)}
      {[[21.5, 12.9], [25.7, 12.9], [21.5, 14.3], [25.7, 14.3]].map(([x, y]) => <Caja key={`${x}${y}`} clase="op-pata" x0={x - 0.06} x1={x + 0.06} y0={y - 0.06} y1={y + 0.06} z1={0.62} />)}
      <Caja clase="op-ping" x0={21.3} x1={25.9} y0={12.8} y1={14.4} z0={0.62} z1={0.72} />
      <polygon className="op-red" points={puntos([iso(23.6, 12.75, 0.72), iso(23.6, 14.45, 0.72), iso(23.6, 14.45, 0.92), iso(23.6, 12.75, 0.92)])} />
      <ellipse className="op-puf" cx={iso(26.9, 10.4).x} cy={iso(26.9, 10.4).y - 6} rx="18" ry="11" />
      <ellipse className="op-puf op-puf-b" cx={iso(27.1, 11.9).x} cy={iso(27.1, 11.9).y - 6} rx="18" ry="11" />
      <Maceta x={27.5} y={8.6} />
      <Maceta x={19.1} y={15.4} />
    </>,
  }
}

// ---------- Escena ----------
export default function OficinaPlano({ agentes, elegidoId, abrir, ahora }) {
  // Hora de referencia para que las rutinas sigan el reloj (y no arranquen de cero en cada render).
  const [reloj] = useState(() => Date.now())
  // En pantallas angostas el dibujo se desliza de costado: arranca centrado.
  const marco = useRef(null)
  useEffect(() => {
    const m = marco.current
    if (m && m.scrollWidth > m.clientWidth) m.scrollLeft = (m.scrollWidth - m.clientWidth) / 2
  }, [])
  const rut = rutinas(agentes)
  const lugar = {}
  for (const e of ORDEN) {
    const del = agentes.filter(a => a.equipo === e)
    puestos(e, del.length).forEach((p, i) => { lugar[del[i].id] = p })
  }
  const ubicados = agentes.filter(a => lugar[a.id]).map(a => ({ a, ...lugar[a.id], rutina: rut[a.id] }))
  const porProfundidad = lista => [...lista].sort((p, q) => p.x + p.y - (q.x + q.y))
  const arriba = porProfundidad(ubicados.filter(u => u.tipo === 'escritorio'))
  const reunion = porProfundidad(ubicados.filter(u => u.tipo === 'mesa'))
  const muebles = mobiliario()
  const paseantes = ubicados.filter(u => u.rutina.tipo === 'rutina')
  const dormidos = ubicados.filter(u => u.rutina.tipo === 'siesta' && u.rutina.puf)
  const ping = paseantes.filter(u => u.rutina.descanso.objeto === 'paleta')

  const minX = iso(0, D).x - 30, maxX = iso(W, 0).x + 30, minY = iso(0, 0, P).y - 20, maxY = iso(W, D).y + 25
  return <div className="oficina-plano" ref={marco}>
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="group" aria-label="La oficina: Trabajadores y UP en sus escritorios, la sala de reuniones de PDG, la cocina y el living">
      <defs>
        <linearGradient id="op-cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfe3ff" /><stop offset="1" stopColor="#e9f5ff" /></linearGradient>
      </defs>
      <Estructura reloj={ahora} />
      {muebles.arriba}
      {arriba.map(u => <Escritorio key={u.a.id} {...u} elegido={u.a.id === elegidoId} abrir={abrir} reloj={reloj} />)}
      {/* Sala de reuniones de PDG: vidrio del fondo, los comerciales, la mesa y el vidrio del costado. */}
      <polygon className="op-vidrio" points={puntos([iso(0, 8), iso(7.4, 8), iso(7.4, 8, 1.9), iso(0, 8, 1.9)])} />
      {reunion.map(u => <AsientoReunion key={u.a.id} {...u} elegido={u.a.id === elegidoId} abrir={abrir} reloj={reloj} />)}
      <Caja clase="op-mesa-reunion" x0={1.2} x1={7.8} y0={12.3} y1={13.5} z1={0.72} />
      {reunion.map(u => <Caja key={u.a.id} clase="op-cuaderno" x0={u.x - 0.25} x1={u.x + 0.25} y0={12.45} y1={12.8} z0={0.72} z1={0.75} />)}
      <polygon className="op-vidrio" points={puntos([iso(9, 8), iso(9, 14), iso(9, 14, 1.9), iso(9, 8, 1.9)])} />
      <polygon className="op-vidrio-borde" points={puntos([iso(9, 8, 1.9), iso(9, 14, 1.9), iso(9, 14, 1.95), iso(9, 8, 1.95)])} />
      {muebles.cocina}
      {muebles.living}
      {/* Arriba de todo: los que andan de descanso, los que duermen, burbujas y carteles. */}
      {dormidos.map(u => <Dormido key={u.a.id} a={u.a} puf={u.rutina.puf} abrir={abrir} />)}
      {porProfundidad(paseantes.map(u => ({ ...u, x: u.rutina.descanso.x, y: u.rutina.descanso.y }))).map(u =>
        <Paseante key={u.a.id} a={u.a} desde={lugar[u.a.id]} rutina={u.rutina} reloj={reloj} abrir={abrir} />)}
      {ping.length === 2 && <circle className="op-pelota" r="2.4"
        style={{ '--retraso': `${retrasoAnimacion(ping[0].rutina.retraso, reloj)}s`, '--ciclo': `${CICLO_S}s`, '--px0': `${iso(21.6, 13.6, 1.2).x}px`, '--px1': `${iso(25.6, 13.6, 1.2).x}px`, '--py': `${iso(23.6, 13.6, 1.2).y}px` }} />}
      {ubicados.map(u => {
        const sentado = u.tipo === 'mesa' ? iso(u.x, u.y, 0.3) : iso(u.x, u.y - 0.72, 0.28)
        const tapa = iso(u.x, u.y - 0.2, 1.12)
        const cartel = u.tipo === 'mesa' ? iso(u.x, 14.1 + (reunion.indexOf(u) % 2) * 0.55) : iso(u.x + 0.45, u.y + 0.85)
        const nombre = u.tipo === 'mesa' ? nombreCorto(u.a.nombre).split(' ')[0] : nombreCorto(u.a.nombre)
        return <g key={u.a.id} className="op-rotulos" aria-hidden="true">
          {u.a.estado === 'trabajando' && u.tipo === 'escritorio' && [0, 1].map(i => <text key={i} className={`op-codigo op-codigo-${i}`} x={tapa.x + (i ? 6 : -6)} y={tapa.y - 2}>{i ? '✓' : '</>'}</text>)}
          {(u.a.estado === 'trabajando' || u.a.estado === 'error') && <Burbuja estado={u.a.estado} x={sentado.x + 15} y={sentado.y - 52} />}
          <Cartel x={cartel.x} y={cartel.y} texto={nombre} estado={u.a.estado} />
        </g>
      })}
    </svg>
  </div>
}

export function LeyendaPlano() {
  return <ul className="oficina-leyenda" aria-label="Qué significa lo que se ve">
    <li><span className="burbuja-muestra estado-trabajando">…</span>tecleando en su escritorio: trabajando</li>
    <li><span className="burbuja-muestra estado-error">!</span>preocupado: con un problema</li>
    <li><span className="burbuja-muestra">☕</span>en la cocina o el living: libre, en su descanso</li>
    <li><span className="burbuja-muestra">z</span>durmiendo en un puf: pausado</li>
  </ul>
}
