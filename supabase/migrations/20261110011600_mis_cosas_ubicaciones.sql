-- Mis cosas: dónde quedó cada cosa de la dueña. El celular manda su ubicación (MacroDroid) a la función
-- "ubicacion" con un token propio; los auriculares quedan anotados en el lugar donde se desconectaron.
create table public.ubicaciones (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  dispositivo text not null check (char_length(dispositivo) between 1 and 60),
  motivo text not null default 'periodico' check (motivo in ('periodico', 'desconexion', 'reconexion', 'manual')),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  precision_m integer check (precision_m >= 0),
  bateria smallint check (bateria between 0 and 100),
  at timestamptz not null default now()
);
create index ubicaciones_owner_dispositivo_idx on public.ubicaciones (owner_id, dispositivo, at desc);
alter table public.ubicaciones enable row level security;
create policy "dueña lee sus ubicaciones" on public.ubicaciones for select to authenticated using (owner_id = (select auth.uid()));
create policy "dueña borra sus ubicaciones" on public.ubicaciones for delete to authenticated using (owner_id = (select auth.uid()));
alter publication supabase_realtime add table public.ubicaciones;

-- Token del celular: se guarda solo su hash. Sin políticas: lo lee la función con service role.
create table public.ubicacion_tokens (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  creado timestamptz not null default now()
);
alter table public.ubicacion_tokens enable row level security;

-- La app pide un token nuevo (el anterior deja de servir) y lo muestra una sola vez para pegarlo en MacroDroid.
create function public.ubicacion_nuevo_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  t text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then raise exception 'Iniciá sesión.'; end if;
  insert into public.ubicacion_tokens (owner_id, token_hash)
  values (auth.uid(), encode(extensions.digest(t, 'sha256'), 'hex'))
  on conflict (owner_id) do update set token_hash = excluded.token_hash, creado = now();
  return t;
end $$;
revoke all on function public.ubicacion_nuevo_token() from public, anon;
grant execute on function public.ubicacion_nuevo_token() to authenticated;

create function public.ubicacion_tiene_token() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select creado from public.ubicacion_tokens where owner_id = auth.uid()
$$;
revoke all on function public.ubicacion_tiene_token() from public, anon;
grant execute on function public.ubicacion_tiene_token() to authenticated;

-- Las ubicaciones se guardan 7 días: alcanza para encontrar algo y no deja un historial de por dónde anda.
create or replace function public.limpiar_historial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  corridas int;
  reportes int;
  lugares int;
begin
  delete from public.trabajos_corridas where iniciado_at < now() - interval '90 days';
  get diagnostics corridas = row_count;
  delete from public.process_reports where iniciado_at < now() - interval '30 days';
  get diagnostics reportes = row_count;
  delete from public.ubicaciones where at < now() - interval '7 days';
  get diagnostics lugares = row_count;
  return jsonb_build_object('trabajos_corridas', corridas, 'process_reports', reportes, 'ubicaciones', lugares);
end;
$$;
revoke all on function public.limpiar_historial() from public, anon, authenticated;
