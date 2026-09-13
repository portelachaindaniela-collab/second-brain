-- Presupuesto mensual de BS67: límite duro de USD 10 por owner_id, controlado en el servidor
-- (Postgres/Supabase), no en el cliente, para que persista entre cierres y reinstalaciones de la
-- app y para que dos consultas simultáneas no puedan superarlo juntas.
--
-- Se cuenta en "micro-dólares" (1.000.000 micros = USD 1), no en centavos: redondear a centavos
-- enteros haría que cualquier consulta chica reserve 1 centavo completo y agote el presupuesto en
-- ~1000 mensajes sin importar su tamaño real.

create table if not exists public.bs67_budget (
  owner_id uuid not null references auth.users(id) on delete cascade,
  year_month text not null,
  limit_micros bigint not null default 10000000,
  reserved_micros bigint not null default 0,
  spent_micros bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_id, year_month)
);
alter table public.bs67_budget enable row level security;
drop policy if exists "bs67_budget_select_own" on public.bs67_budget;
create policy "bs67_budget_select_own" on public.bs67_budget for select using (owner_id = auth.uid());

create table if not exists public.bs67_budget_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  year_month text not null,
  kind text not null check (kind in ('reserva', 'confirmacion', 'liberacion')),
  amount_micros bigint not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
alter table public.bs67_budget_log enable row level security;
drop policy if exists "bs67_budget_log_select_own" on public.bs67_budget_log;
create policy "bs67_budget_log_select_own" on public.bs67_budget_log for select using (owner_id = auth.uid());
create index if not exists bs67_budget_log_owner_idx on public.bs67_budget_log (owner_id, created_at desc);

-- Reserva atómica: el UPDATE con WHERE sobre la fila (owner_id, year_month) se serializa a nivel
-- de fila en Postgres, así que dos llamadas concurrentes no pueden reservar por encima del límite.
create or replace function public.bs67_reservar_presupuesto(
  p_owner uuid, p_year_month text, p_amount_micros bigint, p_limit_micros bigint default 10000000
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  insert into public.bs67_budget (owner_id, year_month, limit_micros)
  values (p_owner, p_year_month, p_limit_micros)
  on conflict (owner_id, year_month) do nothing;

  update public.bs67_budget
  set reserved_micros = reserved_micros + p_amount_micros, updated_at = now()
  where owner_id = p_owner and year_month = p_year_month
    and reserved_micros + spent_micros + p_amount_micros <= limit_micros
  returning true into ok;

  if coalesce(ok, false) then
    insert into public.bs67_budget_log (owner_id, year_month, kind, amount_micros)
    values (p_owner, p_year_month, 'reserva', p_amount_micros);
  end if;

  return coalesce(ok, false);
end;
$$;

create or replace function public.bs67_confirmar_gasto(
  p_owner uuid, p_year_month text, p_reservado_micros bigint, p_real_micros bigint,
  p_model text default null, p_input_tokens integer default null, p_output_tokens integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bs67_budget
  set reserved_micros = greatest(0, reserved_micros - p_reservado_micros),
      spent_micros = spent_micros + p_real_micros,
      updated_at = now()
  where owner_id = p_owner and year_month = p_year_month;

  insert into public.bs67_budget_log (owner_id, year_month, kind, amount_micros, model, input_tokens, output_tokens)
  values (p_owner, p_year_month, 'confirmacion', p_real_micros, p_model, p_input_tokens, p_output_tokens);
end;
$$;

create or replace function public.bs67_liberar_reserva(
  p_owner uuid, p_year_month text, p_amount_micros bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bs67_budget
  set reserved_micros = greatest(0, reserved_micros - p_amount_micros), updated_at = now()
  where owner_id = p_owner and year_month = p_year_month;

  insert into public.bs67_budget_log (owner_id, year_month, kind, amount_micros)
  values (p_owner, p_year_month, 'liberacion', p_amount_micros);
end;
$$;

-- Supabase otorga EXECUTE sobre las funciones de public a anon/authenticated por defecto además de
-- PUBLIC: hay que revocarlo explícitamente de los tres o cualquier usuario logueado podría llamar
-- estas funciones con el owner_id de otra persona.
revoke all on function public.bs67_reservar_presupuesto(uuid, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.bs67_confirmar_gasto(uuid, text, bigint, bigint, text, integer, integer) from public, anon, authenticated;
revoke all on function public.bs67_liberar_reserva(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.bs67_reservar_presupuesto(uuid, text, bigint, bigint) to service_role;
grant execute on function public.bs67_confirmar_gasto(uuid, text, bigint, bigint, text, integer, integer) to service_role;
grant execute on function public.bs67_liberar_reserva(uuid, text, bigint) to service_role;
