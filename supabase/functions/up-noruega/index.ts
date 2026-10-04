import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { HEADER_SECRETO } from "../_shared/trabajador.mjs";
import {
  hoyAR, chequearBorradores, chequearCorridas, chequearDisenador, chequearPublicador, chequearConexiones,
  chequearPreguntas, chequearCrons, estadoGeneral,
} from "./logic.mjs";

// Noruega, el agente madre de UP. La dispara pg_cron cada 30 minutos (x-trabajador-secreto) o la dueña con
// "Revisar ahora" (su sesión). Guarda cada revisión en up_chequeos; la pantalla Agentes muestra la última.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`, "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const REDES_AUTOMATICAS = ["linkedin"]; // las mismas que publica up-publicador
const DIAS_HISTORIAL = 7;

async function revisar(admin: any, ownerId: string, crons: any[]) {
  const ahora = Date.now();
  const hoy = hoyAR(new Date(ahora));
  const desde = new Date(ahora - 24 * 3600_000).toISOString();
  const [dia, piezasHoy, corridas, carruseles, horarios, conexiones, faltaInfo] = await Promise.all([
    admin.from("up_calendario").select("fecha,redes,formato_instagram,salteado").eq("owner_id", ownerId).eq("fecha", hoy).maybeSingle(),
    admin.from("up_piezas").select("red,texto,estado,error_publicacion").eq("owner_id", ownerId).eq("fecha", hoy),
    admin.from("up_corridas").select("fecha,estado,error,iniciado_at").eq("owner_id", ownerId).gte("iniciado_at", desde),
    admin.from("up_piezas").select("texto,estado,assets_texto,updated_at").eq("owner_id", ownerId).eq("red", "instagram").eq("contenido->>formato", "carrusel").neq("estado", "publicado").not("texto", "is", null),
    admin.from("up_horarios").select("red,hora").eq("owner_id", ownerId),
    admin.from("up_conexiones").select("red,expira_at").eq("owner_id", ownerId),
    admin.from("up_piezas").select("fecha").eq("owner_id", ownerId).eq("estado", "falta_info").gte("fecha", hoy),
  ]);
  const error = [dia, piezasHoy, corridas, carruseles, horarios, conexiones, faltaInfo].find((x: any) => x.error)?.error;
  if (error) throw new Error(error.message);

  const chequeos = [
    chequearBorradores({ dia: dia.data, piezas: piezasHoy.data, ahora }),
    chequearCorridas({ corridas: corridas.data, ahora }),
    chequearDisenador({ carruseles: carruseles.data, ahora }),
    chequearPublicador({ piezasHoy: piezasHoy.data, horarios: horarios.data, conexiones: conexiones.data, ahora, redesAutomaticas: REDES_AUTOMATICAS }),
    chequearConexiones({ conexiones: conexiones.data, ahora }),
    chequearPreguntas({ faltaInfo: faltaInfo.data, ahora }),
    chequearCrons({ crons, ahora }),
  ];
  const estado = estadoGeneral(chequeos);
  await admin.from("up_chequeos").insert({ owner_id: ownerId, estado, chequeos });
  await admin.from("up_chequeos").delete().eq("owner_id", ownerId).lt("at", new Date(ahora - DIAS_HISTORIAL * 86_400_000).toISOString());
  return { estado, chequeos };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let duenas: string[];
  const secreto = req.headers.get(HEADER_SECRETO);
  if (secreto) {
    const { data: valido } = await admin.rpc("trabajador_secreto_valido", { p_secreto: secreto });
    if (valido !== true) return json({ error: "Secreto inválido." }, 401);
    const { data } = await admin.from("up_calendario").select("owner_id");
    duenas = [...new Set((data || []).map((d: any) => d.owner_id as string))];
  } else {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
    const { data, error } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
    if (error || !data?.user) return json({ error: "Iniciá sesión." }, 401);
    duenas = [data.user.id];
  }

  const { data: crons, error } = await admin.rpc("up_estado_crons");
  if (error) return json({ error: error.message }, 500);
  try {
    const resultados = [];
    for (const d of duenas) resultados.push(await revisar(admin, d, crons || []));
    return json({ resultados });
  } catch (e) {
    return json({ error: `Noruega no pudo revisar (${e instanceof Error ? e.message : String(e)}).` }, 500);
  }
});
