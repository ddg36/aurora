# browser-use — Mapa de Código Fuente

> Última actualización: 2026-06-09

---

## Qué es

Framework Python de automatización de browser para agentes IA. Conecta LLMs con Chrome via CDP. Pipeline: DOM → serialización para LLM → acciones → CDP.

```
LLM (Anthropic/OpenAI/Ollama/15+ más)
      ↓
   agent/service.py  (loop de decisiones)
      ↓
   tools/            (registro de acciones)
      ↓
   actor/            (CDP: click, type, nav)
      ↓
   browser/session.py (WebSocket CDP)
      ↓
   Chrome / Chromium
```

---

## browser_use/ — Raíz del paquete

```
__init__.py         — init paquete; setup logging condicional para modo MCP
cli.py              — CLI entry; detección modo MCP y routing de comandos
config.py           — sistema de configuración con migración automática
exceptions.py       — tipos de excepción custom
init_cmd.py         — handler del comando de instalación
logging_config.py   — setup de logging con file handlers opcionales
observability.py    — integración LMNR telemetry para modo debug
utils.py            — utilidades comunes (env vars, paths)
```

---

## agent/ — Loop de Decisiones IA

```
service.py          — orchestrador del agente (4132 LOC); task planning, LLM loop, dispatch de acciones
prompts.py          — construcción del system prompt y optimización de contexto
judge.py            — evaluación de traces de ejecución del agente
variable_detector.py — detección de variables reutilizables desde historial
cloud_events.py     — modelos CloudEvent para streaming session/task/step/file
views.py            — modelos Pydantic: AgentHistory, ActionResult, AgentState
gif.py              — generación de GIF desde traces de ejecución

message_manager/service.py  — historial de conversación y tracking de HistoryItem
message_manager/utils.py    — serialización de mensajes y guardado de conversación
message_manager/views.py    — tipos de mensaje: BaseMessage, UserMessage, AssistantMessage

system_prompts/     — 8 variantes .md: plantillas para OpenAI/Anthropic/Claude con/sin thinking
```

---

## browser/ — Sesión CDP (4018 LOC session.py)

```
session.py          — BrowserSession event-driven; gestión de tabs; wrapper cliente CDP
session_manager.py  — pooling multi-sesión y lifecycle de conexiones
events.py           — definiciones de eventos de cambio de estado del browser
_cdp_timeout.py     — wrapper de timeout CDP por request
demo_mode.py        — inyección de panel de log en browser para debug visual
profile.py          — gestión de perfiles y extensiones del browser
python_highlights.py — renderizado de bounding boxes en screenshots
video_recorder.py   — servicio de grabación de pantalla
views.py            — BrowserTabInfo, BrowserAction models
watchdog_base.py    — base abstracta para monitoring de agentes
cloud/cloud.py      — integración de provisión de browser en cloud
cloud/views.py      — modelos de configuración de browser cloud

watchdogs/aboutblank_watchdog.py    — handler screensaver about:blank
watchdogs/captcha_watchdog.py       — detección y coordinación de resolución CAPTCHA
watchdogs/crash_watchdog.py         — detección de crashes y timeouts del browser
watchdogs/default_action_watchdog.py — handlers de acciones browser por defecto
watchdogs/dom_watchdog.py           — monitoreo de mutaciones DOM
watchdogs/downloads_watchdog.py     — manejo y persistencia de descargas de archivos
watchdogs/har_recording_watchdog.py — grabación de requests de red (formato HAR)
watchdogs/local_browser_watchdog.py — lifecycle de subprocess Chrome/Chromium
watchdogs/permissions_watchdog.py   — auto-otorgar permisos del browser
watchdogs/popups_watchdog.py        — auto-handle diálogos JS (alert/confirm/prompt)
watchdogs/recording_watchdog.py     — coordinación de grabación de video
watchdogs/screenshot_watchdog.py    — manejo de requests de screenshot
watchdogs/security_watchdog.py      — enforcement de política de acceso a URLs
watchdogs/storage_state_watchdog.py — persistencia de cookies y storage
```

---

## dom/ — Procesamiento DOM (1174 LOC service.py)

```
service.py          — adquisición de snapshots DOM; merge AX tree + computed styles
enhanced_snapshot.py — construcción de snapshot con extracción de propiedades CSS
markdown_extractor.py — conversión DOM → Markdown
utils.py            — truncado de texto y utilidades DOM
views.py            — DOMRect, EnhancedAXNode, SerializedDOMState

serializer/serializer.py        — convertidor DOM → texto principal para ingesta LLM
serializer/eval_serializer.py   — serializer optimizado para escritura de queries LLM
serializer/html_serializer.py   — DOM → HTML preservando shadow roots
serializer/clickable_elements.py — detección y scoring de elementos interactivos
serializer/paint_order.py       — jerarquía visual y tracking Z-order
```

