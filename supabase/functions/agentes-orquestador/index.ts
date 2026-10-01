import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { identificarCorrida, abrirCorrida, cerrarCorrida, HEADER_SECRETO } from "../_shared/trabajador.mjs";
import { resultadoCorrida } from "./corrida.mjs";

const TRABAJADOR = "maria";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = { ...cors, "Content-Type": "application/json" };

async function registrar(admin: any, ownerId: string, agente: string, estado: string, resumen: string, detalle: unknown, inicio: Date) {
  await admin.from("process_reports").insert({
    owner_id: ownerId,
    agente,
    estado,
    resumen,
    detalle,
    iniciado_at: inicio.toISOString(),
    finalizado_at: new Date().toISOString()
  });
}

// Por cron se le pasa el secreto a maria-agent; desde la app, la sesión de la usuaria.
async function correrMonitorSitios(admin: any, ownerId: string, credencial: Record<string, string>) {
  const inicio = new Date();
  try {
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/maria-agent`, {
      method: "POST",
      headers: { ...credencial, "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
      body: "{}"
    });
    const data = await resp.json();
    if (!resp.ok) {
      await registrar(admin, ownerId, "monitor_sitios", "error", data?.error ?? "Falló el chequeo de sitios.", data, inicio);
      return { agente: "monitor_sitios", estado: "error", resumen: data?.error ?? "Falló el chequeo de sitios.", fallo: true };
    }
    const estado = data?.resumen?.estado_general ?? "ok";
    const resumen = `${data?.resumen?.ok ?? 0} ok · ${data?.resumen?.aviso ?? 0} avisos · ${data?.resumen?.error ?? 0} errores`;
    await registrar(admin, ownerId, "monitor_sitios", estado, resumen, data, inicio);
    return { agente: "monitor_sitios", estado, resumen, datos: data };
  } catch (e) {
    await registrar(admin, ownerId, "monitor_sitios", "error", String(e), null, inicio);
    return { agente: "monitor_sitios", estado: "error", resumen: String(e), fallo: true };
  }
}

async function correrTareasEstancadas(admin: any, ownerId: string) {
  const inicio = new Date();
  const limite = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
  try {
    const { data, error } = await admin.from("tasks")
      .select("id,title,touched_at")
      .eq("owner_id", ownerId).eq("done", false)
      .lt("touched_at", limite)
      .order("touched_at", { ascending: true })
      .limit(20);
    if (error) throw error;
    const estancadas = data ?? [];
    const estado = estancadas.length > 5 ? "error" : estancadas.length > 0 ? "aviso" : "ok";
    const resumen = estancadas.length ? `${estancadas.length} tareas sin tocar hace más de 3 días.` : "Ninguna tarea estancada.";
    await registrar(admin, ownerId, "tareas_estancadas", estado, resumen, estancadas, inicio);
    return { agente: "tareas_estancadas", estado, resumen, datos: estancadas };
  } catch (e) {
    await registrar(admin, ownerId, "tareas_estancadas", "error", String(e), null, inicio);
    return { agente: "tareas_estancadas", estado: "error", resumen: String(e), fallo: true };
  }
}

async function correrSyncEstado(admin: any, ownerId: string) {
  const inicio = new Date();
  try {
    const { data: cuenta, error: cuentaError } = await admin.from("oauth_accounts").select("refresh_token,expires_at").eq("owner_id", ownerId).eq("provider", "google").maybeSingle();
    if (cuentaError) throw cuentaError;
    if (!cuenta) {
      const resumen = "Google no está vinculado.";
      await registrar(admin, ownerId, "sync_estado", "aviso", resumen, { vinculado: false }, inicio);
      return { agente: "sync_estado", estado: "aviso", resumen, datos: { vinculado: false } };
    }
    if (!cuenta.refresh_token) {
      const resumen = "Google está vinculado en modo lectura limitada; puede pedir reconectar pronto.";
      await registrar(admin, ownerId, "sync_estado", "aviso", resumen, { vinculado: true, refrescable: false }, inicio);
      return { agente: "sync_estado", estado: "aviso", resumen, datos: { vinculado: true, refrescable: false } };
    }

    const [eventos, mails] = await Promise.all([
      admin.from("calendar_events").select("synced_at").eq("owner_id", ownerId).order("synced_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("emails").select("synced_at").eq("owner_id", ownerId).order("synced_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    const ultimos = [eventos.data?.synced_at, mails.data?.synced_at].filter(Boolean).map((s: string) => new Date(s).getTime());
    if (!ultimos.length) {
      const resumen = "Google vinculado, todavía sin ninguna sincronización.";
      await registrar(admin, ownerId, "sync_estado", "aviso", resumen, { vinculado: true }, inicio);
      return { agente: "sync_estado", estado: "aviso", resumen, datos: { vinculado: true } };
    }
    const masReciente = Math.max(...ultimos);
    const horas = (Date.now() - masReciente) / 3600_000;
    const estado = horas > 26 ? "error" : horas > 2 ? "aviso" : "ok";
    const resumen = `Google vinculado · última sincronización hace ${Math.round(horas)} h.`;
    await registrar(admin, ownerId, "sync_estado", estado, resumen, { vinculado: true, horas }, inicio);
    return { agente: "sync_estado", estado, resumen, datos: { vinculado: true, horas } };
  } catch (e) {
    await registrar(admin, ownerId, "sync_estado", "error", String(e), null, inicio);
    return { agente: "sync_estado", estado: "error", resumen: String(e), fallo: true };
  }
}

// verify_jwt está apagado: la corre pg_cron con el secreto de Vault o la pantalla María con la sesión.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const responder = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: json });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let quien;
  try {
    const body = await req.json().catch(() => ({}));
    quien = await identificarCorrida({ admin, req, clave: TRABAJADOR, body });
  } catch (e: any) {
    return responder({ error: e?.message ?? String(e) }, e?.status ?? 500);
  }
  const credencial: Record<string, string> = quien.secreto
    ? { [HEADER_SECRETO]: quien.secreto }
    : { Authorization: req.headers.get("Authorization") ?? "" };

  let corrida = null;
  try {
    if (quien.anotar) corrida = await abrirCorrida(admin, TRABAJADOR);
    const agentes = await Promise.all([
      correrMonitorSitios(admin, quien.ownerId, credencial),
      correrTareasEstancadas(admin, quien.ownerId),
      correrSyncEstado(admin, quien.ownerId)
    ]);
    await cerrarCorrida(admin, corrida, resultadoCorrida(agentes));
    return responder({ generado: new Date().toISOString(), agentes });
  } catch (e) {
    await cerrarCorrida(admin, corrida, { estado: "error", error: String(e) });
    return responder({ error: String(e) }, 500);
  }
});
