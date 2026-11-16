-- Agente de Postulaciones: los CVs y documentos de referencia de Daniela, y la charla con el agente.
-- Los archivos van al bucket privado postulaciones-docs (carpeta = id de la dueña); el texto extraído queda en la tabla
-- para que el agente lo lea sin procesar el PDF cada vez.

create table public.postulaciones_documentos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('Marketing', 'Operativo', 'Datos', 'Medios', 'IA', 'EN', 'Otros')),
  archivo text not null,
  ruta text not null,
  mime text not null,
  texto text not null default '',
  subido_at timestamptz not null default now()
);
-- Un archivo por tipo de CV (Otros puede tener varios).
create unique index postulaciones_documentos_un_cv_por_tipo on public.postulaciones_documentos (owner_id, tipo) where tipo <> 'Otros';
alter table public.postulaciones_documentos enable row level security;
create policy "dueña lee sus documentos" on public.postulaciones_documentos for select to authenticated using (owner_id = (select auth.uid()));
create policy "dueña crea sus documentos" on public.postulaciones_documentos for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "dueña edita sus documentos" on public.postulaciones_documentos for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "dueña borra sus documentos" on public.postulaciones_documentos for delete to authenticated using (owner_id = (select auth.uid()));

-- La charla con el agente: una sola, con un botón para empezar de nuevo.
create table public.postulaciones_charla (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  mensajes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.postulaciones_charla enable row level security;
create policy "dueña usa su charla" on public.postulaciones_charla for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit) values ('postulaciones-docs', 'postulaciones-docs', false, 15728640);
create policy "dueña lee sus documentos de postulaciones" on storage.objects for select to authenticated
  using (bucket_id = 'postulaciones-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dueña sube sus documentos de postulaciones" on storage.objects for insert to authenticated
  with check (bucket_id = 'postulaciones-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dueña borra sus documentos de postulaciones" on storage.objects for delete to authenticated
  using (bucket_id = 'postulaciones-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
