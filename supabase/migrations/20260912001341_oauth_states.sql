create table oauth_states (
  state       text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  provider    text not null default 'google',
  created_at  timestamptz not null default now()
);
alter table oauth_states enable row level security;

create index on oauth_states (created_at);;
