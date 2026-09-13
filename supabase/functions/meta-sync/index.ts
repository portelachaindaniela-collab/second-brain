import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v21.0";

// Se trae like_count/comments_count directo del nodo de media (estable y documentado), en vez de
// la API de Insights (impressions/reach), cuyos nombres de métrica cambian seguido entre versiones
// de Graph API y necesitan permisos aparte — se puede sumar más adelante una vez probado en vivo.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!jwt) return json({ error: "Iniciá sesión." }, 401);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: auth, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !auth.user) return json({ error: "Sesión inválida." }, 401);
    const ownerId = auth.user.id;

    const { data: cuenta } = await admin.from("oauth_accounts").select("*").eq("owner_id", ownerId).eq("provider", "meta").maybeSingle();
    if (!cuenta) return json({ conectado: false });
    if (new Date(cuenta.expires_at).getTime() < Date.now()) {
      return json({ conectado: false, reconectar: true, error: "El acceso a Instagram venció. Volvé a conectarlo." });
    }

    const { data: cuentaSocial } = await admin.from("social_accounts").select("id").eq("owner_id", ownerId).eq("provider", "instagram").maybeSingle();
    if (!cuentaSocial) return json({ conectado: false, error: "No se encontró la cuenta de Instagram vinculada." });

    const mediaResp = await fetch(`${GRAPH}/${cuenta.external_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=25&access_token=${encodeURIComponent(cuenta.access_token)}`, { signal: AbortSignal.timeout(15000) });
    const media = await mediaResp.json();
    if (!mediaResp.ok) {
      const scope = /permission|scope|OAuth/i.test(media.error?.message || "");
      return json({ conectado: true, error: media.error?.message || "Instagram no pudo devolver tus publicaciones.", reconectar: scope }, 502);
    }

    let guardados = 0;
    for (const m of media.data || []) {
      const foto = m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
      const registro = {
        owner_id: ownerId,
        social_account_id: cuentaSocial.id,
        body: m.caption || null,
        media: foto ? [foto] : [],
        link: m.permalink || null,
        status: "publicado",
        published_at: m.timestamp || null,
        external_id: m.id,
      };
      const { data: existente } = await admin.from("social_posts").select("id").eq("social_account_id", cuentaSocial.id).eq("external_id", m.id).maybeSingle();
      let postId: string;
      if (existente) { await admin.from("social_posts").update(registro).eq("id", existente.id); postId = existente.id; }
      else { const { data: creado } = await admin.from("social_posts").insert(registro).select("id").single(); postId = creado!.id; }

      const ahora = new Date().toISOString();
      await admin.from("social_metrics").insert([
        { owner_id: ownerId, social_account_id: cuentaSocial.id, social_post_id: postId, key: "likes", value: m.like_count ?? 0, captured_at: ahora },
        { owner_id: ownerId, social_account_id: cuentaSocial.id, social_post_id: postId, key: "comments", value: m.comments_count ?? 0, captured_at: ahora },
      ]);
      guardados++;
    }

    return json({ conectado: true, handle: cuenta.handle, publicaciones: guardados });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
