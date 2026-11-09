alter table public.metric_posts drop constraint if exists metric_posts_plataforma_check;
alter table public.metric_posts add constraint metric_posts_plataforma_check check (plataforma = 'x');
alter table public.metric_posts drop column if exists manual;
;
