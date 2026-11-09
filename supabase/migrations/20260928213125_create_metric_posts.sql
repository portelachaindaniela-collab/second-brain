create table if not exists public.metric_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  plataforma text not null check (plataforma in ('x','linkedin')),
  post_id text not null,
  enlace text not null,
  autor text,
  usuario text,
  avatar text,
  imagen text,
  titulo_enlace text,
  publicado timestamptz,
  actualizado timestamptz not null default now(),
  metricas jsonb not null default '{}'::jsonb,
  manual boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, plataforma, post_id)
);

alter table public.metric_posts enable row level security;

create policy "metric_posts_select_own" on public.metric_posts
  for select using (owner_id = auth.uid());
create policy "metric_posts_insert_own" on public.metric_posts
  for insert with check (owner_id = auth.uid());
create policy "metric_posts_update_own" on public.metric_posts
  for update using (owner_id = auth.uid());
create policy "metric_posts_delete_own" on public.metric_posts
  for delete using (owner_id = auth.uid());
;
