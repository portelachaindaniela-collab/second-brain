import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { tienePermiso, urlPermiso, idDeHoja, columnas, letraColumna, filasPostulaciones, mismaPostulacion, motivoErrorGoogle } from "./logic.mjs";

// Pantalla Postulaciones. La app manda, con la sesión de la dueña:
//   { accion: 'estado' }                      ¿hay Google, permiso de planillas y planilla elegida?
//   { accion: 'conectar' }                    link para sumar el permiso de planillas a la conexión de Google
//   { accion: 'elegir', hoja: link o id }     guarda cuál es la planilla
//   { accion: 'leer' }                        filas de la planilla
//   { accion: 'cambiar', fila, puesto, empresa, estado }  escribe el estado de esa fila en la planilla

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

class ErrorGoogle extends Error {
  status: number;
  constructor(status: number, cuerpo: unknown) { super(motivoErrorGoogle(status, cuerpo)); this.status = status; }
}

async function tokenVigente(admin: any, cuenta: any): Promise<string> {
  if (cuenta.access_token && cuenta.expires_at && Date.parse(cuenta.expires_at) - 60_000 > Date.now()) return cuenta.access_token;
  if (!cuenta.refresh_token) throw new ErrorGoogle(401, null);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: cuenta.refresh_token, grant_type: "refresh_token" }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new ErrorGoogle(401, t);
  await admin.from("oauth_accounts").update({ access_token: t.access_token, expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString() }).eq("id", cuenta.id);
  return t.access_token;
}

async function google(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorGoogle(r.status, cuerpo);
  return cuerpo;
}

const rango = (pestana: string, a1: string) => encodeURIComponent(`'${pestana.replace(/'/g, "''")}'!${a1}`);

// La pestaña guardada, o la primera de la planilla.
async function abrir(token: string, hoja: any) {
  const meta = await google(token, `${SHEETS}/${hoja.hoja_id}?fields=properties.title,spreadsheetUrl,sheets.properties.title`);
  const pestanas = (meta.sheets || []).map((s: any) => s.properties.title);
  const pestana = hoja.pestana && pestanas.includes(hoja.pestana) ? hoja.pestana : pestanas[0];
  return { titulo: meta.properties?.title ?? "", url: meta.spreadsheetUrl, pestana };
}

async function leerValores(token: string, hojaId: string, pestana: string) {
  const r = await google(token, `${SHEETS}/${hojaId}/values/${rango(pestana, "A1:Z3000")}?valueRenderOption=FORMATTED_VALUE`);
  return r.values || [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
  const { data: u, error: eU } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  if (eU || !u?.user) return json({ error: "Iniciá sesión." }, 401);
  const ownerId = u.user.id;
  let body: any = {};
  try { body = await req.json(); } catch { /* sin cuerpo: estado */ }

  try {
    const [{ data: cuenta }, { data: hoja }] = await Promise.all([
      admin.from("oauth_accounts").select("*").eq("owner_id", ownerId).eq("provider", "google").maybeSingle(),
      admin.from("postulaciones_hoja").select("*").eq("owner_id", ownerId).maybeSingle(),
    ]);
    const conectado = !!cuenta && tienePermiso(cuenta.scopes);

    if (body?.accion === "conectar") {
      if (!env.GOOGLE_CLIENT_ID) return json({ error: "Falta GOOGLE_CLIENT_ID en los secrets." }, 500);
      const state = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
      const { error } = await admin.from("oauth_states").insert({ state, owner_id: ownerId, provider: "google" });
      if (error) return json({ error: `No se pudo preparar la conexión: ${error.message}` }, 500);
      return json({ url: urlPermiso({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: `${env.SUPABASE_URL}/functions/v1/google-callback`, state }) });
    }

    if (body?.accion === "elegir") {
      const id = idDeHoja(body.hoja);
      if (!id) return json({ error: "Pegá el link de la planilla de Google Sheets." }, 400);
      const { error } = await admin.from("postulaciones_hoja").upsert({ owner_id: ownerId, hoja_id: id, pestana: null, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (body?.accion === "leer" || body?.accion === "cambiar") {
      if (!conectado) return json({ error: "Primero conectá la planilla.", conectar: true }, 400);
      if (!hoja) return json({ error: "Falta elegir la planilla.", elegir: true }, 400);
      const token = await tokenVigente(admin, cuenta);
      const info = await abrir(token, hoja);
      const valores = await leerValores(token, hoja.hoja_id, info.pestana);

      if (body.accion === "leer") return json({ ...info, filas: filasPostulaciones(valores) });

      const fila = Number(body.fila);
      const estadoNuevo = String(body.estado ?? "").trim();
      if (!Number.isInteger(fila) || fila < 2 || !estadoNuevo) return json({ error: "Falta la fila o el estado." }, 400);
      const actual = filasPostulaciones(valores).find((p: any) => p.fila === fila);
      if (!actual || !mismaPostulacion(actual, body)) return json({ error: "La planilla cambió desde que la abriste. Recargá y probá de nuevo.", recargar: true }, 409);
      const col = columnas(valores[0] || []).estado;
      if (col === undefined) return json({ error: "La planilla no tiene una columna Estado." }, 400);
      await google(token, `${SHEETS}/${hoja.hoja_id}/values/${rango(info.pestana, `${letraColumna(col)}${fila}`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[estadoNuevo]] }) });
      return json({ ok: true, fila, estado: estadoNuevo });
    }

    return json({ google: !!cuenta, conectado, cuenta: cuenta?.handle ?? null, elegida: !!hoja });
  } catch (e) {
    if (e instanceof ErrorGoogle) return json({ error: e.message, conectar: e.status === 401 || e.status === 403 }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
