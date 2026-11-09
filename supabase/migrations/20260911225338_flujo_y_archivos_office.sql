alter table tasks
  add column status text not null default 'ideas'
  check (status in ('ideas','en_curso','esperando','listo'));

update tasks set status = 'listo' where done = true;

alter table tasks add column position int not null default 0;
create index on tasks (owner_id, status, position);

alter table assets drop constraint assets_kind_check;
alter table assets
  add constraint assets_kind_check
  check (kind in ('imagen','video','pdf','planilla','documento','presentacion','otro'));

alter table assets add column name text;
alter table assets add column source text not null default 'subido'
  check (source in ('subido','drive'));
alter table assets add column external_id text;
alter table assets add column external_url text;
alter table assets add column size_bytes bigint;
alter table assets add column updated_at timestamptz not null default now();

create trigger t_assets before update on assets
  for each row execute function touch_updated_at();;
