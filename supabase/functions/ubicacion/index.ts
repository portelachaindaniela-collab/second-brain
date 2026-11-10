import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { HEADER_TOKEN, ErrorUbicacion, leerUbicacion, hashToken, esRepetido } from "./logic.mjs";

// La llama MacroDroid desde el celular, sin sesión: se identifica con el token que se genera en Mis cosas
// (header x-token-ubicacion). verify_jwt apagado por eso; sin token válido no guarda nada.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const token = req.headers.get(HEADER_TOKEN)?.trim() ?? "";
  if (token.length < 32) return json({ error: "Falta el token de Mis cosas." }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: duena, error } = await admin.from("ubicacion_tokens").select("owner_id").eq("token_hash", await hashToken(token)).maybeSingle();
    if (error) throw new ErrorUbicacion("No se pudo validar el token.", 500);
    if (!duena) throw new ErrorUbicacion("Token inválido: generá uno nuevo en Mis cosas.", 401);

    const ubicacion = leerUbicacion(await req.json().catch(() => null));
    const { data: ultima } = await admin.from("ubicaciones").select("at").eq("owner_id", duena.owner_id)
      .eq("dispositivo", ubicacion.dispositivo).order("at", { ascending: false }).limit(1).maybeSingle();
    if (esRepetido(ultima, ubicacion)) return json({ ok: true, repetido: true });

    const { error: errorAlta } = await admin.from("ubicaciones").insert({ ...ubicacion, owner_id: duena.owner_id });
    if (errorAlta) throw new ErrorUbicacion("No se pudo guardar la ubicación.", 500);
    return json({ ok: true });
  } catch (e) {
    const status = e instanceof ErrorUbicacion ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : "Error desconocido." }, status);
  }
});
