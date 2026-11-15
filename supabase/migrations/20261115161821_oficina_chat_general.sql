-- El chat de toda la oficina: las noticias del día (cumpleaños, parejas nuevas, celos, peleas, infidelidades,
-- reconciliaciones) que escriben los agentes, y lo que escribe Daniela con las respuestas de los que contestan.
create table public.oficina_chat_general (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  autor text not null check (autor = 'daniela' or autor ~ '^(trabajadores|up|pdg|sistemas):[a-z_]{1,40}$'),
  texto text not null check (length(texto) between 1 and 2000),
  tipo text not null default 'charla' check (tipo in ('charla', 'noticia')),
  creado timestamptz not null default now()
);
create index oficina_chat_general_creado on public.oficina_chat_general (owner_id, creado desc);
alter table public.oficina_chat_general enable row level security;
create policy "chat general dueña" on public.oficina_chat_general for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
