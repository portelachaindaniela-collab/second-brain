-- Configuración de cada trabajador. El estado de sus corridas NO va acá: sale de trabajos_corridas
-- (se une por trabajadores.clave = trabajos_corridas.trabajador).
-- `frecuencia` es la expresión cron declarada; por ahora la programación real sigue en cron.job.
create table public.trabajadores (
  id bigint generated always as identity primary key,
  clave text not null unique,
  funcion text not null,
  nombre text not null,
  descripcion text,
  tipo text not null check (tipo in ('scraper', 'cliente_api', 'monitor')),
  activo boolean not null default true,
  frecuencia text not null,
  parametros jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trabajadores enable row level security;

create policy "sesiones leen trabajadores" on public.trabajadores
  for select to authenticated using (true);

insert into public.trabajadores (clave, funcion, nombre, descripcion, tipo, activo, frecuencia, parametros) values (
  'scraper_empleo',
  'trabajador-scraper-empleo',
  'Scraper de empleo',
  'Lee el último reporte del scraper de Radar Laboral (GitHub Pages) y guarda fechas, ofertas publicadas y estado de cada portal.',
  'cliente_api',
  true,
  '7 * * * *',
  '{"url": "https://portelachaindaniela-collab.github.io/scraper-busquedas-laborales/ultima_corrida.json", "timeout_ms": 10000, "ventana_sin_repetir_min": 5}'::jsonb
);

-- ---------- Panel de trabajadores (migración panel_trabajadores) ----------
-- Solo la dueña lee y edita la configuración; desde la app solo se pueden cambiar activo, frecuencia y parametros.
-- Para sumar un trabajador: insertar la fila (owner_id se completa solo) y desplegar su Edge Function con el
-- mismo nombre que `funcion`. El trigger crea el job de pg_cron; nada del panel, María ni BS67 cambia.
alter table public.trabajadores add column owner_id uuid references auth.users (id) on delete cascade;
-- Sistema de una sola usuaria: la dueña es la única cuenta.
update public.trabajadores set owner_id = (select id from auth.users order by created_at limit 1) where owner_id is null;
alter table public.trabajadores alter column owner_id set not null;

create or replace function public.trabajadores_completar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- Sistema de una sola usuaria: una fila cargada por SQL hereda la dueña de los trabajadores existentes.
    new.owner_id := coalesce(new.owner_id, auth.uid(), (select owner_id from public.trabajadores limit 1));
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trabajadores_completar before insert or update on public.trabajadores
  for each row execute function public.trabajadores_completar();

-- pg_cron corre en UTC. La programación real sigue a `frecuencia` y `activo`; el comando de un job existente no se toca.
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
grant update (activo, frecuencia, parametros) on public.trabajadores to authenticated;

-- ---------- Baja de trabajadores (migración trabajadores_baja_cron) ----------
-- Al borrar la fila de un trabajador se da de baja su job de pg_cron. Si no tenía job, no pasa nada.
-- La Edge Function no se puede borrar desde SQL: se borra a mano en Supabase → Edge Functions.
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

revoke execute on function public.trabajadores_baja_cron() from public, anon, authenticated;

-- ---------- Trabajadores del lado del servidor (migración trabajadores_servidor) ----------
-- Los trabajadores que tocan datos de la dueña (google-sync, María) corren sin su sesión: pg_cron les manda
-- el secreto `trabajadores_secreto` de Vault en el header x-trabajador-secreto, y la función lo valida con
-- trabajador_secreto_valido(). El secreto se genera acá adentro y no se escribe en ningún archivo.
-- La dueña de los datos sale de trabajadores.owner_id, nunca de la llamada.
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

-- Cuánto puede tardar una corrida antes de mostrarse como trabada. Depende del trabajador: google-sync tarda más.
alter table public.trabajadores add column minutos_trabado integer not null default 10 check (minutos_trabado between 1 and 240);

-- Los jobs nuevos leen el secreto de Vault en cada corrida (no queda escrito en cron.job) y esperan hasta
-- 2 minutos la respuesta (pg_net corta a los 5 s por defecto).
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
revoke execute on function public.trabajadores_sincronizar_cron() from public, anon, authenticated;

-- ---------- Tablero de trabajadores (migración trabajadores_color_y_salud) ----------
-- Color de identidad: nombre de un token de tema (--id-<color> en styles.css), uno por trabajador y fijo.
-- No se puede editar desde la app (el grant de update sigue siendo solo activo, frecuencia y parametros).
alter table public.trabajadores add column color text check (color in ('ambar', 'azul', 'violeta', 'rosa', 'cian', 'lima'));
update public.trabajadores set color = case clave
  when 'scraper_empleo' then 'ambar' when 'google_sync' then 'azul' when 'maria' then 'violeta' when 'buscador_eventos' then 'rosa' end;
alter table public.trabajadores alter column color set not null;
alter table public.trabajadores add constraint trabajadores_color_unico unique (color);

-- Panel "Salud del sistema": la app no puede leer el esquema cron, así que esta función devuelve solo totales
-- (nunca los comandos de los jobs) y los eventos de quien la llama.
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
grant execute on function public.salud_sistema() to authenticated;
