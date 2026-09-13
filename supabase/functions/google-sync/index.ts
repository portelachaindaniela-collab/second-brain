import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { quitarEliminados } from "./eliminados.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = { ...cors, "Content-Type": "application/json" };

async function tokenVigente(admin: any, cuenta: any): Promise<string> {
  const margen = 60_000;
  if (cuenta.access_token && cuenta.expires_at && new Date(cuenta.expires_at).getTime() - margen > Date.now()) {
    return cuenta.access_token;
  }
  if (!cuenta.refresh_token) throw new Error("reconectar");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: cuenta.refresh_token,
      grant_type: "refresh_token"
    })
  });
  const t = await r.json();
  if (!r.ok || !t.access_token) throw new Error("reconectar");

  await admin.from("oauth_accounts").update({
    access_token: t.access_token,
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString()
  }).eq("id", cuenta.id);

  return t.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userData } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: json });

    const { data: cuenta } = await admin.from("oauth_accounts")
      .select("*").eq("owner_id", user.id).eq("provider", "google").maybeSingle();

    if (!cuenta) return new Response(JSON.stringify({ conectado: false }), { headers: json });

    let token: string;
    try {
      token = await tokenVigente(admin, cuenta);
    } catch (_) {
      return new Response(JSON.stringify({ conectado: false, reconectar: true }), { headers: json });
    }

    const desde = new Date(); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(); hasta.setDate(hasta.getDate() + 7); hasta.setHours(23, 59, 59, 999);

    // Antes solo se sincronizaba el calendario "primary" — cualquier evento en un calendario
    // secundario (Salud, Trabajo, Organización, etc.) nunca aparecía en Second Brain aunque
    // estuviera en el rango de fechas. Ahora se recorren todos los calendarios que la usuaria
    // tiene tildados/visibles en Google Calendar (igual que ve ella en su propia UI).
    let calendarios: { id: string }[] = [{ id: "primary" }];
    try {
      const calListResp = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", { headers: { Authorization: `Bearer ${token}` } });
      const calListData = await calListResp.json();
      if (calListResp.ok && Array.isArray(calListData.items) && calListData.items.length) {
        calendarios = calListData.items.filter((c: any) => c.selected !== false && !c.deleted);
      }
    } catch (_) { /* si falla la lista, seguimos con al menos "primary" */ }

    let totalEventos = 0;
    let errorCalendario: string | null = null;
    for (const calendario of calendarios) {
      const cal = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendario.id)}/events`);
      cal.searchParams.set("timeMin", desde.toISOString());
      cal.searchParams.set("timeMax", hasta.toISOString());
      cal.searchParams.set("singleEvents", "true");
      cal.searchParams.set("orderBy", "startTime");
      cal.searchParams.set("maxResults", "60");

      const calResp = await fetch(cal.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const calData = await calResp.json();
      if (!calResp.ok) {
        // Un calendario puntual puede fallar (por ej. uno compartido sin permiso de lectura de
        // eventos) sin que eso tire abajo la sincronización de los demás.
        if (calendario.id === "primary") errorCalendario = calData?.error?.message ?? "Calendar rechazó la consulta";
        continue;
      }
      const eventos = (calData.items ?? []).filter((e: any) => e.status !== "cancelled");

      for (const e of eventos) {
        const todoElDia = !!e.start?.date;
        const ini = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : null);
        const fin = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : null);
        await admin.from("calendar_events").upsert({
          owner_id: user.id,
          google_event_id: e.id,
          calendar_id: calendario.id,
          title: e.summary ?? "(sin título)",
          description: e.description ?? null,
          location: e.location ?? null,
          starts_at: ini,
          ends_at: fin,
          all_day: todoElDia,
          synced_at: new Date().toISOString()
        }, { onConflict: "owner_id,calendar_id,google_event_id" });
        totalEventos++;
      }
    }
    if (totalEventos === 0 && errorCalendario) {
      return new Response(JSON.stringify({ conectado: true, error: errorCalendario }), { headers: json });
    }

    let eliminados = 0;
    let errorEliminados: string | null = null;
    try {
      eliminados = await quitarEliminados({ admin, ownerId: user.id, token });
    } catch (e) {
      errorEliminados = `No se pudieron comprobar todos los eventos eliminados: ${e instanceof Error ? e.message : String(e)}`;
    }

    let mails = 0;
    const leidos: string[] = [];
    try {
      const lista = await fetch(
        "https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread+newer_than:14d&maxResults=20",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const listaData = await lista.json();
      const ids = (listaData.messages ?? []).map((m: any) => m.id);

      for (const id of ids) {
        const det = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!det.ok) continue;
        const m = await det.json();
        const h: Record<string, string> = {};
        for (const x of m.payload?.headers ?? []) h[x.name.toLowerCase()] = x.value;

        const from = h["from"] ?? "";
        const nombre = from.includes("<") ? from.split("<")[0].trim().replace(/^\"|\"$/g, "") : null;
        const dir = from.includes("<") ? from.split("<")[1].replace(">", "").trim() : from;

        await admin.from("emails").upsert({
          owner_id: user.id,
          gmail_id: m.id,
          thread_id: m.threadId,
          from_addr: dir,
          from_name: nombre || dir,
          subject: h["subject"] ?? "(sin asunto)",
          snippet: m.snippet ?? null,
          received_at: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
          is_unread: true,
          is_starred: (m.labelIds ?? []).includes("STARRED"),
          synced_at: new Date().toISOString()
        }, { onConflict: "owner_id,gmail_id" });
        leidos.push(m.id);
        mails++;
      }
    } catch (_) { /* si Gmail falla, el calendario ya se guardó */ }

    try {
      const { data: guardados } = await admin.from("emails")
        .select("id, gmail_id").eq("owner_id", user.id).eq("is_unread", true);
      const sobran = (guardados ?? []).filter((g: any) => !leidos.includes(g.gmail_id)).map((g: any) => g.id);
      if (sobran.length) {
        await admin.from("emails").update({ is_unread: false }).in("id", sobran);
      }
    } catch (_) { /* limpieza opcional */ }

    return new Response(JSON.stringify({
      conectado: true,
      cuenta: cuenta.handle,
      eventos: totalEventos,
      eliminados,
      ...(errorEliminados ? { error: errorEliminados } : {}),
      mails
    }), { headers: json });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: json });
  }
});
