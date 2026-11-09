create table public.noticias_medios (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medio text not null,
  pais text not null,
  idioma text,
  sitio text not null,
  rss text,
  x text,
  newsletter text,
  temas text[] not null default '{}',
  activo boolean not null default true,
  ultima_lectura_at timestamptz,
  ultimo_error text,
  created_at timestamptz not null default now(),
  unique (owner_id, medio)
);

alter table public.noticias_medios enable row level security;
create policy "dueña lee sus medios" on public.noticias_medios for select to authenticated using (owner_id = auth.uid());
create policy "dueña edita sus medios" on public.noticias_medios for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke insert, update, delete on public.noticias_medios from anon, authenticated;
grant update (activo) on public.noticias_medios to authenticated;

create table public.noticias (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medio_id bigint references public.noticias_medios (id) on delete set null,
  url text not null,
  titulo text not null,
  resumen text,
  imagen text,
  medio text not null,
  pais text not null,
  idioma text,
  canal text not null check (canal in ('web', 'x')),
  temas text[] not null default '{}',
  publicada_at timestamptz not null,
  leida boolean not null default false,
  guardada boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, url)
);

create index noticias_owner_publicada on public.noticias (owner_id, publicada_at desc);

alter table public.noticias enable row level security;
create policy "dueña lee sus noticias" on public.noticias for select to authenticated using (owner_id = auth.uid());
create policy "dueña marca sus noticias" on public.noticias for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke insert, update, delete on public.noticias from anon, authenticated;
grant update (leida, guardada) on public.noticias to authenticated;

alter table public.trabajadores drop constraint trabajadores_color_check;
alter table public.trabajadores add constraint trabajadores_color_check
  check (color in ('ambar', 'azul', 'violeta', 'rosa', 'cian', 'lima', 'arena'));;
