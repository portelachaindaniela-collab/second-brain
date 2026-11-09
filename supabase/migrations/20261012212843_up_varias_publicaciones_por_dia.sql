alter table public.up_calendario drop constraint up_calendario_owner_id_fecha_key;
create index up_calendario_owner_fecha_idx on public.up_calendario (owner_id, fecha);
alter table public.up_piezas drop constraint up_piezas_owner_id_fecha_red_key;
alter table public.up_piezas alter column calendario_id set not null;
alter table public.up_piezas add constraint up_piezas_calendario_red_key unique (calendario_id, red);
alter table public.up_piezas drop constraint up_piezas_calendario_id_fkey,
  add constraint up_piezas_calendario_id_fkey foreign key (calendario_id) references public.up_calendario (id) on delete cascade;
create index up_piezas_owner_fecha_idx on public.up_piezas (owner_id, fecha);

create function public.up_piezas_siguen_fecha() returns trigger language plpgsql set search_path = public as $f$
begin
  update public.up_piezas set fecha = new.fecha where calendario_id = new.id and fecha is distinct from new.fecha;
  return new;
end $f$;
create trigger up_piezas_siguen_fecha after update of fecha on public.up_calendario
  for each row when (old.fecha is distinct from new.fecha) execute function public.up_piezas_siguen_fecha();;
