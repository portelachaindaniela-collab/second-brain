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
insert into public.search_console_sitios (owner_id, site_url, nombre)
select owner_id, s.url, s.nombre from public.oauth_accounts,
  (values ('https://pointdataglobal.netlify.app/', 'Point Data Global'), ('https://primeraafem.netlify.app/', 'Primera A Fem')) s(url, nombre)
where provider = 'google' and handle = '<EMAIL_DUEÑA>'
on conflict do nothing;;
