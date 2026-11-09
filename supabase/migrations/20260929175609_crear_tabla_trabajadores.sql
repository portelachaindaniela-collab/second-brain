create table public.trabajadores (
  id bigint generated always as identity primary key,
  clave text not null unique,
  funcion text not null,
  nombre text not null,
  descripcion text,
  tipo text not null check (tipo in ('scraper', 'cliente_api', 'monitor')),
  activo boolean not null default true,
  frecuencia text not null,
  parametros jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trabajadores enable row level security;

create policy "sesiones leen trabajadores" on public.trabajadores
  for select to authenticated using (true);

insert into public.trabajadores (clave, funcion, nombre, descripcion, tipo, activo, frecuencia, parametros) values (
  'scraper_empleo',
  'trabajador-scraper-empleo',
  'Scraper de empleo',
  'Lee el último reporte del scraper de Radar Laboral (GitHub Pages) y guarda fechas, ofertas publicadas y estado de cada portal.',
  'cliente_api',
  true,
  '7 * * * *',
  '{"url": "https://portelachaindaniela-collab.github.io/scraper-busquedas-laborales/ultima_corrida.json", "timeout_ms": 10000, "ventana_sin_repetir_min": 5}'::jsonb
);;
