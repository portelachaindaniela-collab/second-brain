import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { CabeceraPantalla, Bloques, Bloque, Pie } from '../estructura.jsx'
import {
  porDispositivo, haceCuanto, estaDesactualizada, TEXTO_MOTIVO, urlMapa, urlGoogleMaps, BUSCADORES_OFICIALES,
  URL_FUNCION, cuerpoMacroDroid, DISPOSITIVO_CELULAR,
} from '../ubicaciones.mjs'
import { puedeMandarDesdeAca, mandarAlAbrir, cambiarMandarAlAbrir, mandarMiUbicacion } from '../miUbicacion.js'
import './MisCosas.css'

function Dispositivo({ d, ahora }) {
  const u = d.ultima
  const vieja = estaDesactualizada(u.at, ahora)
  const datos = [haceCuanto(u.at, ahora), u.precision_m != null && `precisión ${u.precision_m} m`, u.bateria != null && `batería ${u.bateria}%`].filter(Boolean)
  return <Bloque titulo={d.dispositivo} accion={<span className={`bloque-nota${vieja ? ' txt-aviso' : ''}`}>{datos.join(' · ')}</span>}>
    <p className="cosas-motivo">{TEXTO_MOTIVO[u.motivo] ?? u.motivo}{vieja && d.dispositivo === DISPOSITIVO_CELULAR && ' · hace más de una hora que no manda: puede estar apagado o sin internet'}</p>
    <iframe className="cosas-mapa" title={`Mapa: ${d.dispositivo}`} src={urlMapa(u.lat, u.lon, u.precision_m)} />
    <div className="cosas-acciones">
      <a className="btn btn-sm" href={urlGoogleMaps(u.lat, u.lon)} target="_blank" rel="noreferrer">Abrir en Google Maps</a>
    </div>
    {d.anteriores.length > 0 && <details className="cosas-anteriores">
      <summary>Antes ({d.anteriores.length})</summary>
      <ul>{d.anteriores.slice(0, 20).map(a => <li key={a.id}>
        <a href={urlGoogleMaps(a.lat, a.lon)} target="_blank" rel="noreferrer">{new Date(a.at).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</a>
        <span className="tenue"> · {TEXTO_MOTIVO[a.motivo] ?? a.motivo}</span>
      </li>)}</ul>
    </details>}
  </Bloque>
}

function Paso({ n, children }) {
  return <li className="cosas-paso"><span className="cosas-paso-n">{n}</span><div>{children}</div></li>
}

function Codigo({ children }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try { await navigator.clipboard.writeText(children); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sin portapapeles: se copia a mano */ }
  }
  return <div className="cosas-codigo"><code>{children}</code><button type="button" className="btn btn-sm" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</button></div>
}

function GuiaMacroDroid({ token }) {
  const [auriculares, setAuriculares] = useState('Auriculares')
  return <div className="cosas-guia">
    <p className="hint">En el celular, una sola vez. MacroDroid es gratis (alcanza con 3 macros) y manda la ubicación aunque SB esté cerrado.</p>
    <ol>
      <Paso n="1">Instalá <strong>MacroDroid</strong> desde Play Store y dale permiso de <strong>ubicación todo el tiempo</strong> (Ajustes → Apps → MacroDroid → Permisos → Ubicación → Permitir todo el tiempo).</Paso>
      <Paso n="2">Samsung apaga las apps en segundo plano: en <strong>Ajustes → Batería → Límites de uso en segundo plano</strong>, poné MacroDroid en <strong>Apps que nunca se suspenden</strong>.</Paso>
      <Paso n="3">Para encontrarlo aunque esté sin internet: <strong>Ajustes → Seguridad y privacidad → Encontrar mi móvil</strong> → activá <strong>Búsqueda sin conexión</strong> y <strong>Enviar última ubicación</strong>.</Paso>
      <Paso n="4">
        Macro <strong>«Ubicación cada 30 min»</strong>. Disparador: <em>Fecha/Hora → Temporizador regular</em>, cada 30 minutos.
        Acciones: <em>Ubicación → Forzar actualización de ubicación</em>, y después <em>Conectividad → Solicitud HTTP</em>:
        <dl className="cosas-http">
          <dt>Método</dt><dd>POST</dd>
          <dt>URL</dt><dd><Codigo>{URL_FUNCION}</Codigo></dd>
          <dt>Encabezado</dt><dd><Codigo>x-token-ubicacion</Codigo><Codigo>{token ?? '(generá el token arriba)'}</Codigo></dd>
          <dt>Cuerpo (JSON)</dt><dd><Codigo>{cuerpoMacroDroid(DISPOSITIVO_CELULAR, 'periodico')}</Codigo></dd>
        </dl>
        <p className="hint">Si MacroDroid muestra las variables con otro nombre, elegilas con el botón de «texto mágico»: latitud, longitud, precisión y batería de la última ubicación.</p>
      </Paso>
      <Paso n="5">
        Macro <strong>«Volvió internet»</strong>, para no perder la ubicación si estuvo sin datos (por ejemplo en otro país). Disparador:
        <em> Conectividad → Cambio de conectividad de datos → Conectado</em>. Mismas acciones que el paso 4, con este cuerpo:
        <Codigo>{cuerpoMacroDroid(DISPOSITIVO_CELULAR, 'reconexion')}</Codigo>
      </Paso>
      <Paso n="6">
        Macro <strong>«Se desconectaron los auriculares»</strong>. Disparador: <em>Conectividad → Evento Bluetooth → Dispositivo desconectado</em>, elegí tus auriculares.
        Mismas acciones que el paso 4. Nombre con el que aparecen acá:
        <input className="cosas-nombre" value={auriculares} onChange={e => setAuriculares(e.target.value)} aria-label="Nombre de los auriculares" />
        <Codigo>{cuerpoMacroDroid(auriculares.trim() || 'Auriculares', 'desconexion')}</Codigo>
      </Paso>
      <Paso n="7">Probá la macro del paso 4 con <em>Ejecutar acciones</em>: en unos segundos el celular aparece acá arriba.</Paso>
    </ol>
  </div>
}

