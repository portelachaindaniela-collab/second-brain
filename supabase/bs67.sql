-- BS67 integrado en las tres apps (bs67 = Second Brain, up, pdg).

-- bs67_charlas: cada conversación con sus mensajes (texto, propuestas y lo que Daniela decidió). El menú de charlas las
-- lista y BS67 las puede buscar para recordar lo que se habló.
create table public.bs67_charlas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app text not null default 'bs67' check (app in ('bs67', 'up', 'pdg')),
  titulo text not null default 'Charla nueva',
  mensajes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bs67_charlas_owner_idx on public.bs67_charlas (owner_id, updated_at desc);
alter table public.bs67_charlas enable row level security;
create policy "dueña lee sus charlas" on public.bs67_charlas for select to authenticated using (owner_id = (select auth.uid()));
create policy "dueña crea sus charlas" on public.bs67_charlas for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "dueña edita sus charlas" on public.bs67_charlas for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "dueña borra sus charlas" on public.bs67_charlas for delete to authenticated using (owner_id = (select auth.uid()));

-- bs67_registro: una fila por cada respuesta o acción de BS67 (la escriben bs67-chat y up-asistente). María la lee en
-- cada vuelta para avisar si BS67 falla, tarda o se quedó sin IA.
create table public.bs67_registro (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  app text not null check (app in ('bs67', 'up', 'pdg')),
  tipo text not null default 'charla' check (tipo in ('charla', 'accion')),
  estado text not null check (estado in ('ok', 'error')),
  ia text,
  ms integer,
  herramientas integer not null default 0,
  error text,
  at timestamptz not null default now()
);
create index bs67_registro_owner_idx on public.bs67_registro (owner_id, at desc);
alter table public.bs67_registro enable row level security;
create policy "dueña lee su registro de bs67" on public.bs67_registro for select to authenticated using (owner_id = (select auth.uid()));

-- respaldo: cuando Groq falla y el mensaje lo responde Gemini (o fallan los dos), el motivo, p. ej. «groq 429 TPM → gemini».
alter table public.bs67_registro add column if not exists respaldo text;
