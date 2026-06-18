# Aurora — Mapa de la Codebase (lectura rápida)

## Estructura general
```
aurora/
├── extensions/                 → Extensiones MV3 importadas
│   ├── README.md               → Resumen de extensiones absorbidas
│   ├── registry.json           → Registro de 9 extensiones (aihub, ash, bold, etc.)
│   └── aihub/                  → Chrome extension MV3 activa
│       ├── manifest.json       → v2.1.0, name "Aurora Hub"
│       ├── background.js       → Service Worker (1412 líneas) — puente chrome.* → server :7779
│       ├── sidepanel.html/js   → Side panel con iframe a :7779/ui/
│       ├── newtab.html/app.js  → New tab override, conecta al server
│       ├── content-scripts/
│       │   ├── yt-captures.js  → Extracción transcript YouTube (429 líneas)
│       │   ├── yt-noambient.js → Desactiva ambient mode (MAIN world)
│       │   ├── ai-bridge.js    → Bridge para inyectar texto en AI chats
│       │   ├── gem-observer.js → Observer de bloques ✦✦✦/✧✧✧
│       │   ├── bold-hud.js     → Bionic reading overlay
│       │   └── main.js         → Relay universal
│       └── background/
│           ├── yt-history.js   → Historial local de extracciones YouTube (max 50)
│           └── browser-cabin.js → Session management, DOM mapping, CDP
├── src/                        → Backend Python (Litestar, puerto 7779)
│   ├── main.py                 → Entry point, registra todos los routers
│   ├── gemita/                 → LLM local chat (WebSocket :7778)
│   │   ├── router.py           → ws://localhost:7779/gemita
│   │   ├── tools.py            → 13 herramientas Python (run_bash, read_file, etc.)
│   │   ├── bucle.py            → Chat loop / inference
│   │   ├── providers.py        → Discovery de LLM providers (Ollama, etc.)
│   │   ├── protocol.py         → Tool protocol/schema
│   │   ├── roles.py            → Assistant roles/personas
│   │   ├── shell.py            → Shell execution helper
│   │   └── config.py           → Gemita config
│   ├── tools/                  → Tool registry (Aurora API)
│   │   ├── router.py           → /tools, /tools/ocr, /tools/{name}/run
│   │   ├── builtin.py          → 16 herramientas builtin
│   │   ├── registry.py         → Tool registration
│   │   ├── contract.py         → ToolContract(schema, handler, risk, policy)
│   │   └── policy.py           → Access policy
│   ├── ext/                    → Extension communication bus
│   │   └── router.py           → /ext/ws, /ext/capture, /ext/tab-stream (SSE), etc.
│   ├── nexus/                  → Workspace engine
│   │   ├── router.py           → /nexus/shell/run, /nexus/fs/*, /nexus/py/*, etc.
│   │   ├── shell.py            → Shell execution (post /nexus/shell/run)
│   │   ├── fs.py               → Filesystem operations
│   │   ├── py.py               → Python execution
│   │   ├── editor.py           → File editing
│   │   ├── approvals.py        → Approval system
│   │   ├── tasks.py            → Job management
│   │   ├── workspace.py        → Workspace sandbox
│   │   └── config.py           → Nexus config
│   ├── mcp/                    → Model Context Protocol
│   │   ├── router.py           → MCP endpoints
│   │   ├── protocol.py         → MCP protocol/schema
│   │   ├── config.py           → MCP config
│   │   ├── resources.py        → MCP resources
│   │   ├── prompts.py          → MCP prompts
│   │   └── external.py         → External MCP servers
│   ├── parser/                 → Block parser (Orion)
│   ├── db/                     → Database layer (SQLite)
│   │   ├── connection.py       → Async SQLite
│   │   ├── auth.py             → Auth guard middleware
│   │   ├── router.py           → 22 controllers registrados
│   │   ├── schema.sql          → Schema v5
│   │   └── routes/             → Individual route modules
│   │       ├── ext_capturas.py → /db/ext-capturas (CRUD)
│   │       ├── yt.py           → /db/yt/extracciones (CRUD)
│   │       ├── productividad.py → /db/productividad/* (capturas, research, tasks, clipboard, forms, meetings, tabs, prices)
│   │       ├── chats.py        → Chat conversations
│   │       ├── wiki.py         → Wiki indexing
│   │       ├── usuarios.py     → User management
│   │       ├── backup.py       → DB backup/restore
│   │       ├── jobs.py         → Scheduled job control
│   │       ├── mdreader.py     → Markdown reader prefs/index
│   │       ├── ash_downloads.py → Download tracking
│   │       └── ...many more (ajustes, ash, bc, eventos, extensions, llm, nav, prompts, scratchpad, sesiones, stats, tokens, urls_custom)
│   ├── browser/                → Browser automation (browser-use)
│   │   ├── router.py           → POST /nav/run, GET /nav/stream/{id}
│   │   └── agent.py            → Agent runner
│   ├── voz/                    → STT/TTS
│   │   └── router.py           → POST /voz/stt, POST /voz/tts, GET /voz/voces
│   └── jobs/                   → Scheduled jobs
│       └── cleanup_capturas.py → Cleanup de ext_capturas viejas
├── ui/                         → Frontend (Preact + HTM + Twind, sin build)
│   ├── boot.js                 → Boot/loader, ensureAuroraUser, setupTwind
│   ├── app.js                  → Main Preact app
│   ├── store.js                → Signals-based state
│   ├── vendor/                 → preact.min.js, htm.umd.js, twind.js, signals
│   ├── components/             → UI components (Button, Chip, Dropdown, Input, etc.)
│   │   ├── footer/             → Footer component + action registry
│   │   ├── themes/             → 25+ animated backgrounds, 12 HUD overlays
│   │   └── inject/             → Injected page styles
│   └── _legacy/                → Legacy code
├── config/                     → TOML configs (server, extensions, llm, mcp, nexus, workspaces)
├── databases/                  → SQLite (aihub.db)
├── docs/                       → Documentation
│   ├── aurorav1/               → v1 docs
│   │   ├── aurora.md           → Main manifesto (772 líneas)
│   │   └── nexus.md
│   ├── aurorav2/               → v2 docs
│   │   ├── aurora-v2.md        → v2 architecture target
│   │   ├── aurora-ideas.md     → 15 feature ideas (Capture, Researcher, Tasks, etc.)
│   │   └── ...
│   └── ...
└── scripts/                    → start.sh, start.bat, aurora_mcp_stdio.py
```

