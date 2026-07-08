# Lyra — Paridad total con pi CLI — Diseño

> Fecha: 2026-07-07 · Estado: aprobado en conversación
> Depende de: [2026-07-07-pi-motor-aurora-design.md](2026-07-07-pi-motor-aurora-design.md)

## Visión

Aurora es el rostro nuevo de pi, no un clon visual de su TUI. Pero todo lo que pi CLI
permite hacer — sus 21 comandos, su forma real de mostrar streaming, su árbol de
sesiones — debe existir en Lyra, adaptado al idioma visual de Aurora (chat web), sin
inventar comportamiento propio donde pi ya define uno. Este spec cierra las brechas de
capacidad entre pi CLI y Lyra encontradas al auditar la fuente real de pi
(`@earendil-works/pi-coding-agent` dist + docs), no solo su documentación.

## Hallazgos de la auditoría (evidencia, no interpretación)

- **pi no tiene typewriter.** `assistant-message.js`: cada evento re-pinta el mensaje
  completo tal cual llegó, sin delay artificial. El efecto de tipeo en pi CLI es 100%
  velocidad real de generación. `ui/modules/lyra/scripts/chat/typewriter.js` (delay fijo
  de 8ms/char) es una fabricación de Aurora que no existe en pi.
- **Bug real en `src/pi/bridge.py`:** cuando `_tool_in_progress` es verdadero, el texto
  real del LLM (`text_delta`) se acumula en `_tool_output_buffer` y luego **reemplaza**
  el resultado real de la tool en `tool_execution_end`. pi nunca mezcla texto y
  resultados de tool — son bloques separados en un único array cronológico.
- **Estructura real de pi:** `message.content` es un array ordenado de bloques
  `{text | thinking | toolCall}` en el orden cronológico real. El `asistenteEnVivo` de
  Lyra usa 4 arrays separados (texto, thinking, toolCalls, toolResults) — pierde el
  orden real de intercalado.
- **Lista canónica de comandos** (`docs/usage.md`, 22 comandos reales):
  `/login /logout /model /scoped-models /settings /resume /new /name /session /tree
  /trust /fork /clone /compact /copy /export /import /share /reload /hotkeys /changelog
  /quit`. Lyra tenía 7 builtins propios, incluyendo `/thinking` que **no existe** como
  comando pi (vive dentro de `/settings`).
- **`/tree`** (`tree-selector.js`) es UN comando unificado: lista plana buscable y
  plegable construida directo de `get_tree`, con salto a cualquier nodo y continuar
  desde ahí. Reemplaza el diseño previo de "fork simple" + "árbol visual" separados.
- **Sin pipe RPC** (confirmado contra la lista completa de comandos RPC en `rpc.md`):
  `/login /logout /share /trust /import /reload /scoped-models`. Cada uno tiene un
  mecanismo real de pi por debajo, reutilizable sin pipe RPC directo (ver Capa 1).

## Arquitectura — capas de prioridad

### Capa 0 — Fidelidad de streaming (bugs, primero)

- Eliminar `typewriter.js`. `onToken`/`onThinking` escriben directo al bloque de texto
  en curso; sin animación, sin delay. El re-render en cada evento ya produce el efecto
  real de generación (igual que pi).
- Eliminar `_tool_in_progress`/`_tool_output_buffer` de `bridge.py`. `text_delta` siempre
  se manda como `token`; el resultado de la tool siempre es el resultado real de
  `tool_execution_end`, sin excepción.
- `asistenteEnVivo` pasa de `{text, thinking, toolCalls[], toolResults[]}` a
  `{blocks: [{tipo, ...}]}` — un array cronológico único, igual que `message.content` de
  pi. El render recorre `blocks` en orden en vez de 4 secciones fijas.

### Capa 1 — Los 21 comandos

Backend: `src/pi/bridge.py` extiende `_BUILTINS`/`_builtin()`. Frontend: el menú `/`
existente (ya lista builtins + extensiones + skills) no cambia de mecanismo, solo crece
la lista.

**Vía RPC directo (patrón ya existente en `_builtin`):**
`/new /name /session /compact /export /model /fork /clone /copy` (nuevo:
`get_last_assistant_text`) `/tree` (nuevo: `get_tree` + UI de árbol, ver abajo).
- `/settings` — en pi agrupa thinking+tema+delivery+transport. En Lyra: subconjunto
  útil vía RPC es el thinking level (`set_thinking_level`, lo que antes era mi
  `/thinking` inventado); tema/fondo ya tienen su propio panel en Aurora (`ajustes`) —
  `/settings` en Lyra muestra el thinking actual y linkea a ese panel, no lo duplica.
