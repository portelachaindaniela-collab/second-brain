import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { HEADER_SECRETO } from "../_shared/trabajador.mjs";
import { hoyAR, REDES_AUTOMATICAS, LINKEDIN_VERSION_DEFAULT, horaAR, tocaPublicar, cuerpoPostLinkedIn, urlPostLinkedIn, motivoErrorLinkedIn } from "./logic.mjs";

// Publicador de UP. Lo dispara pg_cron cada 15 minutos (con x-trabajador-secreto). Publica lo aprobado de hoy
// cuyo horario ya llegó. Si sale: "publicado" con el link. Si falla: sigue "aprobado" con el motivo en
// error_publicacion (la app lo muestra como error al publicar y no se reintenta hasta que la dueña toca Reintentar).

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function publicarLinkedIn(conexion: any, texto: string) {
  if (conexion.expira_at && Date.parse(conexion.expira_at) <= Date.now()) {
    return { ok: false, motivo: "La conexión con LinkedIn venció. Reconectala en Redes y tocá Reintentar." };
  }
  const r = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conexion.access_token}`,
      "LinkedIn-Version": Deno.env.get("UP_LINKEDIN_VERSION") || LINKEDIN_VERSION_DEFAULT,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpoPostLinkedIn(conexion.cuenta_id, texto)),
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
  const { data: piezas, error } = await admin.from("up_piezas").select("id,owner_id,fecha,red,texto,estado,error_publicacion")
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
    const res = await publicarLinkedIn(conexion, p.texto ?? "");
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
