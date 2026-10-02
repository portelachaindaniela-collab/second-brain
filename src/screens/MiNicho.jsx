import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'
import { CabeceraPantalla, Bloques, Bloque, Pie } from '../estructura.jsx'
import {
  TRABAJADOR_NOTICIAS, TEMAS, nombreTema, nombrePais, IDIOMAS, haceCuanto, filtrar, porTema, destacadas,
  temaPrincipal, newslettersDelMail, cifrasNoticias,
} from '../noticias.mjs'
import { horaAR } from '../trabajadores.mjs'
import './Noticias.css'

const FILTROS_VACIOS = { pais: '', idioma: '', web: true, x: true, bluesky: true, fuente: '', soloSinLeer: false, guardadas: false, texto: '' }
const CANALES = { web: { icono: '◎', titulo: 'Nota en la web' }, x: { icono: '𝕏', titulo: 'Post en X' }, bluesky: { icono: '🦋', titulo: 'Post en Bluesky' } }
const POR_BLOQUE = 4
const REFERENTES_POR_BLOQUE = 3

function useReloj() {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(reloj)
  }, [])
  return ahora
}

function Canal({ canal }) {
  const c = CANALES[canal] ?? CANALES.web
  return <span className={`noticia-canal canal-${canal}`} title={c.titulo}>{c.icono}</span>
}

function Meta({ n, ahora, otros, marcar }) {
  return <div className="noticia-meta">
    <Canal canal={n.canal} />
    <b>{n.medio}</b>
    <span className="noticia-pais" title={nombrePais(n.pais)}>{n.pais}</span>
    <span>· {haceCuanto(n.publicada_at, ahora)}</span>
    {otros > 0 && <span>· +{otros} {otros === 1 ? 'medio' : 'medios'}</span>}
    {n.leida && <span>· leída</span>}
    <button className={`noticia-guardar${n.guardada ? ' on' : ''}`} aria-pressed={n.guardada}
      title={n.guardada ? 'Quitar de guardadas' : 'Guardar'} onClick={e => { e.preventDefault(); e.stopPropagation(); marcar(n, { guardada: !n.guardada }) }}>
      {n.guardada ? '★' : '☆'}
    </button>
  </div>
}

// La nota abre en el navegador (en Electron, window.open va al navegador del sistema) y queda como leída.
function Enlace({ n, marcar, className, children }) {
  return <a className={className} href={n.url} target="_blank" rel="noreferrer" onClick={() => { if (!n.leida) marcar(n, { leida: true }) }}>{children}</a>
}

function Imagen({ src, className }) {
  const [rota, setRota] = useState(false)
  return <div className={`noticia-img ${className ?? ''}`}>
    {src && !rota && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setRota(true)} />}
  </div>
}

function Destacada({ d, ahora, marcar }) {
  const n = d.noticia
  return <article className={`noticia-destacada${n.leida ? ' leida' : ''}`}>
    <Enlace n={n} marcar={marcar} className="noticia-link">
      <Imagen src={n.imagen} className="img-destacada" />
      <span className="noticia-tema">{nombreTema(temaPrincipal(n))}</span>
      <h3>{n.titulo}</h3>
    </Enlace>
    <Meta n={n} ahora={ahora} otros={d.otros} marcar={marcar} />
  </article>
}

function Grande({ n, ahora, marcar }) {
  return <article className={`noticia-grande${n.leida ? ' leida' : ''}`}>
    <Enlace n={n} marcar={marcar} className="noticia-link">
      <Imagen src={n.imagen} className="img-grande" />
      <h3>{n.titulo}</h3>
    </Enlace>
    <Meta n={n} ahora={ahora} marcar={marcar} />
    {n.resumen && <p className="noticia-resumen">{n.resumen}</p>}
  </article>
}

function Fila({ n, ahora, marcar }) {
  return <article className={`noticia-fila${n.leida ? ' leida' : ''}`}>
    <Enlace n={n} marcar={marcar} className="noticia-link noticia-fila-link">
      <Imagen src={n.imagen} className="img-fila" />
      <h4>{n.titulo}</h4>
    </Enlace>
    <Meta n={n} ahora={ahora} marcar={marcar} />
  </article>
}