export default function MisCosas({ ownerId }) {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ahora, setAhora] = useState(() => Date.now())
  const [mandando, setMandando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [alAbrir, setAlAbrir] = useState(mandarAlAbrir)
  const [tokenCreado, setTokenCreado] = useState(null)
  const [token, setToken] = useState(null)
  const desdeAca = puedeMandarDesdeAca()

  const cargar = useCallback(async () => {
    const [ubic, tok] = await Promise.all([
      supabase.from('ubicaciones').select('*').order('at', { ascending: false }).limit(300),
      supabase.rpc('ubicacion_tiene_token'),
    ])
    if (ubic.error) setError('No se pudieron leer las ubicaciones: ' + ubic.error.message)
    else { setFilas(ubic.data ?? []); setError('') }
    if (!tok.error) setTokenCreado(tok.data)
    setCargando(false); setAhora(Date.now())
  }, [])

  useEffect(() => {
    cargar()
    const reloj = setInterval(() => setAhora(Date.now()), 60_000)
    const canal = supabase.channel('mis-cosas').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ubicaciones' }, cargar).subscribe()
    return () => { clearInterval(reloj); supabase.removeChannel(canal) }
  }, [cargar])

  async function mandarAhora() {
    setMandando(true); setAviso('')
    try { await mandarMiUbicacion(ownerId, 'manual'); setAviso('Listo: ubicación del celular actualizada.'); cargar() }
    catch (e) { setAviso(e.message) }
    finally { setMandando(false) }
  }

  async function nuevoToken() {
    if (tokenCreado && !confirm('Si generás un token nuevo, MacroDroid deja de poder mandar hasta que pegues el nuevo. ¿Seguís?')) return
    const { data, error } = await supabase.rpc('ubicacion_nuevo_token')
    if (error) { setAviso('No se pudo generar el token: ' + error.message); return }
    setToken(data); setTokenCreado(new Date().toISOString())
  }

  const dispositivos = porDispositivo(filas)
  const celular = dispositivos.find(d => d.dispositivo === DISPOSITIVO_CELULAR)
  const cifras = [
    { valor: dispositivos.length, etiqueta: 'cosas ubicadas' },
    { valor: celular ? haceCuanto(celular.ultima.at, ahora) : '—', etiqueta: 'celular', nivel: celular && estaDesactualizada(celular.ultima.at, ahora) ? 'aviso' : undefined },
  ]

  return <div className="mis-cosas">
    <CabeceraPantalla sobretitulo="Dónde quedó" titulo="Mis cosas" subtitulo="La última ubicación de tu celular y de tus auriculares. Se guarda 7 días." cifras={cifras} cargando={cargando}
      accion={desdeAca && <button className="btn btn-primary" disabled={mandando} onClick={mandarAhora}>{mandando ? 'Ubicando…' : 'Mandar mi ubicación ahora'}</button>} />
    {error && <p role="alert" className="feedback-error">{error}</p>}
    {aviso && <p role="status" className={/^Listo/.test(aviso) ? 'feedback-ok' : 'feedback-error'}>{aviso}</p>}
    <Bloques>
      {!cargando && dispositivos.length === 0 && <Bloque titulo="Todavía no hay ubicaciones" ancho="completo">
        <p className="cosas-motivo">{desdeAca ? 'Tocá «Mandar mi ubicación ahora» para ver el celular acá, y configurá MacroDroid (abajo) para que se actualice solo.' : 'Abrí SB en el celular y tocá «Mandar mi ubicación ahora», o configurá MacroDroid (abajo) para que se actualice solo.'}</p>
      </Bloque>}
      {dispositivos.map(d => <Dispositivo key={d.dispositivo} d={d} ahora={ahora} />)}
      <Bloque titulo="Hacerlo sonar o encontrarlo sin internet" ancho="completo">
        <ul className="cosas-oficiales">{BUSCADORES_OFICIALES.map(b => <li key={b.url}>
          <a className="btn btn-sm" href={b.url} target="_blank" rel="noreferrer">{b.nombre} ↗</a><span className="tenue">{b.detalle}</span>
        </li>)}</ul>
      </Bloque>
    </Bloques>
    {desdeAca && <Pie titulo="Este celular" resumen={alAbrir ? 'manda la ubicación cada vez que abrís SB' : 'solo manda la ubicación con el botón'} boton={alAbrir ? 'Apagar' : 'Mandar al abrir SB'}
      onBoton={() => { cambiarMandarAlAbrir(!alAbrir); setAlAbrir(!alAbrir) }} />}
    <Pie titulo="MacroDroid" resumen={tokenCreado ? `token creado ${haceCuanto(tokenCreado, ahora)}` : 'sin configurar: el celular solo se ubica cuando abrís SB'} boton="Ver cómo configurarlo">
      <div className="cosas-token">
        {token ? <><p><strong>Token nuevo.</strong> Copialo ahora: no se vuelve a mostrar.</p><Codigo>{token}</Codigo></>
          : <button type="button" className="btn btn-sm" onClick={nuevoToken}>{tokenCreado ? 'Generar un token nuevo' : 'Generar el token'}</button>}
      </div>
      <GuiaMacroDroid token={token} />
    </Pie>
  </div>
}
