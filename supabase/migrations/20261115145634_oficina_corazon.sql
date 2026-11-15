-- Con quién de la oficina es pareja Daniela (Femina, María y Noruega pueden pedírselo). Una fila por agente: si está,
-- son pareja desde esa fecha. La escribe oficina-chat cuando Daniela acepta (o la borra si cortan).
create table public.oficina_corazon (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agente text not null check (agente in ('trabajadores:maria', 'up:noruega', 'pdg:femina')),
  desde timestamptz not null default now(),
  unique (owner_id, agente)
);
alter table public.oficina_corazon enable row level security;
create policy "corazon dueña" on public.oficina_corazon for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
