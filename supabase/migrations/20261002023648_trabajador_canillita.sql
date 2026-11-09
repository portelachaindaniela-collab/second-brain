insert into public.trabajadores (clave, funcion, nombre, descripcion, tipo, activo, frecuencia, parametros, color, minutos_trabado) values (
  'canillita',
  'trabajador-noticias',
  'Canillita',
  'Lee las webs y las cuentas de X de los medios principales de cada país y guarda en Noticias lo que toca tus temas.',
  'scraper',
  true,
  '41 * * * *',
  '{"medios_por_corrida": 45, "dias_maximos": 3, "dias_conservar": 15, "max_por_medio": 25}'::jsonb,
  'arena',
  5
);;
