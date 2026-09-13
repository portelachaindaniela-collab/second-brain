import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Scopes para leer la cuenta de Instagram Business/Creator vinculada a una Página propia y sus
// métricas — no publican nada, solo lectura.
const SCOPES = ["instagram_basic", "pages_show_list", "pages_read_engagement", "instagram_manage_insights"].join(",");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const clientId = Deno.env.get("META_CLIENT_ID");
    if (!clientId) return json({ error: "Falta configurar META_CLIENT_ID en los secrets." }, 503);

    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401);

    const state = crypto.randomUUID() + "-" + crypto.randomUUID();
    await admin.from("oauth_states").insert({ state, owner_id: userData.user.id, provider: "meta" });
    await admin.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-callback`;
    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);

    return json({ url: url.toString() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
