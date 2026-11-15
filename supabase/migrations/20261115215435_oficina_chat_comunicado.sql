-- Los comunicados oficiales de Daniela: quedan en el chat de la oficina (así los agentes los leen) con tipo 'comunicado'.
alter table oficina_chat_general drop constraint oficina_chat_general_tipo_check;
alter table oficina_chat_general add constraint oficina_chat_general_tipo_check check (tipo = any (array['charla','noticia','comunicado']));
