# Modo túnel / enfoque (focus mode)

> Código fuente completo: [bold-hud.js.original](bold-hud.js.original)
> — bloques CSS `tunnelActive` y `focusActive` dentro de `updateStyles()`,
> y el listener `document.addEventListener('mouseover', ...)`.

## Qué hace

Dos efectos CSS independientes, ambos gateados por `focusActive`:

1. **Túnel** (`tunnelActive`): limita el ancho de lectura de
   `p, article, li, h1-h4, .textLayer span` a `65ch` centrado — estilo
   "modo lectura" de navegador.
2. **Enfoque** (`focusActive` por sí solo): usa `:has()` en CSS puro —
   `body:has(.focus-target:hover) .focus-target:not(:hover)` — para
   atenuar (`opacity:0.25; blur`) todo bloque marcado `.focus-target`
   excepto el que tiene el mouse encima. La marca `.focus-target` la pone
   el propio script en cada bloque procesado (mismo recorrido que biónico,
   línea 333 del original), o el listener de `mouseover` (línea 495) que
   agrega la clase on-the-fly a cualquier `p, li, h1, h2` bajo el cursor
   aunque no haya sido preprocesado.

Cuando `focusActive` está activo, además reserva espacio para el HUD:
`body { padding-right: 340px }`.

## Riesgo si se combina

- **Es el único modo puramente CSS de los "modos de lectura"** — no
  reescribe `innerHTML`, solo agrega/quita clases y un bloque `<style>`.
  Bajo riesgo real de romper una SPA.
- **`body { padding-right: 340px }` es invasivo layout-wise** — cambia el
  ancho útil de *toda* la página mientras está activo. Si el sitio tiene
  su propio layout con `100vw`/`box-sizing` sensible, puede generar
  scroll horizontal o recortar contenido a la derecha. Sí puede notarse
  visualmente roto en sitios con diseño rígido (dashboards con grids
  fijas, por ejemplo).
- **`:has()` requiere Chrome moderno** — soportado en versiones recientes,
  pero si el navegador es viejo esta regla simplemente no aplica (no
  rompe nada, solo el efecto no se ve).
- **Combinado con 01 (HUD):** en el original van siempre juntos
  (`focusActive` activa ambos). Si se separan, el HUD puede vivir solo
  (mostrar outline sin atenuar el resto de la página) — no hay dependencia
  técnica real entre ambos, solo estaban acoplados por el mismo flag.
- **Combinado con 05 (autoscroll):** el autoscroll depende de
  `scrollActive`, que solo tiene sentido si `focusActive` está prendido
  (si no hay atenuación, no hay "foco" al que hacer scroll). Acoplamiento
  de producto, no técnico.
