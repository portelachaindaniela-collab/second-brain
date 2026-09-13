# Contexto para retomar este proyecto

Second Brain: app de escritorio (Electron) para una sola usuaria (Daniela).
Frontend en `Second-brain-Windows/source/` (React 19 + Vite 8, sin router ni
librería de estado — todo el estado vive en `src/App.jsx` y baja por props).
Backend: Supabase, proyecto `second-brain` (ref `itultpcdafpxpgtblgfb`,
región sa-east-1). Cliente en `src/supabase.js` (URL + publishable key ya
puestos ahí, son públicos a propósito). Convenciones: nombres de tablas/
columnas/variables/textos en español, RLS por `owner_id` en toda tabla, sin
comentarios obvios, CSS plano con variables (`src/styles.css`), sin Tailwind.

**Cómo se prueba:** `npm install && npm run dev` adentro de `source/`, abrir
`http://localhost:5183` — el login funciona contra el Supabase real, hace
falta la contraseña real de la cuenta (no hay modo demo).

**Cómo se despliega:**
- App de escritorio: `npm run build` genera `source/dist`; copiar completo a
  `Second-brain-Windows/app/resources/app/dist` (**respaldar el `dist`
  anterior primero**, hay varios `dist-backup-*` sueltos en esa carpeta de
  sesiones previas). El `electron.cjs` instalado ahí (con su copia en
  `source/electron.cjs`) vigila esa misma carpeta con `fs.watch` y refresca
  la ventana sola apenas cambia — no hace falta reabrir la app a mano salvo
  que cambie el propio `electron.cjs`/`package.json`.
- Web/mobile (PWA): `npm run build:pages` (usa `--base=/second-brain/`, sale
  a `dist-pages/`, **no** a `dist/`) y se publica a mano en la rama
  `gh-pages` del repo `github.com/portelachaindaniela-collab/second-brain`
  (público) vía un git worktree temporal — ver el historial de commits
  "Deploy: …" para el patrón exacto de comandos. URL viva:
  https://portelachaindaniela-collab.github.io/second-brain/
- Edge Functions: se despliegan con el MCP de Supabase (`deploy_edge_function`),
  no hay `supabase` CLI instalado en esta PC.

## Todo lo que se hizo en la sesión de Claude Code del 2026-09-12/13

- **Tema "Panel de control":** retinteo completo de `styles.css` a superficies
  azul-carbón + acento ámbar, IBM Plex Sans/Mono.
- **BS67:** reemplazó el bot de comandos rígidos por un chat natural
  (`supabase/functions/bs67-chat`) con contexto real (proyectos, tareas,
  agenda, mails, docs, pantalla actual) y presupuesto de USD 10/mes
  controlado en el servidor en micro-dólares (`bs67-budget.sql`).
- **Calendario:** ahora se puede crear y borrar eventos además de editar
  (`supabase/functions/google-calendar-edit`, acciones crear/editar/eliminar),
  sincronizado con Google cuando hay cuenta conectada.
- **Mobile/PWA:** sidebar con cajón deslizable en pantallas chicas, manifest +
  service worker mínimo (sin caché, para no mostrar nunca una versión vieja),
  ícono con la mascota de BS67, publicado en GitHub Pages (ver arriba).
- **Actualización automática del Electron:** `electron.cjs` + `electron-updates.cjs`
  (lógica extraída y testeada en `electron-updates.test.mjs`).
- **Métricas + Instagram:** pantalla nueva (`src/screens/Metricas.jsx`) con
  conexión OAuth a Instagram Business/Creator vía Meta
  (`supabase/functions/meta-auth`, `meta-callback`, `meta-sync`). **No
  funciona todavía** — depende de que Daniela cargue `META_CLIENT_ID` y
  `META_CLIENT_SECRET` en los secrets de Supabase (trámite suyo en Meta for
  Developers, no es código). X y LinkedIn quedan sin empezar: X necesita plan
  pago de API, LinkedIn requiere aplicar a la Community Management API.
- **Sidebar reorganizado:** se sacaron los grupos "Redes", "Herramientas" y
  "Mis páginas" del menú lateral (dato intacto en la tabla `pantallas`, solo
  se dejaron de mostrar — `GRUPOS` en `App.jsx` quedó vacío, fácil de
  reactivar). "Herramientas" pasó a mostrarse como bloques dentro de Flujo
  (`src/screens/Flujo.jsx`).
- **Mail y Calendario unificados** en una sola pantalla con pestañas
  (`src/screens/MailCalendario.jsx`, envuelve `Agenda.jsx` y `Bandeja.jsx`
  sin tocarlas para no romper su reuso en `Mails.jsx` por proyecto), con el
  estado de conexión de Google y el mail de la cuenta visible arriba.
