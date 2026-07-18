# Aurora v2 — Plan de Arquitectura (HISTÓRICO)

> Última actualización: 2026-06-17 — mapeo exacto contra codebase real

---

## Visión

Aurora es el server. Un proceso Python/Litestar corriendo en `:7779` que unifica todo el ecosistema.

```
┌─────────────────────────────────────┐
│  Chrome Extensions (thin clients)   │
│  content.js, background.js          │
│  index.html → iframe :7779/ui       │
└────────────────┬────────────────────┘
                 │ iframe + fetch
┌────────────────▼────────────────────┐
│  AURORA SERVER :7779                │
│  Python / Litestar                  │
│  /ui    → frontend estático         │
│  /db    → SQLite gateway            │
│  /nexus → shell, fs, py             │
│  /gemita→ LLM streaming WebSocket   │
│  /browser→ Playwright               │
│  /voz   → STT faster-whisper, TTS   │
│  /mcp   → MCP protocol              │
└────────────────┬────────────────────┘
                 │ SQLite
┌────────────────▼────────────────────┐
│  aihub.db — HDD NTFS compartido     │
│  Linux ↔ Windows                    │
└─────────────────────────────────────┘
```

---

## R.I.P. aurora.js

`aurora.js` fue el engine v1 — un bundler en runtime, sin build step, sin Node, corriendo directo en browser. Resolvió el problema de "cómo construir algo complejo sin infraestructura".

Ahora hay infraestructura. Aurora.js cumplió su propósito y descansa en `docs/aurora.md` como documentación histórica de v1.

**Lo que reemplaza cada parte:**

| aurora.js v1 | v2 |
|---|---|
| Store Redux dispatch/subscribe | Preact signals |
| Router de vistas via manifest | `app.js` — router por URL `?tab=X` |
| `_importScript()` / `shell.scripts[]` | ES imports nativos |
| `globalThis` para todo | `globalThis` solo para Preact + html + twind |
| `registry.js` + `manifest.js` | Import directo del módulo |
| `views.extension.sidepanel/` | `modules/local/`, `modules/wiki/`, etc. |
| Engine 1126 líneas | `boot.js` + `app.js` + `store.js` (~150 líneas total) |

---

## Stack

**Frontend:** Preact + HTM + Twind + Preact Signals. Sin build step. Sin bundler. Sin JSX. ES modules nativos.

**Backend:** Python 3 / Litestar / aiosqlite / SQLite.

**Extensiones:** Thin clients puros. Solo Chrome APIs. Sin UI propia — montan iframe al server.

---

## Extensiones — Thin Clients

Las extensiones ya no tienen UI propia. No usan aurora.js. No tienen `modules/`, ni `ui/components/`, ni Preact.

```
aurora/extensions/ash/
  manifest.json     ← MV3, permisos mínimos
  background.js     ← service worker: Chrome APIs, routing mensajes
  content.js        ← observa DOM del LLM, parsea bloques ✦✦₃/✧✧✧
  index.html        ← <iframe src="http://localhost:7779/ui?ext=ash">

aurora/extensions/bold/
  manifest.json
  background.js
  content.js        ← bionic reading, blur, scroll — lógica DOM pura

aurora/extensions/ytnoambient/
  manifest.json
  content.js        ← desactiva ambient mode YouTube — 50 líneas, sin deps
```

Estado 2026-06-17: `ash`, `bold`, `browsernebula`, `orion`, `pcp4` y `ytnoambient` ya fueron importadas completas a `aurora/extensions/` con `registry.json`. Falta adelgazar cada paquete para que quede como thin client puro.

Toda la UI debe vivir en el server. La extensión solo:
1. Abre el sidepanel/popup con `index.html`
2. `index.html` carga `localhost:7779/ui` en un iframe
3. `content.js` toca el DOM de la página cuando necesita
4. `background.js` maneja Chrome APIs y pasa datos al server via fetch

---

## Principio de Normalización de Código

Los archivos JS se tratan como tablas de base de datos normalizadas:

| Forma Normal | Regla en código |
|---|---|
| **1NF** | Un archivo = una responsabilidad atómica. Sin listas de responsabilidades. |
| **2NF** | Cada export depende del propósito completo del archivo. Sin helpers ajenos. |
| **3NF** | Sin dependencias transitivas. Si A necesita C, importa C directo — no via B. |
| **BCNF** | Cada export vive en un único lugar canónico. Sin duplicados entre archivos. |
| **4NF** | Sin conceptos independientes mezclados en un archivo. |
| **5NF** | Sin archivos reconstruibles juntando otros dos. |
| **6NF** | Cada slice de estado evoluciona independientemente. |

