-- Oficina: las tareas programadas de Administración (las que no son trabajadores) con sus últimas corridas.
-- Solo lectura. La usa la pantalla Oficina para mostrar si cada una corrió bien.
create or replace function public.oficina_administracion()
returns table (jobname text, schedule text, activo boolean, inicio timestamptz, fin timestamptz, estado text, mensaje text)
language sql stable security definer set search_path to ''
as $$
  select j.jobname::text, j.schedule::text, j.active, r.start_time, r.end_time, r.status::text, left(r.return_message, 300)
  from cron.job j
  left join lateral (
    select d.start_time, d.end_time, d.status, d.return_message
    from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 5
  ) r on true
  where j.jobname in ('search-console', 'resumen-diario-push', 'agenda-dulce-1410', 'agenda-dulce-1900', 'up-historial', 'limpiar-historial')
  order by j.jobname, r.start_time desc
$$;
revoke execute on function public.oficina_administracion() from public, anon;
grant execute on function public.oficina_administracion() to authenticated;