// Lo que publica un referente es un post corto: va en una fila de texto, sin foto grande.
function PostReferente({ n, ahora, marcar }) {
  return <article className={`referente-post${n.leida ? ' leida' : ''}`}>
    <Enlace n={n} marcar={marcar} className="noticia-link"><p>{n.titulo}</p></Enlace>
    <Meta n={n} ahora={ahora} marcar={marcar} />
  </article>
}

function BloqueTema({ tema, lista, referentes, ahora, marcar }) {
  const [todas, setTodas] = useState(false)
  const [todosRef, setTodosRef] = useState(false)
  const primera = lista.find(n => n.imagen) ?? lista[0]
  const resto = lista.filter(n => n !== primera)
  const visibles = todas ? resto : resto.slice(0, POR_BLOQUE - 1)
  const refVisibles = todosRef ? referentes : referentes.slice(0, REFERENTES_POR_BLOQUE)
  const nota = lista.length + referentes.length
    ? `${lista.length} ${lista.length === 1 ? 'nota' : 'notas'} · ${referentes.length} de referentes`
    : 'sin novedades'
  return <Bloque titulo={tema.nombre} accion={<span className="bloque-nota">{nota}</span>}>
    {!lista.length && !referentes.length && <p className="hint">Canillita no encontró nada de este tema con los filtros actuales.</p>}
    {primera && <Grande n={primera} ahora={ahora} marcar={marcar} />}
    {visibles.map(n => <Fila key={n.id} n={n} ahora={ahora} marcar={marcar} />)}
    {resto.length > POR_BLOQUE - 1 && <button className="noticias-mas" onClick={() => setTodas(x => !x)}>
      {todas ? 'Ver menos' : `Ver las ${lista.length} notas →`}
    </button>}
    {referentes.length > 0 && <div className="referentes-tema">
      <h3 className="referentes-titulo">Qué dicen los referentes</h3>
      {refVisibles.map(n => <PostReferente key={n.id} n={n} ahora={ahora} marcar={marcar} />)}
      {referentes.length > REFERENTES_POR_BLOQUE && <button className="noticias-mas" onClick={() => setTodosRef(x => !x)}>
        {todosRef ? 'Ver menos' : `Ver los ${referentes.length} posts →`}
      </button>}
    </div>}
  </Bloque>
}

function Newsletters({ items, medios, ahora }) {
  const conNewsletter = medios.filter(m => m.newsletter)
  const [lista, setLista] = useState(false)
  return <Bloque titulo="Newsletters en tu mail" accion={<span className="bloque-nota">de los medios de la lista</span>}>
    {items.length === 0 && <p className="hint">Todavía no llegó ninguna newsletter de estos medios a tu Gmail.</p>}
    {items.slice(0, 5).map(({ mail, medio }) => <div key={mail.id} className="newsletter-fila">
      <span className="newsletter-ico">{medio.medio.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 2).toUpperCase()}</span>
      <div><h4>{mail.subject || '(sin asunto)'}</h4><small>{medio.medio} · {mail.from_name || mail.from_addr}</small></div>
      <span className="newsletter-hora">{haceCuanto(mail.received_at, ahora)}</span>
    </div>)}
    <button className="noticias-mas" onClick={() => setLista(x => !x)}>
      {lista ? 'Cerrar' : `Suscribirte a más: ${conNewsletter.length} medios tienen newsletter →`}
    </button>
    {lista && <ul className="newsletter-lista">
      {conNewsletter.sort((a, b) => a.medio.localeCompare(b.medio)).map(m => <li key={m.id}>
        <a href={m.newsletter} target="_blank" rel="noreferrer">{m.medio}</a> <span className="hint">{nombrePais(m.pais)}</span>
      </li>)}
    </ul>}
  </Bloque>
}

