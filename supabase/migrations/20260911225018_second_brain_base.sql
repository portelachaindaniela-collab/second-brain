create extension if not exists pgcrypto;

create table projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug        text not null,
  name        text not null,
  status      text not null default 'activo' check (status in ('activo','pausado','archivado','idea')),
  color       text,
  summary     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, slug)
);

create table docs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete cascade,
  title       text not null,
  body        text,
  tags        text[] default '{}',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table assets (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id    uuid references projects(id) on delete cascade,
  storage_path  text not null,
  kind          text not null default 'imagen' check (kind in ('imagen','video','pdf','otro')),
  caption       text,
  created_at    timestamptz not null default now()
);

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  due_at      timestamptz,
  priority    smallint not null default 2 check (priority between 1 and 3),
  source      text,
  created_at  timestamptz not null default now()
);

create table metrics (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete cascade,
  key         text not null,
  value       numeric not null,
  unit        text,
  captured_at timestamptz not null default now()
);
create index on metrics (project_id, key, captured_at desc);

create table oauth_accounts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider       text not null check (provider in ('google','meta','x','linkedin','whatsapp')),
  external_id    text,
  handle         text,
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  scopes         text[],
  created_at     timestamptz not null default now(),
  unique (owner_id, provider, external_id)
);

create table emails (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id   uuid references projects(id) on delete set null,
  gmail_id     text not null,
  thread_id    text,
  from_addr    text,
  from_name    text,
  subject      text,
  snippet      text,
  received_at  timestamptz,
  is_unread    boolean not null default true,
  is_starred   boolean not null default false,
  synced_at    timestamptz not null default now(),
  unique (owner_id, gmail_id)
);
create index on emails (owner_id, received_at desc);

create table calendar_events (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id        uuid references projects(id) on delete set null,
  google_event_id   text not null,
  calendar_id       text,
  title             text,
  description       text,
  location          text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  all_day           boolean not null default false,
  synced_at         timestamptz not null default now(),
  unique (owner_id, google_event_id)
);
create index on calendar_events (owner_id, starts_at);

create table social_accounts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id   uuid references projects(id) on delete set null,
  provider     text not null check (provider in ('instagram','x','linkedin')),
  handle       text not null,
  external_id  text,
  oauth_id     uuid references oauth_accounts(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table social_posts (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id         uuid references projects(id) on delete set null,
  social_account_id  uuid references social_accounts(id) on delete cascade,
  body               text,
  media              text[] default '{}',
  link               text,
  status             text not null default 'borrador' check (status in ('borrador','programado','publicado','error')),
  scheduled_at       timestamptz,
  published_at       timestamptz,
  external_id        text,
  error              text,
  created_at         timestamptz not null default now()
);
create index on social_posts (owner_id, status, scheduled_at);

create table social_metrics (
  id                 bigint generated always as identity primary key,
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  social_account_id  uuid references social_accounts(id) on delete cascade,
  social_post_id     uuid references social_posts(id) on delete cascade,
  key                text not null,
  value              numeric not null,
  captured_at        timestamptz not null default now()
);
create index on social_metrics (social_account_id, key, captured_at desc);

create table social_inbox (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  social_account_id  uuid references social_accounts(id) on delete cascade,
  kind               text not null check (kind in ('comentario','dm')),
  external_id        text not null,
  author_handle      text,
  body               text,
  received_at        timestamptz,
  replied            boolean not null default false,
  unique (owner_id, external_id)
);

create table whatsapp_messages (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction    text not null check (direction in ('entrante','saliente')),
  wa_id        text,
  body         text,
  template     text,
  status       text,
  sent_at      timestamptz not null default now()
);

create table bot_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  channel     text not null default 'web' check (channel in ('web','whatsapp')),
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index on bot_messages (owner_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array[
    'projects','docs','assets','tasks','metrics','oauth_accounts',
    'emails','calendar_events','social_accounts','social_posts',
    'social_metrics','social_inbox','whatsapp_messages','bot_messages'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "propias" on %I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger t_projects before update on projects
  for each row execute function touch_updated_at();
create trigger t_docs before update on docs
  for each row execute function touch_updated_at();;
