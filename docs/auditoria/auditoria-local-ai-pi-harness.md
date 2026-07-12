# Auditoría: integración "local AI" vía pi harness

Fecha auditoría: 2026-07-10
Fecha fixes: 2026-07-10

## Resumen

Auditoría de cómo Aurora integra un modelo LLM local con el chat de Lyra (pi harness / RPC). Se encontraron 6 puntos; 4 se arreglaron, 1 no aplicaba fix (el flujo dentro de `src/pi/*` ya estaba bien), y 1 queda como nota arquitectural abierta (ver [Pendiente](#pendiente)).

## Qué se arregló

### 1. `[llama].base_url` muerto en `config/llm.toml`

El campo no lo leía nadie (`src/pi/*` no toca `[llama]`, y `src/llm/providers.py` solo lee `default_model`, no `base_url` — cada proveedor local tiene su propio endpoint fijo en `DEFAULT_PROVIDERS`). Se eliminó el campo y se dejó un comentario explicando por qué no aplica ahí.

Archivo: `config/llm.toml`.

### 2. Triple hardcodeo independiente del endpoint local

`src/browser/agent.py` tenía su propia constante `LLAMA_BASE = "http://localhost:8088/v1"`, duplicando (sin reusar) el valor `llamacpp` ya definido en `src/llm/providers.py:DEFAULT_PROVIDERS`. Ahora `browser/agent.py` importa `DEFAULT_PROVIDERS` y deriva `LLAMA_BASE` de ahí — una sola fuente de verdad para el endpoint de `llamacpp`.

Archivo: `src/browser/agent.py:28,32`.

### 3. Health chip de UI mal alineado

`ui/modules/inicio/view/inicio.js` solo mostraba un chip `"llama-server"` basado en `health.llama` (el motor OCR/browser-agent), sin ningún indicador del estado de pi — el motor real que usa el chat de Lyra. Se agregó un chip `"pi (Lyra)"` usando `health.pi.ok` (ese campo ya lo devolvía el backend en `src/main.py:76`, simplemente no se mostraba) y se relabeleó el chip existente a `"llama-server (OCR/browser)"` para dejar claro que es un motor distinto.

Archivo: `ui/modules/inicio/view/inicio.js:70-72`.

### 4. Cobertura de tests solo superficial para el proveedor local

`tests/pi/test_bridge.py` solo cubría orden de lista (`/models`) y CRUD de favoritos (`/scoped-models`) para `llamacpp` — ningún test mandaba un turno de chat real contra ese proveedor. Se agregó un test que selecciona `model: "llamacpp"`, espía los comandos RPC para confirmar que `set_model` se llama con `provider: "llama-cpp"` / `modelId: "llamacpp"`, y verifica que el turno completa (`done`, sin `error`, tokens correctos).

Archivo: `tests/pi/test_bridge.py` (bloque agregado después del assert de `/models`).

Verificado: `.venv-linux/bin/python3 tests/pi/test_bridge.py` → `OK — todos los asserts pasaron`. También corridos `test_error_proveedor_retry.py` y `test_stats_y_compactacion.py` sin romperse.

## Sin cambios (ya estaba bien)

`src/pi/config.py`, `src/pi/proceso.py`, `src/pi/router.py`, `src/pi/bridge.py`: ningún hardcodeo remoto (`openai`/`anthropic`) pisa la selección de modelo. La selección delega 100% a pi vía RPC (`get_available_models` / `set_model`) — Aurora es passthrough puro. No requería fix.

## Pendiente

**La premisa "pi es el único motor LLM" sigue siendo inexacta a nivel de producto**, no de bug: `src/llm/providers.py` es un segundo motor LLM local completo, vivo en producción (usado por `/tools/ocr` y por `src/browser/agent.py` para el agente de navegación), totalmente desacoplado de pi/RPC. Esto es una decisión de arquitectura (¿el motor OCR/browser-use debería pasar por pi también, o se mantiene separado a propósito porque pi no expone ese tipo de llamada?) que no se resolvió acá — solo se eliminó la duplicación de endpoints entre ambos motores (punto 2 arriba). Si se decide unificar, hay que decidir primero si pi puede servir ese caso de uso (completions puntuales sin sesión/chat) antes de tocar código.
