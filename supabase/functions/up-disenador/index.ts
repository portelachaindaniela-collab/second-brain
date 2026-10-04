import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { HEADER_SECRETO } from "../_shared/trabajador.mjs";
import { FIRMA, BUCKET, MAX_PLACAS, placasDeTexto, necesitaDiseno, rutaDeAsset } from "./logic.mjs";

// Diseñador de UP. Lo llama la GitHub Action up-disenador (con x-trabajador-secreto = UP_DISENADOR_SECRETO):
// - GET: los carruseles que hay que armar, con sus placas ya leídas del texto.
// - POST { id, texto, placas: [png en base64] }: sube las placas al bucket público y las guarda en la pieza.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function anotar(admin: any, pieza: any, paso: { accion: string; detalle: string }, error: string | null = null) {
  const at = new Date().toISOString();
  await admin.from("up_corridas").insert({
    owner_id: pieza.owner_id, fecha: pieza.fecha, origen: "cron", estado: error ? "error" : "ok", error,
    pasos: [{ agente: "disenador", red: "instagram", ...paso, at }], iniciado_at: at, finalizado_at: at,
  });
}

function base64AByte(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Falta la conexión a la base." }, 503);
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: valido } = await admin.rpc("up_disenador_secreto_valido", { p_secreto: req.headers.get(HEADER_SECRETO) ?? "" });
  if (valido !== true) return json({ error: "Secreto inválido." }, 401);

  if (req.method === "GET") {
    const { data, error } = await admin.from("up_piezas")
      .select("id,owner_id,fecha,red,texto,estado,contenido,assets,assets_texto,up_calendario(tema_semana)")
      .eq("red", "instagram").neq("estado", "publicado").not("texto", "is", null).order("fecha");
    if (error) return json({ error: error.message }, 500);
    const piezas = [];
    for (const p of (data || []).filter(necesitaDiseno)) {
      const { placas } = placasDeTexto(p.texto);
      if (!placas.length) {
        // Sin placas legibles no hay nada que armar; se marca para no reintentar hasta que cambie el texto.
        await admin.from("up_piezas").update({ assets: [], assets_texto: p.texto }).eq("id", p.id);
        await anotar(admin, p, { accion: "no pudo armar", detalle: "El texto no tiene placas (cada una tiene que empezar con «Placa 1.», «Placa 2.»…)." }, "Sin placas en el texto.");
        continue;
      }
      piezas.push({ id: p.id, fecha: p.fecha, texto: p.texto, antetitulo: (p.up_calendario as any)?.tema_semana ?? "", placas: placas.slice(0, MAX_PLACAS) });
    }
    return json({ firma: FIRMA, piezas });
  }

  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo inválido." }, 400); }
  if (typeof body?.id !== "string" || typeof body?.texto !== "string" || !Array.isArray(body?.placas) || !body.placas.length) {
    return json({ error: "Faltan id, texto o placas." }, 400);
  }

  const { data: pieza, error } = await admin.from("up_piezas").select("id,owner_id,fecha,texto,estado,assets").eq("id", body.id).maybeSingle();
  if (error || !pieza) return json({ error: "No existe la pieza." }, 404);
  // Si la dueña editó el texto mientras se renderizaba, estas placas ya no sirven: las arma la próxima corrida.
  if (pieza.texto !== body.texto || pieza.estado === "publicado") return json({ descartado: true, motivo: "El texto cambió mientras se armaban las placas." }, 409);

  const marca = Date.now();
  const urls: string[] = [];
  for (let i = 0; i < body.placas.length; i++) {
    const ruta = `${pieza.owner_id}/${pieza.id}/${marca}-${i + 1}.png`;
    const { error: e } = await admin.storage.from(BUCKET).upload(ruta, base64AByte(body.placas[i]), { contentType: "image/png" });
    if (e) return json({ error: `No se pudo subir la placa ${i + 1}: ${e.message}` }, 500);
    urls.push(admin.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl);
  }
  const { error: eUpd } = await admin.from("up_piezas").update({ assets: urls, assets_texto: body.texto }).eq("id", pieza.id);
  if (eUpd) return json({ error: eUpd.message }, 500);

  const viejas = (pieza.assets || []).map(rutaDeAsset).filter(Boolean);
  if (viejas.length) await admin.storage.from(BUCKET).remove(viejas);
  await anotar(admin, pieza, { accion: "armó", detalle: `${urls.length} ${urls.length === 1 ? "placa" : "placas"} del carrusel.` });
  return json({ id: pieza.id, assets: urls });
});
