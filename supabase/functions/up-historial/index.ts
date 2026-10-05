import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { HEADER_SECRETO } from "../_shared/trabajador.mjs";
import {
  PESTANA, TITULO, ENCABEZADOS, tienePermisoHojas, urlPermiso, ultimaMetrica, filaHistorial, rangoFila, queCopiar, filaDeRango, motivoErrorGoogle,
} from "./logic.mjs";

// Historial de UP en Google Sheets. La app manda { accion: 'estado' | 'conectar' | 'copiar' } con la sesión de la
// dueña; pg_cron la llama cada hora con x-trabajador-secreto y copia lo publicado de cada dueña con Sheets conectado.
// Usa la conexión de Google que ya existe (oauth_accounts); 'conectar' solo le suma el permiso de hojas.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`, "Access-Control-Allow-Methods": "POST, OPTIONS" };
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

async function cuentaGoogle(admin: any, ownerId: string) {
  const { data } = await admin.from("oauth_accounts").select("*").eq("owner_id", ownerId).eq("provider", "google").maybeSingle();
  return data;
}

async function crearHoja(admin: any, token: string, ownerId: string) {
  const h = await google(token, SHEETS, {
    method: "POST",
    body: JSON.stringify({ properties: { title: TITULO }, sheets: [{ properties: { title: PESTANA, gridProperties: { frozenRowCount: 1 } } }] }),
  });
  await google(token, `${SHEETS}/${h.spreadsheetId}/values/${encodeURIComponent(rangoFila(1))}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [ENCABEZADOS] }) });
  const fila = { owner_id: ownerId, hoja_id: h.spreadsheetId, url: h.spreadsheetUrl, ultima_copia_at: null, ultimo_error: null };
  await admin.from("up_historial").upsert(fila);
  // Una hoja nueva arranca vacía: todo lo publicado se vuelve a copiar.
  await admin.from("up_piezas").update({ historial_fila: null, historial_at: null }).eq("owner_id", ownerId).not("historial_fila", "is", null);
  return fila;
}

async function copiar(admin: any, ownerId: string) {
  const cuenta = await cuentaGoogle(admin, ownerId);
  if (!cuenta || !tienePermisoHojas(cuenta.scopes)) return { conectado: false };
  try {
    const token = await tokenVigente(admin, cuenta);
    let { data: hoja } = await admin.from("up_historial").select("*").eq("owner_id", ownerId).maybeSingle();
    if (!hoja) hoja = await crearHoja(admin, token, ownerId);

    const [pie, cal, met] = await Promise.all([
      admin.from("up_piezas").select("id,fecha,red,estado,texto,url_publicada,historial_fila,historial_at").eq("owner_id", ownerId).eq("estado", "publicado"),
      admin.from("up_calendario").select("fecha,tema_dia,tema_instagram").eq("owner_id", ownerId),
      admin.from("up_metricas").select("pieza_id,dia,impresiones,reacciones,comentarios,compartidos,fuente,updated_at").eq("owner_id", ownerId),
    ]);
    if (pie.error || cal.error || met.error) throw new Error((pie.error || cal.error || met.error).message);
    const temas = new Map((cal.data || []).map((d: any) => [d.fecha, d]));
    const metricas = new Map<string, any[]>();
    for (const m of met.data || []) metricas.set(m.pieza_id, [...(metricas.get(m.pieza_id) || []), m]);
    const tema = (p: any) => { const d: any = temas.get(p.fecha); return p.red === "instagram" && d?.tema_instagram ? d.tema_instagram : d?.tema_dia; };
    const fila = (p: any) => filaHistorial(p, tema(p), ultimaMetrica(metricas.get(p.id) || []));

    const { nuevas, viejas } = queCopiar(pie.data || [], metricas);
    const base = `${SHEETS}/${hoja.hoja_id}/values`;
    for (const p of nuevas) {
      const r = await google(token, `${base}/${encodeURIComponent(`${PESTANA}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [fila(p)] }) });
      await admin.from("up_piezas").update({ historial_fila: filaDeRango(r?.updates?.updatedRange), historial_at: new Date().toISOString() }).eq("id", p.id);
    }
    for (const p of viejas) {
      await google(token, `${base}/${encodeURIComponent(rangoFila(p.historial_fila))}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [fila(p)] }) });
      await admin.from("up_piezas").update({ historial_at: new Date().toISOString() }).eq("id", p.id);
    }
    const ahora = new Date().toISOString();
    await admin.from("up_historial").update({ ultima_copia_at: ahora, ultimo_error: null }).eq("owner_id", ownerId);
    return { conectado: true, url: hoja.url, copiadas: nuevas.length, actualizadas: viejas.length, ultima_copia_at: ahora };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    // Si la hoja ya no existe, se olvida para crear otra en la próxima copia.
    if (e instanceof ErrorGoogle && e.status === 404) await admin.from("up_historial").delete().eq("owner_id", ownerId);
    else await admin.from("up_historial").update({ ultimo_error: mensaje }).eq("owner_id", ownerId);
    return { conectado: true, error: mensaje };
  }
}

async function estado(admin: any, ownerId: string) {
  const [cuenta, hoja, pendientes] = await Promise.all([
    cuentaGoogle(admin, ownerId),
    admin.from("up_historial").select("url,ultima_copia_at,ultimo_error").eq("owner_id", ownerId).maybeSingle(),
    admin.from("up_piezas").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("estado", "publicado").is("historial_fila", null),
  ]);
  return {
    google: !!cuenta, conectado: !!cuenta && tienePermisoHojas(cuenta.scopes), cuenta: cuenta?.handle ?? null,
    url: hoja.data?.url ?? null, ultima_copia_at: hoja.data?.ultima_copia_at ?? null, ultimo_error: hoja.data?.ultimo_error ?? null,
    sin_copiar: pendientes.count ?? 0,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const secreto = req.headers.get(HEADER_SECRETO);
  if (secreto) {
    const { data: valido } = await admin.rpc("trabajador_secreto_valido", { p_secreto: secreto });
    if (valido !== true) return json({ error: "Secreto inválido." }, 401);
    const { data } = await admin.from("up_piezas").select("owner_id").eq("estado", "publicado");
    const resultados = [];
    for (const d of new Set((data || []).map((x: any) => x.owner_id as string))) resultados.push(await copiar(admin, d));
    return json({ resultados });
  }

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
  const { data: u, error: eU } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  if (eU || !u?.user) return json({ error: "Iniciá sesión." }, 401);
  const ownerId = u.user.id;
  let body: any = {};
  try { body = await req.json(); } catch { /* sin cuerpo: estado */ }

  try {
    if (body?.accion === "conectar") {
      if (!env.GOOGLE_CLIENT_ID) return json({ error: "Falta GOOGLE_CLIENT_ID en los secrets." }, 500);
      const state = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
      const { error } = await admin.from("oauth_states").insert({ state, owner_id: ownerId, provider: "google" });
      if (error) return json({ error: `No se pudo preparar la conexión: ${error.message}` }, 500);
      return json({ url: urlPermiso({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: `${env.SUPABASE_URL}/functions/v1/google-callback`, state }) });
    }
    if (body?.accion === "copiar") {
      const r: any = await copiar(admin, ownerId);
      if (!r.conectado) return json({ error: "Primero conectá Google Sheets." }, 400);
      if (r.error) return json({ error: r.error }, 502);
      return json(r);
    }
    return json(await estado(admin, ownerId));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
