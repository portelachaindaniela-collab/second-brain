import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { identificarCorrida, abrirCorrida, cerrarCorrida, HEADER_SECRETO } from "../_shared/trabajador.mjs";
import { TRABAJADOR, MAXIMO, diasSinTocar, limiteTouched, resultadoTareas } from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// verify_jwt apagado: la corre pg_cron con el secreto de Vault o el botón [correr] del panel con la sesión.
// Lista las tareas sin tocar de la dueña y las deja en trabajos_corridas; quien lo interpreta es María.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let quien;
  try {
    const body = await req.json().catch(() => ({}));
    quien = await identificarCorrida({ admin, req, clave: TRABAJADOR, body });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, e?.status ?? 500);
  }

  let corrida = null;
  try {
    corrida = await abrirCorrida(admin, TRABAJADOR);
    const { data: config, error: errorConfig } = await admin.from("trabajadores").select("parametros").eq("clave", TRABAJADOR).maybeSingle();
    if (errorConfig || !config) throw new Error("No hay configuración para tareas estancadas.");
    const dias = diasSinTocar(config.parametros);
    const { data, error } = await admin.from("tasks")
      .select("id,title,touched_at")
      .eq("owner_id", quien.ownerId).eq("done", false)
      .lt("touched_at", limiteTouched(dias))
      .order("touched_at", { ascending: true })
      .limit(MAXIMO);
    if (error) throw error;
    const resultado = resultadoTareas(data ?? [], dias);
    await cerrarCorrida(admin, corrida, resultado);
    return json({ id: corrida.id, estado: "ok", tareas: resultado.cantidad });
  } catch (e: any) {
    const mensaje = e?.message ?? String(e);
    await cerrarCorrida(admin, corrida, { estado: "error", error: mensaje });
    return json({ id: corrida?.id, estado: "error", error: mensaje }, 502);
  }
});