### Capas de import

```
globalThis          ← solo: preact, html (htm), twind, signals
                      nadie los importa — boot.js los inyecta al arrancar

components/         → importados por modules/ y entre componentes
modules/X/scripts/  → importan de components/ y entre scripts del mismo módulo
modules/X/view/     → importa de modules/X/scripts/ (nunca al revés)
```

### Prohibido

```js
// Viola 3NF — transitiva
// view importa parser directamente cuando solo modloader/observer.js lo necesita
import { parse } from '../../components/shared/protocol/parser.js'; // ❌

// Viola BCNF — duplicado
// formatFecha() definida en historial.js Y en mensajes.js → solo en utils/fecha.js

// Viola 4NF — mezcla conceptos independientes
// gemita-ws.js con lógica de historial adentro → archivos separados
```

---

## Estructura de Proyecto

```
aurora/
  src/              ← Aurora Server — proceso único Python :7779
  ui/               ← frontend — servido como estático por el server
  extensions/       ← thin clients Chrome
  config/           ← server.toml, nexus.toml, workspaces.toml, llm.toml, extensions.toml
  databases/        ← aihub.db SQLite
  tests/
  scripts/          ← start.sh, start.bat
  docs/
```

---

## src/ — Aurora Server

```
src/
  main.py                     ← entry point Litestar — registra todos los routers, StaticFiles /ui

  db/                         ← gateway SQLite — /db/*
    connection.py             ← init_db(), get_conn()
    auth.py                   ← resuelve usuario_id desde Bearer token
    router.py                 ← registra todos los Controllers
    schema.sql                ← schema v5 completo
    routes/
      usuarios.py             ← POST /db/usuarios/init, GET /db/usuarios/me
      chats.py                ← CRUD /db/chats, /db/mensajes
      prompts.py              ← CRUD /db/prompts, historial, favoritos, uso
      ajustes.py              ← GET/PUT /db/ajustes/:clave
      stats.py                ← GET /db/stats — SQL puro
      llm.py                  ← /db/llm/history, /db/llm/adapters
      urls_custom.py          ← CRUD /db/urls-custom
      nav.py                  ← /db/nav/sesiones, log, capturas
      wiki.py                 ← /db/wiki/search, indice
      scratchpad.py           ← /db/scratchpad/imagenes
      sesiones.py             ← POST /db/sesiones — telemetría
      tokens.py               ← /db/token-analisis
      eventos.py              ← /db/eventos
      ash.py                  ← /db/ash/proyectos, descargas, prompts-capturados
      bc.py                   ← /db/bc/sesiones
      yt.py                   ← /db/yt/extracciones
      extensions.py           ← /db/extensions registry + estado por usuario en ajustes
      backup.py               ← /db/backup + /resumen — export total JSON
      ext_capturas.py         ← /db/ext-capturas
      jobs.py                 ← /db/jobs
      mdreader.py             ← /db/md-reader
      productividad.py        ← /db/productividad
      ash_downloads.py        ← /db/ash-downloads

  nexus/                      ← shell, fs, py, approvals — /nexus/*
    router.py                 ← registra NexusController
    config.py                 ← workspace roots, patrones destructivos, EXTENSIONS dict
    workspace.py              ← _safe(), _is_inside(), sandboxing, path traversal prevention
                                import: config.py
    approvals.py              ← cola pendientes — GET /nexus/approvals, POST /nexus/approve|deny
                                import: workspace.py, config.py
    shell.py                  ← POST /nexus/shell/run, /nexus/shell/exec
                                import: workspace.py, approvals.py
    fs.py                     ← GET /nexus/fs/list|read|head — POST /nexus/fs/write|patch|delete|move
                                import: workspace.py, approvals.py
    py.py                     ← POST /nexus/py/run|pip-install — GET /nexus/py/status
                                import: workspace.py, approvals.py
    editor.py                 ← POST /nexus/editor/run — ejecuta py/js/sh/ts, stdout/stderr + duración
                                import: workspace.py, approvals.py
    tasks.py                  ← tareas programadas (backups automáticos, etc.)

  gemita/                     ← LLM local streaming — WebSocket /gemita
    router.py                 ← registra WebSocket handler, chat como task asyncio + inbox queue
    bucle.py                  ← loop agéntico httpx streaming, thinking/token/tool_call/tool_result
                                import: config.py, tools.py, roles.py, protocol.py, providers.py
    config.py                 ← host, port, modelos, parámetros
    roles.py                  ← system prompts predefinidos
    protocol.py               ← catálogo de tools del protocolo
    providers.py              ← abstracción de providers (llama.cpp, Ollama, etc.)
    shell.py                  ← bash persistente/sesión
    tools.py                  ← 12 tools Python function-calling

  voz/                        ← server-side speech — /voz/*
    router.py                 ← POST /voz/stt (faster-whisper), POST /voz/tts (edge-tts), GET /voz/voces

  browser/                    ← Playwright + browser-use — /browser/*
    router.py                 ← registra BrowserController
    agent.py                  ← agente Playwright autónomo

  tools/                      ← tool registry y routing
    builtin.py                ← tools built-in del sistema
    contract.py               ← contratos y validación de tools
    policy.py                 ← políticas de ejecución
    registry.py               ← registro central de herramientas
    router.py                 ← ruteo de tool_calls

  mcp/                        ← MCP (Model Context Protocol)
    config.py                 ← configuración MCP
    external.py               ← integración MCP externa
    prompts.py                ← plantillas MCP
    protocol.py               ← implementación protocolo MCP
    resources.py              ← recursos MCP
    router.py                 ← ruteo MCP

  ext/                        ← extensiones server-side
    router.py                 ← /ext/* endpoints

  jobs/                       ← tareas background programadas
    cleanup_capturas.py       ← limpieza periódica de capturas
```

