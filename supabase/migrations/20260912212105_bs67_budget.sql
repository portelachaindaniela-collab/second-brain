-- Presupuesto mensual de BS67: límite duro de USD 10 por owner_id, controlado en el servidor
-- (Postgres/Supabase), no en el cliente, para que persista entre cierres y reinstalaciones de la
-- app y para que dos consultas simultáneas no puedan superarlo juntas.

create table if not exists public.bs67_budget (
  owner_id uuid not null references auth.users(id) on delete cascade,
  year_month text not null,
  limit_cents integer not null default 1000,
  reserved_cents integer not null default 0,
  spent_cents integer not null default 0,
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
  amount_cents integer not null,
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
  p_owner uuid, p_year_month text, p_amount_cents integer, p_limit_cents integer default 1000
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  insert into public.bs67_budget (owner_id, year_month, limit_cents)
  values (p_owner, p_year_month, p_limit_cents)
  on conflict (owner_id, year_month) do nothing;

  update public.bs67_budget
  set reserved_cents = reserved_cents + p_amount_cents, updated_at = now()
  where owner_id = p_owner and year_month = p_year_month
    and reserved_cents + spent_cents + p_amount_cents <= limit_cents
  returning true into ok;

  if coalesce(ok, false) then
    insert into public.bs67_budget_log (owner_id, year_month, kind, amount_cents)
    values (p_owner, p_year_month, 'reserva', p_amount_cents);
  end if;

  return coalesce(ok, false);
end;
$$;

create or replace function public.bs67_confirmar_gasto(
  p_owner uuid, p_year_month text, p_reservado_cents integer, p_real_cents integer,
  p_model text default null, p_input_tokens integer default null, p_output_tokens integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bs67_budget
  set reserved_cents = greatest(0, reserved_cents - p_reservado_cents),
      spent_cents = spent_cents + p_real_cents,
      updated_at = now()
  where owner_id = p_owner and year_month = p_year_month;

  insert into public.bs67_budget_log (owner_id, year_month, kind, amount_cents, model, input_tokens, output_tokens)
  values (p_owner, p_year_month, 'confirmacion', p_real_cents, p_model, p_input_tokens, p_output_tokens);
end;
$$;

create or replace function public.bs67_liberar_reserva(
  p_owner uuid, p_year_month text, p_amount_cents integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bs67_budget
  set reserved_cents = greatest(0, reserved_cents - p_amount_cents), updated_at = now()
  where owner_id = p_owner and year_month = p_year_month;

  insert into public.bs67_budget_log (owner_id, year_month, kind, amount_cents)
  values (p_owner, p_year_month, 'liberacion', p_amount_cents);
end;
$$;

revoke all on function public.bs67_reservar_presupuesto(uuid, text, integer, integer) from public;
revoke all on function public.bs67_confirmar_gasto(uuid, text, integer, integer, text, integer, integer) from public;
revoke all on function public.bs67_liberar_reserva(uuid, text, integer) from public;
grant execute on function public.bs67_reservar_presupuesto(uuid, text, integer, integer) to service_role;
grant execute on function public.bs67_confirmar_gasto(uuid, text, integer, integer, text, integer, integer) to service_role;
grant execute on function public.bs67_liberar_reserva(uuid, text, integer) to service_role;
;
