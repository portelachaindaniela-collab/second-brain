import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { proveedor, validarPedido, armarMensajes } from "./logic.mjs";
import { leerWeb } from "./web.mjs";

// Corre un agente comercial de PDG con la sesión de la dueña (RLS) y guarda lo que escribe como borrador.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const hoyAR = () => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

async function llamarModelo(prov: any, messages: unknown[]) {
  const r = await fetch(prov.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${prov.clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: prov.modelo, messages, temperature: 0.5, max_tokens: 4000 }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await r.json().catch(() => null);
  if (r.status === 429) throw new Error("La IA llegó a su límite de consultas gratis por ahora. Probá de nuevo en un rato.");
  if (!r.ok) throw new Error(data?.error?.message || `La IA respondió HTTP ${r.status}.`);
  const texto = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!texto) throw new Error("La IA no devolvió texto.");
  return texto;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: u, error: eU } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  if (eU || !u?.user) return json({ error: "Iniciá sesión." }, 401);
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Cuerpo inválido." }, 400); }
  const v: any = validarPedido(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const prov = proveedor(env);
  if (!prov) return json({ error: "Falta configurar la IA (GROQ_API_KEY o GEMINI_API_KEY)." }, 503);

  // Lo que Femina encontró de la cuenta en el último mes (cambios en su web y noticias), salvo lo descartado.
  const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [m, a, c, p, n] = await Promise.all([
    db.from("pdg_manual").select("texto").maybeSingle(),
    db.from("pdg_agentes").select("nombre,rol,instrucciones").eq("clave", v.agente).maybeSingle(),
    v.cuenta_id ? db.from("pdg_cuentas").select("*").eq("id", v.cuenta_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    v.cuenta_id ? db.from("pdg_trabajos").select("agente,texto,created_at").eq("cuenta_id", v.cuenta_id).eq("estado", "aprobado").order("created_at", { ascending: false }).limit(3) : Promise.resolve({ data: [], error: null }),
    v.cuenta_id ? db.from("pdg_hallazgos").select("tipo,titulo,detalle,url,created_at").eq("cuenta_id", v.cuenta_id).neq("estado", "descartado").gte("created_at", desde).order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [], error: null }),
  ]);
  const fallo = [m, a, c, p, n].find((r: any) => r.error);
  if (fallo) return json({ error: "No se pudo leer la base: " + (fallo as any).error.message }, 500);
  if (!a.data) return json({ error: "Este agente no tiene instrucciones cargadas: revisá el Manual." }, 400);
  if (v.cuenta_id && !c.data) return json({ error: "No encontré esa cuenta." }, 404);

  const web = c.data?.web && (v.agente === "prospector" || v.agente === "demo") ? await leerWeb(c.data.web) : {};
  const mensajes = armarMensajes({
    manual: m.data?.texto ?? "", agente: a.data, cuenta: c.data, previos: (p.data ?? []).reverse(),
    textoWeb: (web as any).texto, avisoWeb: (web as any).aviso, novedades: n.data ?? [], pedido: v.pedido, hoy: hoyAR(),
  });

  let texto: string;
  try { texto = await llamarModelo(prov, mensajes); } catch (e) { return json({ error: (e as Error).message }, 502); }

  const { data: trabajo, error: eT } = await db.from("pdg_trabajos")
    .insert({ cuenta_id: v.cuenta_id, agente: v.agente, pedido: v.pedido || null, texto, modelo: `${prov.nombre}/${prov.modelo}` })
    .select("*").single();
  if (eT) return json({ error: "Se escribió pero no se pudo guardar: " + eT.message, texto }, 500);
  return json({ trabajo, avisoWeb: (web as any).aviso ?? null });
});
