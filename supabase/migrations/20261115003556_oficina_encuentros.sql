-- Lo que los agentes le dicen a Daniela cuando la cruzan caminando por la oficina, y lo que ella contestó. Lo leen
-- después en la charla (oficina-chat), así saben qué le quisieron decir en el pasillo.
create table public.oficina_encuentros (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agente text not null check (agente ~ '^(trabajadores|up|pdg|sistemas|admin):[a-z_]{1,40}$'),
  texto text not null check (length(texto) between 1 and 1500),
  respuesta text check (respuesta in ('ahora_no', 'hablemos', 'aprobada', 'rechazada')),
  creado timestamptz not null default now(),
  respondido timestamptz
);
create index oficina_encuentros_agente on public.oficina_encuentros (owner_id, agente, creado desc);
alter table public.oficina_encuentros enable row level security;
create policy "encuentros dueña" on public.oficina_encuentros for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