---

## ui/ — Frontend

Sin aurora.js. Sin registry. Sin manifest. Preact + HTM + Twind + Signals directo.

### Reglas de estructura ui/

```
ui/components/          ← familias de componentes reutilizables
                          importados via ES import por cualquier módulo o componente
                          SIN prefijo Au* — solo Button, Panel, Input, etc.
                          CSS via Twind inline — sin archivos .css por componente

ui/components/shared/   ← lógica compartida entre módulos (no UI pura)
                          gemita-ws.js, markdown.js, etc.
                          cualquier módulo puede importar de aquí

ui/modules/X/
  view/                 ← componentes Preact del módulo — importan de scripts/ y components/
  scripts/              ← lógica fetch /db/*, fetch /nexus/*, signals locales
                          importan de components/ y entre scripts del mismo módulo
```

**Prohibido en modules/X/:**
- No `.styles/` — CSS va en el componente via Twind
- No `manifest.js` — no hay registry en v2
- No `views.extension.sidepanel/` — no hay contexto de extensión
- No importar de `modules/Y/` (otro módulo) — pasar por `components/`

```
ui/
  vendor/
    preact.min.js
    preact-hooks.min.js
    htm.umd.js
    twind.js
    signals-core.js           ← @preact/signals-core 1.8.0
    signals.js                ← @preact/signals 1.3.1

  boot.js                     ← 1) globalThis.html = htm.bind(preact.h)
                                  2) signals globales en globalThis
                                  3) twind setup
                                  4) POST /db/usuarios/init si no hay token
                                  5) monta <App />
                                  6) ping /ping cada 30s
  app.js                      ← router lazy por ?tab=X → monta módulo correcto
                                  Background + HUD dinámicos via loaders
                                import: store.js, modules/*/view/*.js (lazy)
  store.js                    ← signals globales exportados como ES module
                                export: signal (re-export de preactSignals),
                                        activeTab, theme, background, hud,
                                        nexusOnline, user,
                                        setTab(), setTheme(), setBackground()
                                import: nada — usa globalThis.preactSignals

  index.html                  ← carga vendor/ en orden, luego boot.js como module

  components/
    index.js                  ← barrel export: Button, Dropdown, Status, Toolbar,
                                 Panel, List, Empty, Chip, Input, ChatMessage, IframeContainer

    globals.js                ← Object.assign(globalThis, { Button, Panel, Input, ... })
                                  cargado por boot.js via import() dinámico
                                import: todos los primitivos

    tokens.css                ← variables CSS: colores tema, spacing, fonts
    ui.css                    ← estilos base UI
    fx.css                    ← fx-hover, fx-active, fx-panel, fx-focus, fx-danger
    graph.css                 ← estilos para gráficas
    markdown.css              ← estilos para render markdown

    globals/                  ← estilos globales
      reset.css               ← normalize base
      keyframes.css           ← animaciones globales
      scrollbars.css          ← estilos scrollbar
      shell-layout.css        ← layout shell
      theme-mode.css          ← estilos modo tema
      utilities-lite.css      ← utilidades ligeras

    inject/                   ← estilos para inyección en páginas externas
      buttons.css
      dropdown.css
      inject.css
      modal.css
      panel.css
      tokens.css

    local/                    ← estilos específicos módulo local
      local.css
      local.canvas.css
      local.composer-cloud.css
      local.messages.css
      local.panels.css
      local.responsive.css
      local.tools.css

    local.views/
      canvas.js               ← componente canvas Preact

    scratchpad/
      index.js                ← componentes scratchpad Preact
      scratchpad.css          ← estilos scratchpad

    images/                   ← assets gráficos
      fire-sprite-0.png
      fire-sprite-1.png
      fire-sprite.png

    nav/                      ← componentes de navegación
      command-palette.js      ← Ctrl+K: filtro fuzzy "Ir a X" + Alt+1..9
      nav-tabs.js             ← tabs de navegación
      notif-center.js         ← panel deslizable: eventos, historial cloud, backup
      sesion-ui.js            ← restaura último tab, telemetría /db/eventos
      user-switcher.js        ← login por clic, crear usuario

    footer/
      footer.js               ← contenedor footer 3 zonas
      registry.js             ← registro declarativo de acciones footer
      acciones-modulo.js      ← acciones por módulo

    themes/
      manager.js              ← aplica tema: CSS variables en :root
                                export: aplicarTema(theme)
      index.js                ← THEMES, BACKGROUNDS, HUDS
                                import: ./backgrounds/loaders.js, ./hud/loaders.js
      lib.js                  ← helpers de tema
      tema-hora.js            ← tema automático por franja horaria
      backgrounds/
        loaders.js            ← lazy import backgrounds por nombre
        Aurora.js, Nebula.js, Matrix.js, Rain.js, Fog.js, ... (25 fondos)
      hud/
        loaders.js            ← lazy import HUDs por nombre
        Circuit.js, Luna.js, PulseRings.js, ... (9 overlays)

    shared/                   ← lógica compartida entre módulos
      api.js                  ← helper fetch: BASE + Bearer + getJSON/postJSON/putJSON/patchJSON/deleteJSON
      gemita-ws.js            ← WebSocket /gemita, reconexión automática
                                export: GemitaWS — connect(), send(), onToken(), onDone()
      markdown.js             ← markdown → HTML + syntax highlight
                                export: renderMarkdown(text) → string
      autosave.js             ← autosave helper
      clipboard.js            ← clipboard helper
      ext-bridge.js           ← bridge comunicación con extensiones
      flash.js                ← flash message helper
      toast.js                ← toast notifications

    Button.js                 ← variant="primary|danger|ghost" size="sm|md|lg" active disabled
    Panel.js                  ← Panel + PanelHeader + PanelBody + PanelFooter + PanelLabel + PanelValue
    Input.js                  ← Input + Textarea + Select
    Chip.js                   ← Chip + ChipGroup
    Toolbar.js                ← Toolbar + ToolbarSpacer
    Status.js                 ← indicadores de estado
    List.js                   ← List + ListItem + ListActions
    Empty.js                  ← empty state placeholder
    ChatMessage.js            ← ChatList + ChatMessage
    IframeContainer.js        ← wrapper iframe con loading state
    Dropdown.js               ← menú desplegable

    # Componentes retirados (v1) — viven en _legacy/components-unused/:
    #   StatusBar.js, Dropup.js, LLMPicker.js, TabPicker.js, NavExtra.js

  modules/
    # PATRÓN DE MÓDULO — aplica a TODOS los módulos:
    #
    #   X/
    #     view/     ← componentes Preact — importan de scripts/ y components/
    #     scripts/  ← fetch /db/*, /nexus/*, signals locales — importan de components/
    #
    # NUNCA en un módulo:
    #   - .styles/       → CSS via Twind en el componente
    #   - manifest.js    → no hay registry en v2
    #   - views.extension.sidepanel/  → no hay contexto de extensión
    #   - import de modules/Y/  → si necesita compartir, va a components/

    inicio/
      view/inicio.js          ← dashboard: stats, workspace, LLMs, acciones rápidas
                                import: ../scripts/dashboard.js, ../scripts/ping.js
      scripts/
        dashboard.js          ← health dashboard widgets
                                export: renderDashboard()
        ping.js               ← ping /ping cada 30s → signal nexusOnline
                                export: startPing(), stopPing()
      inicio.css              ← estilos dashboard

    local/
      view/local.js           ← chat + parámetros + historial sidebar
                                import: scripts/chat/*, scripts/voz/voz.js, scripts/canvas/canvas.js
      scripts/
        chat/
          historial.js        ← CRUD chats: fetch /db/chats — signals: chats, chatActualId
                                export: cargarChats(), crearChat(), eliminarChat(), autoGuardar()
          mensajes.js         ← fetch /db/chats/:id/mensajes — signals: historial, streamingActual, cargando
                                export: cargarMensajes(), guardarMensaje(), agregarMensajeLocal(), limpiarHistorial()
          parametros.js       ← fetch /db/ajustes — signals: params, modeloSeleccionado
                                export: cargarParametros(), guardarParametros()
          instrucciones.js    ← fetch /db/ajustes — system prompt
                                export: cargarInstruccion(), guardarInstruccion()
          vision.js           ← imagen pendiente RAM, máx 5MB
                                export: setPendingImage(), getPendingImage(), clearPendingImage()
          renderizar.js       ← render tool_calls, contenido markdown, scroll
                                export: renderizarContenido(), formatearArgsToolCall(), scrollAlFondo()
          typewriter.js       ← efecto escritura streaming
                                export: iniciarTypewriter(), detenerTypewriter(), isTyping()
          actividad.js        ← tool-activity-bar: ring buffer 24 tool executions
                                export: trackStart(), trackEnd(), clearActivity()
          acciones-rapidas.js ← quick actions: copiar, notas, reformular, leer
                                export: copiarMensaje(), añadirANotas(), reformularRespuesta(), leerMensaje()
          herramientas.js     ← tool definitions
                                export: HERRAMIENTAS_SISTEMA, promptParaHerramienta()
          exportar-pdf.js     ← exporta conversación a PDF
                                export: exportarChatPDF()
          limpiar.js          ← limpia historial RAM + toast
                                export: limpiarChat()
        voz/
          voz.js              ← STT via /nexus/shell/run + TTS Web Speech API
                                export: iniciarGrabacion(), detenerGrabacion(), hablar(), detenerVoz()
        canvas/
          canvas.js           ← canvas (tool canvas_write), persiste /db/ajustes/local_canvas
                                export: CanvasPanel, canvasWrite(), toggleCanvas()

    llmcloud/
      view/llmcloud.js        ← Single/Split con iframes presets (ChatGPT/Claude/Gemini)
                                import: ../scripts/duo.js, ../scripts/duo-panel.js, ../scripts/urls.js
      scripts/
        duo.js                ← loop P1↔P2 en RAM (nativo server-side WebSockets)
                                export: DuoLoop — start(), stop(), step()
        duo-panel.js          ← panel de control para Duo
                                export: DuoPanel
        urls.js               ← urls-custom de /db, aviso X-Frame-Options
                                export: cargarUrls(), guardarUrl()

    prompts/
      view/prompts.js         ← lista + editor + filtros unificado
                                import: ../scripts/guardar.js, ../scripts/filtros.js
      scripts/
        guardar.js            ← fetch /db/prompts — CRUD manuales
                                export: cargarPrompts(), crearPrompt(data), borrarPrompt(id)
        filtros.js            ← filtrado local: categoría, tag, tipo, búsqueda
                                export: filtrar(prompts, filtros) → prompts[]
        ideas.js              ← generación de ideas con AI
                                export: generarIdeas()
        plantillas.js         ← gestión de plantillas
                                export: cargarPlantillas(), importarPlantillas()

    wiki/
      view/wiki.js            ← árbol + editor + preview markdown
                                import: ../scripts/fs.js
      scripts/
        fs.js                 ← fetch /nexus/fs/* — list, read, write, delete, mkdir, move
                                export: listar(), leer(), escribir(), borrar(), crearDir(), mover()

    scratchpad/
      view/scratchpad.js      ← ensambla shell con bloques
                                import: ../scripts/notas.js
      scripts/
        notas.js              ← autosave /nexus/fs/write, bloques, sidebar
                                export: guardarAhora(), addBlock(), deleteBlock(), moveBlock()

    editor/
      view/editor.js          ← árbol archivos + textarea + output en vivo
                                import: ../scripts/runner.js
      scripts/
        runner.js             ← fetch /nexus/editor/run
                                export: ejecutar(path, lang, code) → { stdout, stderr, duracion }

    toolkit/
      view/toolkit.js         ← input + selector herramienta + output
                                import: ../scripts/herramientas.js
      scripts/
        herramientas.js       ← 8 herramientas 1-click (resumir/traducir/explicar/etc.)
                                export: HERRAMIENTAS

    chain/
      view/chain.js           ← selector AIs, estado chain, botón Iniciar
                                import: ../scripts/ejecutar.js
      scripts/
        ejecutar.js           ← orquesta flujo 3 AIs en cadena
                                export: iniciarChain(ais), detenerChain()

    webnavigator/
      view/web-navigator.js   ← log + mapa elementos + cascada resolución
                                import: ../scripts/sesion.js, ../scripts/log.js, ../scripts/resolver.js
      scripts/
        sesion.js             ← fetch /db/nav/sesiones
                                export: iniciarSesion(objetivo), cerrarSesion(id, resultado)
        log.js                ← fetch /db/nav/log
                                export: logAccion(sesionId, tipo, mensaje, url)
        capturas.js           ← fetch /db/nav/capturas
                                export: guardarCaptura(sesionId, datos)
        resolver.js           ← cascada: placeholder→selector→testid→aria→text→index
                                export: resolverElemento(descriptor, iframe) → Element

    stats/
      view/stats.js           ← gráficas y resúmenes de uso
                                import: ../scripts/calcular.js
      scripts/
        calcular.js           ← fetch /db/stats → JSON listo
                                export: cargarStats()

    detective-tokens/
      view/detective.js       ← textarea + contador tiempo real + historial
                                import: ../scripts/analizar.js
      scripts/
        analizar.js           ← estimación tokens, fetch /db/token-analisis
                                export: analizar(texto) → { chars, tokens, breakdown }

    stylecatalog/
      view/stylecatalog.js    ← galería de todos los componentes primitivos
                                import: ../scripts/catalogo.js
      scripts/
        catalogo.js           ← catálogo de componentes con preview vivo
                                export: CARGAR_COMPONENTES, CARGAR_TOKENS

    ajustes/
      view/ajustes.js         ← tema, LLMs custom, export/import
                                import: ../scripts/tema.js, ../scripts/llms.js, ../scripts/export.js
      scripts/
        tema.js               ← fetch /db/ajustes/theme
                                export: cargarTema(), guardarTema(theme)
        llms.js               ← fetch /db/urls-custom — CRUD, detecta favicon/título
                                export: cargarLLMs(), crearLLM(data), borrarLLM(id)
        export.js             ← export/import JSON manual del store
                                export: exportarJSON(), importarJSON(file)

    aurora/                   ← módulo interno Aurora UI
    captura/                  ← módulo captura de pantalla
    md-reader/                ← módulo lector markdown
    productividad/            ← módulo productividad
```

