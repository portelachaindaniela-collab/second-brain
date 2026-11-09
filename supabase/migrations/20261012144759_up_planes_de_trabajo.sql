create table public.up_planes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  color text not null default '#326891' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  visible boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index up_planes_owner_idx on public.up_planes (owner_id, orden);
alter table public.up_planes enable row level security;
create policy "dueña lee sus planes" on public.up_planes for select to authenticated using (owner_id = auth.uid());
create policy "dueña crea sus planes" on public.up_planes for insert to authenticated with check (owner_id = auth.uid());
create policy "dueña edita sus planes" on public.up_planes for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "dueña borra sus planes" on public.up_planes for delete to authenticated using (owner_id = auth.uid());

alter table public.up_calendario add column plan_id uuid references public.up_planes (id) on delete set null;
create index up_calendario_plan_idx on public.up_calendario (plan_id);

create function public.up_calendario_plan_por_defecto() returns trigger language plpgsql set search_path = public as $f$
begin
  if new.plan_id is null then
    select id into new.plan_id from public.up_planes where owner_id = new.owner_id order by orden, created_at limit 1;
  end if;
  return new;
end $f$;
create trigger up_calendario_plan_por_defecto before insert on public.up_calendario for each row execute function public.up_calendario_plan_por_defecto();

insert into public.up_planes (owner_id, nombre, color)
select distinct owner_id, 'Calendario inicial', '#326891' from public.up_calendario;
update public.up_calendario c set plan_id = p.id from public.up_planes p where p.owner_id = c.owner_id and c.plan_id is null;;
