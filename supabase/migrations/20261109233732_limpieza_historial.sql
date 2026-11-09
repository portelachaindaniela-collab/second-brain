-- Retención: los registros de corridas y de María crecían sin límite.
-- trabajos_corridas: 90 días (Trabajadores muestra historial por día). process_reports: 30 días (Hoy lee las últimas 20).
-- noticias ya se limpia sola en trabajador-noticias (parámetro dias_conservar, hoy 15 días).
create or replace function public.limpiar_historial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  corridas int;
  reportes int;
begin
  delete from public.trabajos_corridas where iniciado_at < now() - interval '90 days';
  get diagnostics corridas = row_count;
  delete from public.process_reports where iniciado_at < now() - interval '30 days';
  get diagnostics reportes = row_count;
  return jsonb_build_object('trabajos_corridas', corridas, 'process_reports', reportes);
end;
$$;

revoke all on function public.limpiar_historial() from public, anon, authenticated;

select cron.schedule('limpiar-historial', '15 8 * * *', $$select public.limpiar_historial()$$);