## Extension — Arquitectura
- **Service Worker** (background.js) = puente entre chrome.* APIs y servidor Aurora :7779
- **WebSocket control bus** → ws://localhost:7779/ext/ws con auto-reconnect, EXT_HELLO/ACK/CMD/RESULT
- **Side panel** → iframe a :7779/ui/, bridge via postMessage, clipboard fallback
- **Content scripts** → inyectados por dominio (youtube.com, AI chats, all URLs)
- **MAIN world** → solo yt-noambient.js (necesita acceder a ytplayer.config)
- **ISOLATED world** → todos los demás content scripts

## Mensajes del background.js (los más importantes)
- `capture_active_tab` → Texto limpio de pestaña (LLM chat > article > main > body)
- `screenshot` → chrome.tabs.captureVisibleTab() → PNG
- `capture_youtube` → Full YouTube capture (transcript + comments) — proxy a yt-captures.js con retry ×3 + reinyeccion en bridge.js
- `reinject_yt_cs` → Fuerza reinyeccion de yt-captures.js en tab activa
- `check_yt_cs` → Ping a yt-captures.js para verificar que esta vivo
- `meeting_snapshot` → Transcript/participants de Meet/Teams/Zoom
- `price_extract` → Precio/stock de e-commerce
- `run_js` → JS execution ISOLATED
- `inspect_page` → Formularios y botones
- `smart_fill_form` / `fill_input` → Form filling con native setter
- `screenshot_with_map` → Screenshot + element coordinates
- `click_element` / `scroll_page` / `get_selected_text` / `find_on_page` / `get_page_links`
- `navigate_to` / `clipboard_read` / `clipboard_write`
- `aurora_inject_text_tab` → Inyecta texto en AI chat inputs
- `open_sidepanel` → Abre side panel
- `CAPTURE_YOUTUBE` → Proxy a yt-captures.js (extractData) con retry ×3 + reinyeccion via bridge.js
- `CHECK_YT_CS` / `REINJECT_YT_CS` → Ping + reinyeccion forzada de yt-captures.js
- `DEBUG_YOUTUBE` → CDP debug completo de YouTube tab (via chrome.debugger Runtime.evaluate)
- `DEBUGGER_EVAL` / `DEBUGGER_SCREENSHOT` / `DEBUGGER_GET_CONSOLE` → CDP-based

