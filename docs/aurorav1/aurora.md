# Aurora — Manifiesto del Sistema

> Última actualización: 2026-06-09

---

## Qué es Aurora

No es una extensión. Es un sistema de inteligencia personal.

```
EXTENSIÓN (UI)
      ↓
   NEXUS :7777 (Python — shell, filesystem, DB gateway)
      ↓
   SQLite (HDD NTFS compartido Linux↔Windows)
      ↓
   DATOS (el valor real)
```

---

## Ecosistema

| Componente | Tipo | Qué hace | Estado |
|---|---|---|---|
| **aaa/** | Engine + CLI | Motor Aurora + libs (Preact/HTM/Twind/Monaco) + tools de construcción | Activo |
| **au-aihub** | Sidepanel | Chat local, LLMs cloud, scratchpad, wiki, prompts, toolkit, WebNavigator | Activo |
| **au-ash** | Sidepanel | Ejecutor de bloques `@@` — puente browser↔Nexus | Activo |
| **au-bold** | Popup | Negrita biónica, modo túnel, blur periférico | Activo |
| **au-browsernebula** | Sidepanel | Control de browser + captura + YouTube | Activo |
| **au-orion** | Background | Parser central de bloques `@@` | Activo |
| **au-pcp4** | Popup | Captura YouTube — transcripciones, metadata, comentarios | Activo |
| **au-rtxnvidia** | Desktop | Video, encoding, modelos RTX | En desarrollo |
| **au-ytnoambient** | Content script | Desactiva ambient mode YouTube | Activo |
| **Nexus** (`nexus.py`) | Servidor :7777 | Shell, filesystem, aprobaciones, multi-workspace | Activo |
| **Gemita** (`gemita.py`) | Servidor :7778 | LLM local streaming via WebSocket → Ollama | Activo |

---

## Stack

**Frontend:** Preact + HTM + Twind — sin build step, sin bundler, sin JSX. Corre directo en browser.

**Engine** (`aaa/aurora.js`): store Redux (`getState/dispatch/subscribe`), router de vistas, sistema de módulos. Estado vive en RAM — persiste solo lo registrado en `session.keys`.

**Backend:** Python 3, SQLite, Ollama (:8088)

**Comunicación:**
- `courier` — abstrae Chrome APIs + Nexus + clipboard
- `fetch localhost:7777` — Nexus
- WebSocket `localhost:7778` — Gemita streaming
- CDP — control del browser (BraveTools dev)

---

## aaa/ — CLI Tools

`aaa.config.js` = fuente de verdad. Todas las tools lo leen.

| Tool | Qué hace |
|---|---|
| `gn.mjs` | Crea módulo/vista/contenedor |
| `rm.mjs` | Elimina módulo/vista |
| `upd.mjs` | Actualiza módulo/vista/extensión |
| `build-extension.mjs` | Build completo (copia aaa/ → au-{id}/) |
| `build-desktop.mjs` | Build app desktop |
| `sync-extension.mjs` | Sincroniza manifests |
| `audit.mjs` | Auditoría de estructura |
| `doctor.mjs` | Diagnóstico de módulos |
| `gen-globals.mjs` | Genera globals.js |
| `module-compiler.mjs` | Compilador interno |

---

## Módulos de au-aihub

| Vista | Qué hace |
|---|---|
| **Local** | Chat con modelos locales via Gemita/Ollama |
| **LLMCloud** | ChatGPT, Gemini, Claude, Grok en Single/Split/Arena |
| **Scratchpad** | Notas con bloques (texto, código, imagen, tabla, kanban) |
| **Wiki** | Archivos .md en filesystem Nexus |
| **Prompts** | Biblioteca de prompts guardados |
| **WebNavigator** | Control del browser con AI |
| **Toolkit** | Procesamiento rápido de texto |
| **Chain** | Cadena de LLMs secuencial |
| **DetectiveTokens** | Análisis de tokens |
| **Editor** | Editor de código/prompts |
| **Ajustes** | Config del sistema |

---

## Airbag — Por Qué Funciona

El manifest describe cada módulo desde afuera. Aurora registra, no importa directamente:

```js
// Sin manifest — si falla, todo cae:
import { Local } from './Local/...'

// Con manifest — si falla, solo ese módulo:
registry.register('Local', manifest)
```

Si un módulo explota → solo pierde su vista. Los demás siguen.

**Por qué se rompió:** módulos empezaron a depender entre sí directamente, saltando el store.

**Con DB se resuelve:** módulos no dependen entre sí — dependen de la DB. Manifest + DB = airbag real.

---

## Base de Datos

> Schema completo, migración, endpoints y roadmap → **[database.md](database.md)**

Resumen: SQLite en HDD NTFS compartido Linux↔Windows. Acceso exclusivo via Aurora Server `/db/*`. Reemplaza chrome.storage + localStorage completamente.

---

## Auditoría de Archivos

> Sin leer el código no se sabe qué guardar. Esta sección registra qué se revisó.

✅ Revisado | 🔑 Impacta DB | ⬜ Sin revisar

### LLMCloud

| Archivo | Estado | Hallazgo |
|---|---|---|
| `iframe-history.js` | ✅ 🔑 | Key `aurora:iframeHistory`. Guarda última URL por `slot:aiId`. Filtra paths genéricos (`/`). → `llm_iframe_history` |
| `iframe-adapter-store.js` | ✅ 🔑 | Key `aurora_iframe_adapters_v1`. Adapters DOM por dominio. Soporta legacy key. → `llm_adapters` |
| `iframe-pool.js` | ✅ 🔑 | Pool de iframes en memoria por slot. Al montar llama `IframeLoader.loadWithHistory`. Graveyard oculto para no destruir iframes al cambiar vista. |
| `iframe-loader.js` | ✅ | Solo lee `IframeHistory.getAsync`. Sin escritura. Sin impacto en DB. |
| `llm-data.js` | ✅ | Helpers para leer LLMs del store. Sin persistencia. |
| `llm-capture.js` | ✅ | Captura texto/screenshot al portapapeles. Sin persistencia. |
| `llmcloud-duo.js` | ✅ | Loop conversacional P1↔P2. Solo RAM. |
| `llmcloud.js` (view) | ✅ | Monta modos con IframePool. Sin persistencia. |

### Local (Chat)

| Archivo | Estado | Hallazgo |
|---|---|---|
| `chat-historial-conversaciones.js` | ✅ 🔑 | Key `llama_chats` localStorage. Máx 60. `{id, nombre, modelo, mensajes[], updatedAt, createdAt}`. → `chats` + `mensajes` |
| `chat-parametros.js` | ✅ 🔑 | Key `llama_params` localStorage. `{temperature, top_p, top_k, seed, num_ctx}`. → columnas en `chats` |
| `chat-instrucciones-sistema.js` | ✅ 🔑 | Key `llama_instruccion` localStorage. System prompt personalizable. → `chats.instruccion` |
| `chat-condensar-memoria.js` | ✅ 🔑 | Sin storage directo. Al 68% ctx → Gemita condensa → reemplaza historial. Rota archivos en `memory/sessions/` via Nexus (máx 20). |
| `chat-vision-imagenes.js` | ✅ | Solo RAM (`pendingImage`, `pendingImageDataUrl`). Máx 5MB. Se limpia al enviar. Sin impacto DB. |
| `chat-wiki-contexto.js` | ✅ | Lee `LLM Wiki/wiki/` de Nexus. Límites: index 1500 chars, página 1800 chars, máx 2 páginas. Sin escritura. |
| `cloudasbackend.js` | ✅ | Menú contextual para seleccionar AI cloud. Sin persistencia propia. |
| `local.js` (view) | ✅ | Vista principal. Sin persistencia directa. |

### Prompts

| Archivo | Estado | Hallazgo |
|---|---|---|
| `guardar.js` | ✅ 🔑 | Key `aihub_prompts` chrome.storage. `{id, name, content, category, tags[], targetAI, usos, createdAt}`. → `prompts` |
| `guardados.js` | ✅ 🔑 | Key `aihub_prompts_guardados` chrome.storage. Máx 200. Tipos equipo/comfyui/wan con meta JSON. → `prompts` (tipo=output) |
| `historial.js` | ✅ 🔑 | Key `aihub_prompts_historial` chrome.storage. Máx 50. → `prompts_historial` |
| `favoritos.js` | ✅ 🔑 | Key `aihub_prompts_favs` chrome.storage. Array de IDs. → columna `favorito` en `prompts` |

### Ajustes

| Archivo | Estado | Hallazgo |
|---|---|---|
| `llm-guardar.js` | ✅ 🔑 | CRUD LLMs custom. Detecta favicon/título. → `llms` |
| `storage-sync.js` | ✅ 🔑 | `loadFromStorage` / `saveToStorage`. Keys: `prompts, customLLMs, scratchpad, scratchpadDoc, theme, background, single, split, arena, lastView, nexus, notas, chain, local, wiki, promptsUI, llmModal, detectiveTokens, ajustesUI`. → todo a `ajustes` |
| `storage-guardar.js` | ✅ | Export/import JSON manual. Sin persistencia automática. |
| `nexus-workspace.js` | ✅ 🔑 | Inicializa dirs Nexus (`memory/`, `LLM Wiki/`, etc.). Guarda `workspaceRoot` + `recentWorkspaces` (máx 5). → `usuarios.workspace_root` + `ajustes` |

### Stats

| Archivo | Estado | Hallazgo |
|---|---|---|
| `stats-calcular.js` | ✅ 🔑 | Solo lectura. Keys: `llama_chats`, `prompts`, `notas_contenido`, `nexus_workspaceRoot`, `gemita_session_start`. Con DB → SQL puro reemplaza todo. |

### WebNavigator

| Archivo | Estado | Hallazgo |
|---|---|---|
| `web-navigator.js` | ✅ 🔑 | Log RAM máx 40. Capturas de inspección en memoria. Scoring de botones, cascada de resolución (placeholder → selector → testid → aria → text → index). → `nav_log` + `nav_capturas` |

### Wiki

| Archivo | Estado | Hallazgo |
|---|---|---|
| `wiki-nexus-fs.js` | ✅ 🔑 | I/O via Nexus REST: list/read/write/delete/mkdir/move. Path: `{workspaceRoot}/LLM Wiki/{subfolder}/`. Filesystem puro. → archivos en disco, `wiki_indice` solo para RAG |

### Scratchpad

| Archivo | Estado | Hallazgo |
|---|---|---|
| `acciones.js` | ✅ 🔑 | Autosave a `wiki/` via Nexus cada 1.5s. Persiste doc en store (`SET_SCRATCHPAD_DOC`). Exporta a `.md`. |

### Infraestructura

| Archivo | Estado | Hallazgo |
|---|---|---|
| `bridge.js` (aurora/) | ✅ 🔑 | Define `session.keys`: `llmcloud, single, split, arena, local, prompts, scratchpad, chain, webnavigator`, etc. — qué persiste al cerrar panel. |
| `iframe-adapter-store.js` | ✅ 🔑 | Ver LLMCloud. |

---

## Código Fuente — au-aihub

> Rutas relativas a `au-aihub/modules/aihub/views.extension.sidepanel/<Módulo>/`

### Ajustes

```
manifest.js                              — registro del módulo, deps, session.keys
Ajustes.nexus.bridge.py                  — LEGACY: registraba endpoints en Nexus v1
Ajustes.nexus/nexus-config.py            — lee/escribe config de puertos y seguridad
Ajustes.nexus/nexus-ejecutar.py          — HTTP server legacy: /status /execute /fs/*
Ajustes.nexus/nexus-promote.py           — promueve tab a ventana principal via Node
Ajustes.scripts/cambiar-tema.js          — aplica tema claro/oscuro al DOM
Ajustes.scripts/llm-formulario.js        — formulario de agregar/editar LLM custom
Ajustes.scripts/llm-guardar.js           — CRUD LLMs custom → chrome.storage customLLMs
Ajustes.scripts/markdown-render.js       — convierte markdown a HTML + syntax highlight
Ajustes.scripts/nexus-ejecutar-herramientas.js — carga herramientas de Nexus vía /tools
Ajustes.scripts/nexus-workspace.js       — inicializa dirs workspace (memory/, LLM Wiki/), guarda recentWorkspaces
Ajustes.scripts/storage-guardar.js       — export/import JSON manual del store
Ajustes.scripts/storage-sync.js          — loadFromStorage / saveToStorage para todas las keys de chrome.storage
Ajustes.scripts/utilidades-basicas.js    — helpers DOM: sanitize, estimateTokens, debounce
Ajustes.styles/ajustes.css               — estilos del panel de ajustes
Ajustes.view/ajustes.js                  — componente Preact principal de Ajustes
Ajustes.view/render.js                   — punto de montaje del módulo
```

### Chain

```
manifest.js                              — registro del módulo
Chain.scripts/flujo.js                   — orquesta flujo 3 AIs en cadena, navega a vista correcta
Chain.styles/chain.css                   — estilos del panel
Chain.view/chain.js                      — componente Preact: selector de AIs, estado del chain, botón Iniciar
Chain.view/render.js                     — punto de montaje
```

### CurrentView

```
manifest.js                              — registro del módulo
CurrentView.scripts/currentview.js       — efectos puros (placeholder, template vacío)
CurrentView.styles/currentview.css       — estilos
CurrentView.view/currentview.js          — componente Preact de la vista activa
CurrentView.view/render.js               — punto de montaje
```

### DetectiveTokens

```
manifest.js                              — registro del módulo
DetectiveTokens.scripts/analizar.js      — estimación de tokens (heurística ~4 chars/token), breakdown por sección
DetectiveTokens.styles/detectivetokens.css — estilos
DetectiveTokens.view/detectivetokens.js  — componente Preact: textarea + contador en tiempo real
DetectiveTokens.view/render.js           — punto de montaje
```

### Editor

```
manifest.js                              — registro del módulo
Editor.nexus.bridge.py                   — registra endpoints de Editor en Nexus
Editor.nexus/nexus-editor.py             — ejecuta py/js/sh/ts/json y retorna stdout/stderr + duración
Editor.scripts/editor.js                 — árbol de archivos Nexus + Monaco + output/preview en vivo
Editor.styles/editor.css                 — estilos del editor de código
Editor.view/editor.js                    — componente Preact: layout árbol↔editor↔output
Editor.view/render.js                    — punto de montaje
```

### Inicio

```
manifest.js                              — registro del módulo
Inicio.foot/shell-actions.js             — inject AURORA_INJECT_PROTOCOL a todos los iframes LLM activos
Inicio.foot/shell-nexus-init.js          — ping Nexus /ping cada 30s → despacha estado al store
Inicio.foot/shell-protocol-listener.js   — escucha PROTOCOL_RUN desde iframes LLM cloud → ejecuta bloques @@
Inicio.scripts/shortcuts.js             — atajos de teclado globales (Ctrl+Shift+N = toggle scratchpad)
Inicio.styles/inicio.css                 — estilos del dashboard
Inicio.view/inicio.js                    — dashboard: stats sistema, workspace, LLMs disponibles, acciones rápidas
Inicio.view/render.js                    — punto de montaje
```

### LLMCloud

```
manifest.js                              — registro del módulo
LLMCloud.foot/foot-component.js          — componente footer: config modal del Duo (P1↔P2 loop)
LLMCloud.foot/render.js                  — monta footer con foot-component
LLMCloud.scripts/llm-capture.js          — captura texto/screenshot del LLM al portapapeles
LLMCloud.scripts/llmcloud-duo.js         — loop conversacional P1↔P2 solo RAM
LLMCloud.scripts/llm-data.js             — helpers de lectura: LLMs del store, nombre/icono/url
LLMCloud.scripts/protocol-relay-init.js  — inicializa gemita-relay + protocol-listener al arrancar
LLMCloud.scripts/split-chat.js           — input unificado para Split/Arena: panel flotante, mapeo de panes
LLMCloud.view/llmcloud.js               — vista principal: Single/Split/Arena con IframePool
LLMCloud.view/render.js                  — punto de montaje
```

### Local (módulo más grande — chat local con Ollama/Gemita)

**Backend Python (Local.gemita/)**

```
gemita-websocket-servidor.py             — WS server :7778, sesiones, dispatcher de mensajes
gemita-bucle-llama.py                    — bucle de inferencia: envía a Ollama, streaming de tokens
gemita-config.py                         — parámetros del servidor (host, port, modelos)
gemita-herramientas-browser.py           — tools Python: control de browser (tabs, DOM, nav)
gemita-herramientas-python.py            — tools Python: eval Python en sandbox, read/write archivos
gemita-inspector.py                      — inspecciona DOM y extrae elementos de páginas
gemita-roles.py                          — roles/personas del asistente (system prompts predefinidos)
gemita-shell-bash.py                     — ejecuta comandos bash, retorna stdout/stderr
gemita-tool-protocol.py                  — protocolo de tool_calls: deserializa y despacha
herramientas-definiciones.py             — schemas JSON de todas las herramientas (function-calling)
herramientas-hub-delegacion.py           — delega tools hub_action al AI Hub por postMessage
herramientas-python-ejecutar.py          — ejecuta código Python arbitrario en sandbox aislado
```

**Scripts — chat/**

```
Local.scripts/chat/chat-acciones-rapidas.js      — chips en mensajes: copiar, notas, reformular, enviar a AI, TTS
Local.scripts/chat/chat-actividad.js             — ring buffer 24 entradas de ejecuciones de tools
Local.scripts/chat/chat-condensar-memoria.js     — al 68% ctx → condensa historial via Gemita, rota memory/sessions/ (máx 20)
Local.scripts/chat/chat-contexto-workspace.js    — inyecta memoria + archivos + perfil del workspace en system prompt
Local.scripts/chat/chat-exportar-pdf.js          — exporta conversación a PDF via window.print() + CSS impresión
Local.scripts/chat/chat-historial-conversaciones.js — CRUD historial; key llama_chats localStorage, máx 60 chats
Local.scripts/chat/chat-instrucciones-sistema.js — system prompt configurable; key llama_instruccion localStorage
Local.scripts/chat/chat-limpiar.js               — limpia historial en RAM + toast
Local.scripts/chat/chat-mensajes-renderizar.js   — markdown → HTML, scroll, eventos de código
Local.scripts/chat/chat-parametros.js            — parámetros Ollama (temp, top_p, top_k, seed, ctx); key llama_params
Local.scripts/chat/chat-typewriter.js            — efecto de escritura progresiva durante streaming (8ms/char)
Local.scripts/chat/chat-vision-imagenes.js       — imagen pendiente en RAM, máx 5MB, limpia al enviar
Local.scripts/chat/chat-voz.js                   — STT via Nexus /stt + TTS nativo Web Speech API
Local.scripts/chat/chat-wiki-contexto.js         — lee LLM Wiki/wiki/ de Nexus; límite index 1500 chars, página 1800
```

**Scripts — gemita/**

```
Local.scripts/gemita/gemita-enviar-mensaje.js    — único camino de chat; envía a Gemita WS, streaming token a token
Local.scripts/gemita/gemita-websocket.js         — conexión persistente ws://localhost:7778, reconexión automática
```

**Scripts — llama/**

```
Local.scripts/llama/llama-conectar.js            — ping, listModels, chatStream con abort, pullModel con progreso
```

**Scripts — modloader-iframe/**

```
Local.scripts/modloader-iframe/bridge-iframe.js          — escucha GEMITA_ASK, orquesta, responde GEMITA_ANSWER
Local.scripts/modloader-iframe/gemita-relay.js           — adaptador AI Hub sobre courier.iframe, handshake y timeouts
Local.scripts/modloader-iframe/iframe-mapeador.js        — mapeo manual + auto de input/send/output dentro del iframe
Local.scripts/modloader-iframe/iframe-mapeador-store.js  — guarda adapter mapeado en AuroraAdapterStore
Local.scripts/modloader-iframe/iframe-orquestador-estados.js — estado de flujo de inferencia, espera robusta del assistant
Local.scripts/modloader-iframe/iframe-protocol-injector.js — inyecta instrucciones del protocolo @@ en LLM cloud
Local.scripts/modloader-iframe/iframe-protocol-observer.js  — observa respuestas del LLM y extrae bloques @@
Local.scripts/modloader-iframe/inject-send-ai.js         — orquesta inyección de texto y envío
Local.scripts/modloader-iframe/input-ai.js               — detecta input del LLM (contenteditable/input/textarea)
Local.scripts/modloader-iframe/mods=iframes.js           — aplica mods visuales a los iframes (negrita bionica, etc.)
Local.scripts/modloader-iframe/adapter/                  — 9 archivos: schema, defaults, resolver, store, actions, bundle, ready, runtime, selector
```

**Scripts — protocol/**

```
Local.scripts/protocol/parser.js         — extrae bloques @@tag:hash del texto crudo (streaming-safe)
Local.scripts/protocol/registry.js       — registro de plugins de protocolo
Local.scripts/protocol/ProtocolMessage.js — renderiza resultado de bloque en el chat
Local.scripts/protocol/ProtocolPanel.js  — panel lateral con historial de ejecuciones
Local.scripts/protocol/plugins/          — plugins: boton.js, browser.js, message.js, nexus.js
```

**Scripts — tools/**

```
Local.scripts/tools/tools-definiciones.js         — schema function-calling de todas las tools (hub_action, navigate, etc.)
Local.scripts/tools/tools-ejecutar-despachador.js — punto de entrada único: delega a hub-y-utils, navegador, notas, nexus, sandbox
Local.scripts/tools/tools-registro.js             — registra tools activas según configuración
Local.scripts/tools/tools-renderizar.js            — render de tool_calls en el chat
Local.scripts/tools/tools-sandbox.js              — ejecuta custom tools en sandbox aislado
Local.scripts/tools/agente-navegador.js            — agente autónomo de navegación
Local.scripts/tools/chat-toolbar.js               — toolbar con acciones del chat
Local.scripts/tools/mapeador-doms.js               — mapea elementos del DOM de la página activa
Local.scripts/tools/tools-contrato-agentico.js    — contrato/API para tools agénticas
Local.scripts/tools/web-navigator-tools.js        — tools que delegan a WebNavigator
```

**Scripts — local-features/**

```
Local.scripts/local-features/tools-ejecutar-hub-y-utils.js    — hub_action, get_state, set_tab, utilidades
Local.scripts/local-features/tools-ejecutar-navegador.js      — get_active_tab, click, fill, navigate, inspect, screenshot
Local.scripts/local-features/tools-ejecutar-notas-y-memoria.js — read/write scratchpad, memoria, profile
Local.scripts/local-features/tools-ejecutar-autoprogramacion.js — ejecuta código generado por el LLM via Nexus
```

**Scripts — node-anchors/**

```
Local.scripts/node-anchors/node-anchors-store.js  — toggle/add/remove anclas de nodos en el store
Local.scripts/node-anchors/node-anchors-fill.js   — rellena anclas desde DOM
Local.scripts/node-anchors/node-anchors-overlay.js — overlay visual de anclas
```

**Estilos / Vistas**

```
Local.styles/local.css                   — estilos base del chat
Local.styles/local.messages.css          — estilos de mensajes user/assistant
Local.styles/local.tools.css             — estilos de tool_calls y resultados
Local.styles/local.panels.css            — layout de paneles laterales
Local.styles/local.canvas.css            — canvas/preview para imágenes
Local.styles/local.composer-cloud.css   — estilos del input cloud-as-backend
Local.styles/local.responsive.css        — breakpoints responsive
Local.view/local.js                      — componente Preact principal: chat + parámetros + historial
Local.view/tools.js                      — componente de tools en la vista
Local.view/render.js                     — punto de montaje
```

### Prompts

```
manifest.js                              — registro del módulo
PROMPT_PARA_AI_PRESETS.md               — doc interno de presets de prompts de sistema
Prompts.scripts/general/guardar.js       — CRUD prompts manuales; key aihub_prompts chrome.storage
Prompts.scripts/general/guardados.js     — prompts output guardados (máx 200); key aihub_prompts_guardados
Prompts.scripts/general/historial.js     — historial de uso (máx 50); key aihub_prompts_historial
Prompts.scripts/general/favoritos.js     — toggle favorito; key aihub_prompts_favs
Prompts.scripts/general/filtros.js       — filtros por categoría/tag/tipo
Prompts.scripts/general/templates.js     — carga templates JSON de la carpeta templates/
Prompts.scripts/general/variables-detectar.js — detecta variables {{nombre}} en prompts
Prompts.scripts/general/enviar-a-ai.js  — envía prompt al AI seleccionado (local/cloud)
Prompts.scripts/prompts.js               — lógica principal de la vista
Prompts.styles/general/prompts.css       — estilos de la biblioteca
Prompts.styles/general/prompts-ui.css   — estilos del modal de edición
Prompts.view/general/prompts.js          — lista de prompts con filtros y acciones
Prompts.view/general/prompts-ui.js       — modal editor de prompt
Prompts.view/render.js                   — punto de montaje
templates/comfyui-chips.tmpl.json        — chips de parámetros ComfyUI
templates/conceptos-creatividad.tmpl.json — conceptos creatividad para imagen
templates/prompts-imagen.tmpl.json       — prompts de imagen (Flux, SD, etc.)
templates/prompts-sistema.tmpl.json      — system prompts predefinidos
templates/prompts-wan.tmpl.json          — prompts Wan (video)
templates/wan-video.tmpl.json            — configuraciones de video Wan
templates/roles-equipo.tmpl.json         — roles de equipo predefinidos
templates/equipos/_index.json            — índice de templates de equipos
templates/equipos/desarrollo.empresa.json   — equipo de desarrollo
templates/equipos/gamedev.empresa.json      — equipo de gamedev
templates/equipos/investigacion.empresa.json — equipo de investigación
templates/equipos/marketing.empresa.json    — equipo de marketing
templates/equipos/narrativa.empresa.json    — equipo de narrativa
```

### Scratchpad

```
manifest.js                              — registro del módulo
Scratchpad.scripts/acciones.js           — autosave a wiki/ via Nexus cada 1.5s, exporta .md, SET_SCRATCHPAD_DOC
Scratchpad.styles/scratchpad.css         — estilos del editor de notas
Scratchpad.view/scratchpad.js            — componente Preact: bloques (texto/código/imagen/tabla/kanban)
Scratchpad.view/render.js                — punto de montaje
```

### Stats

```
manifest.js                              — registro del módulo
Stats.scripts/stats-calcular.js          — lectura de: llama_chats, prompts, notas_contenido, nexus_workspaceRoot, gemita_session_start → métricas calculadas en JS
Stats.styles/stats.css                   — estilos del panel de estadísticas
Stats.view/stats.js                      — componente Preact: gráficas y resúmenes de uso
Stats.view/render.js                     — punto de montaje
```

### StyleCatalog

```
manifest.js                              — registro del módulo
StyleCatalog.scripts/stylecatalog.js     — efectos puros del catálogo (placeholder, template vacío)
StyleCatalog.styles/stylecatalog.css     — estilos del catálogo
StyleCatalog.view/stylecatalog.js        — componente Preact: galería de componentes Twind
StyleCatalog.view/render.js              — punto de montaje
```

### Toolkit

```
manifest.js                              — registro del módulo
Toolkit.scripts/toolkit-gemita.js        — conexión WS independiente a Gemita; ejecuta prompts de herramientas sin historial
Toolkit.scripts/toolkit-herramientas.js  — definiciones estáticas de herramientas de texto (resumir, traducir, etc.)
Toolkit.styles/toolkit.css               — estilos del panel
Toolkit.view/toolkit.js                  — componente Preact: input + selector de herramienta + output
Toolkit.view/render.js                   — punto de montaje
```

### WebNavigator

```
CLAUDE.md                                — instrucciones internas del módulo (lecciones de resolución de elementos)
manifest.js                              — registro del módulo
WebNavigator.nexus.bridge.py             — expone endpoints de navegación (/browser/*) via Playwright
WebNavigator.nexus/browser-agent.py      — agente Playwright: navega, inspecciona, interactúa autónomamente
WebNavigator.styles/general.css          — estilos del panel de navegación
WebNavigator.view/web-navigator.js       — log RAM máx 40, cascada resolución: placeholder→selector→testid→aria→text→index
WebNavigator.view/render.js              — punto de montaje
```

### Wiki

```
manifest.js                              — registro del módulo
Wiki.nexus.bridge.py                     — registra endpoints /fs/* y /workspaces en Nexus
Wiki.nexus/nexus-workspace.py            — operaciones fs con seguridad path-traversal; WORKSPACES_BASE configurable
Wiki.scripts/wiki-nexus-fs.js            — I/O via Nexus REST: list/read/write/delete/mkdir/move
Wiki.scripts/wiki.js                     — lógica principal: navegación de árbol, búsqueda, favoritos
Wiki.scripts/wiki-borrar-archivo.js      — borra archivo o directorio via Nexus
Wiki.scripts/wiki-crear-archivo.js       — crea archivo nuevo via Nexus
Wiki.scripts/wiki-guardar-archivo.js     — guarda contenido de archivo abierto
Wiki.scripts/wiki-renombrar-archivo.js   — renombra/mueve archivo via Nexus
Wiki.styles/wiki.css                     — estilos del explorador de archivos
Wiki.view/wiki.js                        — componente Preact: árbol + editor + preview
Wiki.view/render.js                      — punto de montaje
```

---

## Código Fuente — otras extensiones

> Rutas relativas a la raíz de cada extensión. Solo archivos editables (no aurora/, cloud/, generated/).

### au-ash

Ejecutor de bloques `@@` para LLMs cloud (ChatGPT, Gemini, Claude). Autoloop Nexus, control de browser, panel lateral con proyectos.

```
manifest.json                        — MV3; content scripts, permisos, background worker
config.json                          — comandos permitidos por Nexus y directorios root
nexus.py                             — HTTP bridge :7777; endpoint unificado para CLI/shell
background.js                        — Service Worker; downloads, notificaciones, inyección de content scripts
content.js                           — Content script sensor; responde mensajes Chrome para extracción DOM
boot.js                              — Bootstrap sidepanel; monta Aurora UI con temas y fondos
popup-boot.js                        — Bootstrap popup; bridge inline sin tabs de settings
popup.html / popup.js                — UI popup entry point
index.html                           — UI sidepanel entry point
ash_main.js                          — Coordinador central; inicializa módulos, carga temas, inyecta CSS
ash_detection.js                     — Funciones puras: detecta bloques @@, clasifica código, encuentra Nexus
ash_injector.js                      — Inyecta botones en bloques de código; dropdown, detección de lenguaje
ash_projects.js                      — Gestión de proyectos activos; persistencia en sessionStorage
ash_prompt_capture.js                — Captura prompts del usuario (ChatGPT, Gemini, Claude, Grok)
ash_executor.js                      — Ejecuta JS en sandbox iframe; captura output con timeout
ash_ollama.js                        — Integración Ollama para análisis de código y detección de errores
ash_runtime_state.js                 — Estado runtime: autoloop, queue, policy, eventos internos
ash_context.js                       — Gestión de contexto para Ollama; contexto compacto <1000 tokens

src/main/observer.js                 — DOM watcher: detecta texto nuevo del assistant, dispara dispatcher
src/main/dispatcher.js               — Parsea bloques @@, enruta a Orion o ejecutores locales
src/main/executors.js                — Runner normalizado para target=nexus/browser/local-dom
src/main/orion_client.js             — Cliente chrome.messaging a au-orion para parseo de bloques
src/main/sender.js                   — Envía resultados a chat; dedup por block ID, tracking sessionStorage
src/main/result-blocks.js            — Formatea Result Block v1; sink estructurado de resultados
src/main/index.js                    — Init y export del módulo principal

src/executors/nexus.js               — Ejecutor nexus: run-cli, routing de workspaces
src/executors/nx.js                  — Ejecutor bash: normalización via Nexus
src/executors/nxw.js                 — Ejecutor PowerShell: normalización via Nexus
src/executors/br.js                  — Ejecutor browser: launch, navigate, screenshot, click, fill
src/executors/pg.js                  — Ejecutor local-dom: viewport, elementos interactivos, extracción de texto
src/executors/README.md              — Documentación de arquitectura de ejecutores
src/config/orion.js                  — Config integración Orion: extension ID, URL, feature flags

src/modules/ash_processor.js         — Motor de procesamiento: parsea estructuras archivo/carpeta, descarga/guarda
src/modules/ash_ui.js                — Editor flotante modal para modificar código

modules/ash/manifest.js              — Módulo ASH: vistas Inicio + BrowserCabin
modules/ash/skin/ash.css             — Estilos específicos del módulo
modules/ash/views.extension.sidepanel/Inicio/Inicio.view/render.js      — Tab home: runtime state, eventos, errores
modules/ash/views.extension.sidepanel/BrowserCabin/BrowserCabin.view/render.js — Control de browser: mapa de elementos, acciones
modules/ash-popup/manifest.js        — Módulo popup ASH
modules/ash-popup/views.extension.popup/Dashboard/Dashboard.view/render.js — Dashboard del popup

ui/                                  — Design system completo (ver sección au-ash UI abajo)
bc_rules.json                        — Reglas de filtrado/routing de Browser Cabin
sandbox/                             — Directorio de trabajo para archivos ejecutados por Nexus
```

**au-ash UI** (components, themes, backgrounds, HUD — mismo sistema que au-aihub):
```
ui/components/                       — Button, ChatMessage, Chip, Dropup, Empty, IframeContainer, Input,
                                       List, LLMPicker, NavExtra, Panel, scratchpad/, StatusBar, TabPicker, Toolbar
ui/themes/manager.js                 — Aplica tema inyectando CSS variables
ui/themes/backgrounds/               — 25 fondos animados: Aurora, Nebula, Matrix, Rain, Sakura, Lava, Grid, etc.
ui/themes/hud/                       — 9 overlays HUD: Candles, Circuit, Compass, Drip, Ember, Luna, PulseRings, Runes, Scanlines
ui/inject/                           — CSS inyectable en páginas: buttons, dropdown, modal, panel, tokens
ui/globals/                          — reset.css, keyframes.css, scrollbars.css, shell-layout.css
```

---

### au-bold

Mejora de lectura: negrita biológica (bionic reading), modo túnel, blur periférico, scroll ajustable, HUD overlay.

```
manifest.json                        — MV3; content script global, popup, permisos wildcard
background.js                        — Service Worker stub (generado por Aurora)
content.js                           — Inyecta UI de foco, state manager, handlers para highlight/blur/scroll
index.html                           — Entry point del popup
```

---

### au-browsernebula

Browser control + captura de páginas. Combina Browser Cabin (automatización DOM/tabs) y Page Capture Pro (extracción transcripciones YouTube).

```
manifest.json                        — MV3; content script YouTube, permisos
boot.js                              — Bootstrap sidepanel; monta Aurora con temas/fondos/HUDs
popup-boot.js                        — Bootstrap popup; solo módulo PopupMain, sin settings/browsernebula
background.js                        — Service Worker: motor Browser Cabin + extracción YouTube
content.js                           — Content script YouTube: mapea DOM, extrae transcripciones (ytInitialPlayerResponse → captions API; fallback DOM)
package.json                         — Metadata

modules/browsernebula/manifest.js    — Módulo principal; renderMode=tab; perfil experimental
modules/browsernebula/views.extension.sidepanel/BrowserCabin/BrowserCabin.view/render.js — Interfaz control browser; acciones via chrome.runtime.sendMessage
modules/browsernebula/views.extension.sidepanel/Capture/Capture.view/render.js — UI captura: modo normal/YouTube, info video, transcripción, historial, preview
modules/browsernebula/views.extension.sidepanel/Nebula/Nebula.view/render.js   — Status placeholder "BrowserNebula ready"

modules/browsernebula-popup/manifest.js — Módulo popup; renderMode=single; solo PopupMain
modules/browsernebula-popup/views.extension.popup/PopupMain/PopupMain.view/render.js — UI popup: misma lógica de captura que sidepanel

modules/settings/manifest.js         — Módulo settings: selector tema/fondo/HUD, iframe history/restore, shell actions
modules/settings/views/config/config.view/render.js     — Picker de 7 categorías estéticas (Cosmic, Cyberpunk, Gothic, Abysmal, Infernal, Sakura, Arctic)
modules/settings/views/config/config.foot/shell-actions.js — Acciones globales: abrir en tab, ventana flotante (courier.browser)
modules/settings/views/config/config.foot/CaptureDropup.js — Dropup opciones YouTube: transcript con/sin timestamps, markdown, full page, comments, details
modules/settings/views/iframes/iframes.view/render.js   — Visor historial iframes; carga/muestra URLs con restore
modules/settings/views/iframes/iframes.scripts/iframe-history.js   — Tracker persistente URL/estado por slot
modules/settings/views/iframes/iframes.scripts/iframe-loader.js    — Loader dinámico de iframes con manejo async
modules/settings/views/iframes/iframes.scripts/iframe-pool.js      — Pool/reuso de iframes
modules/settings/views/iframes/iframes.scripts/iframe-probe-guard.js — Guard de seguridad para probing de iframes

ui/                                  — Design system completo: 30 componentes, 20+ backgrounds, 12 HUD
```

---

### au-orion

Parser y normalizador central para el ecosistema Aurora. Parsea y valida bloques `@@nx`, `@@nxw`, `@@nexus`, `@@br`, `@@pg` del chat. **Solo parsing** — recibe mensajes externos, devuelve JSON normalizado, no ejecuta.

```
manifest.json                        — MV3; externally_connectable: ChatGPT, Gemini, Claude, DeepAI, HuggingFace
background.js                        — Service Worker; dispatcher central; onMessageExternal → parsers → valida → JSON
index.js                             — Bridge ES Modules que exporta funciones de parseo al background worker

src/index.js                         — API pública: orionParse(text, context) → [NormalizedBlock]
src/normalizer.js                    — Raw block → schemaVersion 1 JSON; agrega id, source, app, action, target, capability, raw
src/validator.js                     — Validación mínima de contrato: campos requeridos (id, schemaVersion, source, app, action, target, capability, raw)
src/hash.js                          — FNV-1a hash para IDs estables de bloques (formato: orion_<hex>)

src/parser/nexus.js                  — Parser @@nexus multilínea; @@end unificado; preserva cuerpo con formato
src/parser/nx.js                     — Parser @@nx (bash) y @@nxw (PowerShell); soporte multilínea; captura literal
src/parser/br.js                     — Parser @@br; flags: --launch, --nav, --map, --shot, --frame, --state, --clr → action mapping
src/parser/pg.js                     — Parser @@pg; local DOM; flags específicos para elementos de página
src/parser/control-flags.js          — Tokenizador flags reservados: --rerun, --allow_multiline, --full, --workspace, --session, --id
src/parser/utils.js                  — Utilidades: splitLeadingControlFlags, hashId FNV-1a

tests/                               — Suite de tests manuales y unitarios para todos los tipos de bloque
tests/RESULTS.md                     — Resultados documentados de cambios en parser
tests/DIAGNOSTIC.md                  — Salida de diagnóstico para debugging
```

---

### au-pcp4

Captura y extracción de contenido YouTube (transcripciones, metadata, info de video). Popup Chrome.

```
manifest.json                        — MV3; popup extension
boot.js                              — Bootstrap; monta Aurora con temas y fondos
background.js                        — Service Worker; gestión de historial de extracciones
content.js                           — Content script YouTube; extrae títulos, canales, transcripciones
index.html                           — HTML principal del popup
package.json                         — Metadata

modules/pcp4/manifest.js             — Definición del módulo (id, versión, vistas, permisos)
modules/pcp4/skin/pcp4.css           — Estilos específicos del módulo
modules/pcp4/views.extension.popup/capture/manifest.js          — Meta de vista Capturar
modules/pcp4/views.extension.popup/capture/capture.view/render.js — Interfaz principal de captura
modules/pcp4/views.extension.popup/capture/capture.foot/render.js — Footer de la vista
modules/pcp4/views.extension.popup/capture/capture.styles/capture.css — Estilos

ui/                                  — Design system: componentes Preact, temas, backgrounds (Aurora, Fireflies, Grid, Matrix, Nebula, Particles, Starfield, Void), HUDs (Circuit, Corners, Luna, PulseRings, Scanlines)
```

---

### au-rtxnvidia

App desktop Tauri para transcoding de video con aceleración NVIDIA RTX. 8 vistas: home, studio (audio), video, remix, encode, games, models, settings. En desarrollo.

```
manifest.json / tauri.conf.json      — Config Tauri (nombre, versión, ventana)
boot.js                              — Bootstrap; monta Aurora con temas/fondos/HUDs
index.html                           — HTML principal de la app
package.json / requirements.txt      — Metadata y deps Python
backend/__init__.py                  — Paquete backend
backend/app.py                       — Importa create_app() de Aurora

modules/rtxnvidia/manifest.js        — Módulo principal; 8 vistas desktop
modules/rtxnvidia/skin/rtxnvidia.css — Estilos específicos
modules/rtxnvidia/scripts/rtx-ui.js  — Helpers UI: RtxApi, _python, _json

modules/rtxnvidia/views.desktop/home/      — Dashboard; summary de estado del sistema
modules/rtxnvidia/views.desktop/studio/    — Editor de audio
modules/rtxnvidia/views.desktop/video/     — Procesamiento de video general
modules/rtxnvidia/views.desktop/remix/     — Remezcla/remixing
modules/rtxnvidia/views.desktop/encode/    — Transcoding con aceleración NVIDIA; rutas /presets, /ping
modules/rtxnvidia/views.desktop/games/     — Gestor de juegos
modules/rtxnvidia/views.desktop/models/    — Gestor de modelos IA
modules/rtxnvidia/views.desktop/settings/  — Configuración

-- Cada vista tiene: manifest.js, render.js, foot/render.js, routes.py, actions.py, jobs.py, __init__.py, *.css

ui/                                  — Design system: componentes Preact, temas, backgrounds, HUDs (igual que au-pcp4)
```

---

### au-ytnoambient

Desactiva Ambient Mode de YouTube (efectos visuales cinematográficos). Content script minimal.

```
manifest.json                        — MV3; content script inyectado en MAIN world en youtube.com
background.js                        — Service Worker placeholder vacío
content.js                           — Lógica principal: desactiva ambient mode, remueve efectos cinemáticos, persiste config via localStorage
```

---

### au-ytsounds

Placeholder/WIP. Solo contiene un script Python de prueba, sin funcionalidad de extensión.

```
hola_mundo.py                        — Script Python standalone: imprime "¡Hola, Mundo!"
```

---

## Ideas Pendientes

### graph.mjs — Dependency Graph automático

`aaa/tools/graph.mjs` que lea `aaa.config.js` + manifests + imports y genere diagrama de nodos del ecosistema en Mermaid o JSON. Sin software externo.

```
         aurora.js
        /    |    \
  aihub    ash    browsernebula
   /|\      |        |
  / | \   nexus   bravetools
Local LLM Wiki
```

Herramientas externas equivalentes: Madge, dependency-cruiser, CodeSee, Sourcetrail.
