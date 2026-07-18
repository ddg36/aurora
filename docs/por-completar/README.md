# Por completar — features sacadas de bold-hud.js

`bold-hud.js` (extensión aihub) se redujo a una sola tarea: pintar
`b`/`strong`/`.bold`/`[font-weight:700]` de verde en `<all_urls>`. El archivo
original (575 líneas) hacía mucho más — cada feature de esa versión está
documentada acá como especificación independiente, para reimplementarla
algún día como **mini-script separado**, no como monolito.

Motivo de separar: el original mezclaba HUD + biónico + frase + túnel +
scroll + ghost panel en un mismo content script con un solo `MutationObserver`
y un solo objeto de estado (`currentState`). Cualquier bug en un módulo
(ej. el reflow del HUD) afectaba a todos los demás. Separado, cada feature
se activa/desactiva y se debuggea sola.

**Código original completo (575 líneas), sin recortar:**
[bold-hud.js.original](bold-hud.js.original) — referencia exacta de qué
había antes de reducir el script en producción a solo el color de negritas.
Cada mini-spec abajo cita las líneas/funciones relevantes de este archivo.

## Índice

| Archivo | Feature | Riesgo de innerHTML destructivo |
|---|---|---|
| [01-hud-lateral.md](01-hud-lateral.md) | Panel lateral: outline de headings + lista de links | No (solo lee, no reescribe texto) |
| [02-modo-bionico.md](02-modo-bionico.md) | Negrita parcial de cada palabra (lectura rápida) | Sí — reescribe innerHTML de bloques de texto |
| [03-modo-frase.md](03-modo-frase.md) | Envuelve cada oración en `<span>` para atenuar el resto | Sí — reescribe innerHTML de bloques de texto |
| [04-modo-tunel-enfoque.md](04-modo-tunel-enfoque.md) | Difumina todo excepto el párrafo bajo el mouse | No (solo CSS/clases) |
| [05-autoscroll-lectura.md](05-autoscroll-lectura.md) | Auto-scroll suave hacia el bloque bajo el mouse | No (solo `scrollTo`) |
| [06-ghost-panel-ai.md](06-ghost-panel-ai.md) | Botón ✨ por párrafo que abre panel de "análisis IA" | No, pero era un stub sin backend real |

## Regla general de combinación

- **01, 04, 05, 06** son seguros de combinar entre sí y con el bold-hud
  actual (simple color) — ninguno reescribe `innerHTML` de texto.
- **02 (biónico) y 03 (frase)** son los peligrosos: ambos hacen
  `block.innerHTML = ...` sobre el mismo tipo de nodos (`p, li, article,
  h1-h4, div[dir="auto"]`). Si se reactivan:
  - **No usarlos en sitios con SPA reactiva sobre esos mismos nodos**
    (ChatGPT/Gemini/Grok mientras hacen streaming, o cualquier vista de
    Aurora con Preact) — ver [[pi-vision-llamacpp]] y el README de Aurora
    para qué vistas usan Preact.
  - **02 y 03 combinados entre sí** ya estaban pensados para convivir en el
    original (biónico se aplica dentro de cada `<span class="sentence">`)
    — si se reimplementan, mantener esa jerarquía (frase afuera, biónico
    adentro), no aplicarlos como dos pasadas independientes sobre el mismo
    nodo (la segunda pasada rompe los spans de la primera).
  - Cualquiera de los dos, si corre en paralelo con **01 (HUD)**, dispara
    el `MutationObserver` del HUD en bucle (el HUD reconstruye su outline
    cada vez que el DOM cambia) — el original mitigaba esto con un
    `setTimeout` de 1s de debounce; si se separan en scripts
    independientes, cada uno necesita su propio guard para no
    reprocesar nodos ya marcados (`dataset.processed`).
