-- Corridas de los trabajadores (Edge Functions programadas con pg_cron).
-- Cada corrida escribe su fila al arrancar ('corriendo') y la actualiza al terminar ('ok' / 'error').
-- No tiene owner_id: lo que buscan los trabajadores no es de una usuaria en particular.
-- Solo el service role escribe; cualquier sesión iniciada puede leer (y seguirlo en vivo por Realtime).
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

alter publication supabase_realtime add table public.trabajos_corridas;

-- Programación: cada hora, a los 7 minutos. Misma llamada que el cron de resumen-diario.
select cron.schedule(
  'trabajador-scraper-empleo',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/trabajador-scraper-empleo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu')
  );
  $$
);
