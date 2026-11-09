# Migraciones de Supabase

Copia exacta del historial de migraciones aplicadas en el proyecto `second-brain`
(`supabase_migrations.schema_migrations`), una por archivo: `<versión>_<nombre>.sql`.
Con esto se puede reconstruir el esquema (tablas, RLS, funciones y tareas programadas) si algo se rompe.

- El email de la dueña se reemplazó por `<EMAIL_DUEÑA>` (el repo es público). Para volver a correr
  esas migraciones hay que poner el email real.
- Las tres cargas de medios (`20261002023347`, `20261002025705`, `20261002030950`) son datos, no esquema;
  su contenido equivalente está en `supabase/noticias-*.sql`.
- Cada migración nueva se agrega acá con el mismo formato, además de aplicarse en Supabase.
