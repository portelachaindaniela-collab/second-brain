create table if not exists public.process_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  agente text not null,
  estado text not null check (estado in ('ok','aviso','error')),
  resumen text not null,
  detalle jsonb,
  iniciado_at timestamptz not null default now(),
  finalizado_at timestamptz not null default now()
);

alter table public.process_reports enable row level security;

create policy "process_reports_select_own" on public.process_reports
  for select using (owner_id = auth.uid());
create policy "process_reports_insert_own" on public.process_reports
  for insert with check (owner_id = auth.uid());

create index if not exists process_reports_owner_agente_idx
  on public.process_reports (owner_id, agente, iniciado_at desc);
;
