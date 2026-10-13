import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  MAX_VUELTAS, HERRAMIENTAS, ACCIONES, proveedor, sistema, validarAccion, describirAccion, urlPermitida, htmlATexto, historialParaModelo,
  validarRedaccion, mensajesRedactar, limpiarPropuesta, numerosSinFuente, buscarPlan, bloqueoDeDia, fragmentosDeCharla } from "./logic.mjs";

// BS67 en UP. La app manda { mensajes } (la conversación), { ejecutar: { nombre, args } } (una acción que la
// dueña confirmó) o { redactar: { fecha, red, texto, pedido } } (una versión para la mesa de trabajo).
// Lee y escribe con la sesión de la dueña (RLS), nunca con permisos de servicio. Cada respuesta queda en bs67_registro
// (app 'up') para que María controle que BS67 funcione.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const TZ = "America/Argentina/Buenos_Aires";
const hoyAR = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const masDias = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const env = Deno.env.toObject();

async function modelo(prov: any, messages: any[], conHerramientas = true) {
  const r = await fetch(prov.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${prov.clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: prov.modelo, messages, temperature: 0.4, max_tokens: 1500, ...(conHerramientas && { tools: HERRAMIENTAS, tool_choice: "auto" }) }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json().catch(() => null);
  if (r.status === 429) throw new Error("La IA llegó a su límite de consultas gratis por ahora. Probá de nuevo en un rato.");
  if (!r.ok) throw new Error(data?.error?.message || `La IA respondió HTTP ${r.status}.`);
  return data?.choices?.[0]?.message ?? {};
}

// Búsqueda web: con Groq, su modelo Compound (busca solo); con Gemini, la búsqueda de Google integrada.
async function buscarWeb(prov: any, consulta: string) {
  if (prov.nombre === "groq") {
    const m = await modelo({ ...prov, modelo: "groq/compound" }, [{ role: "user", content: `Buscá en internet y respondé en español con las fuentes (URLs): ${consulta}` }], false);
    return { resultado: m.content || "Sin resultados." };
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(prov.modelo)}:generateContent?key=${prov.clave}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Buscá en internet y respondé en español: ${consulta}` }] }], tools: [{ google_search: {} }] }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) return { error: `La búsqueda web no está disponible ahora (${data?.error?.message || r.status}).` };
  const c = data?.candidates?.[0];
  const fuentes = (c?.groundingMetadata?.groundingChunks || []).map((g: any) => g.web && `${g.web.title}: ${g.web.uri}`).filter(Boolean).slice(0, 6);
  return { resultado: (c?.content?.parts || []).map((p: any) => p.text ?? "").join(""), fuentes };
}

async function leerLink(valor: string) {
  const url = urlPermitida(valor);
  if (!url) return { error: "Solo puedo leer páginas públicas (http o https)." };
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (UP asistente)" }, signal: AbortSignal.timeout(12000) });
    if (!urlPermitida(r.url)) return { error: "La página redirige a una dirección que no puedo leer." };
    if (!r.ok) return { error: `La página respondió HTTP ${r.status}.` };
    const tipo = r.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(tipo)) return { error: `No es una página de texto (${tipo || "tipo desconocido"}).` };
    const html = (await r.text()).slice(0, 2_000_000);
    return { url: r.url, titulo: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null, texto: htmlATexto(html) };
  } catch (e) {
    return { error: `No pude leer la página (${e instanceof Error ? e.message : String(e)}).` };
  }
}

async function correrPipeline(jwt: string, fecha: string, calendarioId?: string) {
  const r = await fetch(`${env.SUPABASE_URL}/functions/v1/up-pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ fecha, calendario_id: calendarioId }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) return `Los agentes no pudieron generar: ${data.error || `HTTP ${r.status}`}.`;
  if (data.cortado) return data.mensaje;
  if (!data.dias?.length) return "Ese día no tiene publicación en el calendario.";
  return "Los agentes generaron los borradores: están en Hoy (o en «Necesito que me cuentes» si falta un dato).";
}

