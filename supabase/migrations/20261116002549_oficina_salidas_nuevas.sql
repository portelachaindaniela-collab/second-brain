-- Más lugares para charlar fuera de la oficina: cena, cine, teatro, la casa de Daniela y la casa del agente.
alter table oficina_conversacion drop constraint if exists oficina_conversacion_salida_check;
alter table oficina_conversacion add constraint oficina_conversacion_salida_check check (salida = any (array['comer','cafe','after','caminata','cena','cine','teatro','mi_casa','su_casa']));
