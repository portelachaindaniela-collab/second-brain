create table public.up_metricas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pieza_id uuid not null references public.up_piezas (id) on delete cascade,
  dia date not null,
  impresiones integer check (impresiones >= 0),
  reacciones integer check (reacciones >= 0),
  comentarios integer check (comentarios >= 0),
  compartidos integer check (compartidos >= 0),
  fuente text not null default 'manual' check (fuente in ('manual', 'linkedin', 'meta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pieza_id, dia)
);
create index up_metricas_owner_idx on public.up_metricas (owner_id, pieza_id);
create trigger up_metricas_updated_at before update on public.up_metricas for each row execute function public.tocar_updated_at();
alter table public.up_metricas enable row level security;
create policy "dueña lee sus métricas" on public.up_metricas for select to authenticated using (owner_id = auth.uid());
create policy "dueña carga sus métricas" on public.up_metricas for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.up_piezas p where p.id = pieza_id and p.owner_id = auth.uid()));
create policy "dueña edita sus métricas" on public.up_metricas for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.up_piezas p where p.id = pieza_id and p.owner_id = auth.uid()));
create policy "dueña borra sus métricas" on public.up_metricas for delete to authenticated using (owner_id = auth.uid());

create table public.up_historial (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  hoja_id text not null,
  url text not null,
  ultima_copia_at timestamptz,
  ultimo_error text,
  created_at timestamptz not null default now()
);
alter table public.up_historial enable row level security;
create policy "dueña lee su historial" on public.up_historial for select to authenticated using (owner_id = auth.uid());

alter table public.up_piezas add column historial_fila integer, add column historial_at timestamptz;;
