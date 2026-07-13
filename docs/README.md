# Aurora v3 — Documentación Unificada

> **Última actualización:** 2026-07-13
> **Versión:** 0.1.0
> **Motor LLM:** pi (`@earendil-works/pi-coding-agent`) en modo RPC
> **Server:** Python/Litestar en `:7779`
> **Frontend:** Preact + HTM + Twind (sin build step)
> **Base de datos:** SQLite (`aihub.db`, schema v8, WAL)

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [Backend — `src/`](#backend—src)
6. [Frontend — `ui/`](#frontend—ui)
7. [Extensiones Chrome](#extensiones-chrome)
8. [Base de Datos](#base-de-datos)
9. [Características Implementadas](#características-implementadas)
10. [Características Pendientes](#características-pendientes)
11. [Comandos de Lyra](#comandos-de-lyra)
12. [Herramientas (Tools)](#herramientas-tools)
13. [Configuración](#configuración)
14. [Desarrollo](#desarrollo)

---

## Visión General

Aurora es un **entorno harness humano/AI** completo: UI web, base de datos, puente Chrome, voz, automatización de navegador y motor LLM local. El cerebro agéntico es **pi** corriendo headless en modo RPC — mismo motor que pi CLI, sin TUI. Un solo agente, dos caras: terminal (pi CLI) y web (UI Aurora).

Aurora reemplazó a `gemita` (loop agéntico propio) como motor del chat. **pi es el único motor LLM.**

### Estado actual — Cloud y colaboración experimental

Aurora ya conecta Lyra con proveedores Cloud autenticados en iframes reales
(Gemini y ChatGPT verificados) sin convertirlos en APIs falsas. El content
script `cloud-relay.js` observa las interfaces nativas, transmite streaming y
permite ejecutar `read`, `bash`, `edit` y `write` mediante un proceso pi
dedicado y aislado.

```text
Lyra Cloud → askCloud → iframe nativo → cloud-relay
     ↑                                      ↓
feedback de tool ← /pi/cloud-tool ← JSON validado
```

La vista Cloud dispone de Split con dos proveedores persistentes. Su Duo
experimental conserva ambas interfaces nativas y sólo comunica agentes cuando
uno emite explícitamente:

```json
{"tool":"panel_send","args":{"to":"panel2","message":"Revisa este resultado"}}
```

`panel_send` se enruta en el frontend, conserva `runId`, valida el destino y no
ejecuta shell. La interfaz multiagente definitiva todavía no pertenece a esta
vista: se diseñará al integrar Arena dentro de Lyra. El estado detallado de las
superideas vive en `docs/ideas/ideas-rescatadas.md`.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│  Chrome Extensions (thin clients MV3)                   │
│  aihub | homeaurora | aurora-productivity | ash | bold  │
│  browsernebula | orion | pcp4 | ytnoambient | pi        │
└──────────────────┬──────────────────────────────────────┘
                   │ iframe + fetch + WebSocket
┌──────────────────▼──────────────────────────────────────┐
│  AURORA SERVER :7779  (Litestar, proceso único)         │
│                                                         │
│  /ui       → frontend estático (Preact)                 │
│  /lyra     → WS chat streaming (pi)                     │
│  /eventos  → WS bus Observer (broadcast/usuario)        │
│  /nexus/*  → shell, fs, py, editor, approvals, tasks    │
│  /db/*     → SQLite gateway (22+ controllers)           │
│  /tools/*  → tool registry + browser_task + cloud_ask   │
│  /voz/*    → STT faster-whisper + TTS edge-tts          │
│  /mcp/*    → MCP protocol                               │
│  /ext/*    → extension bus                              │
│  /nav/*    → browser-use (Playwright + CDP)             │
│  /health   → estado agregado (pi, providers, DB, ext)   │
│                                                         │
│  pi/proceso.py → spawn `pi --mode rpc` (por SO)         │
│  pi/bridge.py  → RPC JSONL, protocolo Lyra              │
│  pi/cloud_executor.py → LLM nube aislado (propia sesión)│
│  pi/ocr.py    → OCR vía proceso dedicado                │
└──────────────────┬──────────────────────────────────────┘
                   │ SQLite WAL
┌──────────────────▼──────────────────────────────────────┐
│  aihub.db — HDD NTFS compartido                         │
│  Linux ↔ Windows                                        │
│  Schema v8 con 8 migraciones numeradas                  │
└─────────────────────────────────────────────────────────┘
```

**Patrones arquitecturales:**
- **Mediator:** Server es el mediador (las tabs nunca se hablan entre sí)
- **Observer:** Bus `/eventos` notifica escrituras en tiempo real
- **Persistencia reactiva:** `usePersistedState` escucha eventos y actualiza signals sin polling
- **Anti-eco:** Comparación de strings serializados para evitar bucles de eventos

---

## Stack Tecnológico

| Capa | Tecnología | Notas |
|------|-----------|-------|
| **Backend** | Python 3.12 / Litestar / aiosqlite | Proceso único, puerto 7779 |
| **Base de datos** | SQLite 3 (WAL, busy_timeout=5000) | Schema v8, 46+ tablas |
| **Motor LLM** | pi (`@earendil-works/pi-coding-agent`) | Modo RPC, JSONL |
| **Frontend** | Preact 10 + HTM + Twind + Signals | Sin build step, ES modules nativos |
| **Extensiones** | Chrome MV3 (Manifest V3) | Thin clients, iframe-first |
| **STT** | faster-whisper (int8 CPU) | POST `/voz/stt` |
| **TTS** | edge-tts (mp3) | POST `/voz/tts` |
| **Browser** | Playwright + browser-use | POST `/nav/run`, SSE `/nav/stream` |
| **MCP** | Model Context Protocol | Config, external, prompts, protocol, resources |

---

## Estructura del Proyecto

```
aurora/
├── src/                      ← Backend Python (Litestar)
│   ├── main.py               ← Entry point, registra todos los routers
│   ├── eventos_ws.py         ← Bus de eventos WebSocket
│   ├── pi/                   ← MOTOR PRINCIPAL (pi RPC)
│   │   ├── bridge.py         ← 22 comandos pi, settings, tree, mapas
│   │   ├── proceso.py        ← PiProceso: spawn, restart, RPC JSONL
│   │   ├── router.py         ← WS /lyra handler
│   │   ├── cloud_executor.py ← LLM nube aislado (propia sesión)
│   │   ├── cloud_tools.py    ← tool cloud_ask
│   │   ├── ocr.py            ← OCR proceso dedicado
│   │   └── config.py         ← bin/runtime por SO
│   ├── llm/                  ← providers.py (movido desde gemita/)
│   ├── nexus/                ← Workspace engine
│   │   ├── router.py         ← /nexus/* endpoints
│   │   ├── shell.py          ← Shell execution
│   │   ├── fs.py             ← Filesystem operations
│   │   ├── py.py             ← Python execution
│   │   ├── editor.py         ← File editing
│   │   ├── approvals.py      ← Approval system
│   │   ├── tasks.py          ← Job management
│   │   ├── workspace.py      ← Workspace sandbox
│   │   └── config.py         ← Nexus config
│   ├── browser/              ← Browser automation
│   │   ├── router.py         ← /nav/run, /nav/stream/{id}
│   │   └── agent.py          ← Agent runner (browser-use)
│   ├── db/                   ← Database layer
│   │   ├── connection.py     ← Async SQLite, migraciones
│   │   ├── auth.py           ← Auth guard middleware
│   │   ├── router.py         ← 22+ controllers registrados
│   │   ├── schema.sql        ← Schema v5 base (v8 con migraciones)
│   │   └── routes/           ← Individual route modules
│   │       ├── usuarios.py
│   │       ├── chats.py
│   │       ├── prompts.py
│   │       ├── ajustes.py
│   │       ├── stats.py
│   │       ├── wiki.py
│   │       ├── nav.py
│   │       ├── ext_capturas.py
│   │       ├── yt.py
│   │       ├── productividad.py
│   │       ├── mdreader.py
│   │       ├── backup.py
│   │       ├── jobs.py
│   │       └── ... (22+ archivos)
│   ├── voz/                  ← STT/TTS
│   │   └── router.py
│   ├── mcp/                  ← MCP protocol
│   │   ├── router.py
│   │   ├── protocol.py
│   │   ├── config.py
│   │   ├── external.py
│   │   ├── prompts.py
│   │   └── resources.py
│   ├── tools/                ← Tool registry
│   │   ├── router.py         ← /tools/* endpoints
│   │   ├── builtin.py        ← 16+ herramientas builtin
│   │   ├── registry.py       ← Registro central
│   │   ├── contract.py       ← Contratos y validación
│   │   ├── policy.py         ← Políticas de ejecución
│   │   ├── browser_task.py   ← browser_task tool (pi → /nav)
│   │   ├── cloud_ask.py      ← cloud_ask tool (pi → cloud LLM)
│   │   ├── cloud_tools.py    ← Cloud tools executor
│   │   ├── forge.py          ← paquetes inmutables, sandbox y lifecycle
│   │   └── forge_build.py    ← Lyra → Duo Cloud → draft probado
│   ├── ext/                  ← Extension communication bus
│   │   └── router.py
│   └── jobs/                 ← Scheduled jobs
│       ├── cleanup_capturas.py
│       └── db_maintenance.py
├── ui/                       ← Frontend (Preact + HTM + Twind)
│   ├── index.html            ← Entry point
│   ├── boot.js               ← Boot: html+htm, signals, twind, monta App
│   ├── store.js              ← Signals globales
│   ├── app.js                ← Router lazy por ?tab=X
│   ├── vendor/               ← preact.min.js, htm.umd.js, twind.js, signals
│   ├── components/           ← UI components
│   │   ├── index.js          ← Barrel export
│   │   ├── globals.js        ← Object.assign(globalThis, components)
│   │   ├── lyra/             ← CSS específico de Lyra (7 archivos)
│   │   │   ├── lyra.css
│   │   │   ├── lyra.messages.css
│   │   │   ├── lyra.tools.css
│   │   │   ├── lyra.panels.css
│   │   │   ├── lyra.canvas.css
│   │   │   ├── lyra.composer-cloud.css
│   │   │   └── lyra.responsive.css
│   │   ├── lyra.views/       ← Componentes view de Lyra
│   │   │   └── canvas.js
│   │   ├── agent-eye/        ← Panel flotante control browser_task
│   │   │   ├── index.js
│   │   │   └── agent-eye.css
│   │   ├── nav/              ← Navegación
│   │   │   ├── nav-tabs.js   ← TABS: 17 tabs
│   │   │   ├── command-palette.js ← Ctrl+K + Alt+1..9
│   │   │   ├── notif-center.js
│   │   │   ├── sesion-ui.js
│   │   │   └── user-switcher.js
│   │   ├── footer/           ← Footer 3 zonas declarativas
│   │   │   ├── footer.js
│   │   │   ├── registry.js
│   │   │   └── acciones-modulo.js
│   │   ├── themes/           ← Temas, backgrounds, HUDs
│   │   │   ├── index.js      ← THEMES, BACKGROUNDS, HUDS
│   │   │   ├── manager.js
│   │   │   ├── lib.js
│   │   │   ├── tema-hora.js  ← Tema automático por franja horaria
│   │   │   ├── backgrounds/  ← 25 backgrounds
│   │   │   └── hud/          ← 9 HUDs
│   │   ├── scratchpad/       ← Componentes scratchpad
│   │   ├── shared/           ← Helpers compartidos
│   │   │   ├── api.js
│   │   │   ├── lyra-ws.js    ← WS /lyra client
│   │   │   ├── eventos-ws.js ← WS /eventos client
│   │   │   ├── persisted-state.js ← usePersistedState
│   │   │   ├── markdown.js
│   │   │   ├── cloud-ask.js
│   │   │   ├── cloud-bridge-listener.js
│   │   │   ├── llm-sesiones.js
│   │   │   ├── clipboard.js
│   │   │   ├── toast.js
│   │   │   ├── flash.js
│   │   │   ├── autosave.js
│   │   │   ├── ext-bridge.js
│   │   │   ├── iconButton.js
│   │   │   └── agent-eye.js
│   │   └── images/           ← Assets gráficos
│   ├── modules/              ← 17 módulos UI
│   │   ├── lyra/             ← CHAT PRINCIPAL (28 archivos)
│   │   │   ├── view/
│   │   │   │   ├── lyra.js              ← Componente principal
│   │   │   │   ├── message-list.js       ← Historial + streaming
│   │   │   │   ├── composer.js           ← Input + slash commands
│   │   │   │   ├── params-panel.js       ← Parámetros LLM
│   │   │   │   ├── history-panel.js      ← Historial de chats
│   │   │   │   ├── comando-overlay.js    ← Modal interactivo
│   │   │   │   ├── cloud-panel.js        ← Panel cloud LLM
│   │   │   │   ├── ext-dialog.js         ← Diálogos de extensión
│   │   │   │   ├── nexus-confirm-banner.js
│   │   │   │   ├── tool-activity-bar.js
│   │   │   │   └── tools-toolbar.js
│   │   │   └── scripts/
│   │   │       ├── chat/
│   │   │       │   ├── historial.js      ← CRUD chats
│   │   │       │   ├── mensajes.js       ← Streaming, blocks
│   │   │       │   ├── comandos.js       ← 22 comandos pi
│   │   │       │   ├── cloud.js          ← Envío a cloud LLM
│   │   │       │   ├── duo.js            ← Duo Lyra↔Nube
│   │   │       │   ├── canvas/canvas.js  ← Canvas tool
│   │   │       │   ├── voz/voz.js        ← STT/TTS
│   │   │       │   ├── acciones-rapidas.js
│   │   │       │   ├── actividad.js
│   │   │       │   ├── exportar-pdf.js
│   │   │       │   ├── herramientas.js
│   │   │       │   ├── instrucciones.js
│   │   │       │   ├── parametros.js
│   │   │       │   ├── renderizar.js
│   │   │       │   └── vision.js
│   │   │       └── voz/voz.js
│   │   ├── inicio/           ← Dashboard health
│   │   ├── llmcloud/         ← Iframes presets + duo
│   │   ├── prompts/          ← CRUD prompts
│   │   ├── wiki/             ← Editor markdown
│   │   ├── scratchpad/       ← Notas con bloques
│   │   ├── editor/           ← Editor sandbox
│   │   ├── stats/            ← Gráficas
│   │   ├── toolkit/          ← 8 herramientas 1-click
│   │   ├── chain/            ← Cadena 3 AIs
│   │   ├── webnavigator/     ← Browser-use UI
│   │   ├── detective-tokens/ ← Estimador tokens
│   │   ├── stylecatalog/     ← Catálogo componentes
│   │   ├── ajustes/          ← Tema, LLMs, export/import
│   │   ├── md-reader/        ← Lector markdown
│   │   ├── captura/          ← Captura página
│   │   ├── productividad/    ← Productivity tools
│   │   └── aurora/           ← Módulo interno Aurora UI
│   └── _legacy/              ← Código legacy v1
├── extensions/               ← Extensiones Chrome MV3
│   ├── registry.json         ← Registro de 10 extensiones
│   ├── aihub/                ← Sidepanel + bridge chrome.* APIs
│   ├── homeaurora/           ← New tab override
│   ├── aurora-productivity/  ← Productivity thin client
│   ├── ash/                  ← ASH sidepanel
│   ├── bold/                 ← Bionic reading overlay
│   ├── browsernebula/        ← Browser control
│   ├── orion/                ← Parser background
│   ├── pcp4/                 ← Page capture
│   ├── ytnoambient/          ← YouTube ambient mode
│   └── pi/                   ← Pi extension (aurora-tools.ts)
├── config/                   ← TOML configs
│   ├── server.toml           ← Host, port, db path
│   ├── llm.toml              ← LLM providers, engine, session-dir
│   ├── nexus.toml            ← Workspace roots, patterns
│   ├── workspaces.toml       ← Workspace config
│   ├── extensions.toml       ← Extensions config
│   └── mcp.toml              ← MCP config
├── databases/                ← SQLite
│   └── aihub.db              ← DB principal (schema v8)
├── docs/                     ← Documentación
│   └── README.md             ← Este archivo (fuente de verdad)
├── scripts/                  ← Scripts de lanzamiento
│   ├── start.sh              ← Linux
│   ├── start.bat             ← Windows
│   └── aurora_mcp_stdio.py   ← MCP stdio
├── tests/                    ← Tests
│   └── pi/                   ← Tests pi bridge
├── requirements.txt          ← Dependencias Python
└── README.md                 ← Root README
```

---

## Backend — `src/`

### `src/pi/` — Motor Principal (pi RPC)

**`bridge.py`** — Traducción protocolo WS UI ↔ RPC pi:
- 22 comandos reales de pi adaptados a Lyra
- Settings persistentes (15 settings de pi)
- Mapa chat↔sesión (`aurora-map.json`)
- Modelos favoritos (`scoped-models.json`)
- Auth (`~/.pi/agent/auth.json`)
- Árbol de sesión (`get_tree` con filtros)
- Canal `command_result` para comandos (no ensucia historial)

**`proceso.py`** — `PiProceso`:
- Spawn `pi --mode rpc` vía bun (Linux) o bun.exe (Windows)
- Lectura/escritura JSONL (split por `\n`)
- Correlación id request/response
- Restart ante crash con backoff
- Shutdown limpio

**`router.py`** — Handler WebSocket `/lyra`:
- `sendToLyra()` → mensaje, model, system, history, tools, chat_id
- Callbacks: `onToken`, `onThinking`, `onToolCall`, `onToolResult`, `onHubAction`, `onConfirmRequest`
- Steering: Enter mid-stream encola mensajes
- Queue view: chips debajo del composer
- Widgets: franja sobre el composer
- Model cycling: `Alt+M`

**`cloud_executor.py`** — LLM nube aislado:
- Propia sesión descartable (no comparte con chat Lyra)
- Auto-approve de bash desde la nube
- Confirmaciones, cancelación
- Sesión limpia y dedicada

**`cloud_tools.py`** — Executor de tools cloud:
- `ejecutar_tool()` → invoke cloud LLM
- Aislado del pi del chat

**`ocr.py`** — OCR vía pi:
- Segundo `PiProceso` dedicado (paralelo al chat)
- No comparte sesión ni modelo
- `new_session` → `set_model` (visión) → `prompt` con imagen
- Test: `tests/pi/test_ocr.py`

**`config.py`** — Configuración por SO:
- `bin_windows`/`bin_linux`, `runtime_windows`/`runtime_linux`
- Defaults: `~/.bun/bin/pi` + `bun` (Linux)

### `src/nexus/` — Workspace Engine

**`router.py`** — Registra `NEXUS_ROUTES`:
- `POST /nexus/shell/run` — Ejecutar comando shell
- `POST /nexus/shell/exec` — Alias de shell/run
- `GET /nexus/tasks` — Lista jobs
- `POST /nexus/tasks/{id}/kill` — Mata job
- `POST /nexus/tasks/{id}/forget` — Elimina job
- `GET /nexus/tasks/{id}/stream` — SSE streaming
- `POST /nexus/editor/run` — Ejecuta código (py/js/sh)
- `GET /nexus/py/status` — Estado venv
- `POST /nexus/py/run` — Ejecuta script
- `POST /nexus/py/venv-create` — Crea venv
- `POST /nexus/py/pip-install` — Instala paquetes
- `GET /nexus/py/pip-list` — Lista paquetes
- `GET /nexus/fs/list` — Listar archivos
- `GET /nexus/fs/read` — Leer archivo
- `GET /nexus/fs/head` — Primeras N líneas
- `GET /nexus/fs/stat` — Metadata
- `GET /nexus/fs/tree` — Árbol directorios
- `GET /nexus/fs/grep` — Buscar en archivos
- `POST /nexus/fs/write` — Escribir archivo
- `POST /nexus/fs/patch` — Find-and-replace
- `POST /nexus/fs/delete` — Eliminar
- `POST /nexus/fs/move` — Mover/renombrar
- `POST /nexus/fs/mkdir` — Crear directorio

**`shell.py`** — Ejecución shell:
- Linux: `bash -lc {cmd}`
- Windows: `powershell -NoProfile -NonInteractive -Command {cmd}`
- `create_subprocess_exec` (sin `shell=True`, sin inyección)
- Process group: `start_new_session=True` (solo Linux)
- Kill: `os.killpg(pid, SIGTERM)` → `SIGKILL` (Linux) o `taskkill` (Windows)

**`workspace.py`** — Path safety:
- `safe()` → `.resolve()` + `is_inside(BASE)`
- Sin directory traversal

**`approvals.py`** — Sistema de aprobaciones:
- Cola pendientes: `GET /nexus/approvals`
- Aceptar/denegar: `POST /nexus/approve|deny`
- Comandos destructivos: `rm`, `dd`, `mkfs`, `shred`, `del`, `rd`, etc.

> ⚠️ **NEXUS — REDUNDANCIA CON PI TOOLS (2026-07-12)**
>
> Pi (el agente) tiene **7 tools nativas builtin**: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.
> Aurora tiene **wrappers** que duplican estas funciones usando nexus:
> - `aurora.workspace.read` → usa `nexus.workspace.read()` (pi ya tiene `read`)
> - `aurora.workspace.list` → usa `nexus.workspace.list()` (pi ya tiene `ls`/`find`)
> - `aurora.workspace.search` → usa `nexus.workspace.search()` (pi ya tiene `grep`)
> - `aurora.nexus.shell.run` → usa `nexus.shell.ejecutar_shell()` (pi ya tiene `bash`)
>
> **Conclusión:** Nexus es REDUNDANTE para operaciones básicas. Solo es necesario para:
> ✅ **Approval system** — comandos destructivos requieren aprobación UI
> ✅ **Task management** — jobs async con SSE streaming
> ✅ **Workspace sandboxing** — path safety (`safe()`, `is_inside()`)
> ✅ **Extensiones** — `gem-observer.js` usa `/nexus/shell/run`
> ❌ **NO** para read/write/edit/bash/grep/find/ls — pi ya las tiene nativas
>
> **Plan de refactor:** Eliminar wrappers redundantes de `builtin.py` y usar directo las tools nativas de pi.

### `src/browser/` — Browser Automation

**`agent.py`** — Agent runner (browser-use):
- Importa `browser_use.Agent`
- Wrapper con llama-server + CDP :9222
- Pipeline: DOM → serialización → acciones → CDP

**`router.py`** — Endpoints:
- `POST /nav/run` — Iniciar navegación
- `GET /nav/stream/{id}` — SSE log de navegación
- Reporta `webnavigator.disponible` en `/health`

### `src/db/` — Database Layer

**`connection.py`** — Async SQLite:
- `get_db()` — Conexión global única
- `init_db()` — Schema + migraciones
- `MIGRATIONS` — Lista de 8 migraciones numeradas
- `PRAGMA busy_timeout=5000` + `synchronous=NORMAL`
- `_fts_backfill()` — Backfill FTS por tabla-vacía (idempotente)
- `json_loose()` — Lectura tolerante de JSON

**`auth.py`** — Auth guard:
- `auth_guard_global` — Guard global con allowlist de rutas públicas
- Rutas públicas: `/`, `/ping`, `/health`, `/ui/*`, `/db/usuarios/init|login`
- Todo lo demás exige token `Bearer`

**`router.py`** — 22+ controllers registrados:
- `usuarios`, `chats`, `prompts`, `ajustes`, `stats`, `wiki`, `nav`, `ext_capturas`, `yt`, `productividad`, `mdreader`, `backup`, `jobs`, `urls_custom`, `llm`, `eventos`, `sesiones`, `tokens`, `scratchpad`, `ash`, `bc`, `ext_capturas`, `mdreader`, `productividad`, `ash_downloads`

### `src/tools/` — Tool Registry

**`builtin.py`** — 16+ herramientas builtin:
- `aurora.workspace.list/read/search`
- `aurora.nexus.shell.run` (high risk, requires approval)
- `aurora.services.health`
- `aurora.capture.page`
- `aurora.research.page`
- `aurora.tasks.from_capture`
- `aurora.clipboard.save`
- `aurora.forms.inspect/fill`
- `aurora.meeting.capture`
- `aurora.tabs.list/archive`
- `aurora.price.watch/scan`

**`browser_task.py`** — browser_task tool:
- `POST /tools/browser_task/run` — Ejecutar tarea browser
- `POST /tools/browser_task/control` — Pausa/reanuda/aborta
- `GET /tools/browser_task/captura` — Capturas recientes
- Ponytail: un agente por usuario

**`cloud_ask.py`** — cloud_ask tool:
- `POST /tools/cloud_ask/run` — Preguntar a LLM nube
- Emite bus `{tipo:'cloud_ask', reqId}`
- Browser corre `askCloud`

### `src/eventos_ws.py` — Bus de Eventos

**`eventos_ws(socket)`** — WebSocket `/eventos`:
- Registro en memoria: `dict[usuario_id, set[WebSocket]]`
- Proceso único ⇒ sin Redis/pub-sub externo
- Auth por guard global (`?token=`)

**`emitir(usuario_id, tipo, datos)`** — Broadcast:
- Broadcast a todas las tabs del usuario
- Poda sockets muertos
- Jamás propaga error al request que emitió
- Envelope: `{tipo, datos, ts}`

**Persistencia reactiva:**
- `usePersistedState(clave, initial)` — Carga inicial de `/db/ajustes/:clave`
- Suscrito a `onEvento('ajuste')` — Actualización en vivo
- Anti-eco: ref `raw` con último valor serializado conocido

---

## Frontend — `ui/`

### Arquitectura

- **Sin build step** — 175 módulos `.js` sueltos, sin bundler
- **ES modules nativos** — Import directo, no registry
- **Preact + HTM + Twind + Signals** — Sin JSX
- **iframe-first** — Extensiones montan iframe a `:7779/ui`
- **postMessage bridge** — Comunicación extensión ↔ UI

### Módulos UI (17 tabs)

| Tab | ID | Descripción | Estado |
|-----|-----|-------------|--------|
| **Lyra** | `lyra` | Chat principal con pi (streaming, tools, voz, canvas, cloud) | ✅ Completo |
| **Inicio** | `inicio` | Dashboard health (3 HealthDots, refresh 5s) | ✅ Completo |
| **LLM Cloud** | `llmcloud` | Iframes presets (ChatGPT/Claude/Gemini) + Duo server-side | ✅ Completo |
| **Prompts** | `prompts` | CRUD prompts con filtros, búsqueda, ideas, plantillas | ✅ Completo |
| **Wiki** | `wiki` | Árbol recursivo via `/nexus/fs`, editor + preview markdown | ✅ Completo |
| **Scratchpad** | `scratchpad` | Vista Notas: bloques, sidebar, notas.js store | ✅ Completo |
| **Editor** | `editor` | Árbol sandbox + textarea + ▶ `/nexus/editor/run` | ✅ Completo |
| **Stats** | `stats` | GET `/db/stats`: cards + barras | ✅ Completo |
| **Toolkit** | `toolkit` | 8 herramientas 1-click via sendToLyra streaming | ✅ Completo |
| **Chain** | `chain` | Cadena de prompts: salida paso N → entrada N+1 | ✅ Completo |
| **WebNavigator** | `webnavigator` | Visor `/db/nav`: sesiones, log, capturas con selectores | ✅ Completo |
| **Detective Tokens** | `detective-tokens` | Estimador tiempo real, breakdown, autosave | ✅ Completo |
| **StyleCatalog** | `stylecatalog` | Galería de componentes primitivos con preview vivo | ✅ Completo |
| **Ajustes** | `ajustes` | Tema/Fondo/HUD, CRUD LLMs custom, export/import JSON | ✅ Completo |
| **MD Reader** | `md-reader` | Lector markdown: outline, doc-map, workspace-map, search | ✅ MVP 1-3 |
| **Captura** | `captura` | Captura página + YouTube transcript | ✅ Completo |
| **Productividad** | `productividad` | Captures, research, tasks, clipboard, forms, meetings, tabs, prices | ✅ Completo |

### Características de Lyra (módulo principal)

1. **Avatar visual** con moods (`neutral`, etc.), imágenes por mood, posición (left/center/right)
2. **22 comandos de pi** con overlay interactivo (`/tree`, `/model`, `/settings`, `/scoped-models`)
3. **Streaming fiel a pi** — `blocks` array cronológico (no 4 baldes separados)
4. **Steering** — Enter mid-stream encola mensajes
5. **Queue view** — Chips de cola debajo del composer
6. **Widgets** — Franja sobre el composer
7. **Model cycling** — `Alt+M` cicla modelos favoritos
8. **Duo Lyra↔Nube** — LLM local + LLM cloud en paralelo
9. **Cloud panel** — Iframe de LLM externo integrado
10. **Canvas** — Editor de código con preview HTML (tabs: codigo/vista)
11. **Voz** — STT faster-whisper + TTS edge-tts
12. **Vision** — Drag&drop de imágenes (gateado por modelo)
13. **Tool activity bar** — Ring buffer 24 tool executions
14. **Acciones rápidas** — Copiar, notas, reformular, leer
15. **Exportar PDF** — Exportar conversación a PDF
16. **Fijar mensajes** — Pin en DB (`PATCH /db/chats/mensajes/:id/pin`)
17. **Historial de chats** — Sidebar con `parent_chat_id` (fork/clone/import)
18. **Comando overlay** — Modal interactivo para comandos con lista clickeable
19. **Nexus confirm banner** — Aprobaciones de comandos destructivos
20. **Tools toolbar** — Toolbar de herramientas expandible

### Componentes UI

**Primitivos (barrel principal):**
- `Button`, `Toolbar`, `ToolbarSpacer`, `Dropdown`, `DropdownItem`
- `Status`, `Panel`, `PanelHeader`, `PanelBody`, `PanelFooter`
- `List`, `ListItem`, `ListActions`, `Empty`
- `Chip`, `ChipGroup`, `Input`, `Textarea`, `Select`
- `ChatMessage`, `ChatList`, `IframeContainer`

**Avanzados:**
- `CommandPalette` — Ctrl+K, filtro fuzzy, Alt+1..9
- `Footer` — 3 zonas declarativas (global, module, view)
- `UserSwitcher` — Multi-usuario
- `NotifCenter` — Eventos, cloud, backup
- `CanvasPanel` — Editor código + preview HTML
- `ScratchpadPageShell` — Shell principal Scratchpad
- `AgentEye` — Panel flotante control browser_task

**Temas:**
- **25 backgrounds:** starfield, void, clouds, nebula, aurora, particles, matrix, grid, rain, glitch, fireflies, castle, blood, ash, fog, ravens, abyss, depths, hellfire, lava, sakura, autumn, moonlit, blizzard, tundra, none
- **9 HUDs:** luna, pulse-rings, scanlines, circuit, corners, candles, runes, drip, sonar, ember, torii, compass, none
- **Tema por hora:** 06-09 amber, 09-12 cyan, 12-17 ocean, 17-20 lava, 20-23 violet, 23-24 shadow, 00-06 deep

---

## Extensiones Chrome

### Extensiones Activas (registry.json)

| ID | Tipo | Descripción | Estado |
|----|------|-------------|--------|
| `aihub` | MV3 sidepanel-server | Sidepanel → `:7779/ui`. Background = bridge chrome.* APIs | ✅ Active |
| `homeaurora` | MV3 newtab-server | New tab override → `:7779/ui` | ✅ Active |
| `aurora-productivity` | MV3 sidepanel-server | Productivity: capture, research, tasks, clipboard, forms, meetings, tabs, prices | ✅ Active |
| `ash` | MV3 sidepanel | ASH sidepanel | ✅ Imported |
| `bold` | MV3 popup-content | Bionic reading overlay | ✅ Imported |
| `browsernebula` | MV3 sidepanel | Browser control | ✅ Imported |
| `orion` | MV3 background-parser | Parser central | ✅ Imported |
| `pcp4` | MV3 popup-content | Page capture | ✅ Imported |
| `ytnoambient` | MV3 content-script | Desactiva ambient mode YouTube | ✅ Imported |
| `pi` | MV3 | Pi extension (aurora-tools.ts) | ✅ Active |

### Extensiones Pendientes

| ID | Tipo | Descripción | Estado |
|----|------|-------------|--------|
| `rtxnvidia` | UI/backend | Migrar a módulos UI/backend de Aurora | ⏳ Pending |
| `ytsounds` | Backend/audio | Utilidad Python, falta clasificar destino | ⏳ Pending |

### Estructura aihub (extensión principal)

```
aihub/
├── manifest.json           ← MV3, permisos mínimos
├── background.js           ← Service Worker: Chrome APIs, routing mensajes
├── sidepanel.html/js       ← Side panel con iframe a :7779/ui/
├── app.js                  ← New tab override
├── aurora-bridge.js        ← Bridge chrome.* → server :7779
├── rules.json              ← DeclarativeNetRequest
├── content-scripts/
│   ├── yt-captures.js      ← Extracción transcript YouTube (429 líneas)
│   ├── yt-noambient.js     ← Desactiva ambient mode (MAIN world)
│   ├── ai-bridge.js        ← Bridge para inyectar texto en AI chats
│   ├── gem-observer.js     ← Observer de bloques ✦✦✦/✧✧✧
│   ├── bold-hud.js         ← Bionic reading overlay
│   ├── main.js             ← Relay universal
│   ├── cloud-relay.js      ← Relay cloud LLM
│   ├── session-sniffer.js  ← Sniffer de sesiones
│   ├── auth-escape.js      ← Auth escape
│   └── ...
└── background/
    ├── yt-history.js       ← Historial local de extracciones YouTube (max 50)
    └── browser-cabin.js    ← Session management, DOM mapping, CDP
```

### Mensajes background.js (principales)

- `capture_active_tab` — Texto limpio de pestaña
- `screenshot` — chrome.tabs.captureVisibleTab() → PNG
- `capture_youtube` — Full YouTube capture (transcript + comments)
- `meeting_snapshot` — Transcript/participants de Meet/Teams/Zoom
- `price_extract` — Precio/stock de e-commerce
- `run_js` — JS execution ISOLATED
- `inspect_page` — Formularios y botones
- `smart_fill_form` / `fill_input` — Form filling con native setter
- `screenshot_with_map` — Screenshot + element coordinates
- `click_element` / `scroll_page` / `get_selected_text`
- `navigate_to` / `clipboard_read` / `clipboard_write`
- `aurora_inject_text_tab` — Inyecta texto en AI chat inputs
- `open_sidepanel` — Abre side panel

---

## Base de Datos

### Schema v8 — `aihub.db`

**Motor:** SQLite 3 con WAL (Write-Ahead Logging)
**Ruta:** `databases/aihub.db` (resuelto por `_resolve_db_path()`)
**Migraciones:** 8 migraciones numeradas idempotentes

**Tablas principales:**

| Tabla | Descripción |
|-------|-------------|
| `usuarios` | Usuarios + token + workspace_root |
| `chats` | Chats con `parent_chat_id` (fork/clone/import) |
| `mensajes` | Mensajes de chat (user/assistant/system) |
| `prompts` | Prompts (tipo: manual/output/chain/template/tool/idea) |
| `prompts_historial` | Historial de prompts usados |
| `ajustes` | Ajustes clave/valor por usuario |
| `urls_custom` | URLs custom (LLMs) |
| `sesiones` | Telemetría personal |
| `nav_sesiones` | Sesiones de WebNavigator |
| `nav_log` | Log de acciones de navegación |
| `nav_capturas` | Capturas de elementos de navegación |
| `llm_iframe_history` | Historial de iframes LLM cloud |
| `llm_adapters` | Adapters DOM para LLMs |
| `cloud_conversaciones` | Conversaciones capturadas de LLM cloud |
| `cloud_mensajes` | Mensajes de conversaciones cloud |
| `wiki_indice` | Índice wiki para RAG |
| `md_reader_prefs` | Preferencias MD Reader |
| `md_reader_index_meta` | Metadata índice MD Reader |
| `md_reader_files` | Archivos MD indexados |
| `md_reader_nodes` | Nodos del grafo MD |
| `md_reader_edges` | Aristas del grafo MD |
| `scratchpad_imagenes` | Índice de imágenes Scratchpad |
| `ash_proyectos` | Proyectos ASH |
| `ash_descargas` | Historial de descargas ASH |
| `nexus_approvals` | Aprobaciones de Nexus |
| `token_analisis` | Análisis de tokens |
| `eventos` | Eventos del sistema |
| `ash_prompts_capturados` | Prompts capturados por ASH |
| `bc_sesiones` | Sesiones Browser Cabin |
| `yt_extracciones` | Extracciones YouTube |
| `ext_capturas` | Capturas de extensión |
| `productividad_capturas` | Capturas web productividad |
| `productividad_research` | Research entries |
| `productividad_tasks` | Tasks |
| `productividad_clipboard` | Clipboard memory |
| `productividad_form_profiles` | Form profiles |
| `productividad_form_templates` | Form templates |
| `productividad_form_fills` | Form fill history |
| `productividad_meetings` | Meeting notes |
| `productividad_tab_sessions` | Tab sessions |
| `productividad_tab_items` | Tab items |
| `productividad_price_items` | Price watches |
| `productividad_price_checks` | Price check history |
| `search_fts` | FTS5 para búsqueda global |
| `schema_migrations` | Versionado de schema |

**Índices principales:**
- `idx_mensajes_chat` — Optimiza carga de chats
- `idx_mensajes_rol` — Filtrado por rol
- `idx_chats_usuario` — Listado de chats
- `idx_prompts_usuario` — Listado de prompts
- `idx_eventos_usuario` — Historial de eventos
- `idx_wiki_usuario` — Búsqueda wiki
- `idx_md_reader_*` — Índices MD Reader
- `idx_prod_*` — Índices productividad

**FTS5 (Búsqueda global):**
- Tabla virtual `search_fts` con triggers automáticos
- Backfill por tabla-vacía (idempotente)
- Consumido por CommandPalette (Ctrl+K)

---

## Características Implementadas

### ✅ Backend

- [x] Server Litestar `:7779` con CORS acotado + guard global
- [x] SQLite schema v8 con 8 migraciones numeradas
- [x] Auth guard con allowlist de rutas públicas
- [x] Bus de eventos `/eventos` con persistencia reactiva
- [x] Pi bridge completo (Fase 1+2): streaming fiel, 22 comandos, `/tree`
- [x] Pi proceso: spawn lazy, restart automático, shutdown limpio
- [x] Pi cloud_executor: LLM nube aislado (propia sesión)
- [x] Pi ocr: proceso dedicado (no pisa chat)
- [x] Nexus: shell, fs, py, editor, approvals, tasks
- [x] Browser-use: agent.py + router.py (POST `/nav/run`, SSE `/nav/stream`)
- [x] Voz: STT faster-whisper + TTS edge-tts
- [x] MCP: config, external, prompts, protocol, resources, router
- [x] Tools: builtin, contract, policy, registry, router
- [x] browser_task tool: pi → `/nav` (un agente por usuario)
- [x] cloud_ask tool: pi → cloud LLM vía browser
- [x] Jobs: cleanup_capturas, db_maintenance (VACUUM+ANALYZE a demanda)
- [x] Health endpoint enriquecido (pi, providers, DB, ext, webnavigator)
- [x] Multi-usuario (list/login/crear + user-switcher)
- [x] Backup total JSON + `/restore`
- [x] FTS5 búsqueda global + CommandPalette
- [x] Tema por hora automática
- [x] Avatar de Lyra (moods, imágenes, posición)

### ✅ Frontend

- [x] 17 módulos UI funcionales
- [x] Lyra: chat con streaming, tools, voz, canvas, cloud, avatar
- [x] Lyra: 22 comandos pi con overlay interactivo
- [x] Lyra: steering, queue, widgets, model cycling
- [x] Lyra: Duo Lyra↔Nube (LLM local + cloud en paralelo)
- [x] Lyra Cloud: Gemini/ChatGPT con streaming, Stop, adjuntos y tools reales
- [x] Lyra Cloud: tarjetas visuales progresivas para tools y errores
- [x] Lyra Cloud: artefactos `write/edit` abribles en Canvas/preview HTML
- [x] Lyra: canvas (editor código + preview HTML)
- [x] Lyra: voz (STT/TTS), vision (drag&drop imágenes)
- [x] Lyra: tool activity bar, acciones rápidas, exportar PDF
- [x] Lyra: fijar mensajes, historial con parent_chat_id
- [x] Inicio: dashboard health (3 HealthDots)
- [x] LLM Cloud: iframes persistentes, Split y relay por pane
- [x] LLM Cloud: Duo explícito mediante `panel_send` sin transcript duplicado
- [x] AI view actions: bridge describe/invoke auditado para Aurora, Toolkit, Canvas, Scratchpad y MD Reader
- [x] Tool Forge: Cloud construye drafts; sandbox, tests, aprobación, versión y rollback
- [x] Prompts: CRUD con filtros, búsqueda, ideas, plantillas
- [x] Wiki: árbol recursivo + editor + preview markdown
- [x] Scratchpad: notas con bloques, sidebar, outline
- [x] Editor: árbol sandbox + textarea + ▶ `/nexus/editor/run`
- [x] Stats: gráficas y resúmenes de uso
- [x] Toolkit: 8 herramientas 1-click
- [x] Chain: cadena de prompts (salida N → entrada N+1)
- [x] WebNavigator: visor sesiones, log, capturas
- [x] Detective Tokens: estimador tiempo real
- [x] StyleCatalog: galería componentes con preview vivo
- [x] Ajustes: tema/fondo/HUD, CRUD LLMs, export/import
- [x] MD Reader: lector, outline, doc-map, workspace-map, search
- [x] Captura: página + YouTube transcript
- [x] Productividad: captures, research, tasks, clipboard, forms, meetings, tabs, prices
- [x] CommandPalette: Ctrl+K, filtro fuzzy, Alt+1..9
- [x] Footer: 3 zonas declarativas
- [x] UserSwitcher: multi-usuario
- [x] NotifCenter: eventos, cloud, backup
- [x] AgentEye: panel flotante control browser_task
- [x] 25 backgrounds + 9 HUDs + tema por hora
- [x] Avatar de Lyra con moods e imágenes

### ✅ Extensiones

- [x] aihub: sidepanel + bridge chrome.* APIs
- [x] homeaurora: new tab override
- [x] aurora-productivity: productivity thin client
- [x] ash: sidepanel importado
- [x] bold: bionic reading overlay
- [x] browsernebula: browser control
- [x] orion: parser background
- [x] pcp4: page capture
- [x] ytnoambient: YouTube ambient mode
- [x] pi: aurora-tools.ts (yt_transcript, page_capture, tabs, screenshot)

---

## Características Pendientes

### 🔲 Cloud/Arena — siguiente etapa

- [x] **Aislamiento físico por ejecución** — `runId` separa evidencia y, por
  defecto, Duo abre y confirma una conversación nativa nueva en Gemini y
  ChatGPT. El controlador permite desactivarlo para pruebas deliberadas de
  continuidad/contaminación.
- [ ] **Pruebas destructivas de `panel_send`** — destino inválido, autoenvío,
  mensaje vacío, recuperación y Stop ya verificados entre ChatGPT y Gemini;
  faltan ping-pong acotado, timeout completo, recarga y background.
- [ ] **Más proveedores gratuitos** — adaptar y verificar DeepSeek, GLM,
  Kimi/Z.ai y otros sin acoplar el protocolo a selectores de Gemini/ChatGPT.
- [ ] **Artefactos completos** — refresco después de `edit`, MD Reader,
  revelar archivo, normalización de rutas y permisos de apertura.
- [ ] **Tarjeta única por operación** — unir solicitud y resultado de tool en
  una sola entrada histórica que cambie de estado.
- [ ] **Arena dentro de Lyra** — hasta cuatro especialistas Cloud convocables,
  con Lyra como coordinadora, evidencia verificable y Stop global.
- [ ] **Auditor de agentes** — estados enviados/respondido/estable/completado,
  eventos nativos primero y DOM/accesibilidad/OCR como fallback.

### 🔲 Fase 4 — Features nuevos

- [ ] **Más emisores del bus `/eventos`**
  - Chats/mensajes (sidebar de Lyra en vivo)
  - MD Reader (anotaciones)
  - Eventos de pi (estado del motor a todas las tabs)

- [ ] **MD Reader canvas** — Acción por nodo → evento al bus → Lyra/pi → respuesta anclada como anotación
  - Grafo ya en DB (`md_reader_files/nodes/edges`)

- [ ] **start.bat + prueba real de spawn pi en Windows**
  - Verificar `cmd /c` para `.cmd`/`.bat`
  - Testing cross-platform

- [ ] **Aurora Pro** — Licencia ed25519 offline + gating de módulos
  - Sync nube = export `/db/backup` cifrado cliente a storage tonto

### 🔲 Extensiones pendientes (de ideas)

| Idea | Estado | Notas |
|------|--------|-------|
| **Aurora Capture** | ✅ Implementado | `ext_capturas`, `productividad_capturas` |
| **Aurora Researcher** | ✅ Implementado | `productividad_research` |
| **Aurora Tasks From Web** | ✅ Implementado | `productividad_tasks` |
| **Aurora Clipboard Memory** | ✅ Implementado | `productividad_clipboard` |
| **Aurora Form Filler** | ✅ Implementado | `productividad_form_*` |
| **Aurora Meeting Notes** | ✅ Implementado | `productividad_meetings` |
| **Aurora Tab Commander** | ✅ Implementado | `productividad_tab_*` |
| **Aurora Price Watch** | ✅ Implementado | `productividad_price_*` |
| **Aurora Code Context** | 🔲 Pendiente | No implementado como extensión |
| **Aurora Web Automator** | ⚠️ Parcial | browser-use existe, falta grabador de flujos |
| **Aurora Docs Bridge** | 🔲 Pendiente | No implementado |
| **Aurora PDF Lens** | 🔲 Pendiente | No implementado |
| **Aurora Sheet Mind** | 🔲 Pendiente | No implementado |
| **Aurora Media Notes** | ⚠️ Parcial | YouTube transcript implementado, falta video/audio genérico |
| **Aurora Office Copilot** | 🔲 Pendiente | No implementado |

### 🔲 MD Reader — Faltan MVPs

| MVP | Descripción | Estado |
|-----|-------------|--------|
| **MVP 1** | Lector básico + outline + scroll sync | ✅ Implementado |
| **MVP 2** | Mapa documento (headings, links, wikilinks, tareas) | ✅ Implementado |
| **MVP 3** | Mapa global workspace (grafo, estadísticas) | ✅ Implementado |
| **MVP 4** | Edición inline + tareas | ⚠️ Parcial (edición via `/nexus/fs`) |
| **MVP 5** | Aurora intelligence (resumen, extracción, transformación) | ⚠️ Parcial (resumen con `/gemita`) |
| **MVP 6** | Salud y mantenimiento (links rotos, huérfanas, duplicados) | 🔲 Pendiente |

### 🔲 Ideas adicionales (no implementadas)

- Markdown como dashboard con widgets
- Modo proyecto (agrupar notas por proyecto)
- Daily notes (nota diaria automática)
- Meeting notes desde MD (plantilla)
- Research notes (plantilla)
- Prompt library en Markdown
- Wiki generator (detectar temas, crear índice)
- Markdown diff visual
- Command mode en MD Reader
- Exportaciones (HTML, PDF, JSON, Obsidian vault)

---

## Comandos de Lyra

### 22 Comandos de pi (implementados en `bridge.py`)

| Comando | Descripción | Interactivo |
|---------|-------------|-------------|
| `/new` | Sesión pi nueva para este chat (contexto limpio) | No |
| `/compact` | Compacta el contexto: resume lo viejo, mantiene lo reciente | No |
| `/model` | Ver modelos o cambiar: `/model [id]` | Sí (selector) |
| `/scoped-models` | Favoritos para ciclar con Alt+M: `/scoped-models list\|add\|remove [id]` | Sí (selector) |
| `/settings` | Thinking level actual, o fijalo: `/settings [off\|minimal\|low\|medium\|high\|xhigh]` | Sí (selector) |
| `/resume` | Retomar una sesión anterior — usá el historial de chats en la barra lateral | No (apunta a sidebar) |
| `/name` | Nombra la sesión pi: `/name <nombre>` | No |
| `/session` | Estadísticas de la sesión pi actual | No |
| `/tree` | Árbol de la sesión actual (ramas por steering/retries/forks) | Sí (modal interactivo) |
| `/trust` | Confirma que el workspace de Aurora es de confianza | No (texto estático) |
| `/fork` | Ramifica la sesión desde un mensaje anterior: `/fork <entryId>` (ver `/tree`) | Sí (desde /tree) |
| `/clone` | Duplica la rama activa en una sesión nueva | No |
| `/copy` | Muestra el último mensaje de Lyra para copiarlo | No |
| `/export` | Exporta la sesión a HTML | No |
| `/import` | Importa una sesión desde un `.jsonl` del servidor: `/import <ruta>` | No |
| `/share` | Sube la sesión como gist privado de GitHub (requiere `gh` instalado y logueado) | No |
| `/reload` | Reinicia el motor pi — recarga extensiones, skills y prompt templates | No |
| `/hotkeys` | Lista los atajos de teclado de Lyra | No |
| `/changelog` | Historial de versiones de Lyra | No |
| `/login` | Guarda una API key: `/login <provider> <key>` | No |
| `/logout` | Borra la API key guardada de un provider: `/logout <provider>` | No |
| `/quit` | Detiene el motor pi compartido — pide confirmación (afecta TODOS los chats) | No (confirm_request) |

### Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl+K` / `Meta+K` | Command Palette |
| `Alt+1..9` | Cambiar tab |
| `Alt+M` | Model cycling |
| `Enter` | Enviar mensaje |
| `Shift+Enter` | Nueva línea en composer |
| `/` | Abrir menú de comandos en composer |
| `Escape` | Cerrar overlays/modales |

---

## Herramientas (Tools)

### Tools Builtin (16+)

| Tool | Función | Riesgo |
|------|---------|--------|
| `aurora.workspace.list` | Listar archivos del workspace | Bajo |
| `aurora.workspace.read` | Leer archivo | Bajo |
| `aurora.workspace.search` | Buscar en workspace | Bajo |
| `aurora.nexus.shell.run` | Ejecutar comando shell | Alto (requires approval) |
| `aurora.services.health` | Estado del server/LLM/DB | Bajo |
| `aurora.capture.page` | Capturar pestaña activa | Bajo |
| `aurora.research.page` | Investigar página capturada | Bajo |
| `aurora.tasks.from_capture` | Crear tarea desde captura | Bajo |
| `aurora.clipboard.save` | Guardar clipboard | Bajo |
| `aurora.forms.inspect` | Inspeccionar formulario | Medio |
| `aurora.forms.fill` | Rellenar formulario | Medio |
| `aurora.meeting.capture` | Capturar reunión web | Bajo |
| `aurora.tabs.list` | Listar pestañas | Bajo |
| `aurora.tabs.archive` | Archivar pestañas | Medio |
| `aurora.price.watch` | Monitor de precios | Bajo |
| `aurora.price.scan` | Escanear precio actual | Bajo |

### Tools Especiales

| Tool | Endpoint | Descripción |
|------|----------|-------------|
| `browser_task` | `/tools/browser_task/run` | Pi → browser-use (un agente por usuario) |
| `browser_task_control` | `/tools/browser_task/control` | Pausa/reanuda/aborta browser_task |
| `browser_task_captura` | `/tools/browser_task/captura` | Capturas recientes de browser_task |
| `cloud_ask` | `/tools/cloud_ask/run` | Pi → LLM nube vía browser |
| `ocr` | `/tools/ocr` | OCR vía proceso dedicado pi |

---

## Configuración

### `config/server.toml`

```toml
[server]
host = "0.0.0.0"
port = 7779
reload = true

[db]
path_linux  = "/media/almacen/deml/Downloads/core_instruction/aurora/databases/aihub.db"
path_windows = "D:\\Downloads\\core_instruction\\aurora\\databases\\aihub.db"
```

### `config/llm.toml`

```toml
[pi]
engine = "pi"  # "pi" | "gemita" (default "pi")
bin_linux = "~/.bun/bin/pi"
bin_windows = "~/.bun/bin/pi.cmd"
runtime_linux = "bun"
runtime_windows = "bun.exe"
session_dir = "~/.pi/agent/sessions"
provider = "openai"  # Provider por defecto
model = ""  # Modelo por defecto (vacío = usar settings.json de pi)

[llama]
# [llama].base_url fue eliminado — no lo lee nadie
# Cada proveedor local tiene su propio endpoint fijo en src/llm/providers.py
```

### `config/nexus.toml`

```toml
[nexus]
workspace_roots = ["/home/deml/Downloads/core_instruction/aurora"]
destructive_patterns = ["rm", "dd", "mkfs", "shred", "del", "rd", "diskpart", "cipher", "sfc"]
block_patterns = ["format c:", "format d:"]
```

### `config/workspaces.toml`

```toml
[workspaces]
default = "aurora"
paths = { aurora = "/home/deml/Downloads/core_instruction/aurora" }
```

### `config/extensions.toml`

```toml
[extensions]
enabled = ["aihub", "homeaurora", "aurora-productivity", "ash", "bold", "browsernebula", "orion", "pcp4", "ytnoambient", "pi"]
```

### `config/mcp.toml`

```toml
[mcp]
enabled = false
servers = []
```

---

## Desarrollo

### Iniciar Aurora

```bash
# Servidor
cd /home/deml/Downloads/core_instruction/aurora
pip install -r requirements.txt
python -m src.main

# Frontend
http://localhost:7779/ui

# Extensiones (Chrome)
# 1. Abrir chrome://extensions/
# 2. Habilitar "Modo desarrollador"
# 3. "Cargar descomprimida" → extensions/aihub/
# 4. Repetir para otras extensiones
```

### Verificar estado

```bash
# Health endpoint
curl http://localhost:7779/health

# Ping
curl http://localhost:7779/ping

# DB integrity
sqlite3 databases/aihub.db "PRAGMA integrity_check;"

# Schema version
sqlite3 databases/aihub.db "SELECT * FROM schema_migrations ORDER BY version;"
```

### Tests

```bash
# Tests pi bridge
.venv-linux/bin/python3 tests/pi/test_bridge.py
.venv-linux/bin/python3 tests/pi/test_ocr.py
.venv-linux/bin/python3 tests/pi/test_error_proveedor_retry.py
.venv-linux/bin/python3 tests/pi/test_stats_y_compactacion.py

# Tool Forge (lifecycle y orquestación Cloud)
.venv-linux/bin/python3 tests/test_tool_forge.py
.venv-linux/bin/python3 tests/test_forge_build.py

# Verificar import limpio
python -c "from src.main import app; print('OK')"
```

### Estructura de módulos UI

**Patrón de módulo (aplica a TODOS):**
```
modules/X/
  view/     ← Componentes Preact — importan de scripts/ y components/
  scripts/  ← Lógica fetch /db/*, /nexus/*, signals locales — importan de components/
```

**Prohibido en modules/X/:**
- No `.styles/` — CSS via Twind en el componente
- No `manifest.js` — no hay registry en v2
- No `views.extension.sidepanel/` — no hay contexto de extensión
- No importar de `modules/Y/` (otro módulo) — pasar por `components/`

### Reglas de desarrollo

1. Un archivo = una responsabilidad (1NF)
2. `globalThis` solo para: preact, html, twind, signals — boot.js los inyecta
3. ES imports explícitos para toda lógica interna
4. Sin exports duplicados entre archivos (BCNF) — un lugar canónico por función
5. Sin dependencias transitivas en imports (3NF) — si A necesita C, importa C directo
6. Nuevo componente visual → `ui/components/` — nunca inline en un módulo
7. Componente compartible entre módulos → `ui/components/shared/`
8. Lógica Python → `src/nexus/`, `src/pi/`, `src/browser/`, `src/voz/`
9. CSS → Twind en el componente. `tokens.css` para variables. Sin archivos `.css` por módulo.
10. Datos → fetch `/db/*`. Shell/FS → fetch `/nexus/*`. LLM streaming → WebSocket `/lyra`.
11. Extensiones son thin clients: content.js + background.js + index.html con iframe. Sin UI propia.

---

## Notas Finales

### Correcciones a auditorías anteriores

- **`src/parser/`** → Borrado 2026-07-11 (código muerto)
- **`src/browser/`** → NO es esqueleto, es browser-use real funcionando
- **Spawn de pi** → Corregido en `proceso.py::_argv_default()` (cross-platform)
- **`gemita/`** → Borrado, reemplazado por `pi/`
- **`providers.py`** → Movido a `src/llm/` (usado por `/health` y `/tools`)

### Estado de implementación (2026-07-13)

```
FASE 1 — Cimientos          ✅ Completo
FASE 2 — Migración de datos ✅ Completo (chrome.storage → /db/ajustes)
FASE 3 — Migración de lógica ✅ Completo (14 módulos operan contra DB/nexus)
FASE 4 — Features nuevos    🔲 Parcial (Arena, MD Reader y más emisores bus)
FASE 5 — Producto           🔲 Pendiente (start.bat Windows, Aurora Pro, sync nube)
LAB CLOUD — Relay/tools     🟡 Gemini + ChatGPT verificados; más proveedores pendientes
LAB ARENA — Split/Duo       🟡 panel_send bidireccional + aislamiento físico verificados
SUPERIDEA 1 — Tool Forge    ✅ Pipeline completo; instalación siempre humana
SUPERIDEA 2 — AIHub actions 🟡 Bridge operativo en 5 vistas; catálogo total pendiente
```

### Roadmap próximo

1. **AIHub operativo** — catálogo/invocación auditada de acciones semánticas de vistas
2. **Chaos tests restantes de `panel_send`** — ping-pong, timeout, recarga y background
3. **Artefactos Cloud completos** — MD Reader, refresh y navegación
4. **Arena dentro de Lyra** — coordinación inicial de hasta cuatro agentes
5. **Browser/app bridge** — percepción semántica y acciones auditables
6. **Más emisores del bus `/eventos`** — chats, md_reader, eventos pi
7. **Más proveedores Cloud** — DeepSeek, GLM, Kimi/Z.ai y equivalentes
8. **start.bat + Windows / Aurora Pro** — cierre de producto

---

## 📚 Archivos de Ideas (Contexto para Codex)

Los archivos en `docs/ideas/` **NO son fuente de verdad** — son contexto detallado para Codex:

| Archivo | Propósito |
|---------|-----------|
| `aurora-v2-historico.md` | Arquitectura v2 (histórica) + **Principio de Normalización 1NF-6NF** (no en README) |
| `aurora-v3-audit.md` | Auditoría v3 — qué cambió de v2 a v3 |
| `aurora-ideas.md` | Ideas de extensiones y features futuras |
| `aurora-idea-mdreader.md` | Especificación detallada de MD Reader |
| `aurora-components-ui.md` | Catálogo de componentes UI |
| `database.md` | Especificación detallada de schema v8 |
| `nexus.md` | Especificación detallada de nexus |
| `browser-use.md` | Especificación detallada de browser-use |
| `cdp-testing.md` | Testing CDP |
| `compact.md` | Compaction de contexto |

**Regla:** Codex lee `README.md` para estado actual, y `docs/ideas/` para contexto detallado de features específicas.

---

*Este documento es la **fuente de verdad** de Aurora v3. Los archivos de `docs/ideas/` son contexto histórico y detallado, NO la fuente de verdad.*

*Documento actualizado 2026-07-13 — Cruzado con código real, pruebas CDP y estado actual.*
