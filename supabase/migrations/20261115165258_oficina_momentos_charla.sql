-- Lo que se dijeron los agentes cuando se juntaron (mate, café, almuerzo, pasillo, salida): la charla completa, para
-- leerla y para que cada uno la recuerde. [{ agente, texto }]
alter table public.oficina_momentos add column charla jsonb not null default '[]'::jsonb;
