alter table public.trabajadores drop constraint trabajadores_color_check;
alter table public.trabajadores add constraint trabajadores_color_check
  check (color in ('ambar', 'azul', 'violeta', 'rosa', 'cian', 'lima', 'arena', 'fucsia'));
insert into public.trabajadores (clave, funcion, nombre, descripcion, tipo, activo, frecuencia, minutos_trabado, color, parametros) values
('agenda_valentina', 'trabajador-agenda-valentina', 'Agenda de Valentina',
 'Vigila la app de Valentina: sitio y build de Pages, función agenda-dulce y Groq, si la usa, el cole y el chat (solo cantidades). Solo lee.',
 'monitor', true, '23 */3 * * *', 5, 'fucsia',
 '{"familia": "Valentina", "dias_sin_abrir": 3, "horas_sin_leer": 6, "dias_examenes": 3, "dino_aviso": 200}'::jsonb);;
