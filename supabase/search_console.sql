-- Búsquedas en Google: copia diaria de Google Search Console (función search-console, cron cada 6 horas).
-- Google guarda 16 meses; acá queda todo lo que se copió.

create table if not exists public.search_console_sitios (
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  site_url text not null,
  nombre text not null,
  sincronizado_at timestamptz,
  ultimo_error text,
  primary key (owner_id, site_url)
);

create table if not exists public.search_console_dias (
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  site_url text not null,
  fecha date not null,
  clics integer not null default 0,
  impresiones integer not null default 0,
  posicion real,
  primary key (owner_id, site_url, fecha)
);

-- Por día, cada búsqueda y cada página con su desempeño. tipo: 'busqueda' | 'pagina'.
create table if not exists public.search_console_detalle (
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  site_url text not null,
  fecha date not null,
  tipo text not null check (tipo in ('busqueda', 'pagina')),
  clave text not null,
  clics integer not null default 0,
  impresiones integer not null default 0,
  posicion real,
  primary key (owner_id, site_url, fecha, tipo, clave)
);

alter table public.search_console_sitios enable row level security;
alter table public.search_console_dias enable row level security;
alter table public.search_console_detalle enable row level security;

drop policy if exists "search_console_sitios propios" on public.search_console_sitios;
create policy "search_console_sitios propios" on public.search_console_sitios
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "search_console_dias propios" on public.search_console_dias;
create policy "search_console_dias propios" on public.search_console_dias
  for select using (owner_id = auth.uid());
drop policy if exists "search_console_detalle propio" on public.search_console_detalle;
create policy "search_console_detalle propio" on public.search_console_detalle
  for select using (owner_id = auth.uid());

-- Las búsquedas o páginas de un período sumadas (la posición, promediada por impresiones). Corre con los permisos
-- de quien llama, así RLS deja ver solo lo propio.
create or replace function public.search_console_top(p_sitios text[], p_desde date, p_hasta date, p_tipo text, p_limite int default 50)
returns table (clave text, clics bigint, impresiones bigint, posicion double precision)
language sql stable security invoker set search_path = public as $$
  select d.clave, sum(d.clics)::bigint, sum(d.impresiones)::bigint,
         sum(d.posicion * d.impresiones) / nullif(sum(d.impresiones), 0)
  from search_console_detalle d
  where d.site_url = any(p_sitios) and d.fecha between p_desde and p_hasta and d.tipo = p_tipo
  group by d.clave
  order by 2 desc, 3 desc
  limit greatest(1, least(p_limite, 500));
$$;

grant execute on function public.search_console_top(text[], date, date, text, int) to authenticated;

-- Copia cada 6 horas (Google publica los datos con 2 o 3 días de atraso).
select cron.schedule('search-console', '35 */6 * * *', $c$select net.http_post(url := 'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/search-console', headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu', 'x-trabajador-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'trabajadores_secreto')), timeout_milliseconds := 120000);$c$);
