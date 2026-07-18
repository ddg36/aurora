# Ghost panel / botón "Neural Explain"

> Código fuente completo: [bold-hud.js.original](bold-hud.js.original)
> — función `toggleGhostPanel()`, y la inyección del botón dentro de
> `processTextNodes()` (sección "INYECCIÓN DE BOTÓN FANTASMA").

## Qué hace

Por cada bloque `<p>`/`<li>` procesado, inyecta un botón flotante `✨`
(`.neural-ghost-btn`, posicionado a la izquierda del párrafo, visible solo
en hover) que al clickear despliega un panel (`.neural-ghost-panel`) debajo
del párrafo. En el original **era un stub**: el panel solo mostraba el
texto fijo `"Análisis del fragmento seleccionado... (Simulación)"` — no
llamaba a ningún LLM real, no tenía backend.

## Riesgo si se combina

- **Standalone: bajo riesgo técnico**, es solo un botón + panel inyectados
  como hijos del bloque (`block.prepend(ghostBtn)`, `block.appendChild(panel)`)
  — no reescribe el contenido de texto existente, solo agrega nodos nuevos.
- **Con 02/03 (biónico/frase):** el bloque ya fue reescrito por esos modos
  antes de que se inyecte el botón (el original lo hace a propósito, en
  ese orden — "prioridad baja, post-render", comentario línea 370). Si se
  reimplementa como script separado, mantener ese orden: primero
  transformar texto, después inyectar el botón — insertarlo antes causaría
  que biónico/frase lo destruyan al hacer `block.innerHTML = newHTML`.
- **Para tener uso real** necesita conectarse a un LLM de verdad — este
  sería el candidato más directo para usar el `llama-server` local
  (ver [[pi-vision-llamacpp]]: server CUDA en `:8080`, ya con visión) en
  vez del stub simulado. Requeriría day one: mandar el texto del párrafo al
  server, mostrar la respuesta real en el panel en vez del texto fijo.
- **Con sitios de chat AI (ChatGPT/Gemini/Grok):** agregar un botón visual
  dentro de cada `<p>` de sus mensajes es cosméticamente invasivo — no
  rompe el relay (confirmado: los relays no dependen de la estructura
  interna de los `<p>`, ver README principal de esta carpeta), pero superpone
  UI propia sobre la UI del proveedor, lo cual puede verse mal o robar
  clicks si el proveedor tiene sus propios botones flotantes en el mismo
  lugar (ej. botón de copiar código, reacciones, etc).
