alter table public.noticias_medios
  add column tipo text not null default 'medio' check (tipo in ('medio', 'referente')),
  add column descripcion text,
  add column bluesky text;
alter table public.noticias drop constraint noticias_canal_check;
alter table public.noticias add constraint noticias_canal_check check (canal in ('web', 'x', 'bluesky'));
alter table public.noticias add column de_referente boolean not null default false;;
