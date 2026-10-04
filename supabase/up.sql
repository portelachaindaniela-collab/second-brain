-- UP: app de publicaciones (LinkedIn, X, Instagram) dentro de Second Brain (migración up_esquema).
-- El contenido de up_calendario y up_ficha_datos NO se versiona acá: el repo es público. Se carga en la base
-- y se edita desde las pantallas de UP.

-- Una fila por día del calendario editorial (hoja "Seguimiento").
create table public.up_calendario (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  tema_semana text not null,
  tema_dia text not null,
  redes text[] not null default '{linkedin,x}' check (redes <@ '{linkedin,x,instagram}'::text[]),
  formato_instagram text not null default 'ninguno' check (formato_instagram in ('reel', 'carrusel', 'ninguno')),
  -- En la hoja el tema de Instagram es distinto del de LinkedIn + X.
  tema_instagram text,
  -- Carrusel armado con fotos que sube la dueña en vez de placas generadas.
  fotos_propias boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, fecha)
);

-- Única fuente de hechos y números para los agentes.
create table public.up_ficha_datos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  grupo text not null check (grupo in ('ReporTV', 'San Luis FC', 'AFA', 'DeporTV', 'Colegiales', 'Proyectos')),
  dato text not null,
  fuente text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una pieza por red y por día.
create table public.up_piezas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  calendario_id uuid references public.up_calendario (id) on delete set null,
  fecha date not null,
  red text not null check (red in ('linkedin', 'x', 'instagram')),
  texto text,
  assets text[] not null default '{}',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'falta_info', 'revision', 'aprobado', 'publicado', 'error')),
  intentos_revision integer not null default 0,
  motivo_revision text,
  url_publicada text,
  pregunta text,
  respuesta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, fecha, red)
);

create index up_ficha_datos_grupo_idx on public.up_ficha_datos (owner_id, grupo, orden);
create index up_piezas_estado_idx on public.up_piezas (owner_id, estado, fecha);
create index up_piezas_calendario_idx on public.up_piezas (calendario_id);

alter table public.up_calendario enable row level security;
alter table public.up_ficha_datos enable row level security;
alter table public.up_piezas enable row level security;

create policy "dueña lee su calendario" on public.up_calendario for select to authenticated using (owner_id = auth.uid());
create policy "dueña crea su calendario" on public.up_calendario for insert to authenticated with check (owner_id = auth.uid());
create policy "dueña edita su calendario" on public.up_calendario for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "dueña borra su calendario" on public.up_calendario for delete to authenticated using (owner_id = auth.uid());

create policy "dueña lee su ficha" on public.up_ficha_datos for select to authenticated using (owner_id = auth.uid());
create policy "dueña crea su ficha" on public.up_ficha_datos for insert to authenticated with check (owner_id = auth.uid());
create policy "dueña edita su ficha" on public.up_ficha_datos for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "dueña borra su ficha" on public.up_ficha_datos for delete to authenticated using (owner_id = auth.uid());

create policy "dueña lee sus piezas" on public.up_piezas for select to authenticated using (owner_id = auth.uid());
create policy "dueña crea sus piezas" on public.up_piezas for insert to authenticated with check (owner_id = auth.uid());
create policy "dueña edita sus piezas" on public.up_piezas for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "dueña borra sus piezas" on public.up_piezas for delete to authenticated using (owner_id = auth.uid());

create trigger up_calendario_updated_at before update on public.up_calendario
  for each row execute function public.tocar_updated_at();
create trigger up_ficha_datos_updated_at before update on public.up_ficha_datos
  for each row execute function public.tocar_updated_at();
create trigger up_piezas_updated_at before update on public.up_piezas
  for each row execute function public.tocar_updated_at();
