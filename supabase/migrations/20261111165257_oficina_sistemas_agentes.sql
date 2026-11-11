-- Oficina · Sistemas: lo que leen sus agentes. Solo lectura y sin claves.
-- Guardián de claves: de cada conexión, qué es y cuándo vence (nunca el token).
create or replace function public.oficina_conexiones()
returns table (origen text, nombre text, expira_at timestamptz, renovable boolean)
language sql stable security definer set search_path to ''
as $$
  select 'UP · ' || c.red, c.nombre, c.expira_at, false from public.up_conexiones c where c.owner_id = auth.uid()
  union all
  select o.provider, o.handle, o.expires_at, o.refresh_token is not null from public.oauth_accounts o where o.owner_id = auth.uid()
$$;
revoke execute on function public.oficina_conexiones() from public, anon;
grant execute on function public.oficina_conexiones() to authenticated;

-- Operador: cada tarea programada con su última corrida y cuántas fallaron en las últimas 24 horas.
create or replace function public.oficina_operador()
returns table (jobname text, schedule text, activo boolean, ultima timestamptz, estado text, mensaje text, corridas_24h int, fallas_24h int)
language sql stable security definer set search_path to ''
as $$
  select j.jobname::text, j.schedule::text, j.active, u.start_time, u.status::text, left(u.return_message, 300),
    coalesce(d.corridas, 0)::int, coalesce(d.fallas, 0)::int
  from cron.job j
  left join lateral (
    select r.start_time, r.status, r.return_message from cron.job_run_details r where r.jobid = j.jobid order by r.start_time desc limit 1
  ) u on true
  left join lateral (
    select count(*) as corridas, count(*) filter (where r.status = 'failed') as fallas
    from cron.job_run_details r where r.jobid = j.jobid and r.start_time > now() - interval '24 hours'
  ) d on true
  where auth.uid() is not null
  order by j.jobname
$$;
revoke execute on function public.oficina_operador() from public, anon;
grant execute on function public.oficina_operador() to authenticated;
