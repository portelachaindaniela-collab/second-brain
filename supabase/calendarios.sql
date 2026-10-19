-- Nombre y color de cada calendario de Google (migración calendarios_google). Lo llena google-sync
-- desde calendarList; la vista mensual de Mail y Calendario lo usa para pintar y nombrar cada evento.
-- calendar_id es el mismo que guarda calendar_events (el principal va como 'primary').
create table public.calendarios (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  calendar_id text not null,
  nombre text not null,
  color text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, calendar_id)
);

alter table public.calendarios enable row level security;
create policy "dueña lee sus calendarios" on public.calendarios for select to authenticated using (owner_id = (select auth.uid()));
create policy "dueña crea sus calendarios" on public.calendarios for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "dueña edita sus calendarios" on public.calendarios for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "dueña borra sus calendarios" on public.calendarios for delete to authenticated using (owner_id = (select auth.uid()));