function ListaMedios({ medios, ahora }) {
  const porPais = useMemo(() => {
    const g = {}
    for (const m of medios) (g[m.pais] ??= []).push(m)
    return Object.entries(g).sort(([a], [b]) => nombrePais(a).localeCompare(nombrePais(b)))
  }, [medios])
  return <div className="medios-lista">
    {porPais.map(([pais, lista]) => <div key={pais} className="medios-pais">
      <h4>{nombrePais(pais)}</h4>
      {lista.map(m => <div key={m.id} className={`medio-fila${m.ultimo_error ? ' con-error' : ''}`} title={m.ultimo_error ?? ''}>
        <span>{m.medio}</span>
        <span className="medio-canales">
          {m.rss && <a href={m.sitio} target="_blank" rel="noreferrer" title="web">◎</a>}
          {m.x && <a href={`https://x.com/${m.x}`} target="_blank" rel="noreferrer" title={`@${m.x}`}>𝕏</a>}
          {m.newsletter && <a href={m.newsletter} target="_blank" rel="noreferrer" title="newsletter">✉</a>}
        </span>
        <span className="hint">{m.ultimo_error ? 'falló la última lectura' : m.ultima_lectura_at ? haceCuanto(m.ultima_lectura_at, ahora) : 'sin leer todavía'}</span>
      </div>)}
    </div>)}
  </div>
}

function ListaReferentes({ referentes, ahora }) {
  return <div className="medios-lista">
    {TEMAS.map(t => {
      const lista = referentes.filter(r => r.temas?.includes(t.clave))
      if (!lista.length) return null
      return <div key={t.clave} className="medios-pais">
        <h4>{t.nombre}</h4>
        {lista.map(r => <div key={r.id} className={`medio-fila referente-fila${r.ultimo_error ? ' con-error' : ''}`} title={r.ultimo_error ?? r.descripcion ?? ''}>
          <span><b>{r.medio}</b><small>{r.descripcion}</small></span>
          <span className="medio-canales">
            {r.rss && <a href={r.sitio} target="_blank" rel="noreferrer" title="blog o newsletter">◎</a>}
            {r.x && <a href={`https://x.com/${r.x}`} target="_blank" rel="noreferrer" title={`@${r.x}`}>𝕏</a>}
            {r.bluesky && <a href={`https://bsky.app/profile/${r.bluesky}`} target="_blank" rel="noreferrer" title={`@${r.bluesky}`}>🦋</a>}
          </span>
          <span className="hint">{r.ultimo_error ? 'falló la última lectura' : r.ultima_lectura_at ? haceCuanto(r.ultima_lectura_at, ahora) : 'sin leer todavía'}</span>
        </div>)}
      </div>
    })}
  </div>
}

