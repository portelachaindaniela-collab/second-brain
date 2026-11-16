-- Los vínculos entre agentes que arma Daniela quedan fijos: la vida de la oficina no los cambia.
alter table oficina_vinculos add column if not exists fijo boolean not null default false;
