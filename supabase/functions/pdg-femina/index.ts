import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const HEADER_SECRETO = "x-trabajador-secreto"; // el mismo de los trabajadores (_shared/trabajador.mjs)
import { ErrorIA, conRespaldo, llamarModelo, buscarWeb } from "../_shared/ia.mjs";
import { leerWeb } from "../pdg-agente/web.mjs";
import {
  proveedores, cuentasParaWeb, cuentasParaNoticias, tocaProspectar, huellaTexto, cambiosDeWeb, mensajesCambio, leerCambio,
  consultaNoticias, mensajesNoticias, leerNoticias, consultaProspectos, mensajesProspectos, leerProspectos,
} from "./logic.mjs";

// Femina, la exploradora de PDG. La corre pg_cron una vez por día (con el secreto de Vault de los trabajadores) o
// Daniela con el botón «Buscar ahora» (con su sesión). Mira las webs de las cuentas y avisa si cambió algo que sirva para
// vender, junta noticias del sector de algunas cuentas y, una vez por semana, busca prospectos nuevos. Todo queda en
// pdg_hallazgos para que Daniela lo revise; no toca las cuentas.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`, "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = Deno.env.toObject();
const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

async function sha(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function quien(admin: any, req: Request) {
  const secreto = req.headers.get(HEADER_SECRETO);
  if (secreto) {
    const { data: ok } = await admin.rpc("trabajador_secreto_valido", { p_secreto: secreto });
    if (ok !== true) return null;
    const { data } = await admin.from("pdg_agentes").select("owner_id").eq("clave", "femina").limit(1).maybeSingle();
    return data?.owner_id ?? null;
  }
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /i, "") ?? "";
  const { data } = jwt ? await admin.auth.getUser(jwt) : { data: null };
  return data?.user?.id ?? null;
}

