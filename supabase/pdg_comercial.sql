-- PDG comercial: el departamento de ventas y marketing de Point Data Global dentro de Second Brain.
-- Solo el esquema. El manual y las instrucciones de los agentes viven en las tablas (se editan desde la app).

-- Manual comercial: qué es el sistema, qué existe hoy, cómo se adapta a cada segmento. Una fila por dueña.
create table public.pdg_manual (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  texto text not null default '',
  updated_at timestamptz not null default now()
);

-- Los agentes del departamento y sus instrucciones.
create table public.pdg_agentes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  clave text not null check (clave in ('prospector', 'demo', 'objeciones', 'propuesta', 'marketing')),
  nombre text not null,
  rol text not null default '',
  instrucciones text not null default '',
  orden integer not null default 0,
  unique (owner_id, clave)
);

-- Cuentas: clubes, ligas, agencias, medios y marcas a los que se les vende el sistema.
create table public.pdg_cuentas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  segmento text not null default 'club' check (segmento in ('club', 'liga', 'agencia', 'medio', 'marca', 'otro')),
  pais text,
  web text,
  contacto text,
  notas text,
  etapa text not null default 'prospecto' check (etapa in ('prospecto', 'contactada', 'demo', 'propuesta', 'negociacion', 'ganada', 'perdida')),
  proxima_accion text,
  proxima_fecha date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pdg_cuentas_owner_idx on public.pdg_cuentas (owner_id, etapa);

-- Lo que escribe cada agente: con cuenta (auditoría, guion, propuesta…) o suelto (campañas de marketing).
create table public.pdg_trabajos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cuenta_id uuid references public.pdg_cuentas (id) on delete cascade,
  agente text not null,
  pedido text,
  texto text not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'descartado')),
  modelo text,
  created_at timestamptz not null default now()
);
create index pdg_trabajos_owner_idx on public.pdg_trabajos (owner_id, created_at desc);
create index pdg_trabajos_cuenta_idx on public.pdg_trabajos (cuenta_id, created_at desc);

create or replace function public.pdg_tocar_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger pdg_cuentas_updated before update on public.pdg_cuentas for each row execute function public.pdg_tocar_updated_at();
create trigger pdg_manual_updated before update on public.pdg_manual for each row execute function public.pdg_tocar_updated_at();

alter table public.pdg_manual enable row level security;
alter table public.pdg_agentes enable row level security;
alter table public.pdg_cuentas enable row level security;
alter table public.pdg_trabajos enable row level security;
create policy "pdg_manual dueña" on public.pdg_manual for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "pdg_agentes dueña" on public.pdg_agentes for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "pdg_cuentas dueña" on public.pdg_cuentas for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "pdg_trabajos dueña" on public.pdg_trabajos for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