---

## tools/ — Registro de Acciones (2266 LOC service.py)

```
service.py          — registro de acciones, validación de schema, dispatch de ejecución
utils.py            — utilidades comunes de tools
views.py            — modelos de parámetros de acción
extraction/schema_utils.py  — conversión JSON Schema → modelo Pydantic en runtime
extraction/views.py         — ExtractionResult y modelos de output estructurado
registry/service.py         — servicio del registro de acciones
registry/views.py           — ActionModel y metadata del registro
```

---

## actor/ — Wrapper CDP Bajo Nivel

```
element.py          — operaciones de elemento: select, click, text, scroll
page.py             — operaciones de página: navigate, screenshot, eval JS
mouse.py            — input de mouse: move, click, drag
utils.py            — utilidades del actor
```

---

## llm/ — Capa Multi-Proveedor (15+ integraciones)

```
base.py             — interfaz abstracta BaseChatModel
models.py           — catálogo de modelos y lógica de selección
messages.py         — tipos de mensaje: BaseMessage, UserMessage, AssistantMessage, ContentPart
schema.py           — schemas para tool/function calling
views.py            — TokenUsage, ModelInfo
exceptions.py       — excepciones específicas por proveedor

anthropic/          — Claude API + serializer
aws/                — AWS Bedrock + SageMaker Anthropic + serializer
azure/              — Azure OpenAI
browser_use/        — modelo propietario nativo Browser-Use
cerebras/           — Cerebras inference API + serializer
deepseek/           — DeepSeek API + serializer
google/             — Google Gemini + serializer
groq/               — Groq Cloud + parser + serializer
litellm/            — LiteLLM (interfaz universal) + serializer
mistral/            — Mistral API + schema optimizer
oci_raw/            — Oracle Cloud Generative AI + serializer
ollama/             — Ollama local + serializer
openai/             — OpenAI API + serializer + responses format
openrouter/         — OpenRouter aggregator + serializer
vercel/             — Vercel AI + serializer
```

---

## skill_cli/ — Daemon CLI

```
main.py             — entry point CLI principal
daemon.py           — daemon background que mantiene sesión viva
browser.py          — subclase ligera de BrowserSession
actions.py          — ejecución directa de acciones sin event bus
python_session.py   — intérprete Python persistente estilo Jupyter
sessions.py         — lifecycle y factory de sesiones
config.py           — schema de configuración CLI
profile_use.py      — gestión del binario profile-use
tunnel.py           — gestión del binario cloudflared tunnel
utils.py            — utilidades de plataforma

commands/browser.py     — comandos de control de browser (navigate, click, type)
commands/cloud.py       — passthrough REST a Cloud API
commands/doctor.py      — verificación de instalación/dependencias
commands/python_exec.py — ejecución de código Python
commands/setup.py       — setup post-instalación
```

---

## Otros subsistemas

```
mcp/server.py       — servidor MCP que expone acciones como tools
mcp/client.py       — integración cliente MCP
mcp/controller.py   — wrapper de tools para acciones browser-use
mcp/manifest.json   — descriptor del servicio MCP

skills/service.py   — SkillService: fetch y ejecución de cloud skills
skills/views.py     — helpers de metadata de skills

screenshots/service.py  — almacenamiento en disco de screenshots
sandbox/sandbox.py      — runtime de ejecución de tasks en sandbox
filesystem/file_system.py — abstracción I/O de archivos con sanitización

sync/service.py     — streaming de eventos a Browser-Use Cloud
sync/auth.py        — generación y persistencia de Device ID

telemetry/service.py  — envío de eventos de telemetría
tokens/service.py     — contador de tokens y calculadora de costos
tokens/mappings.py    — mapeo de nombres de modelos LiteLLM
tokens/custom_pricing.py   — pricing custom de modelos
tokens/openrouter_pricing.py — lookup de pricing OpenRouter

integrations/gmail/service.py — wrapper de servicio Gmail
integrations/gmail/actions.py — acciones específicas de Gmail
```

---

## Patrones de Arquitectura

| Patrón | Implementación |
|---|---|
| **Event Bus** | `bubus.EventBus` maneja subscripciones async de watchdogs |
| **LLM Adapters** | 15+ proveedores via `BaseChatModel` + plugins serializer |
| **DOM Pipeline** | CDP → Snapshot → EnhancedSnapshot → DOMTreeSerializer → texto LLM |
| **Action System** | Validación Pydantic + extracción en runtime |
| **Multi-Session** | `SessionManager` poolea conexiones CDP con timeouts por request |
| **Cloud Integration** | CloudEvents streaming + protocolo MCP |
