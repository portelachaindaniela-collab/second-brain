import {monitor} from './checks.mjs';
import {isOwner} from './owner.mjs';
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {HEADER_SECRETO} from '../_shared/trabajador.mjs';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':`authorization, apikey, content-type, x-client-info, ${HEADER_SECRETO}`,'Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json({error:'Método no permitido.'},405);
  // El orquestador la llama con el secreto de Vault cuando corre por cron, sin sesión de nadie.
  const secreto=req.headers.get(HEADER_SECRETO);
  if(secreto){
    try {
      const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const {data:valido}=await admin.rpc('trabajador_secreto_valido',{p_secreto:secreto});
      if(valido!==true)return json({error:'Secreto de trabajador inválido.'},401);
      return json(await monitor());
    }catch{return json({error:'No se pudieron completar los chequeos. Probá nuevamente.'},503);}
  }
  const token=req.headers.get('Authorization');
  if(!token?.startsWith('Bearer '))return json({error:'Iniciá sesión en Second Brain.'},401);
  const url=Deno.env.get('SUPABASE_URL');const key=Deno.env.get('SUPABASE_ANON_KEY');
  if(!url||!key)return json({error:'Falta configurar Supabase.'},503);
  try {
    const userResponse=await fetch(url+'/auth/v1/user',{headers:{Authorization:token,apikey:key},signal:AbortSignal.timeout(10000)});
    if(!userResponse.ok)return json({error:'La sesión no es válida. Volvé a entrar.'},401);
    const user=await userResponse.json();
    // Auth entrega el correo verificado; nunca se acepta identidad desde el body.
    const owner=Deno.env.get('MARIA_OWNER_ID');
    const email=Deno.env.get('MARIA_OWNER_EMAIL');
    if(!owner&&!email)return json({error:'Falta configurar el acceso de María.'},503);
    if(!isOwner(user,owner,email))return json({error:'Esta cuenta no tiene acceso a María.'},403);
    return json(await monitor());
  }catch{return json({error:'No se pudieron completar los chequeos. Probá nuevamente.'},503);}
});
