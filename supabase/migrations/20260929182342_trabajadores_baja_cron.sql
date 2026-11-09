create or replace function public.trabajadores_baja_cron() returns trigger
language plpgsql security definer set search_path = public, cron, pg_temp as $$
begin
  if exists (select 1 from cron.job where jobname = old.funcion) then
    perform cron.unschedule(old.funcion);
  end if;
  return old;
end $$;

create trigger trabajadores_baja_cron after delete on public.trabajadores
  for each row execute function public.trabajadores_baja_cron();

revoke execute on function public.trabajadores_baja_cron() from public, anon, authenticated;;
