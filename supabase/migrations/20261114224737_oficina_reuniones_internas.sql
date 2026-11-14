-- Reuniones internas: los agentes se juntan entre ellos en la sala, sin Daniela (para coordinar, repartir trabajo o
-- revisar algo). No hace falta su permiso para juntarse: lo que decidan le llega como pedidos para aprobar. Se hacen la
-- primera vez que Daniela abre la Oficina en la fecha (o después), y María escribe el acta (modo 'interna').
create table public.oficina_reuniones (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  convoca text not null check (convoca ~ '^(trabajadores|up|pdg):[a-z_]{1,40}$'),
  asistentes text[] not null check (cardinality(asistentes) between 2 and 12),
  tema text not null check (length(tema) between 3 and 200),
  detalle text not null default '' check (length(detalle) <= 2000),
  fecha date not null,
  estado text not null default 'agendada' check (estado in ('agendada', 'en_curso', 'hecha', 'cancelada')),
  acta_id bigint references public.oficina_actas (id) on delete set null,
  creada timestamptz not null default now()
);
create index oficina_reuniones_owner_idx on public.oficina_reuniones (owner_id, estado, fecha);
alter table public.oficina_reuniones enable row level security;
create policy "reuniones internas dueña" on public.oficina_reuniones for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter table public.oficina_actas drop constraint oficina_actas_modo_check;
alter table public.oficina_actas add constraint oficina_actas_modo_check check (modo in ('sala', 'oficina', 'turnos', 'interna'));
