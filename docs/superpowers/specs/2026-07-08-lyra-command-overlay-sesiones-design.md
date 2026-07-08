# Lyra — Overlay de comandos + manejo de sesiones — Diseño

> Fecha: 2026-07-08 · Estado: aprobado en conversación
> Depende de: [2026-07-07-lyra-paridad-pi-design.md](2026-07-07-lyra-paridad-pi-design.md)

## Visión

Seguimos en fase de paridad/fidelidad con pi — encontrar cada cosa que difiere
de pi antes de sumar features nuevas. Este spec cierra un bug de arquitectura
real (el output de comandos ensucia el chat) y completa el manejo de sesiones
(fork/tree/import) con una interfaz, no solo texto.

## Hallazgo — bug de arquitectura

Los 22 builtins de Capa 1 mandan su salida por el mismo canal `'token'` que usa
el texto generado por el LLM. Consecuencia real, confirmada con `/session`:
el resultado del comando se guarda en `historial`, se persiste en la DB vía
`guardarMensaje`, y se manda como `history` a futuros prompts — contaminando
el contexto del chat con texto que nunca fue conversación.

pi nunca hace esto. Evidencia: existen archivos de componente DISTINTOS para
selectors (`session-selector.js`, `settings-selector.js`, `model-selector.js`,
`tree-selector.js`, `scoped-models-selector.js`, `trust-selector.js`) separados
de los componentes de mensaje (`assistant-message.js`, `user-message.js`,
`tool-execution.js`). Config/sesión vive en su propia superficie de UI,
nunca en el log de conversación.

**Decisión de alcance:** no se limpian mensajes ya persistidos de chats
existentes — solo los comandos nuevos usan el canal nuevo.

## Qué es interactivo en pi (evidencia, no invención)

Solo lo que tiene su propio `*-selector.js` es interactivo en pi real:

| Comando | Selector real en pi | Interactivo en Lyra |
|---|---|---|
| `/tree` | `tree-selector.js` | Sí — click nodo → fork |
| `/model` | `model-selector.js` | Sí — click modelo → set_model |
| `/settings` | `settings-selector.js` | Sí (thinking level) — click nivel → set_thinking_level |
| `/scoped-models` | `scoped-models-selector.js` | Sí — click favorito → add/remove |
| `/resume` | `session-selector.js` | **No** — sin RPC para listar sesiones pasadas (mismo hueco de `navigateTree`); queda apuntando a la sidebar de Aurora |
| `/session`, `/hotkeys`, `/changelog` | (ninguno — pi los imprime como texto plano) | No — modal simple: texto + botón Cerrar |
| `/trust` | `trust-selector.js` en pi | No — en Aurora el workspace es fijo y siempre confiable (spec anterior), no hay decisión real que tomar; se mantiene como texto estático, sin selector |
| `/copy`, `/export`, `/share`, `/login`, `/logout`, `/reload`, `/new`, `/name`, `/fork`, `/clone`, `/import` | (acciones, no selectors) | No — modal simple con resultado de la acción |
| `/quit` | (acción con confirmación) | No es parte de este canal — usa el `confirm_request`/`_pedir_confirmacion` ya existente (Capa 1); solo el mensaje final ("Motor detenido"/"Cancelado") viaja como `command_result` estático |

## Arquitectura

### Backend — nuevo canal, nunca toca historial

`bridge.py`: `_builtin()` deja de usar `avisar()` (que manda `'token'`). Cada
comando manda un evento `command_result` con datos estructurados:

```python
await self.send({
    'type': 'command_result',
    'command': 'tree',           # nombre del comando
    'interactive': True,          # True → modal con lista clickeable
    'data': {...},                 # forma según el comando (ver abajo)
})
```

`router.py`/`manejar_chat`: cuando `es_comando` y `nombre in _BUILTINS`, el
resultado va por `command_result`, no por `'token'` — nunca se llama
`agregarMensajeRico` ni `guardarMensaje` para esto. `self.send({'type':'done'})`
sigue cerrando el turno igual (el composer vuelve a estar libre).

**Formas de `data` por comando:**
- `tree`: `{ nodos: [...árbol de get_tree, aplanado con profundidad...], leafId }`
- `model`: `{ actual: id, modelos: [{id, provider, favorito: bool}] }`
- `settings`: `{ thinkingActual, niveles: [...] }`
- `scoped-models`: `{ favoritos: [...], todos: [...] }`
- resto (incluido `trust` y el resultado final de `quit`): `{ texto }` — string
  ya formateado, se muestra tal cual con botón Cerrar

### Frontend — modal genérico

Nuevo componente `ComandoOverlay` en `lyra.js` (o archivo propio si crece):
- Centrado, fondo atenuado (`position:fixed; inset:0`), click afuera o Esc
  cierra.
- Header: ícono + nombre del comando (ej. "🌳 Árbol de sesión").
- Cuerpo según `interactive`:
  - `true` → lista clickeable, ↑↓ navega, Enter selecciona (mismo patrón que
    el menú `/` que ya existe en el composer).
  - `false` → texto preformateado (`<pre>` o markdown liviano) + botón Cerrar.
- Click en un ítem interactivo dispara la acción correspondiente por WS
  (`fork`, `set_model`, `set_thinking_level`, `scoped-models add/remove`).
  El modal muestra un estado "aplicando…" y cierra recién cuando llega la
  confirmación real del backend — nunca optimista — igual que cualquier
  otro cambio de estado en Lyra.

`lyra-ws.js`: nuevo caso en `_dispatch` para `command_result` → callback
`onCommandResult(command, interactive, data)`, registrado igual que
`onQueueUpdate` etc. en `sendToLyra`.

### Sesiones — `parent_chat_id`

Columna nueva en `chats` (nullable, `INTEGER REFERENCES chats(id)`). Se llena
en 3 momentos:
1. Click en nodo del modal `/tree` → `fork(entryId)` → nuevo chat, parent =
   chat actual.
2. `/clone` → nuevo chat, parent = chat actual.
3. `/import <ruta>` → antes de importar, Aurora lee la primera línea
   (`SessionHeader`) del `.jsonl`; si tiene `parentSession` y ese path
   coincide con la `sessionPath` de algún chat ya mapeado, se asigna ese
   `parent_chat_id` automáticamente.

La sidebar (☰) sigue siendo "solo un añadido visual" como aclaró el usuario —
mismo listado de siempre, con indentación cuando un chat tiene `parent_chat_id`.
No es el mecanismo central; es una vista más de los mismos datos.

## Testing

- Backend: test que confirma `command_result` nunca dispara `agregarMensajeRico`
  ni queda en `historial` (regresión directa del bug encontrado).
- Backend: `/import` con un `.jsonl` de prueba con `parentSession` → confirma
  que el `chats.parent_chat_id` correcto se asigna solo.
- Frontend: cada comando interactivo dispara la acción esperada por WS al
  clickear un ítem (mock del modal, sin browser real disponible en esta sesión
  — se documenta esa limitación igual que en specs anteriores).

## Fuera de alcance

- `/resume` como picker interactivo real (sin RPC de pi para listar sesiones
  pasadas — limitación de pi, no de Aurora).
- Limpieza de mensajes de comando ya persistidos en chats existentes.
- Features nuevas sobre pi (nuevas skills, nuevas extensiones) — este spec es
  paridad/fidelidad, no expansión.
