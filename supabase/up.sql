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

-- ---------- Pipeline de texto (migración up_pipeline) ----------
-- contenido: estructura que arma el redactor (posts del hilo, placas, escenas) para el diseñador.
-- problemas: lo que marcó el revisor ({fragmento, motivo}); datos_usados: ids de la ficha que eligió el investigador.
alter table public.up_piezas
  add column contenido jsonb,
  add column problemas jsonb,
  add column datos_usados uuid[];

-- Cada mañana genera los borradores del día. Corre cada 10 minutos entre las 06:02 y las 07:52 de Buenos Aires
-- (09:02–10:52 UTC) porque la cuota gratuita de Gemini corta la corrida a las pocas consultas: cada corrida sigue
-- donde quedó la anterior y, cuando ya está todo, no consulta al modelo (migración up_pipeline_cada_10_min).
select cron.schedule('up-pipeline', '2-59/10 9-10 * * *', $c$select net.http_post(url := 'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/up-pipeline', headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu', 'x-trabajador-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'trabajadores_secreto')), timeout_milliseconds := 120000);$c$);

-- ---------- Saltear un día (migración up_saltear_dia) ----------
-- Desde "Necesito que me cuentes" se puede saltear un día: el pipeline no lo trabaja más.
alter table public.up_calendario add column salteado boolean not null default false;

-- ---------- Registro de los agentes (migración up_corridas) ----------
-- Una fila por corrida del pipeline que llegó a trabajar (las corridas sin nada que hacer no se anotan).
-- pasos: lo que hizo cada agente, en orden ({agente, red, accion, detalle, at}). Lo escribe solo la Edge Function.
create table public.up_corridas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  origen text not null check (origen in ('cron', 'app')),
  estado text not null default 'corriendo' check (estado in ('corriendo', 'ok', 'cortado', 'error')),
  pasos jsonb not null default '[]',
  error text,
  iniciado_at timestamptz not null default now(),
  finalizado_at timestamptz
);
create index up_corridas_owner_idx on public.up_corridas (owner_id, iniciado_at desc);
alter table public.up_corridas enable row level security;
create policy "dueña lee sus corridas" on public.up_corridas for select to authenticated using (owner_id = auth.uid());
alter publication supabase_realtime add table public.up_corridas;

-- ---------- Diseñador (migración up_disenador) ----------
-- assets_texto: el texto del que salieron los assets. Si la dueña edita el texto, deja de coincidir y el diseñador
-- vuelve a armar las placas. Las placas se renderizan en GitHub Actions (.github/workflows/up-disenador.yml) y la
-- Edge Function up-disenador las sube a un bucket público (Instagram necesita URLs públicas).
alter table public.up_piezas add column assets_texto text;

insert into storage.buckets (id, name, public) values ('up-assets', 'up-assets', true);

-- Secreto propio de la Action (no el de los trabajadores de BS67). Se genera en la base; el valor va solo al
-- secret UP_DISENADOR_SECRETO del repo.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'up_disenador_secreto', 'GitHub Action del diseñador de UP (secret UP_DISENADOR_SECRETO del repo second-brain).');

create function public.up_disenador_secreto_valido(p_secreto text)
returns boolean language sql stable security definer set search_path to ''
as $$
  select coalesce(p_secreto <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'up_disenador_secreto' and decrypted_secret = p_secreto
  ), false)
$$;
revoke execute on function public.up_disenador_secreto_valido(text) from public, anon, authenticated;
grant execute on function public.up_disenador_secreto_valido(text) to service_role;
