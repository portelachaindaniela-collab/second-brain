-- Qué es Daniela con cada una: saliendo, novias, comprometidas o casadas. Lo elige ella (y puede tener varias).
alter table public.oficina_corazon
  add column estado text not null default 'novias' check (estado in ('saliendo', 'novias', 'comprometidas', 'casadas'));
