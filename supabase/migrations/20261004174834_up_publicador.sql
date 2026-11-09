create table public.up_conexiones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  red text not null check (red in ('linkedin', 'x', 'instagram')),
  access_token text not null,
  expira_at timestamptz,
  cuenta_id text not null,
  nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, red)
);
alter table public.up_conexiones enable row level security;
create trigger up_conexiones_updated_at before update on public.up_conexiones for each row execute function public.tocar_updated_at();

create table public.up_oauth_estados (
  estado text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  red text not null check (red in ('linkedin', 'x', 'instagram')),
  created_at timestamptz not null default now()
);
alter table public.up_oauth_estados enable row level security;

create function public.up_mis_conexiones()
returns table (red text, nombre text, expira_at timestamptz)
language sql stable security definer set search_path to ''
as $$ select c.red, c.nombre, c.expira_at from public.up_conexiones c where c.owner_id = auth.uid() $$;
revoke execute on function public.up_mis_conexiones() from public, anon;
grant execute on function public.up_mis_conexiones() to authenticated;

create table public.up_horarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  red text not null check (red in ('linkedin', 'x', 'instagram')),
  hora time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, red)
);
alter table public.up_horarios enable row level security;
create policy "dueña lee sus horarios" on public.up_horarios for select to authenticated using (owner_id = auth.uid());
create policy "dueña crea sus horarios" on public.up_horarios for insert to authenticated with check (owner_id = auth.uid());
create policy "dueña edita sus horarios" on public.up_horarios for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "dueña borra sus horarios" on public.up_horarios for delete to authenticated using (owner_id = auth.uid());
create trigger up_horarios_updated_at before update on public.up_horarios for each row execute function public.tocar_updated_at();

alter table public.up_piezas add column error_publicacion text;;