## yt-captures.js — Content Script YouTube
**Método 1 (nuevo, primario):** DOM directo via `transcript-segment-view-model`
- Busca `<transcript-segment-view-model>` en el DOM (renderizado por YouTube al cargar la página)
- Si no hay (0), hace click en botón "Transcripción" via `dispatchEvent(MouseEvent)`
- Espera hasta 10s a que aparezcan los segmentos
- Extrae timestamp de `.ytwTranscriptSegmentViewModelTimestamp` + texto de `span[role="text"]`
- Fuente: `dom-transcript-segment-view`

**Método 2 (fetch, legacy):** fetch del HTML → ytInitialPlayerResponse → captions API (JSON3 o XML)
- **ROTO**: YouTube bloqueó la API timedtext (devuelve 0 bytes desde Jun 2026)
- Mantenido como fallback por si vuelve a funcionar

**Método 3 (DOM legacy):** auto-descubrimiento de selectores en panel engagement-panel-searchable-transcript
- **ROTO**: YouTube cambió a nuevo DOM con `transcript-segment-view-model` dentro de panel tid051

**Metadata:** título, canal, subs, views, likes/dislikes (returnyoutubedislikeapi), upload date, description
**Comentarios:** hasta 200, con autor y contenido
**Formateadores:** withTimestamps, withoutTimestamps, markdown, fullPage, pageNoTranscript, commentsOnly
**SPA-aware:** escucha yt-navigate-finish

## Server — Endpoints clave
- `GET /health` → Estado del server, LLM providers, DB
- `GET /ping` → Ping básico
- `POST /db/usuarios/init` → Init/get user token
- `WS /ext/ws` → Extension communication bus
- `POST /ext/capture` → Page capture (compat)
- `POST /ext/tab-change` → Tab change notification (fallback REST)
- `GET /ext/tab-stream` → SSE con tab activa en tiempo real
- `GET /ext/tab` → Última tab activa
- `GET /ext/status` → Estado de conexión de la extensión
- `GET /tools` → Lista de herramientas registradas
- `GET /tools/{name}` → Detalle de herramienta
- `POST /tools/{name}/run` → Ejecutar herramienta
- `POST /tools/ocr` → OCR de imagen via LLM visión
- `WS /gemita` → LLM chat WebSocket
- `POST /nexus/shell/run` → Shell execution
- `POST /nexus/shell/exec` → Shell execution (alias)
- `POST /nexus/fs/*` → Filesystem operations
- `POST /nexus/py/*` → Python execution
- `POST /nexus/editor/*` → File editing
- `POST /nexus/approval/*` → Approval system
- `GET/POST /db/ext-capturas/*` → Extension captures CRUD
- `GET/POST /db/yt/extracciones/*` → YouTube extractions CRUD
- `GET/POST /db/productividad/*` → Productivity CRUD
- `GET/POST /db/jobs/*` → Job control
- `GET/POST /db/mdreader/*` → Markdown reader prefs
- `POST /voz/stt` → Speech-to-text (faster-whisper)
- `POST /voz/tts` → Text-to-speech (edge-tts)
- `GET /voz/voces` → Lista de voces disponibles
- `POST /nav/run` → Browser automation (browser-use)
- `GET /nav/stream/{id}` → SSE log de navegación

## Herramientas builtin existentes (16)
- `aurora.workspace.list/read/search` → Filesystem workspace
- `aurora.nexus.shell.run` → Shell command (high risk, requires approval)
- `aurora.services.health` → Service/LLM status
- `aurora.capture.page` → Capture active tab context → productividad_capturas
- `aurora.research.page` → Research entry from capture
- `aurora.tasks.from_capture` → Task from capture
- `aurora.clipboard.save` → Clipboard → classified memory
- `aurora.forms.inspect/fill` → Form inspection and filling
- `aurora.meeting.capture` → Meeting transcript capture
- `aurora.tabs.list/archive` → Tab management
- `aurora.price.watch/scan` → Price monitoring

## Gemita — LLM local
- WebSocket en :7778, served via :7779/gemita
- 13 herramientas Python: run_bash, nexus_run, read_file, write_file, list_directory, search_in_files, find_files, update_memory, read_memory, get_user_profile, save_user_profile, wiki_search
- Providers: Ollama (:8088) + discovery dinámico
- Roles/personas configurables

## Frontend — Patrones
- Preact + HTM + Twind (sin build step, sin JSX)
- Signals-based state (preact-signals)
- iframe-first architecture
- postMessage bridge entre extension y UI
- Theme system: 25+ animated backgrounds, 12 HUD overlays, time-based themes
- Registry pattern para componentes y footer actions

