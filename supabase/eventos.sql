-- Módulo de evaluación de eventos y planes (migración eventos_y_reglas_personales).
-- El contenido de reglas_personales NO se versiona acá: el repo es público. Se edita desde la pantalla Eventos.

create or replace function public.tocar_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Una fila por usuaria: el texto que se usa como criterio en cada evaluación.
create table public.reglas_personales (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  contenido text not null,
  updated_at timestamptz not null default now()
);

alter table public.reglas_personales enable row level security;
create policy "dueña lee sus reglas" on public.reglas_personales for select to authenticated using (owner_id = auth.uid());
create policy "dueña crea sus reglas" on public.reglas_personales for insert to authenticated with check (owner_id = auth.uid());
create policy "dueña edita sus reglas" on public.reglas_personales for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger reglas_personales_updated_at before update on public.reglas_personales
  for each row execute function public.tocar_updated_at();

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  inicio_at timestamptz not null,
  fin_at timestamptz,
  lugar text,
  direccion text,
  url text,
  tiene_entrada boolean not null default false,
  precio text,
  estado text not null default 'anotado' check (estado in ('anotado', 'evaluado', 'descartado', 'fui', 'no_fui')),
  agenda text,
  veredicto jsonb,
  evaluado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin_at is null or fin_at >= inicio_at)
);

create index eventos_owner_inicio on public.eventos (owner_id, inicio_at desc);

alter table public.eventos enable row level security;
create policy "dueña lee sus eventos" on public.eventos for select to authenticated using (owner_id = auth.uid());
create policy "dueña crea sus eventos" on public.eventos for insert to authenticated with check (owner_id = auth.uid());
create policy "dueña edita sus eventos" on public.eventos for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "dueña borra sus eventos" on public.eventos for delete to authenticated using (owner_id = auth.uid());
create trigger eventos_updated_at before update on public.eventos
  for each row execute function public.tocar_updated_at();

-- ---------- Buscador de eventos (migración eventos_origen) ----------
-- De dónde salió cada evento: 'manual' si lo cargó la dueña, o el tipo de fuente del trabajador buscador_eventos.
-- El buscador no duplica ni pisa: si ya hay un evento con el mismo nombre y día, lo deja como está.
alter table public.eventos add column origen text not null default 'manual';
