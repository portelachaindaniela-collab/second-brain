create table public.mail_reglas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('incluir', 'excluir')),
  patron text not null,
  created_at timestamptz not null default now()
);

alter table public.mail_reglas enable row level security;

create policy propias on public.mail_reglas
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

insert into public.mail_reglas (owner_id, tipo, patron)
select id, 'excluir', 'computrabajo' from auth.users where email = '<EMAIL_DUEÑA>'
union all
select id, 'incluir', 'entrevista' from auth.users where email = '<EMAIL_DUEÑA>';;
