import test from 'node:test'
import assert from 'node:assert/strict'
import { cuerpoEscrito, leerContenido, VACIO, combinarEscritos, serializarGuardados, leerLocales, claveEscrito } from './escritos.mjs'
test('guarda formato estructurado y no interpreta HTML externo como documento', () => {
  assert.deepEqual(leerContenido(cuerpoEscrito(VACIO)), VACIO)
  assert.equal(leerContenido('<script>alert(1)</script>'),null)
  assert.equal(leerContenido('{"contenido":{"type":"doc"}}'),null)
})
test('recupera borradores pendientes sin ocultar documentos de la cuenta', () => {
  const base = {body:cuerpoEscrito(VACIO),updated_at:'2026-09-13T12:00:00Z'}
  const docs = combinarEscritos([{...base,id:'a',title:'Remoto'},{...base,id:'b'}],[{...base,id:'a',title:'Borrador',pendiente:true}])
  assert.equal(docs.find(d=>d.id==='a').title,'Borrador'); assert.equal(docs.length,2)
})
test('aísla borradores por cuenta e ignora registros dañados', () => {
  const m = new Map([[claveEscrito('ana','1'),JSON.stringify({id:'1',owner_id:'ana',body:cuerpoEscrito(VACIO)})],[claveEscrito('otra','2'),JSON.stringify({id:'2',owner_id:'otra',body:cuerpoEscrito(VACIO)})],[claveEscrito('ana','3'),'roto']])
  const almacen = {length:m.size,key:i=>[...m.keys()][i],getItem:k=>m.get(k)}
  assert.deepEqual(leerLocales(almacen,'ana').map(d=>d.id),['1'])
})
test('una respuesta lenta no puede sobrescribir una versión posterior', async () => {
  let liberar
  const puerta = new Promise(r=>{liberar=r})
  const llamadas=[]
  const guardar=serializarGuardados(async d=>{llamadas.push(d.version);if(d.version===1)await puerta})
  const a=guardar({id:'a',owner_id:'ana',version:1}); const b=guardar({id:'a',owner_id:'ana',version:2})
  await new Promise(r=>setTimeout(r,0)); assert.deepEqual(llamadas,[1]); liberar(); await Promise.all([a,b]); assert.deepEqual(llamadas,[1,2])
})
test('permite reintentar después de un fallo de guardado', async () => {
  const guardar=serializarGuardados(async d=>{if(d.version===1)throw new Error('sin red');return d.version})
  await assert.rejects(guardar({id:'a',owner_id:'ana',version:1})); assert.equal(await guardar({id:'a',owner_id:'ana',version:2}),2)
})
