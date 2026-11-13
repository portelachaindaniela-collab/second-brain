# Second Brain — cómo trabajar en este repo

App personal de una sola usuaria (Daniela): React 19 + Vite 8, publicada en GitHub Pages (`.github/workflows/deploy-pages.yml`
al mergear en `master`) y empaquetada en Electron (`electron.cjs`). Backend en Supabase (Postgres con RLS, Edge Functions en
Deno, pg_cron).

## Reglas
- Mirá el código que vas a tocar antes de cambiarlo. Cambios mínimos: nada de refactors, renombres ni "mejoras" que no se
  pidieron. Daniela pierde tiempo cuando se cambian cosas que no hacían falta.
- Todo lo que ve Daniela va en español rioplatense (vos, «probá», «aprobá»), claro y sin jerga técnica.
- Lógica pura en archivos `.mjs` con tests al lado (`*.test.mjs`, `node:test`); React solo para la vista.
- Nunca pongas claves, tokens ni contraseñas en el código. Los secretos viven en Supabase (variables de las funciones) o
  en Vault.
- Las tablas tienen RLS por `owner_id = auth.uid()`; las funciones leen con la sesión de la dueña salvo las que corre el
  cron (que validan `x-trabajador-secreto`).

## Dónde está cada cosa
- `src/screens/`: pantallas. `src/oficina*.mjs` y `src/oficina3d/`: la Oficina de agentes (3D con three.js).
- `src/pdg/`: el departamento comercial (PDG). `src/up/`: la app de redes UP.
- `supabase/functions/<nombre>/`: Edge Functions (`index.ts` + `logic.mjs` puro con tests). Código compartido en
  `supabase/functions/_shared/` (la IA con respaldo está en `_shared/ia.mjs`).
- `supabase/migrations/`: cambios de base, uno por archivo `AAAAMMDDHHMMSS_nombre.sql`.

## Antes de terminar
```
node --test src/*.test.mjs supabase/functions/*/*.test.mjs
npx oxlint
npx vite build
```

## Desde GitHub Actions (Sistemas)
No hay acceso a Supabase: si el cambio necesita una migración o desplegar una Edge Function, dejala en el repo y explicá en
el PR qué hay que aplicar. No mergees: Daniela revisa el PR.
