create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'resumen-diario-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/resumen-diario',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu')
  );
  $$
);;
