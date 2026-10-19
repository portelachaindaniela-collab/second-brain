import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { tienePermiso, urlPermiso, rangoACopiar, nombrePorDefecto, sitiosUsables, consulta, filasDias, filasDetalle, motivoErrorGoogle, SCOPE_SEARCH_CONSOLE } from "./logic.mjs";
const HEADER_SECRETO = "x-trabajador-secreto";

// Búsquedas en Google: copia Search Console a search_console_dias y search_console_detalle.
// La app manda { accion: 'estado' | 'conectar' | 'sincronizar' } con la sesión de la dueña; pg_cron la llama cada
// 6 horas con x-trabajador-secreto y copia a cada dueña que tenga el permiso de Search Console.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`, "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const API = "https://searchconsole.googleapis.com/webmasters/v3/sites";

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
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(60000) });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorGoogle(r.status, cuerpo);
  return cuerpo;
}

async function guardar(admin: any, tabla: string, filas: any[], conflicto: string) {
  for (let i = 0; i < filas.length; i += 1000) {
    const { error } = await admin.from(tabla).upsert(filas.slice(i, i + 1000), { onConflict: conflicto });
    if (error) throw new Error(`No se pudo guardar en ${tabla}: ${error.message}`);
  }
}

async function sincronizar(admin: any, cuenta: any) {
  const ownerId = cuenta.owner_id;
  const token = await tokenVigente(admin, cuenta);
  const lista = await google(token, API);
  const urls = sitiosUsables(lista.siteEntry || []);
  if (urls.length) await admin.from("search_console_sitios").upsert(urls.map((u: string) => ({ owner_id: ownerId, site_url: u, nombre: nombrePorDefecto(u) })), { onConflict: "owner_id,site_url", ignoreDuplicates: true });
  const { data: sitios } = await admin.from("search_console_sitios").select("*").eq("owner_id", ownerId).in("site_url", urls.length ? urls : [""]);
  const resultados = [];
  for (const sitio of sitios || []) {
    const { desde, hasta } = rangoACopiar(sitio.sincronizado_at);
    const base = `${API}/${encodeURIComponent(sitio.site_url)}/searchAnalytics/query`;
    try {
      const pedir = (dims: string[]) => google(token, base, { method: "POST", body: JSON.stringify(consulta(desde, hasta, dims)) });
      const [dias, busquedas, paginas] = await Promise.all([pedir(["date"]), pedir(["date", "query"]), pedir(["date", "page"])]);
      await guardar(admin, "search_console_dias", filasDias(dias, ownerId, sitio.site_url), "owner_id,site_url,fecha");
      await guardar(admin, "search_console_detalle", [...filasDetalle(busquedas, ownerId, sitio.site_url, "busqueda"), ...filasDetalle(paginas, ownerId, sitio.site_url, "pagina")], "owner_id,site_url,fecha,tipo,clave");
      await admin.from("search_console_sitios").update({ sincronizado_at: new Date().toISOString(), ultimo_error: null }).eq("owner_id", ownerId).eq("site_url", sitio.site_url);
      resultados.push({ sitio: sitio.nombre, dias: dias?.rows?.length ?? 0 });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await admin.from("search_console_sitios").update({ ultimo_error: mensaje }).eq("owner_id", ownerId).eq("site_url", sitio.site_url);
      if (e instanceof ErrorGoogle && (e.status === 401 || e.status === 403)) throw e;
      resultados.push({ sitio: sitio.nombre, error: mensaje });
    }
  }
  return { sitios: resultados, sin_verificar: (lista.siteEntry || []).length - urls.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const secreto = req.headers.get(HEADER_SECRETO);
  if (secreto) {
    const { data: valido } = await admin.rpc("trabajador_secreto_valido", { p_secreto: secreto });
    if (valido !== true) return json({ error: "Secreto inválido." }, 401);
    const { data: cuentas } = await admin.from("oauth_accounts").select("*").eq("provider", "google").contains("scopes", [SCOPE_SEARCH_CONSOLE]);
    const resultados = [];
    for (const c of cuentas || []) {
      try { resultados.push(await sincronizar(admin, c)); } catch (e) { resultados.push({ error: e instanceof Error ? e.message : String(e) }); }
    }
    return json({ resultados });
  }

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
  const { data: u, error: eU } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  if (eU || !u?.user) return json({ error: "Iniciá sesión." }, 401);
  const ownerId = u.user.id;
  let body: any = {};
  try { body = await req.json(); } catch { /* sin cuerpo: estado */ }

  try {
    const { data: cuenta } = await admin.from("oauth_accounts").select("*").eq("owner_id", ownerId).eq("provider", "google").maybeSingle();
    const conectado = !!cuenta && tienePermiso(cuenta.scopes);

    if (body?.accion === "conectar") {
      if (!env.GOOGLE_CLIENT_ID) return json({ error: "Falta GOOGLE_CLIENT_ID en los secrets." }, 500);
      const state = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
      const { error } = await admin.from("oauth_states").insert({ state, owner_id: ownerId, provider: "google" });
      if (error) return json({ error: `No se pudo preparar la conexión: ${error.message}` }, 500);
      return json({ url: urlPermiso({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: `${env.SUPABASE_URL}/functions/v1/google-callback`, state }) });
    }
    if (body?.accion === "sincronizar") {
      if (!conectado) return json({ error: "Primero conectá Search Console.", conectar: true }, 400);
      return json(await sincronizar(admin, cuenta));
    }
    return json({ google: !!cuenta, conectado });
  } catch (e) {
    if (e instanceof ErrorGoogle) return json({ error: e.message, conectar: e.status === 401 || (e.status === 403 && !/API de Search Console/.test(e.message)) }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
