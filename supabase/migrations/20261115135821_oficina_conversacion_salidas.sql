-- Charlas fuera de la oficina: Daniela sale con un agente (a comer, un café, after office, una caminata) y charlan de
-- otras cosas. Quedan en la misma conversación, marcadas con adónde salieron.
alter table public.oficina_conversacion
  add column salida text check (salida in ('comer', 'cafe', 'after', 'caminata'));
