-- Relaciones entre agentes como en un simulador de vida: más tipos (de conocidos a casados, rivales, ex, divorciados y
-- amantes), una afinidad de -100 a 100 que sube y baja con lo que pasa, y si es secreta (una infidelidad que nadie sabe).
alter table public.oficina_vinculos drop constraint oficina_vinculos_tipo_check;
alter table public.oficina_vinculos add constraint oficina_vinculos_tipo_check check (tipo in (
  'conocidos', 'companerismo', 'amistad', 'mejores_amigos', 'rivalidad', 'saliendo', 'pareja', 'comprometidos', 'casados',
  'separados', 'divorciados', 'ex', 'amantes'));
alter table public.oficina_vinculos add column afinidad smallint not null default 0 check (afinidad between -100 and 100);
alter table public.oficina_vinculos add column secreto boolean not null default false;
update public.oficina_vinculos set afinidad = case tipo when 'pareja' then 70 when 'amistad' then 45 else 15 end;
