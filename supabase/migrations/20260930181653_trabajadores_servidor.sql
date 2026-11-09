select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'trabajadores_secreto',
  'Lo manda pg_cron a los trabajadores; lo validan con public.trabajador_secreto_valido().')
where not exists (select 1 from vault.secrets where name = 'trabajadores_secreto');

create or replace function public.trabajador_secreto_valido(p_secreto text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_secreto <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'trabajadores_secreto' and decrypted_secret = p_secreto
  ), false)
$$;
revoke execute on function public.trabajador_secreto_valido(text) from public, anon, authenticated;
grant execute on function public.trabajador_secreto_valido(text) to service_role;

alter table public.trabajadores add column minutos_trabado integer not null default 10 check (minutos_trabado between 1 and 240);

create or replace function public.trabajadores_sincronizar_cron() returns trigger
language plpgsql security definer set search_path = public, cron, pg_temp as $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = new.funcion;
  if v_jobid is null then
    v_jobid := cron.schedule(new.funcion, new.frecuencia, format(
      $c$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L, 'x-trabajador-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'trabajadores_secreto')), timeout_milliseconds := 120000);$c$,
      'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/' || new.funcion,
      'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu'));
  else
    perform cron.alter_job(v_jobid, schedule := new.frecuencia);
  end if;
  perform cron.alter_job(v_jobid, active := new.activo);
  return new;
end $$;
revoke execute on function public.trabajadores_sincronizar_cron() from public, anon, authenticated;;
