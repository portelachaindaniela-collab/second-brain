-- Oficina: el área de Sistemas (pedidos que María y Noruega derivan; nada avanza sin la aprobación de Daniela)
-- y las actas de las reuniones (se guardan solas al terminar cada reunión).
create table public.oficina_solicitudes (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agente text not null check (agente in ('trabajadores:maria', 'up:noruega')),
  titulo text not null check (length(titulo) between 3 and 200),
  detalle text not null default '' check (length(detalle) <= 2000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'hecha')),
  nota text check (length(nota) <= 2000),
  origen text not null default 'reunion' check (origen in ('reunion', 'manual')),
  creada timestamptz not null default now(),
  decidida timestamptz
);
create index oficina_solicitudes_owner_idx on public.oficina_solicitudes (owner_id, estado, creada desc);
alter table public.oficina_solicitudes enable row level security;
create policy "solicitudes ver" on public.oficina_solicitudes for select to authenticated using (owner_id = (select auth.uid()));
-- Un pedido nuevo entra siempre pendiente: solo Daniela (al decidir) lo cambia de estado.
create policy "solicitudes crear pendiente" on public.oficina_solicitudes for insert to authenticated
  with check (owner_id = (select auth.uid()) and estado = 'pendiente' and decidida is null);
create policy "solicitudes decidir" on public.oficina_solicitudes for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "solicitudes borrar" on public.oficina_solicitudes for delete to authenticated using (owner_id = (select auth.uid()));

create table public.oficina_actas (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  modo text not null check (modo in ('sala', 'turnos')),
  inicio timestamptz not null,
  fin timestamptz not null default now(),
  asistentes text[] not null default '{}',
  mensajes jsonb not null default '[]' check (jsonb_typeof(mensajes) = 'array'),
  resumen text not null default ''
);
create index oficina_actas_owner_idx on public.oficina_actas (owner_id, fin desc);
alter table public.oficina_actas enable row level security;
create policy "actas dueña" on public.oficina_actas for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
