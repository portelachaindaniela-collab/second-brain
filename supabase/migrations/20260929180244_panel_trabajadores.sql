alter table public.trabajadores add column owner_id uuid references auth.users (id) on delete cascade;
update public.trabajadores set owner_id = (select id from auth.users where email = '<EMAIL_DUEÑA>') where owner_id is null;
alter table public.trabajadores alter column owner_id set not null;

create or replace function public.trabajadores_completar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := coalesce(new.owner_id, auth.uid(), (select owner_id from public.trabajadores limit 1));
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trabajadores_completar before insert or update on public.trabajadores
  for each row execute function public.trabajadores_completar();

create or replace function public.trabajadores_sincronizar_cron() returns trigger
language plpgsql security definer set search_path = public, cron, pg_temp as $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = new.funcion;
  if v_jobid is null then
    v_jobid := cron.schedule(new.funcion, new.frecuencia, format(
      $c$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L));$c$,
      'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/' || new.funcion,
      'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu'));
  else
    perform cron.alter_job(v_jobid, schedule := new.frecuencia);
  end if;
  perform cron.alter_job(v_jobid, active := new.activo);
  return new;
end $$;

create trigger trabajadores_sincronizar_cron_alta after insert on public.trabajadores
  for each row execute function public.trabajadores_sincronizar_cron();
create trigger trabajadores_sincronizar_cron_cambio after update of activo, frecuencia on public.trabajadores
  for each row when (old.activo is distinct from new.activo or old.frecuencia is distinct from new.frecuencia)
  execute function public.trabajadores_sincronizar_cron();

revoke execute on function public.trabajadores_completar() from public, anon, authenticated;
revoke execute on function public.trabajadores_sincronizar_cron() from public, anon, authenticated;

drop policy "sesiones leen trabajadores" on public.trabajadores;
create policy "duena lee trabajadores" on public.trabajadores
  for select to authenticated using (owner_id = auth.uid());
create policy "duena edita trabajadores" on public.trabajadores
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke insert, update, delete on public.trabajadores from anon, authenticated;
grant update (activo, frecuencia, parametros) on public.trabajadores to authenticated;;
