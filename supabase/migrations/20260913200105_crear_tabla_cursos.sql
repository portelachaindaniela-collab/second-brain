create table public.cursos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  plataforma text,
  url text,
  progreso text,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'pausado', 'terminado')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cursos enable row level security;

create policy propias on public.cursos
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());;
