import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function pagina(titulo: string, mensaje: string, ok: boolean) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo}</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#fff;color:#1a1a19}
main{max-width:380px;padding:32px;text-align:center}
h1{font-size:20px;font-weight:600;margin:0 0 10px}
p{color:#62615d;line-height:1.6;margin:0}
.p{width:36px;height:36px;border-radius:50%;margin:0 auto 18px;background:${ok ? "#e1f5ee" : "#fcebeb"};
color:${ok ? "#0f6e56" : "#a32d2d"};display:flex;align-items:center;justify-content:center;font-size:19px}
</style></head><body><main><div class="p">${ok ? "✓" : "!"}</div>
<h1>${titulo}</h1><p>${mensaje}</p></main></body></html>`;
}

const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");
  const html = { "Content-Type": "text/html; charset=utf-8" };

  if (errParam) {
    return new Response(pagina("No se conectó", "Cancelaste el permiso en Meta. Podés volver a intentarlo desde la app.", false), { headers: html });
  }
  if (!code || !state) {
    return new Response(pagina("Faltan datos", "Meta no devolvió el código. Probá de nuevo desde la app.", false), { status: 400, headers: html });
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: fila } = await admin.from("oauth_states").select("*").eq("state", state).maybeSingle();
    if (!fila) return new Response(pagina("El enlace venció", "Volvé a la app y tocá Conectar Instagram otra vez.", false), { status: 400, headers: html });
    await admin.from("oauth_states").delete().eq("state", state);

    const clientId = Deno.env.get("META_CLIENT_ID")!;
    const clientSecret = Deno.env.get("META_CLIENT_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-callback`;

    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("code", code);
    const tokResp = await fetch(tokenUrl.toString());
    const tok = await tokResp.json();
    if (!tokResp.ok || !tok.access_token) {
      return new Response(pagina("Meta rechazó la conexión", String(tok.error?.message || "Error desconocido"), false), { status: 400, headers: html });
    }

    // Token de larga duración (~60 días) — hay que volver a extenderlo antes de que venza; todavía
    // no hay un cron para eso, queda anotado como pendiente igual que el refresh de Google.
    const largoUrl = new URL(`${GRAPH}/oauth/access_token`);
    largoUrl.searchParams.set("grant_type", "fb_exchange_token");
    largoUrl.searchParams.set("client_id", clientId);
    largoUrl.searchParams.set("client_secret", clientSecret);
    largoUrl.searchParams.set("fb_exchange_token", tok.access_token);
    const largoResp = await fetch(largoUrl.toString());
    const largo = await largoResp.json();
    const accessToken = largoResp.ok && largo.access_token ? largo.access_token : tok.access_token;
    const expiresIn = largoResp.ok && largo.expires_in ? largo.expires_in : (tok.expires_in ?? 3600);

    const paginasResp = await fetch(`${GRAPH}/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`);
    const paginas = await paginasResp.json();
    if (!paginasResp.ok) {
      return new Response(pagina("No se pudo leer tus páginas", String(paginas.error?.message || "Error desconocido"), false), { status: 400, headers: html });
    }
    const paginaConIg = (paginas.data || []).find((p: any) => p.instagram_business_account?.id);
    if (!paginaConIg) {
      return new Response(pagina("No encontramos Instagram", "Conectamos tu cuenta de Meta, pero ninguna de tus Páginas de Facebook tiene una cuenta de Instagram Business/Creator vinculada todavía. Vinculala desde la configuración de la Página y volvé a intentar.", false), { status: 400, headers: html });
    }
    const igId = paginaConIg.instagram_business_account.id;

    let username: string | null = null;
    try {
      const igResp = await fetch(`${GRAPH}/${igId}?fields=username&access_token=${encodeURIComponent(accessToken)}`);
      if (igResp.ok) username = (await igResp.json()).username ?? null;
    } catch { /* el nombre es solo para mostrar */ }

    const expira = new Date(Date.now() + expiresIn * 1000).toISOString();
    const registro = {
      owner_id: fila.owner_id,
      provider: "meta",
      external_id: igId,
      handle: username,
      access_token: accessToken,
      refresh_token: null,
      expires_at: expira,
      scopes: ["instagram_basic", "pages_show_list", "pages_read_engagement", "instagram_manage_insights"],
    };

    const { data: previo } = await admin.from("oauth_accounts").select("id").eq("owner_id", fila.owner_id).eq("provider", "meta").maybeSingle();
    let oauthId: string;
    if (previo) { await admin.from("oauth_accounts").update(registro).eq("id", previo.id); oauthId = previo.id; }
    else { const { data: creado } = await admin.from("oauth_accounts").insert(registro).select("id").single(); oauthId = creado!.id; }

    const { data: cuentaSocial } = await admin.from("social_accounts").select("id").eq("owner_id", fila.owner_id).eq("provider", "instagram").maybeSingle();
    if (cuentaSocial) await admin.from("social_accounts").update({ handle: username ?? igId, external_id: igId, oauth_id: oauthId }).eq("id", cuentaSocial.id);
    else await admin.from("social_accounts").insert({ owner_id: fila.owner_id, provider: "instagram", handle: username ?? igId, external_id: igId, oauth_id: oauthId });

    return new Response(pagina("Instagram conectado", `Ya podés cerrar esta ventana y volver a Second brain.${username ? ` Cuenta: @${username}.` : ""}`, true), { headers: html });
  } catch (e) {
    return new Response(pagina("Algo falló", String(e), false), { status: 500, headers: html });
  }
});