// Mi nicho: por ahora, las noticias y los referentes de los temas de Daniela; más adelante, también métricas.
export default function MiNicho() {
  const ahora = useReloj()
  const [noticias, setNoticias] = useState([])
  const [medios, setMedios] = useState([])
  const [mails, setMails] = useState([])
  const [ultima, setUltima] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [f, setF] = useState(FILTROS_VACIOS)
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState('')

  const cargar = useCallback(async () => {
    const desde = new Date(Date.now() - 15 * 86_400_000).toISOString()
    const [n, m, c, e] = await Promise.all([
      supabase.from('noticias').select('id,url,titulo,resumen,imagen,medio,pais,idioma,canal,temas,publicada_at,leida,guardada,de_referente')
        .order('publicada_at', { ascending: false }).limit(1500),
      supabase.from('noticias_medios').select('id,medio,pais,idioma,sitio,rss,x,bluesky,newsletter,temas,tipo,descripcion,activo,ultima_lectura_at,ultimo_error').order('medio'),
      supabase.from('trabajos_corridas').select('estado,finalizado_at,iniciado_at,cantidad_resultados').eq('trabajador', TRABAJADOR_NOTICIAS)
        .order('iniciado_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('emails').select('id,subject,from_name,from_addr,received_at').gte('received_at', desde).order('received_at', { ascending: false }).limit(300),
    ])
    if (n.error || m.error) setError((n.error || m.error).message)
    else setError('')
    setNoticias(n.data ?? [])
    setMedios(m.data ?? [])
    setUltima(c.data ?? null)
    setMails(e.data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Cuando Canillita termina una corrida (la del cron o la del botón), se recarga sola.
  useEffect(() => {
    const canal = supabase.channel('noticias-canillita')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trabajos_corridas', filter: `trabajador=eq.${TRABAJADOR_NOTICIAS}` }, p => {
        if (p.new?.estado !== 'corriendo') cargar()
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [cargar])

  const marcar = useCallback(async (n, cambio) => {
    setNoticias(lista => lista.map(x => (x.id === n.id ? { ...x, ...cambio } : x)))
    const { error: e } = await supabase.from('noticias').update(cambio).eq('id', n.id)
    if (e) {
      setNoticias(lista => lista.map(x => (x.id === n.id ? n : x)))
      setNota(`No se pudo guardar el cambio: ${e.message}`)
    }
  }, [])

  async function actualizar() {
    setOcupado(true)
    setNota('Canillita está leyendo la próxima tanda de medios…')
    const { data, error: e } = await supabase.functions.invoke('trabajador-noticias', { body: { origen: 'app_manual' } })
    setOcupado(false)
    if (e || data?.error) setNota(`No pudo leer: ${data?.error || e.message}`)
    else { setNota(`Listo: ${data.nuevas} ${data.nuevas === 1 ? 'nota nueva' : 'notas nuevas'}.`); cargar() }
  }

  const visibles = useMemo(() => filtrar(noticias, f), [noticias, f])
  const temas = useMemo(() => porTema(visibles), [visibles])
  const top = useMemo(() => destacadas(visibles, ahora), [visibles, ahora])
  const cifras = useMemo(() => cifrasNoticias(noticias, ahora), [noticias, ahora])
  const soloMedios = useMemo(() => medios.filter(m => m.tipo !== 'referente'), [medios])
  const referentes = useMemo(() => medios.filter(m => m.tipo === 'referente'), [medios])
  const newsletters = useMemo(() => newslettersDelMail(mails, soloMedios), [mails, soloMedios])
  const paises = useMemo(() => [...new Set(noticias.map(n => n.pais))].sort((a, b) => nombrePais(a).localeCompare(nombrePais(b))), [noticias])
  const idiomas = useMemo(() => [...new Set(noticias.map(n => n.idioma).filter(Boolean))], [noticias])

  const campo = k => e => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const alternar = k => () => setF(x => ({ ...x, [k]: !x[k] }))
  const resumenFiltros = [
    f.pais ? nombrePais(f.pais) : 'todos los países',
    f.idioma ? IDIOMAS[f.idioma] ?? f.idioma : 'todos los idiomas',
    ['web', 'x', 'bluesky'].every(c => f[c]) ? 'web, X y Bluesky' : `solo ${['web', 'x', 'bluesky'].filter(c => f[c]).map(c => ({ web: 'web', x: 'X', bluesky: 'Bluesky' })[c]).join(' y ') || 'ningún canal'}`,
    ...(f.fuente ? [f.fuente === 'referente' ? 'solo referentes' : 'solo medios'] : []),
    ...(f.soloSinLeer ? ['sin leer'] : []), ...(f.guardadas ? ['guardadas'] : []), ...(f.texto ? [`“${f.texto}”`] : []),
  ].join(' · ')
  const paisesMedios = new Set(soloMedios.map(m => m.pais)).size
  const enX = soloMedios.filter(m => m.x).length
  const conNewsletter = soloMedios.filter(m => m.newsletter).length
  const ultimaLectura = ultima?.finalizado_at ? `última lectura ${haceCuanto(ultima.finalizado_at, ahora)} (${horaAR(Date.parse(ultima.finalizado_at))})` : 'todavía no leyó'

  return <div className="noticias">
    <CabeceraPantalla sobretitulo="Radar" titulo="Mi nicho" cargando={cargando}
      subtitulo="Lo que publican los medios principales de cada país y los referentes de cada área sobre tus temas."
      cifras={[
        { valor: cifras.ultimas24, etiqueta: 'Últimas 24 h' },
        { valor: cifras.paises, etiqueta: 'Países' },
        { valor: cifras.sinLeer, etiqueta: 'Sin leer' },
        { valor: cifras.guardadas, etiqueta: 'Guardadas' },
      ]} />

    {error && <p className="noticias-error" role="alert">No se pudieron cargar las noticias: {error}</p>}
    {!cargando && !noticias.length && !error && <p className="hint">Canillita todavía no trajo noticias. Corre cada hora; podés pedirle que lea ahora desde el pie.</p>}

    {noticias.length > 0 && <Bloques>
      {top.length > 0 && <Bloque titulo="Destacadas" ancho="completo" accion={<span className="bloque-nota">las que más medios cubrieron en el día</span>}>
        <div className="noticias-destacadas">{top.map(d => <Destacada key={d.noticia.id} d={d} ahora={ahora} marcar={marcar} />)}</div>
      </Bloque>}
      {TEMAS.map(t => <BloqueTema key={t.clave} tema={t} lista={temas[t.clave]?.notas ?? []} referentes={temas[t.clave]?.referentes ?? []} ahora={ahora} marcar={marcar} />)}
      <Newsletters items={newsletters} medios={soloMedios} ahora={ahora} />
    </Bloques>}

    <Pie titulo="Filtros" resumen={resumenFiltros} boton="Filtrar">
      <div className="noticias-filtros">
        <label>País <select value={f.pais} onChange={campo('pais')}>
          <option value="">todos</option>
          {paises.map(p => <option key={p} value={p}>{nombrePais(p)}</option>)}
        </select></label>
        <label>Idioma <select value={f.idioma} onChange={campo('idioma')}>
          <option value="">todos</option>
          {idiomas.map(i => <option key={i} value={i}>{IDIOMAS[i] ?? i}</option>)}
        </select></label>
        <button className={`noticias-toggle${f.web ? ' on' : ''}`} aria-pressed={f.web} onClick={alternar('web')}>Web</button>
        <button className={`noticias-toggle${f.x ? ' on' : ''}`} aria-pressed={f.x} onClick={alternar('x')}>X</button>
        <button className={`noticias-toggle${f.bluesky ? ' on' : ''}`} aria-pressed={f.bluesky} onClick={alternar('bluesky')}>Bluesky</button>
        <label>Fuente <select value={f.fuente} onChange={campo('fuente')}>
          <option value="">medios y referentes</option>
          <option value="medio">solo medios</option>
          <option value="referente">solo referentes</option>
        </select></label>
        <button className={`noticias-toggle${f.soloSinLeer ? ' on' : ''}`} aria-pressed={f.soloSinLeer} onClick={alternar('soloSinLeer')}>Solo sin leer</button>
        <button className={`noticias-toggle${f.guardadas ? ' on' : ''}`} aria-pressed={f.guardadas} onClick={alternar('guardadas')}>Guardadas</button>
        <input className="noticias-buscar" type="search" placeholder="Buscar en titulares…" value={f.texto} onChange={campo('texto')} />
        {JSON.stringify(f) !== JSON.stringify(FILTROS_VACIOS) && <button className="btn btn-sm" onClick={() => setF(FILTROS_VACIOS)}>Limpiar</button>}
      </div>
    </Pie>
    <Pie titulo="Canillita" resumen={`${ultimaLectura} · lee ${soloMedios.length} medios y ${referentes.length} referentes por tandas, cada hora`} boton={ocupado ? 'Leyendo…' : 'Leer ahora'}
      onBoton={actualizar} ocupado={ocupado} nota={nota} />
    <Pie titulo="Fuentes" resumen={`${soloMedios.length} medios de ${paisesMedios} países · ${enX} en X · ${conNewsletter} con newsletter`} boton="Ver medios">
      <ListaMedios medios={soloMedios} ahora={ahora} />
    </Pie>
    <Pie titulo="Referentes" resumen={`${referentes.length} personas y cuentas que marcan agenda en tus temas`} boton="Ver referentes">
      <ListaReferentes referentes={referentes} ahora={ahora} />
    </Pie>
  </div>
}

