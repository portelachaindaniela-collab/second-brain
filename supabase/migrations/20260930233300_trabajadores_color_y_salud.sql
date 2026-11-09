alter table public.trabajadores add column color text check (color in ('ambar', 'azul', 'violeta', 'rosa', 'cian', 'lima'));
update public.trabajadores set color = case clave
  when 'scraper_empleo' then 'ambar' when 'google_sync' then 'azul' when 'maria' then 'violeta' when 'buscador_eventos' then 'rosa' end;
alter table public.trabajadores alter column color set not null;
alter table public.trabajadores add constraint trabajadores_color_unico unique (color);

create or replace function public.salud_sistema() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'jobs_total', (select count(*) from cron.job),
    'jobs_activos', (select count(*) from cron.job where active),
    'fallos_cron_24h', (select count(*) from cron.job_run_details where status = 'failed' and start_time > now() - interval '24 hours'),
    'trabajadores_sin_job', (select coalesce(jsonb_agg(t.clave), '[]'::jsonb) from public.trabajadores t
      left join cron.job j on j.jobname = t.funcion
      where t.owner_id = auth.uid() and t.activo and (j.jobid is null or not j.active)),
    'eventos', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb)
      from (select estado, count(*) as n from public.eventos where owner_id = auth.uid() group by estado) e)
  )
$$;
revoke execute on function public.salud_sistema() from public, anon;
grant execute on function public.salud_sistema() to authenticated;;
