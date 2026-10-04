import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { LINKEDIN_SCOPES } from "../up-publicador/logic.mjs";

// Conexión de UP con LinkedIn (OAuth). Necesita los secrets LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET de la app
// que la dueña crea en developer.linkedin.com (productos "Share on LinkedIn" y "Sign In with LinkedIn using OpenID Connect").
// - POST { accion: "conectar" } con la sesión: devuelve la URL de permiso de LinkedIn.
// - POST { accion: "desconectar" } con la sesión: borra la conexión.
// - GET (vuelta de LinkedIn con code y state): guarda el token y vuelve a UP, a la pantalla Redes.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const APP = "https://portelachaindaniela-collab.github.io/second-brain/";

// Supabase no sirve páginas HTML desde las funciones: la vuelta de LinkedIn redirige a UP (pantalla Redes) con el resultado.
function volver(ok: boolean, mensaje: string) {
  const url = new URL(APP);
  url.searchParams.set("up_redes", ok ? "ok" : "error");
  url.searchParams.set("detalle", mensaje);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
  const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");
  const redirectUri = `${supabaseUrl}/functions/v1/up-linkedin`;

  if (req.method === "POST") {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
    const { data: u, error: eU } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
    if (eU || !u?.user) return json({ error: "Iniciá sesión." }, 401);
    let body: any = {};
    try { body = await req.json(); } catch { /* sin cuerpo */ }

    if (body?.accion === "desconectar") {
      await admin.from("up_conexiones").delete().eq("owner_id", u.user.id).eq("red", "linkedin");
      return json({ ok: true });
    }
    if (!clientId || !clientSecret) return json({ error: "Falta configurar la app de LinkedIn: cargá LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET en los secrets de las Edge Functions de Supabase." }, 503);
    const estado = crypto.randomUUID() + crypto.randomUUID();
    await admin.from("up_oauth_estados").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
    const { error: eE } = await admin.from("up_oauth_estados").insert({ estado, owner_id: u.user.id, red: "linkedin" });
    if (eE) return json({ error: eE.message }, 500);
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", estado);
    url.searchParams.set("scope", LINKEDIN_SCOPES);
    return json({ url: url.toString() });
  }

  if (req.method !== "GET") return json({ error: "Método no permitido." }, 405);
  const q = new URL(req.url).searchParams;
  if (q.get("error")) return volver(false, "Cancelaste el permiso: LinkedIn no quedó conectado.");
  const code = q.get("code"), estado = q.get("state");
  if (!code || !estado) return volver(false, "LinkedIn no devolvió el código. Probá de nuevo.");
  if (!clientId || !clientSecret) return volver(false, "Falta configurar la app de LinkedIn en Supabase.");

  const { data: fila } = await admin.from("up_oauth_estados").select("owner_id").eq("estado", estado).maybeSingle();
  if (!fila) return volver(false, "El enlace venció. Tocá Conectar LinkedIn otra vez.");
  await admin.from("up_oauth_estados").delete().eq("estado", estado);

  try {
    const tokResp = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
    });
    const tok = await tokResp.json();
    if (!tokResp.ok || !tok.access_token) return volver(false, `LinkedIn rechazó la conexión: ${tok.error_description || tok.error || "error desconocido"}.`);

    // Quién es: el id de la persona es el autor de los posts (urn:li:person:<sub>).
    const yoResp = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const yo = await yoResp.json();
    if (!yoResp.ok || !yo.sub) return volver(false, "No se pudo leer tu perfil: revisá que la app tenga el producto «Sign In with LinkedIn using OpenID Connect».");

    const { error } = await admin.from("up_conexiones").upsert({
      owner_id: fila.owner_id, red: "linkedin", access_token: tok.access_token, cuenta_id: yo.sub, nombre: yo.name ?? null,
      expira_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    }, { onConflict: "owner_id,red" });
    if (error) return volver(false, `No se pudo guardar la conexión: ${error.message}`);
    return volver(true, yo.name ? `LinkedIn conectado como ${yo.name}.` : "LinkedIn conectado.");
  } catch (e) {
    return volver(false, `Algo falló: ${e instanceof Error ? e.message : String(e)}`);
  }
});
