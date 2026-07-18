# Modo biónico (bionic reading)

> Código fuente completo: [bold-hud.js.original](bold-hud.js.original)
> — función `applyBionicToText()`, y la rama `else if (currentState.bionicActive)`
> dentro de `processTextNodes()`.

## Qué hace

Negrita parcial de cada palabra según `fixationStrength` (% de la palabra
en negrita, default 50%): `hola` con 50% queda `<b>ho</b>la`. Recorre
`p, li, article, h1, h2, h3, h4, .textLayer span, div[dir="auto"]` con un
`TreeWalker` sobre nodos de texto, reemplaza cada nodo por un `<span>` con
el HTML resultante (`applyBionicToText`). Marca cada bloque procesado con
`dataset.processed = "true"` para no reprocesarlo.

Excepciones: no procesa nodos dentro de `<a>`, ni texto que contenga
`http`/`www` (para no romper URLs), ni bloques con `<img>`.

## Riesgo si se combina

- **Reescribe `innerHTML` de bloques reales de la página** — esto es
  destructivo: si el sitio (React/Preact/Vue) vuelve a renderizar ese mismo
  nodo con contenido distinto (ej. streaming de un chat, o cualquier SPA
  reactiva), el framework puede:
  - pisar el cambio de biónico en el próximo render (biónico se pierde,
    inofensivo pero inútil), o
  - lanzar un error de reconciliation si esperaba que ese nodo siga siendo
    el que él mismo creó (`removeChild`/`insertBefore` en consola). En
    streaming rápido esto puede llegar a congelar la actualización visual
    del mensaje.
- **Con 03 (frase):** en el original, biónico corre *dentro* de cada
  `<span class="sentence">` (frase primero, biónico adentro) — no como dos
  pasadas independientes. Si se reimplementan por separado, aplicar
  biónico después de frase sobre el mismo nodo, nunca al revés ni en
  paralelo (la segunda pasada que se ejecute pisaría los spans de la
  primera).
- **Con el bold-hud actual (color verde en negritas):** compatible sin
  problema — biónico genera `<b>` reales, el CSS de color los pinta verde
  igual que cualquier otra negrita. No hay conflicto de lógica, solo capas
  visuales que se combinan bien.
- **En sitios con mucho texto (artículos largos):** el `TreeWalker` +
  reemplazo de nodo por nodo es O(n) sobre todos los nodos de texto de la
  página — puede ser lento (jank perceptible) en páginas con miles de
  nodos si se ejecuta sin paginar/lazy-procesar.
