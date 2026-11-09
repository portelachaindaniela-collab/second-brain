-- La función google-calendar-edit ya contemplaba crear eventos sin Google conectado
-- (google_event_id queda null en ese caso), pero la columna no lo permitía. Sin esto,
-- cualquier evento puramente local (no sincronizado a Google) fallaba al insertarse.
alter table public.calendar_events alter column google_event_id drop not null;;
