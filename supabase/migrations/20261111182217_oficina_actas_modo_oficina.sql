-- Oficina: las actas también pueden ser de una reunión en la oficina de Daniela (hasta 5, en su mesa).
alter table public.oficina_actas drop constraint oficina_actas_modo_check;
alter table public.oficina_actas add constraint oficina_actas_modo_check check (modo in ('sala', 'oficina', 'turnos'));
