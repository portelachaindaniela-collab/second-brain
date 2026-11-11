-- Sistemas: un pedido puede traer una acción concreta (por ejemplo, Noruega pide frenar una pieza cuando el Diseñador
-- se trabó). La acción se ejecuta recién cuando Daniela la aprueba (Edge Function oficina-sistemas).
alter table public.oficina_solicitudes add column accion jsonb check (accion is null or jsonb_typeof(accion) = 'object');
alter table public.oficina_solicitudes drop constraint oficina_solicitudes_origen_check;
alter table public.oficina_solicitudes add constraint oficina_solicitudes_origen_check check (origen in ('reunion', 'manual', 'agente'));