- **Fix:** el estado "conectado" de Google quedaba trabado en "Conectar
  Google" después de autorizar, porque nada volvía a chequear el estado
  (`conectarGoogle` en `App.jsx` ahora escucha `window.addEventListener('focus', …)`
  y vuelve a llamar `sincronizarGoogle()` al volver de autorizar).
- **Fix:** `google-sync` solo traía eventos del calendario `primary` de
  Google — cualquier evento en un calendario secundario (Salud, Trabajo,
  Organización, etc.) nunca llegaba a Second Brain. Se cambió para recorrer
  `calendarList` completo (todos los calendarios visibles de la usuaria), y
  se migró la restricción única de `calendar_events` a
  `(owner_id, calendar_id, google_event_id)` porque el id de evento de
  Google es único por calendario, no global.
- **`mi-web`:** el sitio personal de Daniela (`danielaportelachain.netlify.app`)
  no tenía código fuente en ningún lado (ni GitHub ni la PC) — se bajó
  directo de la URL publicada (HTML plano, sin build) y quedó en
  `C:\Users\beatr\OneDrive\Escritorio\mi-web`, con git inicializado y
  commiteado local. **Todavía no se subió a GitHub** — falta confirmar
  visibilidad (pública/privada) con Daniela.

## Problema sin resolver ahora mismo — Mail y Calendario "siguen fallando"

Daniela reportó dos veces que "sigue fallando" Mail y Calendario, la última
vez sin dar detalle de qué falla puntualmente (ni mensaje de error, ni
captura). Antes de este último reporte se hicieron dos fixes reales
confirmados por captura de pantalla:

1. El estado de conexión en el sidebar ("Google conectado · mail") **sí**
   pasó a mostrarse bien después del fix del `focus` listener — confirmado
   con captura.
2. El calendario mostraba **muy pocos eventos** comparado con Google
   Calendar real (solo aparecía "Pasear a las perras", creado desde la app;
   faltaban "Entrenar" y otros eventos de calendarios secundarios) — se
   diagnosticó como que `google-sync` solo leía `calendars/primary/events`,
   y se corrigió para recorrer todos los calendarios (`calendarList`). **Este
   fix se deployó (versión 7 de `google-sync`) pero Daniela reportó que
   "sigue fallando" inmediatamente después, sin haber confirmado si ya tocó
   "Sincronizar" con el fix nuevo puesto.**

Lo que ya se verificó y **está bien** (no perder tiempo re-chequeando esto
sin nueva evidencia):
- `oauth_accounts` tiene una fila `provider='google'` para la owner con
  `refresh_token` presente y `scopes` incluyendo `calendar.readonly`,
  `calendar.events.owned` y `gmail.readonly`.
- Los advisors de seguridad de Supabase están limpios.

Lo que **no** se pudo confirmar por falta de detalle de Daniela:
- Si el problema es en Mail, en Calendario, o en los dos.
- Si es un error visible en pantalla, un error silencioso, o simplemente
  "no aparecen los datos que espero".
- Si ya volvió a tocar "Sincronizar" después del deploy de la versión 7 de
  `google-sync` (2026-09-13), o si el reporte es sobre el estado anterior.

**Primer paso recomendado:** no asumir una causa nueva sin pedirle a Daniela
(a) que toque "Sincronizar" en la pantalla "Mail y Calendario" ahora mismo,
(b) qué mensaje de error aparece si aparece alguno (hay un banner rojo
arriba si `sincronizarGoogle` devuelve error), y (c) si el problema es que no
aparecen mails, no aparecen eventos, o ambos — con eso, revisar
`query_logs`/`get_advisors` del proyecto Supabase antes de tocar código de
nuevo. El intento de leer `function_edge_logs` por SQL en esta sesión falló
("Table does not exist" / "Backend error") — puede hacer falta usar la
tabla/vista correcta de logs de Supabase (revisar en el dashboard cuál es)
en vez de adivinar el nombre.

Otras hipótesis a considerar si el chequeo de arriba no alcanza:
- El rango de sincronización es acotado a hoy + 7 días
  (`desde`/`hasta` en `google-sync/index.ts`) — un evento fuera de ese rango
  nunca va a aparecer, aunque el calendario esté bien sincronizado.
- Mail trae solo no leídos de los últimos 14 días
  (`is:unread newer_than:14d` en la query de Gmail) — un mail ya leído o más
  viejo no va a aparecer nunca, por diseño, no por bug.
- El access token puede haber expirado justo entre pasos y el refresh
  fallar silenciosamente — `tokenVigente()` lanza `"reconectar"` en ese caso
  y la función devuelve `{conectado:false, reconectar:true}`, lo que debería
  mostrar el link "Conectar Google" de nuevo en vez de datos viejos.
