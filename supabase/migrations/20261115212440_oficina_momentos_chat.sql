-- Los malentendidos entre compañeros se arreglan por chat: queda como un momento de tipo 'chat'.
alter table oficina_momentos drop constraint oficina_momentos_tipo_check;
alter table oficina_momentos add constraint oficina_momentos_tipo_check check (tipo = any (array['mate','cafe','almuerzo','merienda','cena','after','paseo','chat']));