// Herramientas de lectura: corren solas y devuelven datos para el modelo.
async function leer(db: any, prov: any, nombre: string, a: any) {
  const hoy = hoyAR();
  switch (nombre) {
    case "estado_hoy": {
      const [d, p] = await Promise.all([
        db.from("up_calendario").select("id,fecha,tema_semana,tema_dia,redes,formato_instagram,tema_instagram,salteado").eq("fecha", hoy).order("created_at"),
        db.from("up_piezas").select("calendario_id,red,estado,pregunta,motivo_revision,error_publicacion,url_publicada,adjuntos").eq("fecha", hoy),
      ]);
      return { hoy, publicaciones: (d.data || []).map((x: any) => ({ publicacion_id: x.id, ...x, id: undefined, piezas: (p.data || []).filter((q: any) => q.calendario_id === x.id).map(({ calendario_id, adjuntos, ...q }: any) => ({ ...q, adjuntos: (adjuntos || []).map((j: any) => j.nombre) })) })) };
    }
    case "pendientes": {
      const { data } = await db.from("up_piezas").select("fecha,red,estado,pregunta,motivo_revision,error_publicacion")
        .or(`estado.eq.falta_info,estado.eq.revision,and(estado.eq.aprobado,fecha.gte.${hoy})`).order("fecha");
      const p = data || [];
      return {
        preguntas: [...new Map(p.filter((x: any) => x.estado === "falta_info").map((x: any) => [x.fecha, { fecha: x.fecha, pregunta: x.pregunta }])).values()],
        en_revision: p.filter((x: any) => x.estado === "revision").map((x: any) => ({ fecha: x.fecha, red: x.red, motivo: x.motivo_revision })),
        aprobados_sin_publicar: p.filter((x: any) => x.estado === "aprobado").map((x: any) => ({ fecha: x.fecha, red: x.red, error_publicacion: x.error_publicacion })),
      };
    }
    case "ver_calendario": {
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(a?.desde) ? a.desde : hoy;
      const hasta = /^\d{4}-\d{2}-\d{2}$/.test(a?.hasta) ? a.hasta : masDias(desde, 14);
      const [d, p] = await Promise.all([
        db.from("up_calendario").select("id,fecha,tema_semana,tema_dia,redes,formato_instagram,salteado,plan_id").gte("fecha", desde).lte("fecha", hasta).order("fecha").order("created_at"),
        db.from("up_piezas").select("calendario_id,red,estado").gte("fecha", desde).lte("fecha", hasta),
      ]);
      const planes = (await db.from("up_planes").select("id,nombre")).data || [];
      return { desde, hasta, publicaciones: (d.data || []).map(({ plan_id, id, ...x }: any) => ({ publicacion_id: id, ...x, plan: planes.find((pl: any) => pl.id === plan_id)?.nombre ?? "Sin plan", piezas: (p.data || []).filter((q: any) => q.calendario_id === id).map((q: any) => `${q.red}: ${q.estado}`) })) };
    }
    case "ver_planes": {
      const [pl, d] = await Promise.all([
        db.from("up_planes").select("id,nombre,visible").order("orden").order("created_at"),
        db.from("up_calendario").select("plan_id,fecha"),
      ]);
      const dias = d.data || [];
      return { planes: (pl.data || []).map((x: any) => ({ nombre: x.nombre, visible: x.visible, dias: dias.filter((y: any) => y.plan_id === x.id).length, proximos: dias.filter((y: any) => y.plan_id === x.id && y.fecha >= hoy).length })),
        sin_plan: dias.filter((y: any) => !(pl.data || []).some((x: any) => x.id === y.plan_id)).length };
    }
    case "ver_borrador": {
      let q = db.from("up_piezas").select("fecha,red,estado,texto,problemas,adjuntos,up_calendario(tema_dia)").eq("fecha", a?.fecha).eq("red", a?.red);
      if (a?.publicacion_id) q = q.eq("calendario_id", a.publicacion_id);
      const { data } = await q;
      if (!data?.length) return { error: "No hay pieza para esa fecha y red." };
      return data.length === 1 ? data[0] : { varias: data.map((x: any) => ({ tema: x.up_calendario?.tema_dia, estado: x.estado, texto: x.texto })) };
    }
    case "buscar_ficha": {
      let q = db.from("up_ficha_datos").select("grupo,dato,fuente").order("grupo").order("orden");
      if (a?.grupo) q = q.eq("grupo", a.grupo);
      const { data } = await q;
      const t = typeof a?.texto === "string" ? a.texto.toLowerCase() : "";
      return { datos: (data || []).filter((d: any) => !t || d.dato.toLowerCase().includes(t)) };
    }
    case "estado_noruega": {
      const { data } = await db.from("up_chequeos").select("estado,chequeos,at").order("at", { ascending: false }).limit(1).maybeSingle();
      return data ?? { error: "Noruega todavía no revisó." };
    }
    case "buscar_charlas": {
      const { data } = await db.from("bs67_charlas").select("titulo,app,mensajes,updated_at").order("updated_at", { ascending: false }).limit(200);
      const encontradas = (data || []).map((c: any) => ({ c, f: fragmentosDeCharla(c, String(a?.texto ?? "")) })).filter((x: any) => x.f.encontrada).slice(0, 8);
      return encontradas.length
        ? { charlas: encontradas.map(({ c, f }: any) => ({ titulo: c.titulo, app: c.app, cuando: c.updated_at, fragmentos: f.fragmentos })) }
        : { charlas: [], nota: "No encontré charlas sobre eso." };
    }
    case "buscar_web": return await buscarWeb(prov, String(a?.consulta ?? "").slice(0, 500));
    case "leer_link": return await leerLink(String(a?.url ?? ""));
    default: return { error: "Herramienta desconocida." };
  }
}

