# WebNavigator — Modo Visual (control por imagen)

Fecha: 2026-06-05
Componente: `au-aihub/modules/aihub/views.extension.sidepanel/WebNavigator/WebNavigator.view/web-navigator.js`

## Resumen

Quinto tab del WebNavigator ("Visual"), junto a Simple / Workflows / Builder / Runs.
En vez de operar el sitio por selectores, lo opera por imagen: captura el viewport de la
tab seleccionada, lo muestra en el sidepanel, y deja clickear cualquier punto de la imagen.
El click se mapea a coordenadas reales y se ejecuta con click físico (`chrome.debugger` +
`Input.dispatchMouseEvent`). Funciona igual sobre botones, canvas (ComfyUI) o zonas no
detectadas, porque no depende de selectores.

Motivación: sitios canvas/Vue (ComfyUI) y elementos custom no siempre son alcanzables por
selector. El click por coordenadas físicas ya está probado (menú de ComfyUI). Este modo
expone esa primitiva de forma gráfica y da contexto visual real del estado del sitio.

## Decisiones tomadas (brainstorming)

1. **Refresco: bajo demanda.** Captura al entrar al tab; recaptura automática tras cada
   acción (click / escribir / scroll); botón ↺ para forzar. Sin stream continuo.
2. **Click: cualquier píxel + cajas guía.** Se clickea libremente cualquier punto. Encima
   de la imagen se dibujan las cajas de los elementos que el inspector detectó, como guía
   visual opcional (toggle). El click siempre va por coordenadas físicas, esté o no sobre
   una caja.
3. **Escritura: campo en el panel + enviar.** Click en un input lo enfoca en la página
   real; luego se escribe en un campo del panel y al enviar el texto va al foco actual vía
   `Input.insertText` (sin re-resolver el elemento).

## Flujo de usuario

1. Seleccionar tab → entrar al tab Visual → `_captureViewport()` muestra la imagen.
2. Cajas guía dibujadas encima (toggle para ocultar).
3. Click en cualquier punto → mapeo a coords reales → `_trustedClickPoint` → recaptura.
4. Si cayó en input → queda enfocado → campo de texto del panel → enviar → `_visualType`.
5. Tras cada acción: esperar ~600ms y recapturar + re-escanear automáticamente.

## Estado nuevo (store, vía `SET_NAVIGATOR`)

```
activeView: 'visual'                                   // nuevo valor admitido
visualShot: { dataUrl, viewport: { w, h }, dpr, at }   // última captura
visualCapturing: false                                 // flag de captura en curso
visualShowBoxes: true                                  // toggle de cajas guía
```

Nota: `visualShot.viewport` son CSS px (`innerWidth`/`innerHeight`). `dpr` se guarda para
referencia/debug pero no entra en la fórmula de mapeo final.

## Mapeo de coordenadas (pieza crítica)

La captura de `captureVisibleTab` viene en device px (`viewport.w * dpr`). Se muestra
escalada a `anchoMostrada × altoMostrada` (lo que entra en el sidepanel). El `dpr` se
cancela porque el mapeo usa la razón mostrada/viewport, no píxeles absolutos de la imagen.

Click imagen → coordenadas reales (CSS px del viewport, lo que espera `Input.dispatchMouseEvent`):

```
realX = (clickX_enImagen / anchoMostrada) * viewport.w
realY = (clickY_enImagen / altoMostrada) * viewport.h
```

Cajas guía (fórmula inversa, rect del inspector en CSS px → píxeles de la imagen mostrada):

```
boxLeft = rect.x * (anchoMostrada / viewport.w)
boxTop  = rect.y * (altoMostrada  / viewport.h)
boxW    = rect.w * (anchoMostrada / viewport.w)
boxH    = rect.h * (altoMostrada  / viewport.h)
```

**Coherencia rects↔imagen:** captura y re-escaneo del inspector se hacen en el mismo momento
(misma posición de scroll). Si se escanea y luego se scrollea, las cajas quedarían
desfasadas; por eso `_captureViewport` dispara ambos juntos.

## Métodos

Nuevos:
- `_captureViewport()` — `chrome.tabs.captureVisibleTab(windowId, {format:'png'})` +
  `executeScript` que lee `innerWidth/innerHeight/devicePixelRatio` + re-escaneo del
  inspector. Guarda `visualShot`. Pone `visualCapturing` true/false alrededor.
- `_visualClick(clickX, clickY, anchoMostrada, altoMostrada)` — mapea a `realX/realY`,
  llama `_trustedClickPoint`, agenda recaptura ~600ms.
- `_trustedClickPoint(tabId, x, y, button='left')` — attach `chrome.debugger` →
  `Input.dispatchMouseEvent` (mouseMoved/Pressed/Released) en (x,y) → detach. Se extrae de
  la lógica que ya vive dentro de `_trustedClick`; `_trustedClick` pasa a usarlo internamente.
- `_visualType(text)` — `Input.insertText` al foco actual (sin resolución de elemento, el
  click ya enfocó). Reusa la rama `insertText` de `_trustedType` con fallback char-by-char.

Reusados sin cambios: `_scroll`, `_navigate`, `_inspectTab`, `_ensureTab`.

## Render del tab 'visual'

- Contenedor con `<img src=visualShot.dataUrl>` escalada al ancho del panel.
- Overlay de cajas (divs absolutos) sobre la imagen, calculados con la fórmula inversa;
  ocultable con `visualShowBoxes`.
- `onClick` del contenedor → `offsetX/offsetY` relativos a la imagen → `_visualClick`.
- Crosshair/hover que sigue el mouse mostrando las coords reales calculadas (feedback).
- Barra de acción: campo de texto + botón enviar (escribir tras enfocar), botón ↺
  recapturar, toggle cajas, botones scroll ↑/↓.

## Edge cases

- Páginas no capturables (`chrome://`, Chrome Web Store) → mensaje de error en el panel,
  igual que el inspector hoy.
- Click fuera del área de la imagen → ignorar.
- Sidepanel angosto → imagen escalada al ancho; contenedor con scroll vertical. Zoom queda
  fuera de alcance (YAGNI).
- `dpr ≠ 1` → cubierto por la fórmula de razón.
- Tab cerrada / `tabId` inválido → `_ensureTab` ya maneja el fallback y loguea.

## Archivos afectados

- `WebNavigator.view/web-navigator.js` — estado nuevo, tab 'visual' en el render, ~4 métodos
  nuevos, extracción de `_trustedClickPoint` desde `_trustedClick`.
- `WebNavigator.styles/general.css` — estilos `.wn-visual-*`.

No se tocan los otros 4 tabs ni `aurora/`, `registry.js`, ni archivos generados.

## Fuera de alcance (YAGNI)

- Zoom / pan de la imagen.
- Stream continuo de capturas.
- Passthrough de teclado tecla-por-tecla.
- Captura de página completa más allá del viewport (se scrollea + recaptura en su lugar).

## Verificación

Probar con el WebNavigator (sin BraveTools para operar, solo para screenshots de verificación):
1. ComfyUI — click en el botón de menú (canvas/Vue) por imagen → abre menú.
2. Google — click en el campo de búsqueda por imagen → enfoca → escribir → enviar → texto aparece.
3. Scroll → recaptura muestra nueva posición; cajas guía siguen alineadas.
4. Toggle de cajas oculta/muestra el overlay sin recapturar.
5. Página no capturable → mensaje de error, sin crash.
