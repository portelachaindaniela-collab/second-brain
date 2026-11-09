alter table public.up_piezas
  add column contenido jsonb,
  add column problemas jsonb,
  add column datos_usados uuid[];

select cron.schedule('up-pipeline', '52 8 * * *', $c$select net.http_post(url := 'https://itultpcdafpxpgtblgfb.supabase.co/functions/v1/up-pipeline', headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_jK_ebdVy29E9sKQA4sd3Qw_X4YJJ4Qu', 'x-trabajador-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'trabajadores_secreto')), timeout_milliseconds := 120000);$c$);;