## Manifest permissions (14)
declarativeNetRequest, sidePanel, tabs, scripting, activeTab, storage, clipboardWrite, clipboardRead, tabCapture, windows, debugger, downloads, notifications

## Host permissions
localhost:7779, localhost:7777, localhost:8088, youtube.com, AI chats (OpenAI, Claude, Gemini, Grok, Perplexity, Copilot, Kimi), all HTTPS, all URLs

## DB Tables principales
- ext_capturas → Extension captures (tipo, titulo, url, contenido, chars)
- yt_extracciones → YouTube extractions (fuente, url, titulo, tipo, contenido, meta)
- productividad_capturas → Web captures
- productividad_research → Research entries
- productividad_tasks → Tasks
- productividad_clipboard → Clipboard memory
- productividad_form_profiles → Form profiles (datos personales)
- productividad_form_templates → Form templates por dominio
- productividad_form_fills → Form fill history
- productividad_meetings → Meeting notes
- productividad_tab_sessions → Tab sessions
- productividad_tab_items → Tab items dentro de sesiones
- productividad_price_items → Price watches
- productividad_price_checks → Price check history
- md_reader_prefs → Markdown reader preferences
- md_reader_index_meta → Index metadata (file/node/edge counts)
- md_reader_files → Indexed markdown files
- md_reader_nodes → Document nodes (headings, links, etc.)
- md_reader_edges → Document graph edges

## Flujo actual de transcript YouTube (adaptado de au-pcp4)
```
User on YouTube → SSE tab-stream con {tipo:'youtube-video'} → ActionZone muestra botón "Extraer transcripción"
  ├─ CHECK_YT_CS → background.js ping a yt-captures.js (verifica que esté vivo)
  └─ capturarYT(tipo):
      ├─ bridge.js: bgRequest({type:'CAPTURE_YOUTUBE', extractionType})
      ├─ retry ×3 con .catch(() => null)
      └─ si "Receiving end does not exist": REINJECT_YT_CS → wait 600ms → retry
          └─ background.js: chrome.tabs.sendMessage(tab, {action:'extractData', type})
              └─ yt-captures.js ISOLATED world: handleExtraction(type) → fetchViaHTML + DOM fallback
```

## Flujo actual de screenshot
```
User triggers → background.js → chrome.tabs.captureVisibleTab() → PNG dataURL → UI or productivity_capturas.screenshot
```

## Componentes UI existentes (reutilizables)
- `Button` → variant: primary/danger, size: sm, active, disabled, fx-hover/fx-active
- `Panel` + `PanelHeader` + `PanelBody` (noPadding) + `PanelFooter` + `PanelLabel` + `PanelValue`
- `Dropdown` + `DropdownItem` → z-30, absolute, bg-aurora-surface, border-aurora-border
- `Chip` + `ChipGroup` → variant: yt/accent/muted/dim, con colores predefinidos
- `List` + `ListItem` (icon, name, sub, info, onClick) + `ListActions`
- `Input` + `Textarea` + `Select` → base class con fx-focus, border-aurora-border
- `Status` → tone: ok/warn/err/loading, con colores predefinidos
- `Empty` → estado vacío
- `Toolbar` + `ToolbarSpacer`
- `ChatMessage` + `ChatList` → para respuestas tipo chat
- `IframeContainer`

## Componentes shared
- `copiarTexto(texto)` → clipboard.js, usa bgRequest si en extensión, navigator.clipboard fallback
- `leerTexto()` → lee del clipboard
- `Toast.show(msg, tipo, ms)` → tipo: info/error/warning/success, colores predefinidos
- `getJSON(path)` / `postJSON(path, body)` / `deleteJSON(path)` → api.js, usa AURORA_BASE + Bearer token
- `__aurora_bgRequest(payload)` → inyectado por boot.js, puente a background.js
- `__aurora_enExtension` → signal (boolean), detecta si está en extensión
- `__aurora_setExtContext` / `__aurora_extContext` → store

