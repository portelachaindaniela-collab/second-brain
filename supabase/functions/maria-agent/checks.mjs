// Adaptación de maria/checks.py y sitios.yml. Solo consulta destinos fijos.
export const sites = [
  {nombre:'Radar Laboral (scraper de empleos)',url:'https://portelachaindaniela-collab.github.io/scraper-busquedas-laborales/',extras:true},
  {nombre:'ODBA - Arma mi dia',url:'https://odba.netlify.app'},
  {nombre:'Portfolio Daniela',url:'https://danielaportelachain.vercel.app'},
  {nombre:'Point Data Global',url:'https://pointdataglobal.netlify.app'},
  {nombre:'Primera AFA Femenina',url:'https://primeraafem.netlify.app'},
  {nombre:'Creando Sentido',url:'https://creandosentido.netlify.app'}
];
export function worst(checks) {
  return checks.some(c=>c.nivel==='error')?'error':checks.some(c=>c.nivel==='aviso')?'aviso':'ok';
}
export async function readLimited(response, max=65536) {
  if(!response.body) return '';
  const reader=response.body.getReader(); const parts=[]; let size=0;
  try {while(size<max){const {value,done}=await reader.read();if(done)break;const part=value.subarray(0,max-size);parts.push(part);size+=part.length;}}
  finally {await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return new TextDecoder().decode(bytes);
}
export function scraperCheck(data, now=Date.now()) {
  const stamp=data.fin||data.inicio;
  if(typeof stamp!=='string')return {nivel:'error',detalle:'El reporte no contiene fecha de corrida.'};
  const time=Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(stamp)?stamp:stamp+'Z');
  if(!Number.isFinite(time))return {nivel:'error',detalle:'La fecha de corrida no es válida.'};
  const hours=(now-time)/3600000;
  if(hours < -0.1)return {nivel:'aviso',detalle:'La fecha de corrida está en el futuro.'};
  const failed=Object.entries(data.portales||{}).filter(([,v])=>v?.estado!=='ok').map(([k])=>k);
  return {nivel:hours>26?'error':failed.length?'aviso':'ok',detalle:hours>26?`Última corrida hace ${Math.round(hours)} h (límite: 26 h).`:failed.length?`Fallaron: ${failed.join(', ')}.`:`Corrida hace ${Math.round(hours)} h; ${data.publicados??'sin cantidad de'} avisos publicados.`,horas_desde_corrida:Math.round(hours*10)/10};
}
export function actionsCheck(data) {
  const run=data.workflow_runs?.[0];
  if(!run)return {nivel:'aviso',detalle:'Sin corridas registradas.'};
  return {nivel:run.status!=='completed'?'aviso':run.conclusion==='success'?'ok':'error',detalle:run.status!=='completed'?`Corrida ${run.status}.`:`Última corrida: ${run.conclusion}.`};
}
// `lista` sale de trabajadores.parametros.sitios cuando la corre el trabajador; `sites` queda como valor por defecto.
export async function monitor(fetcher=fetch, lista=sites) {
  // No se siguen redirecciones: evita que un destino remoto redirija a una red privada.
  async function get(url) {
    const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'MARIA-monitor/2.0','Accept':'application/json,text/html'}});
    const text=await readLimited(response);return {response,text};
  }
  const results=await Promise.all(lista.map(async site=>{
    const checks=[];const start=Date.now();
    try {const {response,text}=await get(site.url);const ms=Date.now()-start;
      const marker=['page not found','site not found','404 not found','application error','internal server error'].find(x=>text.toLowerCase().includes(x));
      const redirect=response.status>=300&&response.status<400;
      checks.push({tipo:'sitio online',nivel:redirect?'aviso':response.status!==200||marker?'error':ms>3500?'aviso':'ok',detalle:redirect?'El sitio redirige; revisar el destino manualmente.':marker?`La página contiene «${marker}».`:`HTTP ${response.status} en ${ms} ms.`,latencia_ms:ms});
    }catch{checks.push({tipo:'sitio online',nivel:'error',detalle:'No se pudo consultar el sitio dentro de 12 segundos.'});}
    if(site.extras){
      const extra=await Promise.all([
        ['corrida del scraper',site.url+'ultima_corrida.json',scraperCheck],
        ['GitHub Actions','https://api.github.com/repos/portelachaindaniela-collab/scraper-busquedas-laborales/actions/workflows/scrape.yml/runs?per_page=1',actionsCheck]
      ].map(async([tipo,url,parse])=>{try{const {response,text}=await get(url);if(!response.ok)throw Error();return {tipo,...parse(JSON.parse(text))};}catch{return {tipo,nivel:'aviso',detalle:'No se pudo consultar esta fuente; el estado no está verificado.'};}}));checks.push(...extra);
    }
    return {nombre:site.nombre,url:site.url,nivel:worst(checks),chequeos:checks};
  }));
  results.sort((a,b)=>['error','aviso','ok'].indexOf(a.nivel)-['error','aviso','ok'].indexOf(b.nivel));
  return {generado:new Date().toISOString(),resumen:{sitios:results.length,ok:results.filter(s=>s.nivel==='ok').length,aviso:results.filter(s=>s.nivel==='aviso').length,error:results.filter(s=>s.nivel==='error').length,estado_general:worst(results)},sitios:results};
}
