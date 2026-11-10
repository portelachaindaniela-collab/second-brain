-- Un plan de Eventos que se agregó al calendario guarda el evento creado, para no agregarlo dos veces.
alter table public.eventos add column calendario_evento_id uuid references public.calendar_events (id) on delete set null;
