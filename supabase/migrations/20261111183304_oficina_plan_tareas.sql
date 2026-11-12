-- Oficina: el acta de cada reunión guarda el plan que armó María (título, decisiones, tareas, pedidos a Sistemas y,
-- si se habló de un calendario, sus días). Las tareas quedan a cargo del supervisor de cada área, con fecha límite.
-- Mesa de entrada (Sistemas) también puede dejar pedidos: los técnicos que salen de las reuniones.
alter table public.oficina_actas add column titulo text not null default '' check (length(titulo) <= 200);
alter table public.oficina_actas add column plan jsonb check (plan is null or jsonb_typeof(plan) = 'object');

create table public.oficina_tareas (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  acta_id bigint references public.oficina_actas (id) on delete set null,
  tarea text not null check (length(tarea) between 3 and 500),
  area text not null check (area in ('trabajadores', 'up', 'pdg', 'sistemas', 'admin')),
  responsable text not null check (length(responsable) <= 80),
  vence date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha')),
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now()
);
create index oficina_tareas_owner_idx on public.oficina_tareas (owner_id, estado, vence);
alter table public.oficina_tareas enable row level security;
create policy "tareas dueña" on public.oficina_tareas for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter table public.oficina_solicitudes drop constraint oficina_solicitudes_agente_check;
alter table public.oficina_solicitudes add constraint oficina_solicitudes_agente_check check (agente in ('trabajadores:maria', 'up:noruega', 'sistemas:mesa_entrada'));
