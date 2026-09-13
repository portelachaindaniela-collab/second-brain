import { useEffect, useRef, useState } from 'react'

const SONIDOS = [['rain', 'Lluvia'], ['birds-tree', 'Pájaros'], ['coffee', 'Cafetería'], ['waves', 'Olas']]

export default function Ambiente() {
  const [sonido, setSonido] = useState('rain')
  const [volumen, setVolumen] = useState(25)
  const [activo, setActivo] = useState(false)
  const [error, setError] = useState('')
  const audio = useRef(null)
  useEffect(() => {
    const elemento = audio.current
    return () => { elemento?.pause() }
  }, [])
  function elegir(valor) {
    audio.current?.pause(); setActivo(false); setError(''); setSonido(valor)
  }
  async function alternar() {
    if (activo) { audio.current.pause(); setActivo(false); return }
    setError('')
    try { audio.current.volume = volumen / 100; await audio.current.play(); setActivo(true) }
    catch { setError('No se pudo reproducir este sonido. Probá otro.'); setActivo(false) }
  }
  return <div className="escritor-ambiente">
    <span>Ambiente</span>
    <select aria-label="Sonido de ambiente" value={sonido} onChange={e => elegir(e.target.value)}>{SONIDOS.map(([id,nombre]) => <option key={id} value={id}>{nombre}</option>)}</select>
    <button className="btn btn-sm" onClick={alternar} aria-pressed={activo}>{activo ? 'Pausar' : 'Escuchar'}</button>
    <input type="range" aria-label="Volumen del ambiente" min="0" max="100" value={volumen} onChange={e => { const v = Number(e.target.value); setVolumen(v); if (audio.current) audio.current.volume = v / 100 }} />
    <small>{volumen}%</small>
    <audio ref={audio} src={`${import.meta.env.BASE_URL}sonidos/${sonido}.ogg`} loop preload="none" onError={() => { setActivo(false); setError('No se pudo cargar el sonido.') }} />
    {error && <span role="alert">{error}</span>}
  </div>
}
