create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  hora_local text not null default '08:00',
  zona_horaria text not null default 'America/Argentina/Buenos_Aires',
  activo boolean not null default true,
  ultimo_enviado_en date,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy propias on public.push_subscriptions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());;
