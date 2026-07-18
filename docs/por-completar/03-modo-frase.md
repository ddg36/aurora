# Modo frase-por-frase (sentence focus)

> Código fuente completo: [bold-hud.js.original](bold-hud.js.original)
> — rama `if (currentState.sentenceActive)` dentro de `processTextNodes()`,
> y el bloque CSS `.focus-target:hover .sentence:not(:hover)` en `updateStyles()`.

## Qué hace

Parte el texto de cada bloque en oraciones (regex `[^.?!]+[.?!]+["']?`),
envuelve cada una en `<span class="sentence">`. Combinado con CSS de
[04 (modo túnel/enfoque)](04-modo-tunel-enfoque.md): la frase bajo el mouse
queda opaca/nítida, el resto del párrafo se atenúa
(`opacity:0.4; filter:blur(0.5px)`). Reemplaza `block.innerHTML` entero
por el nuevo HTML de spans — comentario original decía explícitamente
"REEMPLAZO DESTRUCTIVO".

Si `bionicActive` también está activo, aplica biónico *dentro* de cada
frase antes de envolverla en el span (ver [02](02-modo-bionico.md)).

## Riesgo si se combina

- **Mismo riesgo que 02**, pero peor: el regex de partición de oraciones es
  ingenuo (no maneja abreviaciones tipo "Sr.", números decimales, etc.) —
  puede partir mal una frase y dejar el texto visualmente cortado en
  puntos raros. Es un problema de calidad de output, no de seguridad, pero
  vale la pena documentarlo antes de reactivar.
- **Depende de 04 (modo túnel)** para tener efecto visual — sin ese CSS de
  atenuación, el modo frase solo envuelve el texto en spans sin ningún
  cambio visible. No tiene sentido reimplementarlo sin 04.
- **Con SPA reactiva:** mismo riesgo de innerHTML destructivo que 02,
  agravado porque acá se reescribe el bloque *completo* (no solo nodos de
  texto sueltos) — mayor probabilidad de que React detecte el nodo como
  "extraño" en su próximo diff.
- **Nunca combinar 02 y 03 como dos pasadas separadas** sobre el mismo
  nodo — la que corra segunda destruye los spans de la primera. Si se
  separan en scripts independientes, uno debe orquestar al otro (frase
  llama a biónico internamente), no ambos escuchando el mismo trigger de
  forma independiente.
