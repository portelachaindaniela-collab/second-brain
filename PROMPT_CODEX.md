# Contexto para retomar este proyecto

Este es "Second Brain", una app de escritorio (Electron) para una sola
usuaria (Daniela). El frontend se está reconstruyendo desde cero en
`Second-brain-Windows/source/` (React 19 + Vite 8, sin router ni librería de
estado — todo el estado vive en `src/App.jsx` y baja por props). Ya tiene
login, sidebar general + sidebar propio por proyecto (Resumen/Docs/Archivos/
Métricas/Mails/Calendario), editor de notas, subida de archivos por carpeta,
visor de archivos (PDF/imagen/HTML detectados por contenido real, no por
extensión), y una pantalla "María" con un diagrama de sistema solar animado
(`src/screens/FlujoAgentes.jsx`) que muestra 3 scripts (Centinela, Rastreador,
Enlace) supervisados por una función de Supabase (`agentes-orquestador`).

Backend: Supabase, proyecto `second-brain` (ref `itultpcdafpxpgtblgfb`,
región sa-east-1). Cliente en `src/supabase.js` (URL + publishable key ya
puestos ahí). Tablas y funciones ya existen, no hace falta tocarlas salvo que
se pida explícitamente.

**Cómo se prueba:** `npm install && npm run dev` adentro de `source/`, abrir
`http://localhost:5183` (o el puerto que Vite elija) en un navegador — el
login funciona contra el Supabase real, hace falta la contraseña real de la
cuenta para entrar (no hay modo demo).

**Cómo se despliega a la app instalada:** `npm run build` genera `source/dist`;
esa carpeta se copia completa a
`Second-brain-Windows/app/resources/app/dist` (reemplazando lo que había),
y se reabre `Second-brain-Windows/app/Second brain.exe`.

## Problema sin resolver ahora mismo

En la pantalla **María** (`src/screens/Maria.jsx` + `src/screens/FlujoAgentes.jsx`),
Daniela reportó que "las tarjetas son muy grandes y no tienen opacidad, se ven
perfectamente y está mal" — algo se ve grande y con opacidad completa cuando
debería verse chico/casi imperceptible.

Lo que ya se intentó, sin éxito según su reporte:
1. Se sacó un grid de tarjetas blancas separadas (`.card.card-pad` en un
   `grid grid-3`) que mostraban el estado de cada script en `Maria.jsx`, y se
   integró esa info dentro del panel oscuro de `FlujoAgentes.jsx` (prop
   `agentes`).
2. Dentro de `FlujoAgentes.jsx`, se bajó la opacidad y el tamaño de fuente del
   texto "● ok/aviso/error" y de la línea de resumen debajo de cada script
   (buscar `opacity: 0.22` y `opacity: 0.28` en ese archivo).
3. Daniela confirmó que recargó la app (Ctrl+R) después de cada cambio y
   reportó que "se ve igual" — no hubo cambio visible desde su lado, a pesar
   de que el build y el despliegue se completaron sin errores cada vez.

**No se llegó a ver una captura de pantalla actualizada** confirmando
exactamente cuál elemento es "la tarjeta grande sin opacidad" — puede ser:
- Que el elemento que ella señala sea otro distinto al que se editó (revisar
  toda la pantalla María de nuevo, no asumir que es el mismo bloque).
- Un problema de caché del bundle en Electron (aunque se hizo `rm -rf dist`
  y copia limpia cada vez).
- Que la opacidad baja no alcance visualmente contra el fondo oscuro que
  tiene el panel (`#0b0f1d`/`#03050c`), y en la práctica el texto blanco/verde
  igual se note "grande y nítido" por el contraste, no por el tamaño real.

**Primer paso recomendado:** pedirle a Daniela una captura de pantalla actual
y concreta de qué es exactamente "la tarjeta" antes de seguir tocando código
a ciegas.
