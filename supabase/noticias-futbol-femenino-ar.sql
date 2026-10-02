-- Fútbol femenino argentino, pedido por Daniela el 2026-10-02.
insert into public.noticias_medios (owner_id, medio, pais, idioma, sitio, rss, formato, filtro, x, bluesky, temas, tipo, descripcion)
select (select owner_id from public.trabajadores order by id limit 1), m.* from (values
('El Femenino', 'AR', 'es', 'https://elfemenino.com.ar', 'https://elfemenino.com.ar/wp-json/wp/v2/posts?per_page=20&_embed=wp:featuredmedia', 'wordpress', null, 'FemeninoAFA', null, array['futbol_femenino'], 'medio', 'El medio líder de fútbol femenino de Argentina'),
('TyC Sports (fútbol femenino)', 'AR', 'es', 'https://www.tycsports.com/futbol-femenino.html', 'https://www.tycsports.com/sitemap_news_48hs.xml', 'sitemap', 'femenin', null, null, array['futbol_femenino'], 'medio', null),
('FutFemGol', 'AR', 'es', 'https://www.futfemgol.com', 'https://www.futfemgol.com/', 'enlaces', '^/noticias/[^/]+/[^/]+$', null, null, array['futbol_femenino'], 'medio', 'Medio digital de fútbol femenino'),
('Femeninoinfo', 'AR', 'es', 'https://femeninoinfo.com', null, 'rss', null, 'Femeninoinfo_', null, array['futbol_femenino'], 'medio', 'Fútbol femenino argentino e internacional'),
('Romina Sacher', 'AR', 'es', 'https://x.com/rosacher', null, 'rss', null, 'rosacher', null, array['futbol_femenino'], 'referente', 'Periodista, directora de El Femenino, cubre fútbol femenino desde 2012')
) as m (medio, pais, idioma, sitio, rss, formato, filtro, x, bluesky, temas, tipo, descripcion)
on conflict (owner_id, medio) do nothing;
