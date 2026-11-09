create table if not exists public.compras_acceso (
  codigo_hash text primary key,
  nombre text,
  creado timestamptz not null default now()
);
create table if not exists public.compras_uso (
  codigo_hash text not null references public.compras_acceso(codigo_hash) on delete cascade,
  dia date not null,
  cantidad int not null default 0,
  primary key (codigo_hash, dia)
);
alter table public.compras_acceso enable row level security;
alter table public.compras_uso enable row level security;;
