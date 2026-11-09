-- Los IDs de evento de Google son únicos por calendario, no globalmente: al sincronizar todos los
-- calendarios de la usuaria (no solo "primary") hace falta que el UPSERT distinga por calendar_id
-- también, o eventos de distintos calendarios con el mismo id chocarían entre sí.
alter table public.calendar_events drop constraint calendar_events_owner_id_google_event_id_key;
alter table public.calendar_events add constraint calendar_events_owner_id_calendar_id_google_event_id_key unique (owner_id, calendar_id, google_event_id);;
