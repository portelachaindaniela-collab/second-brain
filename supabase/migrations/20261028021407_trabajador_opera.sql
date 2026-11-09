alter table public.trabajadores drop constraint trabajadores_color_check;
alter table public.trabajadores add constraint trabajadores_color_check
  check (color in ('ambar', 'azul', 'violeta', 'rosa', 'cian', 'lima', 'arena', 'fucsia', 'bordo'));
insert into public.trabajadores (clave, funcion, nombre, descripcion, tipo, activo, frecuencia, minutos_trabado, color, parametros) values
('opera', 'trabajador-opera', 'Ópera',
 'Arma la cartelera de ODBA (Complejo Teatral y Movistar Arena) desde GitHub Actions y avisa acá. Solo publica la app si la cartelera cambió. Si lo pausás, el workflow no corre.',
 'scraper', true, '0 9 * * *', 15, 'bordo',
 '{"repo": "portelachaindaniela-collab/arma-mi-dia", "workflow": "opera.yml", "hora_ar": "06:00"}'::jsonb);;
