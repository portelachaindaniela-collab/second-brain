-- Quiénes saben de cada relación de Daniela: ids de agentes, o '*' (todos). Vacío: nadie más.
alter table public.oficina_corazon add column saben text[] not null default '{}';
