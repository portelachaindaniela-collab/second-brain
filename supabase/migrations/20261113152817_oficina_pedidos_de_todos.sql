-- La oficina como oficina: cualquier agente le pide permiso a Daniela (no solo María, Noruega y Mesa de entrada),
-- los equipos traen propuestas cada día, y los pedidos de código llevan una especificación más larga.
alter table public.oficina_solicitudes drop constraint oficina_solicitudes_agente_check;
alter table public.oficina_solicitudes add constraint oficina_solicitudes_agente_check
  check (agente ~ '^(trabajadores|up|pdg|sistemas|admin):[a-z_]{1,40}$');

alter table public.oficina_solicitudes drop constraint oficina_solicitudes_origen_check;
alter table public.oficina_solicitudes add constraint oficina_solicitudes_origen_check
  check (origen in ('reunion', 'manual', 'agente', 'propuesta'));

alter table public.oficina_solicitudes drop constraint oficina_solicitudes_detalle_check;
alter table public.oficina_solicitudes add constraint oficina_solicitudes_detalle_check check (length(detalle) <= 4000);
