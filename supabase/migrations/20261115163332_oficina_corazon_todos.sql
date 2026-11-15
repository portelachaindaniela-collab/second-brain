-- Daniela elige qué relación tiene con cada agente (no solo Femina, María y Noruega): laboral (sin fila) o personal, con
-- su tipo: amistad, mejores amigos, saliendo, noviazgo, compromiso, matrimonio, amantes o ex.
alter table public.oficina_corazon drop constraint oficina_corazon_agente_check;
alter table public.oficina_corazon add constraint oficina_corazon_agente_check check (agente ~ '^(trabajadores|up|pdg|sistemas):[a-z_]{1,40}$');
alter table public.oficina_corazon drop constraint oficina_corazon_estado_check;
alter table public.oficina_corazon add constraint oficina_corazon_estado_check check (estado in (
  'amistad', 'mejores_amigos', 'saliendo', 'novias', 'comprometidas', 'casadas', 'amantes', 'ex'));