async function correr(admin: any, ownerId: string) {
  const provs = proveedores(env);
  if (!provs.length) throw new Error("Falta configurar la IA.");
  const pedirIA = (messages: any[], max_tokens = 1500) =>
    conRespaldo(provs, (prov: any) => llamarModelo(prov, { messages, temperature: 0.2, max_tokens }, { timeoutMs: 45000 })).then(r => String((r.resultado as any)?.content ?? ""));
  const modeloBusqueda = (prov: any, messages: any[]) => llamarModelo(prov, { messages, temperature: 0.2, max_tokens: 2500 }, { timeoutMs: 50000 });
  // buscarWeb corta si un proveedor da un error que no es de límite (por ejemplo, Groq sin acceso a su buscador): se
  // prueba arrancando por cada uno, así cualquiera que funcione alcanza.
  const buscar = async (consulta: string) => {
    let ultimo = "";
    for (const prov of provs) {
      const r: any = await buscarWeb(provs, prov, consulta, modeloBusqueda);
      if (!r.error) return String(r.resultado ?? "") + (r.fuentes?.length ? `\nFuentes:\n${r.fuentes.join("\n")}` : "");
      ultimo = r.error;
    }
    throw new Error(ultimo || "La búsqueda web no está disponible.");
  };

  const [c, s, a, u] = await Promise.all([
    admin.from("pdg_cuentas").select("id,nombre,segmento,pais,web,etapa").eq("owner_id", ownerId),
    admin.from("pdg_seguimiento").select("*").eq("owner_id", ownerId),
    admin.from("pdg_agentes").select("instrucciones").eq("owner_id", ownerId).eq("clave", "femina").maybeSingle(),
    admin.from("pdg_femina_corridas").select("iniciada_at,resumen").eq("owner_id", ownerId).eq("estado", "ok").order("iniciada_at", { ascending: false }).limit(20),
  ]);
  const fallo = [c, s, a, u].find((r: any) => r.error);
  if (fallo) throw new Error(`No pude leer la base: ${(fallo as any).error.message}`);
  const cuentas = c.data ?? [], seguimiento = s.data ?? [], agente = a.data;
  const ahora = new Date().toISOString();
  const hallazgos: any[] = [], errores: string[] = [];
  const resumen: any = {};

  // 1) Las webs de las cuentas: la primera vez queda como referencia; después, avisa si cambió algo que importe.
  const webs = cuentasParaWeb(cuentas, seguimiento);
  const previo = new Map(seguimiento.map((x: any) => [x.cuenta_id, x]));
  const tareaWebs = Promise.allSettled(webs.map(async (cuenta: any) => {
    const r: any = await leerWeb(cuenta.web);
    const antes: any = previo.get(cuenta.id);
    if (!r.texto) {
      await admin.from("pdg_seguimiento").upsert({ cuenta_id: cuenta.id, owner_id: ownerId, web_at: ahora, error: r.aviso }, { onConflict: "cuenta_id" });
      throw new Error(`${cuenta.nombre}: ${r.aviso}`);
    }
    const texto = huellaTexto(r.texto).slice(0, 20000);
    const huella = await sha(texto);
    let cambio = null;
    if (antes?.texto && antes.huella !== huella) {
      const d = cambiosDeWeb(antes.texto, texto);
      if (d.importa) {
        const h = leerCambio(await pedirIA(mensajesCambio(cuenta, d, agente)));
        if (h) cambio = { tipo: "cambio_web", cuenta_id: cuenta.id, clave: `${cuenta.id}:${huella.slice(0, 16)}`, url: cuenta.web, ...h };
      }
    }
    await admin.from("pdg_seguimiento").upsert({ cuenta_id: cuenta.id, owner_id: ownerId, huella, texto, web_at: ahora, error: null }, { onConflict: "cuenta_id" });
    if (cambio) hallazgos.push(cambio);
    return antes?.texto ? (antes.huella === huella ? "igual" : "cambió") : "primera";
  }));

  // 2) Prospectos (una vez por semana) o, los otros días, noticias del sector de algunas cuentas.
  const prospectar = tocaProspectar((u.data ?? []).find((x: any) => x.resumen?.prospectos != null)?.iniciada_at ?? null);
  const tareaBusqueda = (async () => {
    if (prospectar) {
      try {
        const lista = leerProspectos(await pedirIA(mensajesProspectos(await buscar(consultaProspectos(cuentas, agente)), cuentas, agente), 2500), cuentas);
        hallazgos.push(...lista);
        resumen.prospectos = lista.length;
      } catch (e) { errores.push(`prospectos: ${motivo(e)}`); }
      return;
    }
    const elegidas = cuentasParaNoticias(cuentas, seguimiento);
    resumen.noticias_de = elegidas.map((x: any) => x.nombre);
    await Promise.allSettled(elegidas.map(async (cuenta: any) => {
      try {
        hallazgos.push(...leerNoticias(await pedirIA(mensajesNoticias(cuenta, await buscar(consultaNoticias(cuenta)), agente), 2000), cuenta.id));
        // Solo la fecha de noticias: lo de la web lo actualiza la otra parte de la vuelta.
        const { error } = await admin.from("pdg_seguimiento").upsert({ cuenta_id: cuenta.id, owner_id: ownerId, noticias_at: ahora }, { onConflict: "cuenta_id" });
        if (error) errores.push(`${cuenta.nombre}: ${error.message}`);
      } catch (e) { errores.push(`noticias de ${cuenta.nombre}: ${e instanceof ErrorIA ? e.message : motivo(e)}`); }
    }));
  })();

  const [resWebs] = await Promise.all([tareaWebs, tareaBusqueda]);
  resWebs.forEach((r: any) => { if (r.status === "rejected") errores.push(`web de ${motivo(r.reason)}`); });
  resumen.webs = { miradas: webs.length, cambiaron: resWebs.filter((r: any) => r.value === "cambió").length, primera_vez: resWebs.filter((r: any) => r.value === "primera").length };

  // Lo que ya había encontrado antes (misma clave) no se repite.
  let nuevos = 0;
  if (hallazgos.length) {
    const { data, error } = await admin.from("pdg_hallazgos").upsert(hallazgos.map(h => ({ ...h, owner_id: ownerId })), { onConflict: "owner_id,tipo,clave", ignoreDuplicates: true }).select("tipo");
    if (error) throw new Error(`No pude guardar lo que encontré: ${error.message}`);
    nuevos = data?.length ?? 0;
    resumen.por_tipo = (data ?? []).reduce((acc: any, x: any) => ({ ...acc, [x.tipo]: (acc[x.tipo] ?? 0) + 1 }), {});
  }
  resumen.nuevos = nuevos;
  if (errores.length) resumen.errores = errores.slice(0, 10);
  return resumen;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const ownerId = await quien(admin, req);
  if (!ownerId) return json({ error: "Iniciá sesión." }, 401);

  // Una vuelta por vez: si hay una en curso de hace menos de 10 minutos, no arranca otra.
  const { data: enCurso } = await admin.from("pdg_femina_corridas").select("id").eq("owner_id", ownerId).eq("estado", "corriendo").gte("iniciada_at", new Date(Date.now() - 600_000).toISOString()).limit(1);
  if (enCurso?.length) return json({ error: "Femina ya está buscando. En un rato aparece lo que encuentre." }, 409);
  const { data: corrida, error } = await admin.from("pdg_femina_corridas").insert({ owner_id: ownerId }).select("id").single();
  if (error) return json({ error: error.message }, 500);

  try {
    const resumen = await correr(admin, ownerId);
    await admin.from("pdg_femina_corridas").update({ estado: "ok", resumen, terminada_at: new Date().toISOString() }).eq("id", corrida.id);
    return json({ ok: true, ...resumen });
  } catch (e) {
    const mensaje = motivo(e);
    await admin.from("pdg_femina_corridas").update({ estado: "error", error: mensaje, terminada_at: new Date().toISOString() }).eq("id", corrida.id);
    return json({ error: mensaje }, 502);
  }
});
