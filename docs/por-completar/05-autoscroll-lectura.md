# Auto-scroll de lectura

> Código fuente completo: [bold-hud.js.original](bold-hud.js.original)
> — función `customSmoothScroll()`, y su uso dentro del listener
> `mouseover` y de `updateHUDActiveState()`.

## Qué hace

Cuando el mouse pasa sobre un bloque (`.focus-target`, ver
[04](04-modo-tunel-enfoque.md)) y `scrollActive` está prendido, hace scroll
suave automático para centrar ese bloque en pantalla (entre 15% y 90% del
viewport), con velocidad configurable (`scrollSpeed`). Implementado con un
loop de `requestAnimationFrame` manual (`customSmoothScroll`), no
`scrollIntoView` nativo — usa easing propio (`ease-out` cuadrático) y tiene
un cooldown de 800ms entre scrolls para no reaccionar en cadena.

También lo usa el HUD (01) para centrar el heading activo en su propio
panel lateral (`allowScroll` en `updateHUDActiveState`), y el click en un
item del outline usa la misma función con `isFastTravel=true` (easing más
agresivo, tipo "salto").

## Riesgo si se combina

- **Standalone: seguro.** Es solo `window.scrollTo` con requestAnimationFrame,
  no toca el DOM del sitio.
- **Con sitios que tienen su propio scroll-snap o smooth-scroll nativo**
  (`scroll-behavior: smooth` en CSS, o su propio JS de scroll): pueden
  competir — dos loops de animación de scroll simultáneos generan un
  efecto de "tironeo" visual (cada uno intenta llevar el scroll a un
  valor distinto). Si se reimplementa, detectar `scroll-behavior` del
  sitio y desactivar el propio si el sitio ya tiene uno.
- **Con 04 (túnel/enfoque):** dependencia de producto, no técnica — el
  autoscroll solo tiene sentido si hay algo "enfocado" al que centrar. Sin
  `focusActive`, el mouseover igual dispara el timer de scroll (línea 500
  del original no chequea `focusActive`, solo `scrollActive`) — esto es un
  bug menor del original: se podía activar scroll automático sin tener el
  modo enfoque prendido, lo cual mueve la página sin ninguna señal visual
  de por qué. Si se reimplementa, agregar ese chequeo faltante.
