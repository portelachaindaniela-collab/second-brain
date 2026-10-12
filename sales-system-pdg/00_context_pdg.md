# Manual comercial de Point Data Global (PDG)

## Qué vendemos
PDG es un **sistema de datos de fútbol femenino que funciona solo**: recolecta resultados de fuentes públicas, los valida y unifica, calcula tablas y estadísticas propias, y los publica en portales, apps, informes y newsletters.

No vendemos "la web". La web (https://pointdataglobal.netlify.app) es la **vidriera**: muestra el sistema funcionando en vivo. Lo que vendemos es **el sistema adaptado a cada cliente**: sus competencias, su marca, sus canales y, si los tiene, sus propios datos.

Metáfora para explicarlo: los recolectores son los camiones, la base de datos es el almacén y la web, la app o el informe son la vidriera. El cliente puede tener su propia vidriera, sus propios camiones o las dos cosas.

## Módulos del sistema (existen hoy)
1. **Recolección automática.** Un recolector por liga o fuente que corre solo todos los días. Activos: Primera División argentina (Apertura, Clausura, Reserva), Liga F (España) y Liga MX Femenil. Chile y Colombia armados, falta probarlos. Marcador en vivo durante los partidos (cada 3 minutos) y goleadoras actualizadas cada 5 minutos.
2. **Motor de datos.** Unifica nombres de clubes (alias; Primera y Reserva cuentan como la misma institución), valida cada partido, guarda historial y aparta lo dudoso para revisión. **Calcula las tablas de posiciones por su cuenta**, no las copia. Sumar una liga es sumar un recolector, no armar un sistema nuevo.
3. **Almacén central.** Partidos, posiciones, equipos, escudos y goleadoras en una base de datos con API, lista para alimentar cualquier pantalla. Los escudos se cambian en un solo lugar y se actualizan en todas las salidas.
4. **Salidas.** Portal web con cifras en vivo, selector de competiciones, fixture, posiciones, goleadoras, historial de Copa Libertadores y archivo de la selección. App instalable (PWA) y paquete de app Android. Informes PDF de torneo y comparativos entre clubes, planillas de métricas en Excel y newsletter semanal (preparado, en activación).
5. **Calidad.** Pruebas automáticas, revisión en celular, tablet y escritorio, modo claro y oscuro. Nunca muestra un total parcial como si fuera completo.

## En desarrollo (no se ofrece como terminado)
- Capa de jugadoras: perfil por jugadora con club, selección y goles en cada contexto.
- Newsletter con envío automático.
- Conexión con proveedores pagos (Opta, StatsBomb, Wyscout, API-Football): el sistema está pensado para sumarlos, pero hoy no hay ninguna conexión hecha.
- Mapas de calor, xG/xA y radares de rendimiento **no existen hoy**. Se pueden ofrecer como desarrollo a medida solo si el cliente aporta datos de eventos de un proveedor pago.

## Cómo se adapta a cada tipo de cliente
- **Clubes:** portal propio con Primera, Reserva e inferiores; informe posterior a cada partido y de temporada, generado solo; comparativo con rivales; datos para sponsors y prensa; app con su escudo.
- **Ligas y federaciones:** portal oficial con todas las categorías; tablas calculadas y verificables; cifras de la competencia; archivo histórico; newsletter para hinchas; datos para TV y prensa.
- **Agencias y scouting:** seguimiento de equipos y goleadoras en varias ligas y países con nombres unificados; informes comparativos. El seguimiento por jugadora llega con la capa de jugadoras.
- **Medios:** tablas, fixture y marcador en vivo para insertar en sus notas; informes listos para publicar; cobertura de ligas que hoy nadie cubre con datos.
- **Marcas y patrocinadores:** contenido de datos con su marca (rankings, informes, newsletter patrocinado); seguimiento de los equipos que patrocinan.

## Formas de contratarlo
- **Llave en mano:** armamos y operamos el sistema para el cliente.
- **Datos por API:** el cliente consume el almacén desde sus propios sistemas.
- **Solo las salidas:** su equipo técnico conserva su backend y nosotros armamos portal, app o informes.
- **Informes a pedido.**

Precios y plazos: los define Daniela. Mientras no figuren en este manual, van como [A DEFINIR].

## Por qué PDG
- **Ya funciona:** se muestra en vivo en la primera reunión, no es una promesa.
- **Especializado en fútbol femenino,** donde los datos son escasos, dispersos y nadie los ordena.
- **Escala por liga:** sumar una competencia es sumar un recolector.
- **Datos propios y defendibles:** las tablas se calculan a partir de resultados públicos, no se copian.
- **Mundial 2027 (Brasil):** PDG llega con la historia de las ligas de cada jugadora, el contexto que FIFA no da.

## Reglas para todos los agentes
- Vender el sistema y su adaptación al cliente, nunca "la web" ni "una plantilla".
- No presentar como existente nada de "En desarrollo".
- No inventar precios, plazos cerrados, clientes, cifras ni testimonios.
- Si preguntan de dónde salen los datos: "Recopilamos resultados de fuentes públicas de fútbol femenino y calculamos nosotros las tablas de posiciones."
- Los datos con licencia (Opta a través de una liga, FIFA) no se recolectan: se integran pagándole al proveedor.
- Español rioplatense, tono profesional, directo y sin exagerar.
