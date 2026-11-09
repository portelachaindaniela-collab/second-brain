create table public.up_corridas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  origen text not null check (origen in ('cron', 'app')),
  estado text not null default 'corriendo' check (estado in ('corriendo', 'ok', 'cortado', 'error')),
  pasos jsonb not null default '[]',
  error text,
  iniciado_at timestamptz not null default now(),
  finalizado_at timestamptz
);
create index up_corridas_owner_idx on public.up_corridas (owner_id, iniciado_at desc);
alter table public.up_corridas enable row level security;
create policy "dueña lee sus corridas" on public.up_corridas for select to authenticated using (owner_id = auth.uid());
alter publication supabase_realtime add table public.up_corridas;;
