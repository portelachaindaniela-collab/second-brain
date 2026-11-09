create table public.trabajos_corridas (
  id bigint generated always as identity primary key,
  trabajador text not null,
  estado text not null check (estado in ('corriendo', 'ok', 'error')),
  iniciado_at timestamptz not null default now(),
  finalizado_at timestamptz,
  duracion_ms integer,
  cantidad_resultados integer,
  payload jsonb,
  error text
);

create index trabajos_corridas_trabajador_iniciado on public.trabajos_corridas (trabajador, iniciado_at desc);

alter table public.trabajos_corridas enable row level security;

create policy "sesiones leen corridas" on public.trabajos_corridas
  for select to authenticated using (true);

alter publication supabase_realtime add table public.trabajos_corridas;;
