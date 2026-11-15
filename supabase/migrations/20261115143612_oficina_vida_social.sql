-- La vida de la oficina: los agentes se relacionan como personas. Vínculos (amistad, pareja, compañerismo) que crecen
-- con el tiempo y momentos que comparten (mate, café, almuerzo en la oficina; cenas, after o paseos afuera). Los arma la
-- IA una vez por día (oficina-chat) y cada agente los recuerda en sus charlas.
create table public.oficina_vinculos (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  a text not null check (a ~ '^(trabajadores|up|pdg):[a-z_]{1,40}$'),
  b text not null check (b ~ '^(trabajadores|up|pdg):[a-z_]{1,40}$'),
  tipo text not null check (tipo in ('amistad', 'pareja', 'companerismo')),
  historia text not null default '' check (length(historia) <= 600),
  desde date not null default current_date,
  actualizado timestamptz not null default now(),
  check (a < b),
  unique (owner_id, a, b)
);
alter table public.oficina_vinculos enable row level security;
create policy "vinculos dueña" on public.oficina_vinculos for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.oficina_momentos (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agentes text[] not null check (cardinality(agentes) between 2 and 4),
  tipo text not null check (tipo in ('mate', 'cafe', 'almuerzo', 'merienda', 'cena', 'after', 'paseo')),
  lugar text not null default '' check (length(lugar) <= 120),
  resumen text not null check (length(resumen) between 3 and 600),
  fecha date not null,
  hora text check (hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  creado timestamptz not null default now()
);
create index oficina_momentos_fecha on public.oficina_momentos (owner_id, fecha desc);
alter table public.oficina_momentos enable row level security;
create policy "momentos dueña" on public.oficina_momentos for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
