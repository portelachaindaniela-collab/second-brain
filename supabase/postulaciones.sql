-- Postulaciones: qué planilla de Google Sheets lee y escribe la pantalla Postulaciones (una por dueña).
-- El contenido vive en la planilla; acá solo se guarda cuál es.
create table if not exists public.postulaciones_hoja (
  owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  hoja_id text not null,
  pestana text,
  updated_at timestamptz not null default now()
);

alter table public.postulaciones_hoja enable row level security;

drop policy if exists "postulaciones_hoja propias" on public.postulaciones_hoja;
create policy "postulaciones_hoja propias" on public.postulaciones_hoja
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