---

## Reglas de Desarrollo

```
1.  Un archivo = una responsabilidad (1NF)
2.  globalThis solo para: preact, html, twind, signals — boot.js los inyecta
3.  ES imports explícitos para toda lógica interna
4.  Sin exports duplicados entre archivos (BCNF) — un lugar canónico por función
5.  Sin dependencias transitivas en imports (3NF) — si A necesita C, importa C directo
6.  Nuevo componente visual → ui/components/ — nunca inline en un módulo
7.  Componente compartible entre módulos → ui/components/shared/
8.  Lógica Python → src/nexus/, src/gemita/, src/browser/, src/voz/
9.  CSS → Twind en el componente. tokens.css para variables. Sin archivos .css por módulo.
10. Datos → fetch /db/*. Shell/FS → fetch /nexus/*. LLM streaming → WebSocket /gemita.
11. Extensiones son thin clients: content.js + background.js + index.html con iframe. Sin UI propia.
```

---

## Progreso de Implementación

### Frontend — ui/

| Archivo | Estado | Notas |
|---|---|---|
| `vendor/signals-core.js` | ✅ | @preact/signals-core 1.8.0 |
| `vendor/signals.js` | ✅ | @preact/signals 1.3.1 |
| `index.html` | ✅ | Sin aurora.js, carga signals |
| `boot.js` | ✅ | Nuevo: html+htm, signals globales, twind, monta App, ping /ping |
| `store.js` | ✅ | Signals: activeTab, theme, background, hud, nexusOnline, user |
| `app.js` | ✅ | Router por ?tab=X, lazy import módulos, Background+HUD dinámicos |
| `modules/inicio/` | ✅ | view + scripts/dashboard.js + scripts/ping.js — fetch /db/stats, acciones rápidas, health dots |
| `modules/local/` | ✅ | Vista Local sobre signals: historial, params, tool activity bar, thinking, typewriter, canvas, voz, acciones rápidas, export PDF |
| `components/shared/api.js` | ✅ | Helper fetch compartido: BASE + Bearer + getJSON/postJSON/putJSON/patchJSON/deleteJSON |
| `components/shared/markdown.js` | ✅ | renderMarkdown liviano (code blocks, headings, listas, links) |
| `components/shared/gemita-ws.js` | ✅ | WebSocket client con reconexión, sendToGemita, fetchModels, cancelar |
| `modules/llmcloud/` | ✅ | Iframes presets (ChatGPT/Claude/Gemini) + urls-custom de /db. Single/Split/Duo nativo server-side |
| `modules/prompts/` | ✅ | CRUD via /db/prompts: búsqueda, filtro categoría, ideas, plantillas |
| `modules/wiki/` | ✅ | Árbol lateral recursivo via /nexus/fs, editor + preview markdown |
| `modules/scratchpad/` | ✅ | Vista Notas: bloques, sidebar, notas.js store |
| `modules/editor/` | ✅ | Árbol sandbox + textarea + ▶ /nexus/editor/run (py/js/sh) con stdout/stderr |
| `modules/stats/` | ✅ | GET /db/stats: cards + barras |
| `modules/toolkit/` | ✅ | 8 herramientas 1-click via sendToGemita streaming |
| `modules/chain/` | ✅ | Cadena de prompts: salida paso N → entrada N+1, streaming por paso |
| `modules/detective-tokens/` | ✅ | Estimador tiempo real, breakdown, autosave a /db/token-analisis |
| `modules/webnavigator/` | ✅ | Visor /db/nav: sesiones, log, capturas con selectores |
| `modules/stylecatalog/` | ✅ | Port StyleCatalog v1: Componentes, Tokens, Patterns |
| `modules/ajustes/` | ✅ | Tema/Fondo/HUD, CRUD LLMs custom, export/import JSON, extensiones |
| `modules/aurora/` | ✅ | Módulo interno Aurora UI |
| `modules/md-reader/` | ✅ | Lector markdown |
| `modules/captura/` | ✅ | Captura de pantalla |
| `modules/productividad/` | ✅ | Productividad |
| `components/nav/` | ✅ | command-palette, nav-tabs, notif-center, sesion-ui, user-switcher |
| `components/footer/` | ✅ | Footer 3 zonas declarativas vía signal |
| `components/themes/` | ✅ | 25 backgrounds + 9 HUDs + tema por hora |
| `_legacy/components-unused/` | ➡️ | StatusBar.js, Dropup.js, LLMPicker.js, TabPicker.js, NavExtra.js — retirados v1 |

