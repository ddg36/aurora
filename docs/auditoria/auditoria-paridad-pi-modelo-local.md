# Auditoría: paridad de funcionalidad pi harness (modelo local vs remoto)

Fecha auditoría: 2026-07-10
Fecha fixes: 2026-07-10

## Contexto

Sigue de [auditoria-local-ai-pi-harness.md](auditoria-local-ai-pi-harness.md), que encontró 2 motores LLM separados en Aurora: pi harness (chat de Lyra) y un motor local aparte (`src/llm/providers.py`, usado por OCR y browser-use). Esta auditoría chequeó si TODO lo que pi harness ofrece ya funciona igual cuando el modelo activo en pi es local (llamacpp) vs remoto (anthropic), antes de seguir dejando crecer el motor aparte con más features propias.

## Veredicto por área

| # | Área | Veredicto |
|---|------|-----------|
| 1 | Tools/tool-calling | Ya conectado igual — delegado 100% a pi, sin lógica model-specific en Aurora |
| 2 | MCP | No aplica — dos sistemas MCP no relacionados (pi interno vs Aurora-como-servidor-MCP), ninguno depende del modelo activo |
| 3 | Vision/imágenes | **Arreglado** |
| 4 | Thinking levels | Ya resuelto — clamp detectado y avisado al usuario |
| 5 | Browser-use | Limitación genuina de pi — **queda pendiente a propósito**, ver [Pendiente](#pendiente) |
| 6 | OCR | **Arreglado** — ahora pasa por un proceso pi dedicado |
| 7 | UI de Lyra (params/tools/history) | Ya conectado igual |
| 8 | MCP/extensiones de pi | Ya conectado igual — carga global por proceso, no por modelo |

## Qué se arregló

### 3. Vision/imágenes

El gap real no era solo "falta usar el dato" — el dato en sí estaba mal leído. `bridge.py:manejar_models` pedía `m.get('capabilities')`, pero ese campo **no existe** en el schema real de pi (`@earendil-works/pi-ai/dist/types.d.ts:interface Model`): pi expone `input: ("text"|"image")[]`, no `capabilities`. O sea, aunque se hubiera cableado el frontend, siempre habría recibido `{}` — la auditoría original asumió mal el nombre del campo.

Cambios:
- `src/pi/bridge.py:manejar_models` ahora lee `'image' in (m.get('input') or [])` y manda `vision: bool` ya resuelto al frontend (antes mandaba `capabilities: {}` sin usar).
- `ui/modules/lyra/view/lyra.js` calcula `visionSoportada` a partir de `modelosDisp` (ya se pedían vía `fetchModels()`, pero nadie los cruzaba con el modelo activo) y gatea `cargarImagen()` — el único choke point compartido por el botón de adjuntar, paste y drag&drop — mostrando un toast de error si el modelo activo no soporta imágenes en vez de mandarlas igual y fallar en silencio.
- `tests/pi/fake_pi.py` y `tests/pi/test_bridge.py` actualizados al schema real (`input` en vez de `capabilities`), con test de regresión para ambos casos (modelo con y sin visión).

### 6. OCR

Antes: `/tools/ocr` usaba el motor separado (`src/llm/providers.py`), HTTP directo a un servidor local, sin pasar por pi.

Ahora: `src/pi/ocr.py` (nuevo) implementa OCR vía un **segundo `PiProceso` dedicado**, corriendo en paralelo al proceso que usa el chat de Lyra — no comparten sesión ni modelo, así que un OCR no pisa lo que el usuario tiene abierto en su chat. Cada llamada:
1. `new_session` — sesión descartable, sin acumular historial entre llamadas de OCR.
2. Chequea el modelo activo del proceso dedicado vía `get_state`; si no soporta imagen (`'image' in input`), busca el primer modelo disponible que sí y lo fija con `set_model`. Este chequeo se repite en cada llamada (barato — mismo proceso ya vivo) porque `new_session` no garantiza que el modelo anterior persista.
3. Manda el `prompt` con la imagen en el formato real de pi (`{type: 'image', data, mimeType}`, igual que usa `bridge.py:_extraer_contenido`) y colecta los `text_delta` hasta `agent_end` (respetando `willRetry`, igual que hace `bridge.py` con el chat de Lyra).

`src/tools/router.py:tools_ocr` ahora llama a `pi.ocr.extraer_texto()` en vez de `llm.providers.choose_provider/complete_chat`.

Test nuevo: `tests/pi/test_ocr.py` — verifica que el proceso dedicado llama `new_session` antes de fijar modelo, elige un modelo con visión (no `llamacpp`, que en el fake no la soporta), y que una segunda llamada no repite `set_model` si el modelo ya es el correcto.

Verificado: `test_bridge.py`, `test_ocr.py`, `test_error_proveedor_retry.py`, `test_stats_y_compactacion.py`, `test_deadlock_socket_muerto.py`, `test_dialogos_extension.py` — todos pasan. `py_compile` limpio en todos los archivos tocados.

## Sin cambios (ya estaba bien)

Tools/tool-calling (#1), MCP (#2), thinking levels (#4), UI de Lyra (#7), MCP/extensiones de pi (#8) — ver auditoría original, sigue vigente el análisis, no requirió cambios.

## Pendiente

**Browser-use (#5)** se deja fuera a propósito — no es un gap por descuido, es una limitación real de la arquitectura RPC de pi (orientada 100% a sesión/turno de chat, un streaming a la vez; `browser_use` necesita completions crudas paso a paso sin sesión persistida). El usuario tiene planeado retomarlo en una evaluación aparte: la idea es extraer de `browser_use` solo lo útil (quitando su capa de API/dependencia de LLM propia) y convertirlo en una skill/tool nativa de pi, en vez de mantenerlo como motor externo. Requiere su propio diseño — no es una extensión trivial del fix de OCR (que sí encajaba en el modelo de sesión de pi).