- `/resume` — ya cubierto por la sidebar de chats existente de Aurora (click en un chat
  = cargar su sesión pi). `/resume` en Lyra abre/enfoca esa misma sidebar, para que el
  comando exista con fidelidad aunque el mecanismo visual ya estaba construido.

**`/tree` — UI nueva, adaptada de `tree-selector.js`:**
Panel deslizable (no modal bloqueante, Aurora no tiene diálogos de terminal): lista
plana con indentación por profundidad, nodo actual resaltado, campo de búsqueda arriba,
plegado de subárboles. Click en un nodo → `fork{entryId: nodo}` si no es el leaf actual,
o no-op si ya es el actual. Fuente de datos: `get_tree` tal cual — sin recalcular
jerarquía del lado de Aurora.

**Estáticos, sin RPC (contenido fijo adaptado):**
`/hotkeys` (lista atajos reales de Lyra: `/`, Alt+M, Enter-steer, etc.) `/changelog`
(historial de versiones de Aurora, no el de pi).

**Adaptados — mecanismo de pi reutilizado, sin su pipe RPC:**
- `/login <provider> <key>` / `/logout <provider>` — edita
  `~/.pi/agent/auth.json` (mismo archivo, mismo formato que pi ya lee) desde Python.
  Reinicio del proceso pi no requerido — auth.json se relee en cada llamada a provider.
- `/share` — `export_html` (ya soportado) → `gh gist create <archivo> --private` como
  subproceso. Requiere `gh` instalado y autenticado; si falla, error explicando el
  requisito.
- `/trust` — responde con confirmación estática: "Workspace de Aurora ya es
  confiable (fijo por config)". Sin diálogo real necesario.
- `/import <ruta.jsonl>` — el usuario sube un archivo vía input de composer (ya existe
  mecanismo de adjuntar archivo); el backend copia el JSONL a `SESSION_DIR` y llama
  `switch_session` con esa ruta.
- `/reload` — reinicio limpio del subproceso pi (`PiProceso.parar()` +
  `ensure()`). Efecto práctico igual al reload de extensiones/skills de pi (se cargan al
  arrancar), aunque el mecanismo sea reinicio de proceso en vez de reload en caliente.
- `/scoped-models [add|remove|list] <id>` — lista de favoritos propia en
  `ajustes` (tabla ya existente de Aurora), sin pipe RPC porque pi no lo expone headless.
  Usada por `/model cycling` (Capa 2) para ciclar solo los favoritos en vez de todos los
  modelos disponibles.
- `/quit` — pi real termina el proceso entero; en Aurora ese proceso es compartido por
  todos los chats, así que "quit" literal rompería a todo el mundo. Adaptación fiel al
  *efecto* (terminar el motor), no al alcance: `/quit` en Lyra es una acción de admin —
  "🛑 Detener motor pi" — con confirmación explícita, ya que afecta todos los chats
  activos. Requiere `ensure()` posterior (por cualquier chat) para volver a levantarlo.

### Capa 2 — Las 5 piezas de capacidad (spec previo, sin cambios de fondo)

1. **Queue view** — pintar `queue_update` (el pipe ya llega al bridge y a
   `lyra-ws.js`, el callback en `lyra.js` está vacío). Chips debajo del composer.
2. **Steering** — Enter mid-stream manda `{"type":"steer",...}` en vez de bloquear
   (`cargando.value` deja de impedir escribir). Chip "🔗 en cola" hasta `queue_update`.
3. **Widgets** — `setWidget` de pi (texto arriba/abajo del composer, ignorado hoy salvo
   `notify`) → franja fina sobre el composer.
4. **Model cycling** — `cycle_model` RPC + atajo `Alt+M` (no Ctrl+P, conflicto con
   imprimir del navegador). Cicla la lista de `/scoped-models` si existe, si no, todos.
5. **`/tree`** — cubierto en Capa 1, ya no es pieza aparte.

## Testing

- Capa 0: test que verifica que un `tool_execution_start` → `text_delta` →
  `tool_execution_end` NUNCA pisa el resultado real (regresión directa del bug
  encontrado). Test de que `token` se manda sin buffering ni delay.
- Capa 1: test por comando nuevo contra el stub `fake_pi.py` (extendido con respuestas
  para `get_tree`, `get_last_assistant_text`, etc.).
- Capa 2: extensión de los tests de bridge existentes (`tests/pi/test_bridge.py`).

## Fuera de alcance

- OAuth device-flow real para `/login` (solo API-key manual, vía archivo).
- Layout de árbol tipo grafo — lista plana plegable, igual que pi.
