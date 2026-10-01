import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { identificarCorrida, abrirCorrida, cerrarCorrida, HEADER_SECRETO } from "../_shared/trabajador.mjs";
import {
  TRABAJADOR, leerParametros, urlBusquedaEventbrite, candidatosDeBusqueda, filaDeDetalle,
  claveEvento, diaAR, dentroDeVentana,
} from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${HEADER_SECRETO}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const NAVEGADOR = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", "Accept-Language": "es-AR,es;q=0.9" };
const EN_PARALELO = 4;

async function traer(url: string): Promise<string> {
  const r = await fetch(url, { headers: NAVEGADOR, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return await r.text();
}

// Cada tipo de fuente devuelve candidatos { nombre, fecha (AAAA-MM-DD), url }. Sumar una fuente = sumar una entrada acá.
const BUSCADORES: Record<string, (fuente: any, termino: string) => Promise<{ nombre: string; fecha: string; url: string }[]>> = {
  eventbrite: async (fuente, termino) => {
    const ubicaciones: string[] = Array.isArray(fuente.ubicaciones) && fuente.ubicaciones.length ? fuente.ubicaciones : ["argentina--buenos-aires"];
    const paginas = Number.isInteger(fuente.paginas) && fuente.paginas > 0 ? Math.min(fuente.paginas, 5) : 1;
    const salida = [];
    for (const ubicacion of ubicaciones) {
      for (let pagina = 1; pagina <= paginas; pagina++) {
        salida.push(...candidatosDeBusqueda(await traer(urlBusquedaEventbrite(ubicacion, termino, pagina))));
      }
    }
    return salida;
  },
};

// Solo el detalle de Eventbrite está implementado; una fuente nueva suma su lector de detalle acá.
const DETALLE: Record<string, (url: string, p: any) => Promise<ReturnType<typeof filaDeDetalle>>> = {
  eventbrite: async (url, p) => filaDeDetalle(await traer(url), p),
};

async function enTandas<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const salida: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += n) salida.push(...await Promise.allSettled(items.slice(i, i + n).map(fn)));
  return salida;
}

async function buscar(admin: any, ownerId: string, parametros: unknown) {
  const p = leerParametros(parametros);
  const ahora = Date.now();
  const errores: string[] = [];
  const porTermino: Record<string, number> = {};
  const candidatos = new Map<string, { nombre: string; fecha: string; url: string; fuente: string }>();
  let busquedasOk = 0;

  for (const fuente of p.fuentes) {
    const buscador = BUSCADORES[fuente.tipo];
    if (!buscador) { errores.push(`La fuente "${fuente.tipo}" todavía no está implementada.`); continue; }
    for (const termino of p.terminos) {
      try {
        const encontrados = await buscador(fuente, termino);
        busquedasOk++;
        porTermino[`${fuente.tipo}: ${termino}`] = encontrados.length;
        for (const c of encontrados) if (!candidatos.has(c.url)) candidatos.set(c.url, { ...c, fuente: fuente.tipo });
      } catch (e) {
        errores.push(`${fuente.tipo} "${termino}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (!busquedasOk) throw new Error(`Ninguna búsqueda respondió. ${errores.join(" · ")}`);

  const enVentana = [...candidatos.values()].filter(c => dentroDeVentana(c.fecha, ahora, p.dias_adelante));

  // Lo que ya está en la tabla (cargado a mano o por una corrida anterior) no se toca: ni se duplica ni se pisa.
  const { data: existentes, error } = await admin.from("eventos").select("nombre,inicio_at,url").eq("owner_id", ownerId)
    .gte("inicio_at", new Date(ahora - 2 * 86_400_000).toISOString())
    .lte("inicio_at", new Date(ahora + (p.dias_adelante + 2) * 86_400_000).toISOString());
  if (error) throw new Error(`No se pudieron leer los eventos existentes: ${error.message}`);
  const claves = new Set((existentes ?? []).map((e: any) => claveEvento(e.nombre, diaAR(e.inicio_at))));
  const urls = new Set((existentes ?? []).map((e: any) => e.url).filter(Boolean));

  const nuevos = enVentana.filter(c => !urls.has(c.url) && !claves.has(claveEvento(c.nombre, c.fecha)));
  const aAbrir = nuevos.slice(0, p.max_detalles_por_corrida);
  const descartados: Record<string, number> = {};
  const filas: any[] = [];

  const detalles = await enTandas(aAbrir, EN_PARALELO, c => DETALLE[c.fuente](c.url, p).then(r => ({ c, r })));
  for (const d of detalles) {
    if (d.status === "rejected") { errores.push(String(d.reason?.message ?? d.reason)); continue; }
    const { c, r } = d.value;
    if (!r.fila) { descartados[r.descartado] = (descartados[r.descartado] ?? 0) + 1; continue; }
    const fila = { ...r.fila, url: r.fila.url ?? c.url };
    const clave = claveEvento(fila.nombre, diaAR(fila.inicio_at));
    // Con la hora real el día puede cambiar respecto de la búsqueda: se vuelve a chequear.
    if (claves.has(clave) || urls.has(fila.url) || !dentroDeVentana(diaAR(fila.inicio_at), ahora, p.dias_adelante)) {
      descartados["ya estaba o fuera de ventana"] = (descartados["ya estaba o fuera de ventana"] ?? 0) + 1;
      continue;
    }
    claves.add(clave);
    urls.add(fila.url);
    filas.push({ ...fila, owner_id: ownerId, estado: "anotado", origen: c.fuente });
  }

  if (filas.length) {
    const { error: errorAlta } = await admin.from("eventos").insert(filas);
    if (errorAlta) throw new Error(`No se pudieron cargar los eventos: ${errorAlta.message}`);
  }

  return {
    cargados: filas.length,
    resumen: {
      encontrados: candidatos.size,
      en_ventana: enVentana.length,
      ya_estaban: enVentana.length - nuevos.length,
      sin_abrir_por_tope: nuevos.length - aAbrir.length,
      descartados,
      por_termino: porTermino,
      cargados: filas.map(f => `${diaAR(f.inicio_at)} · ${f.nombre}`),
      ...(errores.length ? { errores } : {}),
    },
  };
}

// verify_jwt apagado: la corre pg_cron con el secreto de Vault o el botón [correr] del panel con la sesión.
// No evalúa nada: solo carga en estado "anotado".
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let quien;
  try {
    const body = await req.json().catch(() => ({}));
    quien = await identificarCorrida({ admin, req, clave: TRABAJADOR, body });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, e?.status ?? 500);
  }

  let corrida = null;
  try {
    corrida = await abrirCorrida(admin, TRABAJADOR);
    const { data: config, error } = await admin.from("trabajadores").select("parametros").eq("clave", TRABAJADOR).maybeSingle();
    if (error || !config) throw new Error("No hay configuración para el buscador de eventos.");
    const { cargados, resumen } = await buscar(admin, quien.ownerId, config.parametros);
    await cerrarCorrida(admin, corrida, { estado: "ok", cantidad: cargados, payload: resumen });
    return json({ id: corrida.id, estado: "ok", cargados });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await cerrarCorrida(admin, corrida, { estado: "error", error: mensaje });
    return json({ id: corrida?.id, estado: "error", error: mensaje }, 502);
  }
});
