-- Cambia la unidad de cuenta de centavos enteros a micro-dólares (1.000.000 micros = USD 1):
-- redondear a centavos hacía que cualquier consulta chica reservara 1 centavo completo y agotara
-- el presupuesto de USD 10 en ~1000 mensajes sin importar su tamaño real.

drop function if exists public.bs67_reservar_presupuesto(uuid, text, integer, integer);
drop function if exists public.bs67_confirmar_gasto(uuid, text, integer, integer, text, integer, integer);
drop function if exists public.bs67_liberar_reserva(uuid, text, integer);

alter table public.bs67_budget rename column limit_cents to limit_micros;
alter table public.bs67_budget rename column reserved_cents to reserved_micros;
alter table public.bs67_budget rename column spent_cents to spent_micros;
alter table public.bs67_budget alter column limit_micros set default 10000000;

alter table public.bs67_budget_log rename column amount_cents to amount_micros;

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

revoke all on function public.bs67_reservar_presupuesto(uuid, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.bs67_confirmar_gasto(uuid, text, bigint, bigint, text, integer, integer) from public, anon, authenticated;
revoke all on function public.bs67_liberar_reserva(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.bs67_reservar_presupuesto(uuid, text, bigint, bigint) to service_role;
grant execute on function public.bs67_confirmar_gasto(uuid, text, bigint, bigint, text, integer, integer) to service_role;
grant execute on function public.bs67_liberar_reserva(uuid, text, bigint) to service_role;;