// La publicación que toca una acción: por id, o por fecha si ese día hay una sola.
async function publicacion(db: any, a: any) {
  let q = db.from("up_calendario").select("id,fecha,redes,tema_dia").eq("fecha", a.fecha);
  if (a.publicacion_id) q = q.eq("id", a.publicacion_id);
  const { data } = await q;
  if (!data?.length) return "Ese día no tiene publicación en el calendario.";
  if (data.length > 1) return `Ese día hay ${data.length} publicaciones (${data.map((d: any) => `«${d.tema_dia}»`).join(", ")}): decime cuál.`;
  return data[0];
}

// Acciones confirmadas por la dueña.
async function ejecutar(db: any, jwt: string, nombre: string, a: any) {
  switch (nombre) {
    case "cargar_idea": {
      let semana = a.tema_semana;
      if (!semana) {
        const { data } = await db.from("up_calendario").select("tema_semana").lte("fecha", a.fecha).order("fecha", { ascending: false }).limit(1).maybeSingle();
        semana = data?.tema_semana ?? "Ideas";
      }
      let plan_id = null;
      if (a.plan) {
        const plan = buscarPlan((await db.from("up_planes").select("id,nombre")).data || [], a.plan);
        if (!plan) return `No encontré el plan «${a.plan}». Crealo en el Calendario (Planes de trabajo) o decime otro.`;
        plan_id = plan.id;
      }
      const { error } = await db.from("up_calendario").insert({ fecha: a.fecha, tema_semana: semana, tema_dia: a.tema_dia, redes: a.redes, formato_instagram: a.formato_instagram, tema_instagram: a.tema_instagram, ...(plan_id ? { plan_id } : {}) });
      if (error) return `No se pudo cargar: ${error.message}`;
      return "Listo, la idea quedó en el calendario. Los agentes la escriben la mañana de ese día (o pedime que genere ahora).";
    }
    case "editar_dia": {
      const dia: any = await publicacion(db, a);
      if (typeof dia === "string") return dia;
      const cambios: any = {};
      for (const k of ["tema_dia", "tema_semana", "redes", "formato_instagram", "tema_instagram", "salteado"]) if (a[k] !== undefined) cambios[k] = a[k];
      if (cambios.formato_instagram && !cambios.redes && !dia.redes.includes("instagram")) delete cambios.formato_instagram;
      if (cambios.redes && !cambios.redes.includes("instagram")) cambios.tema_instagram = null;
      if (a.plan) {
        const plan = buscarPlan((await db.from("up_planes").select("id,nombre")).data || [], a.plan);
        if (!plan) return `No encontré el plan «${a.plan}». Crealo en el Calendario (Planes de trabajo) o decime otro.`;
        cambios.plan_id = plan.id;
      }
      const { data: piezas } = await db.from("up_piezas").select("estado").eq("calendario_id", dia.id);
      if (a.nueva_fecha) {
        const b = bloqueoDeDia(piezas || []);
        if (b) return `${b} No se puede mover.`;
        cambios.fecha = a.nueva_fecha;
      }
      const { error } = await db.from("up_calendario").update(cambios).eq("id", dia.id);
      if (error) return `No se pudo cambiar: ${error.message}`;
      return "Listo, el día quedó cambiado en el calendario.";
    }
    case "borrar_dia": {
      const dia: any = await publicacion(db, a);
      if (typeof dia === "string") return dia;
      const { data: piezas } = await db.from("up_piezas").select("estado").eq("calendario_id", dia.id);
      const b = bloqueoDeDia(piezas || []);
      if (b) return `${b} No se puede borrar; si querés, lo salteo.`;
      const { error: eP } = await db.from("up_piezas").delete().eq("calendario_id", dia.id);
      if (eP) return `No se pudo borrar: ${eP.message}`;
      const { error } = await db.from("up_calendario").delete().eq("id", dia.id);
      return error ? `No se pudo borrar: ${error.message}` : "Listo, borré la publicación.";
    }
    case "aprobar_pieza": {
      let q = db.from("up_piezas").select("id").eq("fecha", a.fecha).eq("red", a.red).in("estado", ["pendiente", "revision"]).not("texto", "is", null);
      if (a.publicacion_id) q = q.eq("calendario_id", a.publicacion_id);
      const { data: candidatas } = await q;
      if ((candidatas?.length ?? 0) > 1) return "Ese día hay más de una publicación con borrador para esa red: decime cuál.";
      const { data, error } = await db.from("up_piezas").update({ estado: "aprobado" }).in("id", (candidatas || []).map((x: any) => x.id)).select("id");
      if (error) return `No se pudo aprobar: ${error.message}`;
      return data?.length ? "Aprobado. Si la red está conectada y tiene horario, sale sola ese día." : "No encontré un borrador para aprobar en esa fecha y red (puede que ya esté aprobado o que todavía no exista).";
    }
    case "responder_pregunta": {
      const { data, error } = await db.from("up_piezas").update({ respuesta: a.respuesta }).eq("fecha", a.fecha).eq("estado", "falta_info").select("id");
      if (error) return `No se pudo guardar la respuesta: ${error.message}`;
      if (!data?.length) return "Ese día no tiene preguntas pendientes.";
      return `Respuesta guardada. ${await correrPipeline(jwt, a.fecha)}`;
    }
    case "generar_borradores": return await correrPipeline(jwt, a.fecha, a.publicacion_id);
    case "agregar_dato_ficha": {
      const { data: ult } = await db.from("up_ficha_datos").select("orden").eq("grupo", a.grupo).order("orden", { ascending: false }).limit(1).maybeSingle();
      const { error } = await db.from("up_ficha_datos").insert({ grupo: a.grupo, dato: a.dato, fuente: a.fuente, orden: (ult?.orden ?? 0) + 1 });
      return error ? `No se pudo agregar: ${error.message}` : "Listo, el dato está en la Ficha. Los agentes lo pueden usar desde el próximo borrador.";
    }
  }
  return "Acción desconocida.";
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

  const inicio = Date.now();
  // El registro para María: nunca frena la respuesta.
  const registrar = (fila: any) => admin.from("bs67_registro").insert({ owner_id: u.user.id, app: "up", ms: Date.now() - inicio, ...fila }).then(() => {}, () => {});

  if (body?.ejecutar) {
    const v: any = validarAccion(body.ejecutar.nombre, body.ejecutar.args);
    if (!v.ok) return json({ respuesta: v.error });
    try {
      const respuesta = await ejecutar(db, jwt, body.ejecutar.nombre, v.args);
      const fallo = /^No (se )?pud|^Los agentes no pudieron/.test(respuesta);
      await registrar({ tipo: "accion", estado: fallo ? "error" : "ok", error: fallo ? `${body.ejecutar.nombre}: ${respuesta}`.slice(0, 500) : null });
      return json({ respuesta });
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      await registrar({ tipo: "accion", estado: "error", error: `${body.ejecutar.nombre}: ${detalle}`.slice(0, 500) });
      return json({ error: `No pude hacerlo (${detalle}).` }, 500);
    }
  }

  const prov = proveedor(env);
  if (!prov) { await registrar({ estado: "error", error: "Falta la clave de la IA." }); return json({ error: "Falta configurar la IA (GROQ_API_KEY o GEMINI_API_KEY)." }, 503); }
  if (body?.redactar) {
    const v: any = validarRedaccion(body.redactar);
    if (!v.ok) return json({ error: v.error }, 400);
    const [f, d] = await Promise.all([
      db.from("up_ficha_datos").select("grupo,dato").order("grupo").order("orden"),
      v.args.calendario_id ? db.from("up_calendario").select("tema_dia,tema_instagram").eq("id", v.args.calendario_id).maybeSingle()
        : v.args.fecha ? db.from("up_calendario").select("tema_dia,tema_instagram").eq("fecha", v.args.fecha).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const ficha = f.data || [];
    const tema = v.args.red === "instagram" && d.data?.tema_instagram ? d.data.tema_instagram : d.data?.tema_dia;
    try {
      const m = await modelo(prov, mensajesRedactar({ ...v.args, tema, ficha }), false);
      const propuesta = limpiarPropuesta(m.content || "");
      if (!propuesta) return json({ error: "La IA no devolvió una versión. Probá de nuevo." }, 502);
      return json({ propuesta, numeros_sin_fuente: numerosSinFuente(propuesta, [v.args.texto, ...ficha.map((x: any) => x.dato)]), ia: prov.nombre });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  const mensajes: any[] = [{ role: "system", content: sistema(hoyAR()) }, ...historialParaModelo(body?.mensajes)];
  const usadas: string[] = [];
  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const m = await modelo(prov, mensajes);
      const llamadas = m.tool_calls || [];
      if (!llamadas.length) {
        await registrar({ estado: "ok", ia: prov.nombre, herramientas: usadas.length });
        return json({ respuesta: (m.content || "").trim() || "No tengo una respuesta para eso.", herramientas: usadas, ia: prov.nombre });
      }
      const accion = llamadas.find((l: any) => ACCIONES.has(l.function?.name));
      if (accion) {
        let args: any = {};
        try { args = JSON.parse(accion.function.arguments || "{}"); } catch { /* args vacíos */ }
        const v: any = validarAccion(accion.function.name, args);
        if (!v.ok) {
          mensajes.push({ role: "assistant", content: m.content ?? "", tool_calls: [accion] }, { role: "tool", tool_call_id: accion.id, content: JSON.stringify({ error: v.error }) });
          continue;
        }
        await registrar({ estado: "ok", ia: prov.nombre, herramientas: usadas.length });
        return json({
          respuesta: (m.content || "").trim(), herramientas: usadas, ia: prov.nombre,
          propuesta: { nombre: accion.function.name, args: v.args, descripcion: describirAccion(accion.function.name, v.args) },
        });
      }
      mensajes.push({ role: "assistant", content: m.content ?? "", tool_calls: llamadas });
      for (const l of llamadas) {
        let args: any = {};
        try { args = JSON.parse(l.function?.arguments || "{}"); } catch { /* args vacíos */ }
        usadas.push(l.function?.name);
        const resultado = await leer(db, prov, l.function?.name, args);
        mensajes.push({ role: "tool", tool_call_id: l.id, content: JSON.stringify(resultado).slice(0, 16000) });
      }
    }
    await registrar({ estado: "error", ia: prov.nombre, herramientas: usadas.length, error: "Se trabó: demasiadas vueltas de herramientas." });
    return json({ respuesta: "Me trabé buscando la respuesta. ¿Me lo pedís de otra forma?", herramientas: usadas, ia: prov.nombre });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    await registrar({ estado: "error", ia: prov.nombre, herramientas: usadas.length, error: detalle.slice(0, 500) });
    return json({ error: detalle }, 502);
  }
});
