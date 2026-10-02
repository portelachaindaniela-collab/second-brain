-- Pantalla Noticias y su trabajador, Canillita (migración noticias_canillita).
-- Canillita lee la web (RSS/Atom) y la cuenta de X (vía FxTwitter) de cada medio de noticias_medios, se queda
-- con lo que toca algún tema de trabajadores.parametros.temas y lo guarda en noticias.
-- La lista de medios se carga aparte (migración noticias_medios_inicial): son fuentes públicas.

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

-- Color de identidad nuevo para Canillita (token --id-arena en styles.css).
alter table public.trabajadores drop constraint trabajadores_color_check;
alter table public.trabajadores add constraint trabajadores_color_check
  check (color in ('ambar', 'azul', 'violeta', 'rosa', 'cian', 'lima', 'arena'));

-- Cada hora a los :41; con 50 fuentes por corrida (~95 s; el límite de una Edge Function es 150 s) recorre todo cada ~5 horas.
-- Los temas van en parametros para poder editarlos desde el panel; si faltan, la función usa los suyos.
insert into public.trabajadores (clave, funcion, nombre, descripcion, tipo, activo, frecuencia, parametros, color, minutos_trabado) values (
  'canillita',
  'trabajador-noticias',
  'Canillita',
  'Lee las webs y las cuentas de X de los medios principales de cada país y guarda en Noticias lo que toca tus temas.',
  'scraper',
  true,
  '41 * * * *',
  '{"medios_por_corrida": 50, "dias_maximos": 3, "dias_conservar": 15, "max_por_medio": 25}'::jsonb,
  'arena',
  5
);

-- ---------- Referentes (migración noticias_referentes) ----------
-- Además de medios, personas y cuentas oficiales que marcan agenda en cada tema. Todo lo que publican entra en
-- su tema (temas fijos), sin filtrar por palabras. Bluesky se lee por su API pública, sin credenciales; si la
-- persona también está en X, Bluesky se usa solo cuando X no respondió (suelen publicar lo mismo en los dos).
-- La lista inicial está en noticias-referentes.sql.
alter table public.noticias_medios
  add column tipo text not null default 'medio' check (tipo in ('medio', 'referente')),
  add column descripcion text,
  add column bluesky text;
alter table public.noticias drop constraint noticias_canal_check;
alter table public.noticias add constraint noticias_canal_check check (canal in ('web', 'x', 'bluesky'));
alter table public.noticias add column de_referente boolean not null default false;

-- ---------- Sitios sin feed (migración noticias_futbol_femenino_argentina) ----------
-- formato dice cómo se lee la web del medio: 'rss' (RSS/Atom), 'wordpress' (API pública /wp-json/wp/v2/posts),
-- 'sitemap' (sitemap de noticias de Google) o 'enlaces' (links de una página; cada nota nueva se completa con su
-- propia página). filtro: expresión regular que tiene que cumplir el link de la nota.
alter table public.noticias_medios
  add column formato text not null default 'rss' check (formato in ('rss', 'wordpress', 'sitemap', 'enlaces')),
  add column filtro text;
-- Fútbol femenino argentino (El Femenino, TyC Sports, FutFemGol, Femeninoinfo, Romina Sacher): ver noticias-futbol-femenino-ar.sql.
