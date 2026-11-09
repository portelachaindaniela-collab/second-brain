create table public.compras_datos (
  codigo_hash text primary key references public.compras_acceso(codigo_hash) on delete cascade,
  datos       jsonb not null default '{}'::jsonb,
  charlas     jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.compras_datos enable row level security;
-- Sin políticas: solo la función mis-compras (service role) lee y escribe.
create table public.compras_datos_historial (
  id          bigint generated always as identity primary key,
  codigo_hash text not null references public.compras_acceso(codigo_hash) on delete cascade,
  datos       jsonb not null,
  charlas     jsonb not null,
  guardado    timestamptz not null default now()
);
alter table public.compras_datos_historial enable row level security;
create index on public.compras_datos_historial (codigo_hash, guardado desc);;
