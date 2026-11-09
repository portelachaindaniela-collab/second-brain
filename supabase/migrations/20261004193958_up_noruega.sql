create table public.up_chequeos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  estado text not null check (estado in ('ok', 'aviso', 'falla')),
  chequeos jsonb not null default '[]',
  at timestamptz not null default now()
);
create index up_chequeos_owner_idx on public.up_chequeos (owner_id, at desc);
alter table public.up_chequeos enable row level security;
create policy "dueña lee sus chequeos" on public.up_chequeos for select to authenticated using (owner_id = auth.uid());
alter publication supabase_realtime add table public.up_chequeos;

create function public.up_estado_crons()
returns table (jobname text, ultimo_inicio timestamptz, ultimo_estado text)
language sql stable security definer set search_path to ''
as $$
  select j.jobname::text, d.start_time, d.status::text
  from cron.job j
  left join lateral (select r.start_time, r.status from cron.job_run_details r where r.jobid = j.jobid order by r.start_time desc limit 1) d on true
  where j.jobname like 'up-%'
$$;
revoke execute on function public.up_estado_crons() from public, anon, authenticated;
grant execute on function public.up_estado_crons() to service_role;;
