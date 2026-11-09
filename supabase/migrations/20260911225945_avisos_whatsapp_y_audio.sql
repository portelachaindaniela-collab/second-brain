create table nudges (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('resumen_diario','antes_de_evento','tarea_estancada','recordatorio','cierre_del_dia')),
  hora           time,
  dias           smallint[] default '{1,2,3,4,5}',
  minutos_antes  int,
  dias_sin_tocar int,
  plantilla      text,
  activo         boolean not null default true,
  ultimo_envio   timestamptz,
  created_at     timestamptz not null default now()
);

alter table nudges enable row level security;
create policy "propias" on nudges for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table tasks add column remind_at timestamptz;
create index on tasks (owner_id, remind_at) where remind_at is not null;

alter table tasks add column touched_at timestamptz not null default now();

alter table whatsapp_messages add column media_url text;
alter table whatsapp_messages add column transcript text;
alter table whatsapp_messages add column task_id uuid references tasks(id) on delete set null;;
