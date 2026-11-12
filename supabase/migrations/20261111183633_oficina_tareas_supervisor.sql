-- Oficina: cada tarea de un plan la reparte el supervisor del área a alguien de su equipo (responsable) y la sigue
-- (supervisor). Cuando el equipo termina todas las de un plan, el supervisor pide una reunión para mostrarlo
-- (presentada: ya se convocó esa reunión).
alter table public.oficina_tareas add column supervisor text not null default '' check (length(supervisor) <= 80);
alter table public.oficina_tareas add column presentada boolean not null default false;
