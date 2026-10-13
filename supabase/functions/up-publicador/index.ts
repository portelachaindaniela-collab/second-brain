import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { HEADER_SECRETO } from "../_shared/trabajador.mjs";
import { hoyAR, REDES_AUTOMATICAS, LINKEDIN_VERSION_DEFAULT, horaAR, tocaPublicar, cuerpoPostLinkedIn, urlPostLinkedIn, motivoErrorLinkedIn, planDeAdjuntos } from "./logic.mjs";

// Publicador de UP. Lo dispara pg_cron cada 15 minutos (con x-trabajador-secreto). Publica lo aprobado de hoy
// cuyo horario ya llegó, con su documento o sus imágenes adjuntas si tiene. Si sale: "publicado" con el link. Si falla: sigue "aprobado" con el motivo en
// error_publicacion (la app lo muestra como error al publicar y no se reintenta hasta que la dueña toca Reintentar).

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const BUCKET_ADJUNTOS = "up-adjuntos";
const cabecerasLinkedIn = (conexion: any) => ({
  Authorization: `Bearer ${conexion.access_token}`,
  "LinkedIn-Version": Deno.env.get("UP_LINKEDIN_VERSION") || LINKEDIN_VERSION_DEFAULT,
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
});

// Sube un adjunto (guardado en el bucket up-adjuntos) a LinkedIn y devuelve su urn: primero se pide un lugar para
// subirlo (documents o images ?action=initializeUpload) y después se manda el archivo ahí.
async function subirALinkedIn(admin: any, conexion: any, adjunto: any) {
  const { data: archivo, error } = await admin.storage.from(BUCKET_ADJUNTOS).download(adjunto.ruta);
  if (error || !archivo) throw new Error(`No encontré el adjunto «${adjunto.nombre}». Volvé a subirlo en Redes y tocá Reintentar.`);
  const tipo = adjunto.tipo === "documento" ? "documents" : "images";
  const r = await fetch(`https://api.linkedin.com/rest/${tipo}?action=initializeUpload`, {
    method: "POST", headers: cabecerasLinkedIn(conexion),
    body: JSON.stringify({ initializeUploadRequest: { owner: `urn:li:person:${conexion.cuenta_id}` } }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(motivoErrorLinkedIn(r.status, data));
  const { uploadUrl } = data?.value ?? {};
  const urn = data?.value?.document ?? data?.value?.image;
  if (!uploadUrl || !urn) throw new Error(`LinkedIn no dio lugar para subir «${adjunto.nombre}».`);
  const subida = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${conexion.access_token}`, "Content-Type": adjunto.mime || "application/octet-stream" }, body: await archivo.arrayBuffer(), signal: AbortSignal.timeout(120000) });
  if (!subida.ok) throw new Error(`LinkedIn no aceptó «${adjunto.nombre}» (HTTP ${subida.status}).`);
  return urn;
}

async function publicarLinkedIn(admin: any, conexion: any, texto: string, adjuntos: any[] = []) {
  if (conexion.expira_at && Date.parse(conexion.expira_at) <= Date.now()) {
    return { ok: false, motivo: "La conexión con LinkedIn venció. Reconectala en Redes y tocá Reintentar." };
  }
  const plan: any = planDeAdjuntos(adjuntos);
  if (plan.error) return { ok: false, motivo: plan.error };
  let media = null;
  try {
    if (plan.documento) media = { documento: { urn: await subirALinkedIn(admin, conexion, plan.documento), titulo: plan.documento.titulo } };
    else if (plan.imagenes.length) {
      const urns = [];
      for (const img of plan.imagenes) urns.push(await subirALinkedIn(admin, conexion, img));
      media = { imagenes: urns };
    }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
  const r = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: cabecerasLinkedIn(conexion),
    body: JSON.stringify(cuerpoPostLinkedIn(conexion.cuenta_id, texto, media)),
    signal: AbortSignal.timeout(30000),
  });
  if (r.status === 201) return { ok: true, url: urlPostLinkedIn(r.headers.get("x-restli-id")) };
  let data: any = null;
  try { data = await r.json(); } catch { /* sin cuerpo */ }
  return { ok: false, motivo: motivoErrorLinkedIn(r.status, data) };
}

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: valido } = await admin.rpc("trabajador_secreto_valido", { p_secreto: req.headers.get(HEADER_SECRETO) ?? "" });
  if (valido !== true) return json({ error: "Secreto inválido." }, 401);

  const hoy = hoyAR(), ahora = horaAR();
  const { data: piezas, error } = await admin.from("up_piezas").select("id,owner_id,fecha,red,texto,estado,error_publicacion,adjuntos")
    .eq("estado", "aprobado").eq("fecha", hoy).in("red", REDES_AUTOMATICAS).is("error_publicacion", null);
  if (error) return json({ error: error.message }, 500);
  if (!piezas?.length) return json({ hoy, ahora, publicadas: 0 });

  const duenas = [...new Set(piezas.map(p => p.owner_id))];
  const [{ data: horarios }, { data: conexiones }] = await Promise.all([
    admin.from("up_horarios").select("owner_id,red,hora").in("owner_id", duenas),
    admin.from("up_conexiones").select("owner_id,red,access_token,cuenta_id,expira_at").in("owner_id", duenas),
  ]);
  const de = (lista: any[] | null, p: any) => (lista || []).find(x => x.owner_id === p.owner_id && x.red === p.red);

  const pasos = new Map<string, any[]>();
  for (const p of piezas) {
    if (!tocaPublicar(p, de(horarios, p)?.hora, hoy, ahora)) continue;
    const conexion = de(conexiones, p);
    if (!conexion) continue; // Sin conexión no se intenta: Hoy avisa que falta conectar la red.
    const res = await publicarLinkedIn(admin, conexion, p.texto ?? "", p.adjuntos ?? []);
    const at = new Date().toISOString();
    if (res.ok) {
      await admin.from("up_piezas").update({ estado: "publicado", url_publicada: res.url, error_publicacion: null }).eq("id", p.id);
    } else {
      await admin.from("up_piezas").update({ error_publicacion: res.motivo }).eq("id", p.id);
    }
    const lista = pasos.get(p.owner_id) ?? [];
    lista.push({ agente: "publicador", red: p.red, accion: res.ok ? "publicó" : "no pudo publicar", detalle: res.ok ? res.url : res.motivo, at });
    pasos.set(p.owner_id, lista);
  }

  for (const [owner_id, lista] of pasos) {
    const fallo = lista.some(x => x.accion !== "publicó");
    await admin.from("up_corridas").insert({
      owner_id, fecha: hoy, origen: "cron", estado: fallo ? "error" : "ok", pasos: lista,
      error: fallo ? "Una publicación no salió; el motivo está en el paso." : null,
      iniciado_at: lista[0].at, finalizado_at: new Date().toISOString(),
    });
  }
  return json({ hoy, ahora, publicadas: [...pasos.values()].flat().filter(x => x.accion === "publicó").length });
});
