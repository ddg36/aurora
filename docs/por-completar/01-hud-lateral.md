# HUD lateral (Neural Suite)

> Código fuente completo: [bold-hud.js.original](bold-hud.js.original)
> — funciones `createHUD()`, `createModule()`, `applyVisibilityLogic()`,
> `toggleSection()`, `updateHUDActiveState()`, `extractLinks()`.

## Qué hace

Panel fijo a la derecha (`#neural-hud`, 340px, `position:fixed`) con 3
módulos tipo acordeón:

1. **Navegador** — outline de la página: recorre todos los `h1-h4` visibles
   (`offsetParent !== null`), arma un árbol por nivel, permite colapsar
   secciones hijas y resalta el heading activo según el scroll actual
   (`updateHUDActiveState`, calcula qué heading está a 25% del viewport).
2. **Fuentes** — lista todos los `<a href="http...">` únicos de la página
   con su dominio, clickeable (abre en nueva pestaña).
3. **Neural AI** — panel decorativo, era un stub sin lógica real (solo un
   nodo animado con CSS `pulse` y un texto fijo).

Se reconstruye entero (`createHUD()`) cada vez que el DOM cambia
significativamente (vía `MutationObserver`, debounce 1s) o al hacer resize
(`ResizeObserver`, debounce 300ms).

## Cuándo se activa

Solo si `focusActive === true` — es decir, el HUD depende del toggle de
"modo enfoque" (ver [04](04-modo-tunel-enfoque.md)), no es independiente en
el original. Al separarlo, debería tener su propio toggle.

## Riesgo si se combina

- **Con 02/03 (biónico/frase):** el HUD reconstruye su outline de headings
  cada vez que esos modos reescriben `innerHTML` — si los headings mismos
  tienen `bionicActive`/`sentenceActive` aplicado, el HUD lee
  `header.innerText` para el label del outline, lo cual sigue funcionando
  (`innerText` da el texto plano incluso con spans internos), pero dispara
  un ciclo: reescribe texto → MutationObserver dispara → HUD se reconstruye
  → nada cambió realmente → desperdicia CPU en loop. Mitigar con guard de
  "solo reconstruir si cambió la cantidca de headings", no solo "si hubo
  mutación".
- **Standalone:** seguro. Es solo lectura de headings/links + un panel
  fixed, no toca el contenido de la página real.
- **En SPA (Preact/React):** el `MutationObserver` sobre `document.body`
  puede disparar mucho durante renders frecuentes (ej. streaming de chat) —
  con debounce de 1s alcanza, pero si el sitio re-renderiza más rápido que
  eso, el HUD queda desactualizado hasta el siguiente disparo. No es
  destructivo, solo puede mostrar un outline stale por hasta 1s.
