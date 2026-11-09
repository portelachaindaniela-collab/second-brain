revoke all on function public.bs67_reservar_presupuesto(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.bs67_confirmar_gasto(uuid, text, integer, integer, text, integer, integer) from public, anon, authenticated;
revoke all on function public.bs67_liberar_reserva(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.bs67_reservar_presupuesto(uuid, text, integer, integer) to service_role;
grant execute on function public.bs67_confirmar_gasto(uuid, text, integer, integer, text, integer, integer) to service_role;
grant execute on function public.bs67_liberar_reserva(uuid, text, integer) to service_role;;