### Backend — src/

| Módulo | Estado | Notas |
|---|---|---|
| `src/db/` | ✅ | Completo — /db/* endpoints, schema v5. Incluye backup, ext_capturas, jobs, mdreader, productividad, ash_downloads |
| `src/nexus/` | ✅ | Portado de nexus.py standalone a /nexus/*: fs, shell, py, editor/run, approvals, tasks. nexus :7777 sigue vivo solo para extensiones |
| `src/gemita/` | ✅ | Portado completo de gemita.py standalone. WS /gemita: config.py, protocol.py, providers.py, shell.py, tools.py (12 tools), roles.py, bucle.py (loop agéntico httpx streaming), router.py (chat como task asyncio + inbox queue). Probado end-to-end |
| `src/voz/` | ✅ | POST /voz/stt (faster-whisper int8 CPU), POST /voz/tts (edge-tts → mp3), GET /voz/voces |
| `src/parser/` | ⚠️ Legacy | Desconectado — endpoint existe pero no es llamado. Parser real: gem-observer.js |
| `src/browser/` | ⏳ | Pendiente — solo router.py + agent.py esqueleto |
| `src/tools/` | ✅ | Sistema de tools: builtin, contract, policy, registry, router |
| `src/mcp/` | ~ | MCP protocol — config, external, prompts, protocol, resources, router implementados parcialmente |
| `src/ext/` | ✅ | Extensiones server-side router |
| `src/jobs/` | ✅ | cleanup_capturas.py — limpieza periódica |
| `src/main.py` | ✅ | Static /ui con Cache-Control: no-cache, favicon |

### Cambios clave vs v1

- `aurora.js` removido — ya no carga en `index.html`
- `globalThis.html` ahora seteado en `boot.js` via `htm.bind(preact.h)`
- `globalThis.store.dispatch()` → Preact signals directos
- `localStorage` → `fetch /db/ajustes/*` y `fetch /db/chats`
- `ws://localhost:7778` → `ws://localhost:7779/gemita`
- `__AURORA_NEXUS_URL__ :7777` → eliminado, fetch `/nexus/*` al mismo server
- `localStorage` queda solo en `boot.js` como cache del token de auth; todo lo demás (voz, autovoz, canvas, params, chats) vive en DB

### Backend nuevo (2026-06)

- `GET /health` — chequeo agregado: uptime, llama-server, DB
- `GET /db/chats/{id}/fijados` + `PATCH /db/chats/mensajes/{id}/pin` — fijar mensajes
- `GET/POST /db/usuarios/list|login|crear` — multi-usuario
- `GET /db/llm/cloud/conversaciones/{id}/mensajes` + `DELETE` — historial cloud
- `BackupController` (`/db/backup` + `/resumen`) — export total JSON
- `GET /db/wiki/grep` — búsqueda léxica
- `gemita/tools.py`: `wiki_search` (13 tools) — RAG léxico

### Frontend nuevo (2026-06)

- `components/nav/command-palette.js` — Ctrl+K + Alt+1..9
- `components/nav/sesion-ui.js` — restaura último tab + telemetría
- `components/nav/user-switcher.js` — login por clic
- `components/nav/notif-center.js` — panel deslizable
- `components/themes/tema-hora.js` — tema automático por franja horaria
- `modules/inicio/` — dashboard health (3 HealthDots, refresh 5s)
- `modules/local/` — drag-drop archivos de texto, preview markdown, fijar mensajes
- Duo nativo server-side: orquestador de 2 WebSockets
- Extensiones: `aurora/extensions/registry.json` + copia canónica
- Ajustes: panel Extensiones importadas con toggles

**Política localStorage:** árbol activo solo guarda `aurora_token` (credencial bootstrap). Cero app-data en localStorage; todo lo demás en DB. `_legacy/` conserva usos antiguos (no se carga).

---

## Roadmap

```
FASE 1 — Cimientos
  [x] Aurora Server: Litestar :7779
  [x] SQLite: schema v5 + /db/* endpoints
  [x] boot.js nuevo — sin aurora.js, preact signals, router por URL
  [x] store.js — signals globales reemplazan redux store
  [x] app.js — router lazy por ?tab=X
  [x] modules/inicio/ — vista funcional
  [x] modules/local/ — chat core con streaming
  [x] src/gemita/ — absorbido gemita.py standalone (:7778 desaparece) — loop agéntico real
  [x] src/voz/ — STT faster-whisper + TTS edge-tts server-side (/voz/*)
  [x] modules/local/ completo — voz, canvas, thinking, tools
  [x] src/nexus/ — absorbido nexus.py standalone (/nexus/* en :7779; :7777 queda solo para extensiones)
  [x] src/parser/ — legacy desconectado (endpoint existe, no es llamado)
  [x] 12 módulos UI funcionales — ajustes, prompts, wiki, stats, detective-tokens,
      toolkit, chain, scratchpad, editor, llmcloud, webnavigator, stylecatalog
  [x] aurora/extensions/ — import canónico de extensiones MV3 + registry
  [ ] extensions/ thin clients — adelgazar paquetes: sin aurora.js, sin modules/, solo iframe

FASE 2 — Migración de datos
  [~] chrome.storage → /db/ajustes
  [x] localStorage (llama_chats, llama_params) → /db/chats + /db/mensajes + /db/ajustes
  [x] Prompts → /db/prompts (módulo prompts opera 100% contra DB)
  [ ] IframeHistory + Adapters → /db/llm_*

FASE 3 — Migración de lógica
  [x] scripts/ de cada módulo → fetch /db/* y /nexus/* (los 14 módulos de aurora/ui operan contra DB/nexus)

FASE 4 — Features nuevos
  [x] Login: primer arranque → POST /db/usuarios/init (+ list/login/crear, user-switcher)
  [x] RAG wiki: léxico (grep /db/wiki/grep + tool wiki_search)
  [x] Telemetría sesiones: persistencia último tab + eventos /db/eventos
  [ ] WebNavigator persistente
  [x] Health dashboard + command palette Ctrl+K + atajos Alt+1..9
  [x] Footers declarativos 3 zonas
  [x] Backup total JSON + centro de notificaciones
  [x] Fijar mensajes, tema por hora, drag-drop, preview markdown
  [x] Duo nativo server-side (2 WebSockets)

FASE 5 — Producto
  [ ] start.sh / start.bat — levanta Aurora + abre browser
  [x] Multi-usuario (list/login/crear + user-switcher; pendiente: consolidar usuarios duplicados)
  [ ] Sync entre dispositivos via DB compartida
  [~] MCP protocol — implementación parcial
  [x] Tools system — builtin, contract, policy, registry, router
  [x] src/jobs/ — cleanup_capturas background task
```