## gemita-ws.js — Cliente WebSocket Gemita
- `ws://localhost:7779/gemita` (puentea a :7778 Ollama)
- `connectGemita()` → conecta con auto-reconnect exponencial (1s → 30s, max 10 intentos)
- `sendToGemita({message, model, system, history, tools, onToken, onThinking, onToolCall, onToolResult, onHubAction, onConfirmRequest})` → promesa resuelta cuando LLM responde
- `cancelarMensaje()` → envía type:cancel al WS
- `resetGemitaSession()` → envía type:reset
- `fetchModels()` → pide lista de modelos al server
- `disconnectGemita()` → cierra intencionalmente
- `getConnectionState()` → {connected, connecting, reconnectAttempt, maxAttempts}
- `onSessionInfo(cb)` → callback cuando cambia info de sesión
- Mensajes WS: chat, token, thinking, tool_call, tool_result, hub_action_request, confirm_request, done, error, models, session_init, status

## ai-bridge.js — Inyección en AI Chats
- Content script inyectado en: ChatGPT, Claude, Gemini, Grok, Perplexity, Copilot, Kimi
- INPUT_SELECTORS: #prompt-textarea (ChatGPT), [data-testid="composer-code-input"] (Claude), div[contenteditable] (Gemini), textarea[placeholder] (genérico)
- SEND_SELECTORS: button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="Enviar"], button[type="submit"]
- `injectText(el, text)` → contenteditable: execCommand('insertText'), else: native setter + input/change events
- `clickSend()` → busca botón enviar o dispatch keydown Enter
- Escucha: `AURORA_INJECT_TEXT` (msg.text + msg.send), `AURORA_GET_PAGE_TEXT`
- Notifica al background: `AURORA_CS_READY`

## Footer actions
- `ACCIONES_MODULO`: aihub-add-llm, aihub-json-detective, aihub-load-clipboard, aihub-inject-protocol
- `ACCIONES_CAPTURA_RAPIDA`: quick-screenshot, quick-capture
- `SvgBtn` → botón inline SVG reutilizable
- `abrirNotaScratchpad(nombre, contenido)` → escribe nota + setTab('scratchpad')
- `detectJson(raw)` → JSON Detective: parsea y formatea JSON del clipboard

## Captura view — Estructura actual (captura.js 360 líneas)
**Layout (3 zonas fijas):**
```
+-------------------------------------+
| STATUS: "Conectando..." / "OK"      │
+-------------------------------------+
| CHIPS: [YouTube] [dominio] [titulo] │
+-------------------------------------+
| ZONA ACCION (cambia por tipo tab)   │
+-------------------------------------+
| RESULTADO (fade-in cuando hay algo) │
|   - Texto: card mono + botones      │
|   - Screenshot: img preview         │
+-------------------------------------+
| HISTORIAL colapsable (top 5)        │
+-------------------------------------+
```

**Componentes internos:**
- `TabChips` → chips de tipo (YouTube/web)
- `ActionZone` → botones dinámicos según tipo de página
- `ResultadoTexto` → Panel con Textarea, botones Copiar/X, contador de chars
- `ResultadoScreenshot` → Panel con img, botones Copiar/Abrir/X
- `Historial` → Panel colapsable, top 5 items, eliminar, limpiar

**ActionZone por tipo:**
- `youtube-video` → "Extraer transcripción" (dropdown 6 tipos) + "Screenshot"
- `youtube` → aviso "Abrí un video" + "Screenshot"
- `web` → "Capturar página" + "Screenshot"

**YOUTUBE_TIPOS:** withoutTimestamps, withTimestamps, markdown, fullPage, commentsOnly, pageNoTranscript

**Flujo de datos:**
- `bridge.js` → bgRequest({type:'CAPTURE_YOUTUBE', extractionType}) → CAPTURE_YOUTUBE en background.js
- `historial.js` → cargarHistorialCaptura() → GET /db/ext-capturas, agregarAlHistorial() → POST /db/ext-capturas
- SSE para tab changes → EventSource('/ext/tab-stream')

**Lo que NO tiene:**
- Herramientas sobre contenido capturado
- Búsqueda dentro del transcript
- Navegación por timestamps
- Vista de detalle del historial
- Integración con LLM (resumir, puntos clave, etc.)
- Exportar a markdown/clipboard/chat
- Click en historial → ver contenido completo

## Ideas de herramientas para transcript (no implementadas aún)
- Resumir (Gemita)
- Puntos clave (Gemita)
- Notas de estudio (Gemita)
- Buscar dentro del transcript (JS client)
- Timestamps/Capítulos (JS client)
- Traducir (Gemita)
- Enviar al chat (postMessage a ai-bridge)
- Copiar (clipboard API)
- Analizar screenshot (Gemita)
- OCR de screenshot
- Buscar canal (YouTube API)
- Guardar en historial (DB)
- Comparar transcripts
