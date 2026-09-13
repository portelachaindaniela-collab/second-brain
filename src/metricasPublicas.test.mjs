import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarPublicacion, consultarPublicacion } from './metricasPublicas.mjs'
const id = '2095695909770113318'
const enlace = `https://x.com/danielachain/status/${id}`
test('normaliza analytics, parámetros y Twitter sin perder precisión del ID', () => {
  for (const url of [enlace, `${enlace}/analytics`, `${enlace}?s=20`, enlace.replace('x.com','twitter.com'), `${enlace}/photo/1`]) assert.deepEqual(normalizarPublicacion(url), {id, enlace:`https://x.com/i/status/${id}`})
})
test('rechaza dominios falsos, credenciales, perfiles y protocolos inseguros', () => {
  for (const url of ['https://x.com.evil.com/a/status/123','https://x.com@evil.com/a/status/123','javascript:alert(1)','http://x.com/a/status/123','https://x.com/a','https://x.com:444/a/status/123']) assert.throws(() => normalizarPublicacion(url))
})
test('obtiene solo datos públicos, distingue cero de ausente y evita medios inseguros', async () => {
  const p = await consultarPublicacion(enlace, async (url, opciones) => {
    assert.equal(url, `https://api.fxtwitter.com/status/${id}`); assert.equal(opciones.credentials,'omit')
    return {ok:true,json:async()=>({code:200,tweet:{id,text:'Ejemplo',likes:0,retweets:5,views:null,author:{screen_name:'danielachain'},media:{photos:[{url:'https://evil.com/a.png'}]}}})}
  })
  assert.equal(p.metricas.likes,0); assert.equal(p.metricas.vistas,null); assert.equal(p.metricas.respuestas,null); assert.equal(p.imagen,null)
})
test('no acepta respuestas fallidas o de otra publicación', async () => {
  for (const data of [{code:404},{code:200,tweet:{id:'123'}},{}]) await assert.rejects(consultarPublicacion(enlace,async()=>({ok:true,json:async()=>data})))
})
