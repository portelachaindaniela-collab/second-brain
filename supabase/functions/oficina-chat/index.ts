import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validar, contexto, armarMensajes, proveedores } from "./logic.mjs";
import { ErrorIA, conRespaldo, llamarModelo } from "../_shared/ia.mjs";

// Oficina: hablar con un agente. La app manda { agente: 'up:redactor', mensajes }. Lee los datos de ese agente con la
// sesión de la dueña (RLS, nunca con permisos de servicio) y responde con la IA. Solo lectura: no cambia nada.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const TZ = "America/Argentina/Buenos_Aires";
const hoyLargo = () => new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
const hoyISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function leerDatos(db: any, equipo: string, clave: string) {
  if (equipo === "trabajadores") {
    const [t, c] = await Promise.all([
      db.from("trabajadores").select("nombre,descripcion,tipo,frecuencia,activo").eq("clave", clave).maybeSingle(),
      db.from("trabajos_corridas").select("estado,iniciado_at,duracion_ms,cantidad_resultados,error,payload").eq("trabajador", clave).order("iniciado_at", { ascending: false }).limit(10),
    ]);
    if (t.error || c.error) throw new Error((t.error || c.error).message);
    return { trabajador: t.data, corridas: c.data || [] };
  }
  if (equipo === "up") {
    if (clave === "noruega") {
      const { data, error } = await db.from("up_chequeos").select("estado,chequeos,at").order("at", { ascending: false }).limit(3);
      if (error) throw new Error(error.message);
      return { chequeos: data || [] };
    }
    const { data, error } = await db.from("up_corridas").select("estado,error,pasos,iniciado_at").order("iniciado_at", { ascending: false }).limit(15);
    if (error) throw new Error(error.message);
    const pasos = (data || []).flatMap((c: any) => (c.pasos || []).filter((p: any) => p.agente === clave).reverse()).slice(0, 20);
    // Lo que este agente le dejó pendiente a la dueña.
    const filtro: Record<string, [string, string]> = { investigador: ["falta_info", "pregunta"], revisor: ["revision", "motivo_revision"], publicador: ["aprobado", "error_publicacion"] };
    let pendientes: any[] = [];
    if (filtro[clave]) {
      const [estado, campo] = filtro[clave];
      const r = await db.from("up_piezas").select(`fecha,red,${campo}`).eq("estado", estado).gte("fecha", hoyISO()).not(campo, "is", null).order("fecha").limit(8);
      if (r.error) throw new Error(r.error.message);
      pendientes = (r.data || []).map((p: any) => ({ fecha: p.fecha, red: p.red, texto: p[campo] }));
    }
    return { pasos, pendientes };
  }
  const [a, t] = await Promise.all([
    db.from("pdg_agentes").select("nombre,rol,instrucciones").eq("clave", clave).maybeSingle(),
    db.from("pdg_trabajos").select("estado,pedido,texto,created_at,pdg_cuentas(nombre)").eq("agente", clave).order("created_at", { ascending: false }).limit(8),
  ]);
  if (a.error || t.error) throw new Error((a.error || t.error).message);
  return { agente: a.data, trabajos: t.data || [] };
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
  const v: any = validar(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const provs = proveedores(env);
  if (!provs.length) return json({ error: "Falta configurar la IA." }, 503);

  let datos;
  try { datos = await leerDatos(db, v.equipo, v.clave); } catch (e) { return json({ error: `No se pudo leer la base: ${(e as Error).message}` }, 500); }
  const c = contexto(v.equipo, v.clave, datos);
  if (!c) return json({ error: "No encontré a ese agente." }, 404);

  try {
    const { resultado, ia } = await conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages: armarMensajes(c, v.mensajes, hoyLargo()), temperature: 0.4, max_tokens: 900 }));
    const texto = String((resultado as any)?.content ?? "").trim();
    if (!texto) return json({ error: "La IA no devolvió texto. Probá de nuevo." }, 502);
    return json({ texto, ia });
  } catch (e) {
    if (e instanceof ErrorIA) return json({ error: e.message }, 502);
    return json({ error: (e as Error).message }, 500);
  }
});
