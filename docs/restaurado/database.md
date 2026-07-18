# Database — Diseño y Arquitectura

> Última actualización: 2026-06-17
> Ver también: [aurora.md](aurora.md) — auditoría de código fuente | [aurora-v2.md](aurora-v2.md) — arquitectura objetivo

---

## Por qué SQLite

| Problema actual | Causa | Con SQLite |
|---|---|---|
| `chrome.storage` límite 10MB | Todo comparte el mismo cubo | Sin límite, archivo en disco |
| Chats Local máx 60 | `localStorage` key `llama_chats` | Sin límite, mensajes separados |
| LLMCloud sin historial | Conversaciones nunca se guardan | `cloud_conversaciones` + `cloud_mensajes` |
| WebNavigator log máx 40 | Solo RAM | `nav_log` persistente |
| Sin identidad | Sin login, sin sync | `usuarios` + token |
| Datos duplicados | Cada módulo guarda aislado | Normalización real, un solo archivo |

**Un solo archivo físico en HDD NTFS — ambos OS lo ven:**

```
Linux:   /media/almacen/deml/Downloads/core_instruction/databases/aihub/aihub.db
Windows: D:\Downloads\core_instruction\databases\aihub\aihub.db
```

**Acceso exclusivo via Aurora Server** — extensión nunca toca el archivo directamente:

```
Extensión → fetch Aurora Server /db/* → SQLite
```

---

## Decisiones de diseño

| # | Decisión | Elegida | Razón |
|---|---|---|---|
| 1 | Stats queries | SQL puro en server | Stats.js desaparece, server devuelve JSON listo |
| 2 | Local — cuándo guarda | Por mensaje al terminar streaming | Perder un mensaje es aceptable, perder conversación no |
| 3 | Scratchpad | Sigue en disco como .md | Ya funciona, DB solo tiene índice para RAG |
| 4 | Wiki RAG — cuándo indexar | Background worker cada 5min | No bloquea al usuario, llama.cpp puede estar ocupado |
| 5 | Multi-usuario | Token desde día 1 | Agregar usuario_id después es migración dolorosa |
| 6 | Chain | prompt tipo=chain con meta JSON | No necesita tabla propia |
| 7 | LLMs custom | Renombrado a `urls_custom` | Son URLs capturadas, no LLMs reales |
| 8 | Scratchpad imágenes | Disco: workspace/scratchpad/images/ | SQLite + BLOBs grandes = mala idea |
| 9 | ASH proyectos | Tabla propia `ash_proyectos` | Persiste entre sesiones, sessionStorage era temporal |
| 10 | Nexus approvals | Tabla propia `nexus_approvals` | Reemplaza archivos JSON, queries + historial |
| 11 | Templates Prompts | Migran a DB tipo=template | Son datos, no código |
| 12 | DetectiveTokens | Tabla `token_analisis` | Útil para comparar prompts a lo largo del tiempo |
| 13 | Editor recientes | `ajustes` key=editor_recientes | Config simple, no necesita tabla |
| 14 | Toolkit historial | `prompts` tipo=output subtipo=toolkit | Reutiliza estructura existente |
| 15 | Shortcuts | `ajustes` key=shortcuts | Config configurable por usuario |
| 16 | LLMCloud Duo config | `ajustes` key=llmcloud_duo_config | Config simple |
| 17 | Nav sesiones | Tabla `nav_sesiones` + FK en nav_log | Agrupa acciones, útil para RAG |
| 18 | Eventos sistema | Tabla `eventos` | Historial de notificaciones para debugging y contexto LLM |
| 19 | gemita_custom_tools | `prompts` tipo=tool | Reutiliza estructura, queryable, favorito como toggle activo |
| 20 | aihub_ideas_guardadas | `prompts` tipo=idea | Misma tabla, solo cambia tipo, filtrable igual que templates |
| 21 | downloadHistory | Tabla `ash_descargas` | Mismo patrón que scratchpad_imagenes, limpio y separado |
| 22 | aiHubState | `ajustes` key por key | Más granular, permite leer solo lastView sin cargar todo el estado |
| 23 | ash_ollama_config | `ajustes` key=ash_ollama_config | Config simple, mismo patrón que otros configs de extensión |
| 24 | ash_prompt_history | Tabla `ash_prompts_capturados` | Estructura compleja (codeBlocks, platform, status) — necesita tabla |
| 25 | ash_project_context | Columna `contexto` en `ash_proyectos` | Pertenece al proyecto, no es config global |
| 26 | bc_sessions + bc_activeSessId | Tabla `bc_sesiones` | State complejo por sesión, FK a usuario |
| 27 | bc_pendingWindowId | `ajustes` key=bc_pending_window | Temporal/sobrescribible, no necesita historial |
| 28 | ytExtractionHistory | Tabla `yt_extracciones` | Historial real con contenido, au-browsernebula + au-pcp4 comparten |
| 29 | yt-player-ambient-mode | `ajustes` key=yt_ambient_config | Config bool simple |
| 30 | Bold 12 keys sync | `ajustes` key=bold_config JSON | 12 keys → 1 JSON blob, misma semántica |
| 31 | sessionStorage ASH (5 keys) | NO migrar | Efímero intencional — sobreviven solo en tab activo |

---

## Migración: Storage actual → Tablas

| Key actual | Storage | Módulo | → Tabla DB |
|---|---|---|---|
| `llama_chats` | localStorage | Local | `chats` + `mensajes` |
| `llama_params` | localStorage | Local | columnas en `chats` |
| `llama_instruccion` | localStorage | Local | `ajustes` |
| `aihub_prompts` | chrome.storage | Prompts | `prompts` tipo=manual |
| `aihub_prompts_guardados` | chrome.storage | Prompts | `prompts` tipo=output |
| `aihub_prompts_historial` | chrome.storage | Prompts | `prompts_historial` |
| `aihub_prompts_favs` | chrome.storage | Prompts | columna `favorito` en `prompts` |
| `aurora:iframeHistory` | localStorage + chrome | LLMCloud | `llm_iframe_history` |
| `aurora_iframe_adapters_v1` | chrome.storage | LLMCloud | `llm_adapters` |
| `customLLMs` | chrome.storage | Ajustes | `urls_custom` |
| `theme`, `background`, `lastView`, etc. | chrome.storage | Ajustes | `ajustes` |
| `chain` | chrome.storage | Chain | `prompts` tipo=chain |
| `LLM Wiki/*.md` | Nexus filesystem | Wiki | archivos en disco + `wiki_indice` |
| `memory/sessions/*.md` | Nexus filesystem | Local | archivos en disco |
| `state/ash/nexus-approvals/*.json` | Nexus filesystem | ASH | `nexus_approvals` |
| templates/*.tmpl.json | Nexus filesystem | Prompts | `prompts` tipo=template |
| `aiHubState` | chrome.storage | Ajustes | `ajustes` (key por key descompuesto) |
| `gemita_typewriter_enabled` | chrome.storage | Local | `ajustes` key=gemita_typewriter |
| `gemita_tts_enabled` | chrome.storage | Local | `ajustes` key=gemita_tts |
| `gemita_custom_tools` | localStorage | Local/Tools | `prompts` tipo=tool |
| `aurora_iframe_mapeos` | chrome.storage | Local/modloader | `llm_adapters` (alias mapeos) |
| `aihub_ideas_guardadas` | chrome.storage | Prompts | `prompts` tipo=idea |
| `downloadHistory` | chrome.storage | ASH popup | `ash_descargas` |
| `webnavigator_last_context` | localStorage | Local/WebNav | `nav_sesiones.objetivo` (cache temporal → DB) |
| `webnavigator_last_results` | localStorage | Local/WebNav | `nav_log` (resultados en log de sesión) |
| `ash_ollama_config` | chrome.storage | au-ash | `ajustes` key=ash_ollama_config |
| `ash_prompt_history` | chrome.storage | au-ash | `ash_prompts_capturados` |
| `ash_project_context` | chrome.storage | au-ash | columna `contexto` en `ash_proyectos` |
| `bc_sessions` | chrome.storage | au-browsernebula + au-ash | `bc_sesiones` |
| `bc_activeSessId` | chrome.storage | au-browsernebula + au-ash | columna `activa` en `bc_sesiones` |
| `bc_pendingWindowId` | chrome.storage | au-browsernebula + au-ash | `ajustes` key=bc_pending_window (temporal, sobrescribible) |
| `ytExtractionHistory` | chrome.storage | au-browsernebula + au-pcp4 | `yt_extracciones` |
| `yt-player-ambient-mode` | localStorage | au-ytnoambient | `ajustes` key=yt_ambient_config |
| Bold keys (12 keys sync) | chrome.storage.sync | au-bold | `ajustes` key=bold_config JSON único |
| `gemita_session_start` | chrome.storage | Stats (dead code) | **ELIMINAR** — nunca se escribe, Stats usa SQL |
| `notas_contenido` | chrome.storage | Stats (dead code) | **ELIMINAR** — módulo Notas no existe |
| `nexus_workspaceRoot` | chrome.storage | Stats (dead code) | **ELIMINAR** — usar `ajustes` key=workspace_root |
| `ash.nexus.executedIds.v1` | sessionStorage | au-ash | **NO migrar** — efímero intencional |
| `ash.runtime.v1` | sessionStorage | au-ash | **NO migrar** — efímero intencional |
| `ash.convId` | sessionStorage | au-ash | **NO migrar** — efímero intencional |
| `ash.aiapps.sentIds.v2` | sessionStorage | au-ash | **NO migrar** — efímero intencional |
| `ashActiveProject` | sessionStorage | au-ash | **NO migrar** — usar `ash_proyectos.activo` |

**Lo único que queda en chrome.storage después de migrar:**

```
aurora_token   — token UUID del usuario
```

`nexus_host` se almacena en la tabla `ajustes` del servidor (clave `nexus_host`), no en chrome.storage.

---

## Schema v5 — aihub.db

```sql
-- ══════════════════════════════════════════
--  AIHUB.DB — Schema v5
--  Actualizado 2026-06-09 — v5
-- ══════════════════════════════════════════

-- ── MIGRACIONES ───────────────────────────
CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  descripcion TEXT,
  aplicada_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── USUARIOS ──────────────────────────────
CREATE TABLE usuarios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT    NOT NULL,
  token          TEXT    UNIQUE NOT NULL,
  os             TEXT,                    -- 'linux' | 'windows'
  workspace_root TEXT,
  creado_en      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── URLs CUSTOM (antes: LLMs custom) ──────
CREATE TABLE urls_custom (
  id          TEXT    PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  nombre      TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  icono       TEXT,
  activo      INTEGER NOT NULL DEFAULT 1,
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── CHATS ─────────────────────────────────
CREATE TABLE chats (
  id          INTEGER PRIMARY KEY,        -- timestamp original
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  nombre      TEXT    NOT NULL,
  modelo_id   TEXT,
  temperatura REAL    DEFAULT 0.8,
  top_p       REAL    DEFAULT 0.9,
  top_k       INTEGER DEFAULT 40,
  seed        INTEGER DEFAULT -1,
  num_ctx     INTEGER DEFAULT 4096,
  instruccion TEXT,
  creado_en   INTEGER NOT NULL,
  actualizado INTEGER NOT NULL
);

CREATE TABLE mensajes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id     INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  rol         TEXT    NOT NULL CHECK(rol IN ('user','assistant','system')),
  contenido   TEXT    NOT NULL,
  tokens_est  INTEGER,
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── PROMPTS ───────────────────────────────
-- tipo: 'manual' | 'output' | 'chain' | 'template' | 'tool' | 'idea'
-- subtipo: 'equipo' | 'comfyui' | 'wan' | 'toolkit' | 'sistema'
CREATE TABLE prompts (
  id          TEXT    PRIMARY KEY,        -- 'p_<timestamp>'
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  nombre      TEXT    NOT NULL,
  contenido   TEXT    NOT NULL,
  tipo        TEXT    NOT NULL DEFAULT 'manual',
  subtipo     TEXT,
  categoria   TEXT,
  tags        TEXT,                       -- JSON array
  destino_ai  TEXT,                       -- 'ask'|'local'|'chatgpt'|...
  meta        TEXT,                       -- JSON params extra
  favorito    INTEGER NOT NULL DEFAULT 0,
  usos        INTEGER NOT NULL DEFAULT 0,
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch()),
  actualizado INTEGER,
  usado_en    INTEGER
);

CREATE TABLE prompts_historial (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  contenido   TEXT    NOT NULL,
  nombre      TEXT,
  destino_ai  TEXT,
  enviado_en  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── SESIONES (telemetría personal) ────────
CREATE TABLE sesiones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  chat_id     INTEGER REFERENCES chats(id),
  modelo_id   TEXT,
  duracion_ms INTEGER,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  herramienta TEXT,                       -- 'local'|'toolkit'|'chain'|'llmcloud'...
  os          TEXT,
  iniciada_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── WEBNAVIGATOR ──────────────────────────
CREATE TABLE nav_sesiones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  objetivo    TEXT,                       -- qué intentaba hacer el usuario
  resultado   TEXT,                       -- 'ok'|'err'|'parcial'
  inicio      INTEGER NOT NULL DEFAULT (unixepoch()),
  fin         INTEGER
);

CREATE TABLE nav_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  nav_sesion_id INTEGER REFERENCES nav_sesiones(id),
  tipo        TEXT    NOT NULL,           -- 'info'|'ok'|'err'|'warn'
  mensaje     TEXT    NOT NULL,
  url         TEXT,
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE nav_capturas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  nav_sesion_id INTEGER REFERENCES nav_sesiones(id),
  titulo       TEXT,
  url          TEXT,
  selector     TEXT,
  aria         TEXT,
  testid       TEXT,
  placeholder  TEXT,
  rol          TEXT,
  rect_json    TEXT,
  capturado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── IFRAME HISTORY ────────────────────────
CREATE TABLE llm_iframe_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  slot        TEXT    NOT NULL,           -- 'single'|'split-1'|'split-2'|'arena-0'...
  ai_id       TEXT    NOT NULL,           -- 'chatgpt'|'gemini'|'claude'|url_custom_id
  url         TEXT    NOT NULL,
  guardado_en INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(usuario_id, slot, ai_id)
);

-- ── LLM ADAPTERS ─────────────────────────
CREATE TABLE llm_adapters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  dominio      TEXT    NOT NULL,
  adapter_json TEXT    NOT NULL,          -- JSON {input, send, output}
  fuente       TEXT    DEFAULT 'user',    -- 'user'|'detectado'|'builtin'
  actualizado  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(usuario_id, dominio)
);

-- ── LLMCLOUD — conversaciones capturadas ──
CREATE TABLE cloud_conversaciones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  llm          TEXT    NOT NULL,
  url          TEXT,
  titulo       TEXT,
  capturado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE cloud_mensajes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id      INTEGER NOT NULL REFERENCES cloud_conversaciones(id) ON DELETE CASCADE,
  rol          TEXT    NOT NULL,
  contenido    TEXT    NOT NULL,
  capturado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── AJUSTES clave/valor ───────────────────
-- Absorbe: theme, background, lastView, llama_instruccion,
--          llama_params, recentWorkspaces, shortcuts,
--          editor_recientes, llmcloud_duo_config, extensions_enabled, etc.
CREATE TABLE ajustes (
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  clave       TEXT    NOT NULL,
  valor       TEXT,
  PRIMARY KEY (usuario_id, clave)
);

-- ── WIKI ÍNDICE (para RAG) ────────────────
CREATE TABLE wiki_indice (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  path        TEXT    NOT NULL,
  subfolder   TEXT,                       -- 'wiki'|'raw'|'templates'
  titulo      TEXT,
  resumen     TEXT,                       -- generado por llama.cpp
  tags        TEXT,
  actualizado INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── MD READER ────────────────────────────
CREATE TABLE md_reader_prefs (
  usuario_id  INTEGER PRIMARY KEY REFERENCES usuarios(id),
  root_path   TEXT,
  active_path TEXT,
  mode        TEXT,
  filters_json TEXT,
  actualizado INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE md_reader_index_meta (
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  root        TEXT    NOT NULL,
  file_count  INTEGER NOT NULL DEFAULT 0,
  node_count  INTEGER NOT NULL DEFAULT 0,
  edge_count  INTEGER NOT NULL DEFAULT 0,
  actualizado INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (usuario_id, root)
);

CREATE TABLE md_reader_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  root        TEXT    NOT NULL,
  path        TEXT    NOT NULL,
  title       TEXT,
  size        INTEGER,
  mtime       INTEGER,
  checksum    TEXT,
  actualizado INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (usuario_id, root, path)
);

CREATE TABLE md_reader_nodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  root        TEXT    NOT NULL,
  file_path   TEXT    NOT NULL,
  node_id     TEXT    NOT NULL,
  type        TEXT    NOT NULL,
  label       TEXT,
  uri         TEXT,
  line        INTEGER,
  detail      TEXT,
  meta_json   TEXT,
  actualizado INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (usuario_id, root, file_path, node_id)
);

CREATE TABLE md_reader_edges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  root        TEXT    NOT NULL,
  source_path TEXT    NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  edge_type   TEXT    NOT NULL,
  label       TEXT,
  source_line INTEGER,
  detail      TEXT,
  meta_json   TEXT,
  actualizado INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (usuario_id, root, source_path, source_node_id, target_node_id, edge_type)
);

-- ── SCRATCHPAD IMÁGENES ───────────────────
-- Archivos en disco: workspace/scratchpad/images/<uuid>.<ext>
-- DB solo tiene el índice
CREATE TABLE scratchpad_imagenes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  filename    TEXT    NOT NULL,           -- uuid.ext
  path        TEXT    NOT NULL,           -- path absoluto en disco
  tamanio     INTEGER,                    -- bytes
  mime        TEXT,
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── ASH PROYECTOS ─────────────────────────
CREATE TABLE ash_proyectos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
  nombre           TEXT    NOT NULL,
  path             TEXT    NOT NULL,
  activo           INTEGER NOT NULL DEFAULT 0,
  contexto         TEXT,                 -- resumen del proyecto (ash_project_context)
  ultima_actividad INTEGER NOT NULL DEFAULT (unixepoch()),
  creado_en        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── ASH DESCARGAS ────────────────────────
CREATE TABLE ash_descargas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  filename     TEXT    NOT NULL,
  path         TEXT,                       -- path local si se guardó
  url_origen   TEXT,                       -- URL de la que se descargó
  tamanio      INTEGER,                    -- bytes
  descargado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── NEXUS APPROVALS ───────────────────────
-- Reemplaza state/ash/nexus-approvals/*.json
CREATE TABLE nexus_approvals (
  id              TEXT    PRIMARY KEY,    -- UUID
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  extension       TEXT    NOT NULL,       -- 'ash'|'aihub'
  status          TEXT    NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'denied'
  action          TEXT    NOT NULL,
  command         TEXT    NOT NULL,
  reason          TEXT,
  targets_json    TEXT,                   -- JSON array de paths afectados
  solicitado_en   INTEGER NOT NULL DEFAULT (unixepoch()),
  resuelto_en     INTEGER
);

-- ── DETECTIVE TOKENS ──────────────────────
CREATE TABLE token_analisis (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  texto_hash  TEXT    NOT NULL,           -- sha256 corto para dedup
  chars       INTEGER NOT NULL,
  tokens_est  INTEGER NOT NULL,
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── EVENTOS DEL SISTEMA ───────────────────
-- Historial de notificaciones + eventos de debugging
CREATE TABLE eventos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  tipo        TEXT    NOT NULL,           -- 'notif'|'error'|'warn'|'info'|'nexus'
  mensaje     TEXT    NOT NULL,
  origen      TEXT,                       -- 'nexus'|'gemita'|'ash'|'aihub'|'navigator'
  meta        TEXT,                       -- JSON extra
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── ASH PROMPTS CAPTURADOS ────────────────
-- Reemplaza ash_prompt_history — capturado por ASH_PromptCapture
CREATE TABLE ash_prompts_capturados (
  id           TEXT    PRIMARY KEY,       -- generado
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  plataforma   TEXT    NOT NULL,          -- 'ChatGPT'|'Claude'|'Gemini'
  plataforma_k TEXT    NOT NULL,          -- 'chatgpt'|'claude'|'gemini'
  prompt       TEXT    NOT NULL,
  response     TEXT,
  code_blocks  TEXT,                      -- JSON array [{index, code, language}]
  status       TEXT    NOT NULL DEFAULT 'pending', -- 'pending'|'completed'
  capturado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── BROWSER CABIN SESIONES ────────────────
-- Reemplaza bc_sessions + bc_activeSessId
CREATE TABLE bc_sesiones (
  id           TEXT    PRIMARY KEY,       -- sessionId (e.g. 'default')
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  tab_id       INTEGER,
  window_id    INTEGER,
  url          TEXT,
  titulo       TEXT,
  id_by_key    TEXT,                      -- JSON {key → id}
  next_map_id  INTEGER NOT NULL DEFAULT 0,
  activa       INTEGER NOT NULL DEFAULT 0,
  actualizado  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── YOUTUBE EXTRACCIONES ──────────────────
-- Reemplaza ytExtractionHistory (au-browsernebula + au-pcp4)
CREATE TABLE yt_extracciones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  fuente       TEXT    NOT NULL,          -- 'browsernebula'|'pcp4'
  url          TEXT    NOT NULL,
  titulo       TEXT,
  tipo         TEXT,                      -- 'youtube'|'page'
  contenido    TEXT,                      -- texto extraído / transcript
  meta         TEXT,                      -- JSON extra (duración, canal, etc.)
  extraido_en  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── CAPTURAS DE EXTENSIÓN ────────────────
CREATE TABLE ext_capturas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  tipo         TEXT    NOT NULL,          -- 'page'|'screenshot'|'yt:withTimestamps'|etc.
  titulo       TEXT,
  url          TEXT,
  contenido    TEXT,                      -- texto capturado o dataUrl base64 para screenshots
  chars        INTEGER,                  -- longitud del contenido
  tab_title    TEXT,
  tab_url      TEXT,
  capturado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── PRODUCTIVIDAD WEB ─────────────────────
CREATE TABLE productividad_capturas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  tipo          TEXT NOT NULL DEFAULT 'page',
  titulo        TEXT,
  url           TEXT,
  favicon       TEXT,
  seleccion     TEXT,
  contenido     TEXT,
  html_limpio   TEXT,
  metadata_json TEXT,
  screenshot    TEXT,
  origen        TEXT DEFAULT 'aurora-productivity',
  capturado_en  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_research (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  captura_id      INTEGER REFERENCES productividad_capturas(id) ON DELETE SET NULL,
  resumen_corto   TEXT,
  resumen_largo   TEXT,
  entidades_json  TEXT,
  argumentos_json TEXT,
  decisiones_json TEXT,
  fuentes_json    TEXT,
  preguntas_json  TEXT,
  prompt          TEXT,
  creado_en       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  captura_id   INTEGER REFERENCES productividad_capturas(id) ON DELETE SET NULL,
  titulo       TEXT NOT NULL,
  descripcion  TEXT,
  url          TEXT,
  selector     TEXT,
  estado       TEXT NOT NULL DEFAULT 'open',
  prioridad    TEXT NOT NULL DEFAULT 'normal',
  meta_json    TEXT,
  creado_en    INTEGER NOT NULL DEFAULT (unixepoch()),
  actualizado  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_clipboard (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  contenido    TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'nota',
  tags_json    TEXT,
  destino      TEXT,
  url          TEXT,
  creado_en    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_form_profiles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  nombre       TEXT NOT NULL,
  datos_json   TEXT NOT NULL,
  activo       INTEGER NOT NULL DEFAULT 1,
  creado_en    INTEGER NOT NULL DEFAULT (unixepoch()),
  actualizado  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_form_templates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  dominio      TEXT NOT NULL,
  nombre       TEXT,
  campos_json  TEXT NOT NULL,
  creado_en    INTEGER NOT NULL DEFAULT (unixepoch()),
  actualizado  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_form_fills (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),
  template_id    INTEGER REFERENCES productividad_form_templates(id) ON DELETE SET NULL,
  url            TEXT,
  resultado_json TEXT,
  ejecutado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_meetings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id          INTEGER NOT NULL REFERENCES usuarios(id),
  titulo              TEXT,
  url                 TEXT,
  plataforma          TEXT,
  participantes_json  TEXT,
  transcript          TEXT,
  chat                TEXT,
  resumen             TEXT,
  decisiones_json     TEXT,
  pendientes_json     TEXT,
  timeline_json       TEXT,
  creado_en           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_tab_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  nombre      TEXT NOT NULL,
  resumen     TEXT,
  meta_json   TEXT,
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_tab_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  session_id  INTEGER REFERENCES productividad_tab_sessions(id) ON DELETE CASCADE,
  title       TEXT,
  url         TEXT,
  favicon     TEXT,
  active      INTEGER DEFAULT 0,
  window_id   INTEGER,
  group_id    INTEGER,
  preview     TEXT,
  abierto_en  INTEGER,
  creado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_price_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  nombre          TEXT NOT NULL,
  url             TEXT NOT NULL,
  tienda          TEXT,
  moneda          TEXT,
  precio_objetivo REAL,
  selector_precio TEXT,
  selector_stock  TEXT,
  imagen          TEXT,
  activo          INTEGER NOT NULL DEFAULT 1,
  creado_en       INTEGER NOT NULL DEFAULT (unixepoch()),
  actualizado     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE productividad_price_checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  item_id     INTEGER NOT NULL REFERENCES productividad_price_items(id) ON DELETE CASCADE,
  precio      REAL,
  moneda      TEXT,
  stock       TEXT,
  raw_json    TEXT,
  revisado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── ÍNDICES ───────────────────────────────
CREATE INDEX idx_mensajes_chat          ON mensajes(chat_id);
CREATE INDEX idx_mensajes_rol           ON mensajes(chat_id, rol);
CREATE INDEX idx_chats_usuario          ON chats(usuario_id);
CREATE INDEX idx_chats_actualizado      ON chats(usuario_id, actualizado);
CREATE INDEX idx_prompts_usuario        ON prompts(usuario_id);
CREATE INDEX idx_prompts_tipo           ON prompts(usuario_id, tipo);
CREATE INDEX idx_prompts_subtipo        ON prompts(usuario_id, subtipo);
CREATE INDEX idx_prompts_favorito       ON prompts(usuario_id, favorito);
CREATE INDEX idx_prompts_usos           ON prompts(usuario_id, usos);
CREATE INDEX idx_sesiones_usuario       ON sesiones(usuario_id);
CREATE INDEX idx_sesiones_fecha         ON sesiones(iniciada_en);
CREATE INDEX idx_sesiones_herramienta   ON sesiones(usuario_id, herramienta);
CREATE INDEX idx_nav_log_usuario        ON nav_log(usuario_id);
CREATE INDEX idx_nav_log_sesion         ON nav_log(nav_sesion_id);
CREATE INDEX idx_nav_capturas_url       ON nav_capturas(url);
CREATE INDEX idx_cloud_usuario          ON cloud_conversaciones(usuario_id);
CREATE INDEX idx_cloud_msgs_conv        ON cloud_mensajes(conv_id);
CREATE INDEX idx_ajustes_usuario        ON ajustes(usuario_id);
CREATE INDEX idx_wiki_usuario           ON wiki_indice(usuario_id);
CREATE INDEX idx_wiki_resumen_null      ON wiki_indice(usuario_id, resumen) WHERE resumen IS NULL;
CREATE INDEX idx_ash_proyectos_usuario  ON ash_proyectos(usuario_id);
CREATE INDEX idx_ash_descargas_usuario  ON ash_descargas(usuario_id, descargado_en);
CREATE INDEX idx_nexus_approvals_status ON nexus_approvals(usuario_id, status);
CREATE INDEX idx_eventos_usuario           ON eventos(usuario_id, creado_en);
CREATE INDEX idx_eventos_tipo              ON eventos(usuario_id, tipo);
CREATE INDEX idx_ash_prompts_usuario       ON ash_prompts_capturados(usuario_id, capturado_en);
CREATE INDEX idx_ash_prompts_plataforma    ON ash_prompts_capturados(usuario_id, plataforma_k);
CREATE INDEX idx_bc_sesiones_usuario       ON bc_sesiones(usuario_id);
CREATE INDEX idx_bc_sesiones_activa        ON bc_sesiones(usuario_id, activa);
CREATE INDEX idx_yt_extracciones_usuario   ON yt_extracciones(usuario_id, extraido_en);
CREATE INDEX idx_yt_extracciones_fuente    ON yt_extracciones(usuario_id, fuente);
CREATE INDEX idx_ext_capturas_usuario      ON ext_capturas(usuario_id, capturado_en);
CREATE INDEX idx_ext_capturas_tipo         ON ext_capturas(usuario_id, tipo);
CREATE INDEX idx_prod_capturas_usuario     ON productividad_capturas(usuario_id, capturado_en);
CREATE INDEX idx_prod_tasks_usuario        ON productividad_tasks(usuario_id, estado, actualizado);
CREATE INDEX idx_prod_clipboard_usuario    ON productividad_clipboard(usuario_id, creado_en);
CREATE INDEX idx_prod_prices_usuario       ON productividad_price_items(usuario_id, activo);
CREATE INDEX idx_prod_price_checks_item    ON productividad_price_checks(usuario_id, item_id, revisado_en);
CREATE INDEX idx_md_reader_files_usuario_root ON md_reader_files(usuario_id, root);
CREATE INDEX idx_md_reader_nodes_usuario_root ON md_reader_nodes(usuario_id, root);
CREATE INDEX idx_md_reader_edges_usuario_root ON md_reader_edges(usuario_id, root);
```

---

## Flujos de datos por módulo

### Usuarios — primer arranque

```
Primer arranque de au-aihub:
  → genera UUID token → chrome.storage('aurora_token')
  → POST /db/usuarios/init { nombre: 'default', token, os: 'linux'|'windows' }
  → INSERT usuarios → devuelve usuario_id (cliente nunca lo ve)
  → INSERT schema_migrations { version: 1 }
  → todas las requests llevan: Authorization: Bearer <token>
  → server resuelve usuario_id internamente en cada request

Segundo dispositivo (Windows dualboot):
  → mismo token en chrome.storage (copiado manualmente o via config)
  → mismo archivo SQLite en HDD NTFS → mismos datos
```

---

### Local — Chat con llama.cpp

```
Crear chat nuevo:
  → POST /db/chats { nombre, modelo_id, temperatura, top_p, top_k, seed, num_ctx, instruccion }
  → INSERT chats → devuelve chat_id

Usuario escribe mensaje:
  → POST /db/mensajes { chat_id, rol: 'user', contenido }
  → INSERT mensajes

LLM termina streaming (no durante):
  → POST /db/mensajes { chat_id, rol: 'assistant', contenido, tokens_est }
  → INSERT mensajes

Cargar historial:
  → GET /db/chats → lista con último mensaje
  → GET /db/chats/:id/mensajes → historial completo

Cerrar sesión / cambiar módulo:
  → POST /db/sesiones { chat_id, modelo_id, duracion_ms, tokens_in, tokens_out, herramienta: 'local' }
  → INSERT eventos { tipo: 'info', mensaje: 'sesión local cerrada', origen: 'local' }
```

---

### Prompts

```
Guardar prompt manual:
  → POST /db/prompts { nombre, contenido, tipo: 'manual', categoria, tags, destino_ai }
  → INSERT prompts id='p_<timestamp>'

Guardar template (migrado desde templates/*.tmpl.json):
  → POST /db/prompts { tipo: 'template', subtipo: 'comfyui'|'wan'|'equipo'|'sistema', meta: JSON }

Guardar output de AI:
  → POST /db/prompts { tipo: 'output', subtipo: 'toolkit'|'equipo'|'wan', contenido, meta }

Guardar chain:
  → POST /db/prompts { tipo: 'chain', meta: JSON { ais: ['chatgpt','local'], pasos: 3 } }

Usar prompt:
  → PATCH /db/prompts/:id/uso
  → UPDATE prompts SET usos+1, usado_en=now()
  → POST /db/prompts/historial { contenido, nombre, destino_ai }

Toggle favorito:
  → PATCH /db/prompts/:id/favorito
  → UPDATE prompts SET favorito = 1 - favorito

Listar con filtros:
  → GET /db/prompts?tipo=manual&favorito=1&categoria=imagen&subtipo=wan
```

---

### LLMCloud

```
Usuario navega en ChatGPT (URL cambia):
  → PUT /db/llm/history { slot: 'single', ai_id: 'chatgpt', url }
  → INSERT OR REPLACE llm_iframe_history

Abrir panel (restaurar sesión):
  → GET /db/llm/history?slot=single&ai_id=chatgpt → última URL

Mapping manual de adapter:
  → PUT /db/llm/adapters/chatgpt.com { adapter_json, fuente: 'user' }

ASH captura conversación:
  → POST /db/cloud/conversaciones { llm, url, titulo }
  → POST /db/cloud/mensajes { conv_id, rol, contenido } × N

Config Duo (P1↔P2 loop):
  → PUT /db/ajustes/llmcloud_duo_config { valor: JSON { p1, p2, delay, maxPasos } }
```

---

### Wiki + RAG

```
Guardar archivo (sin cambios en flujo):
  → Wiki.js → Nexus /fs/write → disco
  → Aurora Server: INSERT OR IGNORE wiki_indice { path, usuario_id }
                   UPDATE wiki_indice SET resumen=NULL, actualizado=now()

Background worker (cada 5min):
  → SELECT path FROM wiki_indice WHERE resumen IS NULL AND usuario_id=?
  → lee archivo de disco
  → llama.cpp genera resumen
  → UPDATE wiki_indice SET resumen=?, tags=?, actualizado=now()

Búsqueda:
  → GET /db/wiki/search?q=texto
  → SELECT path, titulo, resumen FROM wiki_indice WHERE resumen LIKE ? ORDER BY actualizado DESC
```

---

### Scratchpad

```
Autosave cada 1.5s (sin cambios):
  → disco: workspace/wiki/scratchpad.md
  → NO escribe en DB (wiki_indice lo indexa via worker)

Guardar imagen en bloque:
  → POST /db/scratchpad/imagenes { filename, mime }
  → Aurora Server guarda archivo en workspace/scratchpad/images/<uuid>.<ext>
  → INSERT scratchpad_imagenes { filename, path, tamanio, mime }
  → devuelve path relativo para el bloque

Cargar imagen existente:
  → GET /db/scratchpad/imagenes → lista de imágenes del usuario
  → server sirve el archivo desde disco
```

---

### WebNavigator

```
Iniciar sesión de navegación:
  → POST /db/nav/sesiones { objetivo: 'buscar precio iPhone' }
  → INSERT nav_sesiones → devuelve nav_sesion_id

Cada acción:
  → POST /db/nav/log { nav_sesion_id, tipo, mensaje, url }

Inspeccionar elementos:
  → POST /db/nav/capturas { nav_sesion_id, url, selector, aria, testid, placeholder, rol, rect_json }

Cerrar sesión de navegación:
  → PATCH /db/nav/sesiones/:id { resultado: 'ok'|'err', fin: now() }
```

---

### Stats — SQL puro

Stats.js desaparece como módulo de cálculo. `GET /db/stats` devuelve JSON listo.

```sql
chats_total:             SELECT COUNT(*) FROM chats WHERE usuario_id=?
mensajes_total:          SELECT COUNT(*) FROM mensajes JOIN chats ON chats.id=chat_id WHERE chats.usuario_id=?
tokens_total:            SELECT SUM(tokens_est) FROM mensajes JOIN chats...
prompts_total:           SELECT COUNT(*) FROM prompts WHERE usuario_id=?
prompts_top5:            SELECT nombre, usos FROM prompts WHERE usuario_id=? ORDER BY usos DESC LIMIT 5
modelos_usados:          SELECT modelo_id, COUNT(*) n FROM chats WHERE usuario_id=? GROUP BY modelo_id ORDER BY n DESC
herramientas_top:        SELECT herramienta, COUNT(*) n FROM sesiones WHERE usuario_id=? GROUP BY herramienta ORDER BY n DESC
sesion_duracion_avg:     SELECT AVG(duracion_ms) FROM sesiones WHERE usuario_id=?
nav_acciones_total:      SELECT COUNT(*) FROM nav_log WHERE usuario_id=?
cloud_convs_total:       SELECT COUNT(*) FROM cloud_conversaciones WHERE usuario_id=?
ash_proyectos_total:     SELECT COUNT(*) FROM ash_proyectos WHERE usuario_id=?
yt_extracciones_total:   SELECT COUNT(*) FROM yt_extracciones WHERE usuario_id=?
```

---

### Ajustes — claves conocidas

```
theme                  — tema visual activo
background             — fondo animado activo
hud                    — overlay HUD activo
lastView               — último módulo abierto
workspace_root         — path del workspace activo
recent_workspaces      — JSON array últimos 5 workspaces
llm_default_model      — modelo default para Local
llm_default_temp       — temperatura default
single / split / arena — config de slots LLM cloud
chain                  — config chain actual (ais, pasos)
llmcloud_duo_config    — config P1↔P2 loop
shortcuts              — JSON atajos de teclado configurados
editor_recientes       — JSON array últimos archivos abiertos en Editor
extensions_enabled     — JSON { au-ash: true, au-bold: false, ... }
gemita_typewriter      — bool, efecto typewriter al recibir respuesta
gemita_tts             — bool, TTS activado
detectiveTokens        — config del detective de tokens
ajustesUI / promptsUI  — estado de UI de panels
nexus_host / nexus_port — conexión al Aurora Server
panel_open             — bool, panel lateral abierto (de aiHubState)
active_module          — módulo activo actual (de aiHubState)
sidebar_width          — ancho del sidepanel (de aiHubState)
ash_ollama_config      — JSON {baseUrl, model, timeout, enabled}
bc_pending_window      — windowId temporal Browser Cabin fallback
yt_ambient_config      — JSON config ambient mode YouTube
bold_config            — JSON {focusActive, bionicActive, scrollSpeed, blurAmount, tunnelActive, sentenceActive, fixationStrength, transitionTime, boldColor, hudActive, lastActiveIndex, scrollActive}
```

---

### ASH Proyectos

```
Detectar proyecto activo (al cargar ChatGPT):
  → content script detecta contexto
  → POST /db/ash/proyectos/activar { nombre, path }
  → UPDATE ash_proyectos SET activo=1, ultima_actividad=now() WHERE path=?
  → (o INSERT si no existe)

Listar proyectos:
  → GET /db/ash/proyectos → lista ordenada por ultima_actividad DESC

Desactivar todos:
  → PATCH /db/ash/proyectos/desactivar-todos
  → UPDATE ash_proyectos SET activo=0 WHERE usuario_id=?
```

---

### Nexus Approvals

```
Comando peligroso detectado:
  → Aurora Server crea approval
  → INSERT nexus_approvals { id: UUID, extension, status: 'pending', action, command, reason, targets_json }
  → INSERT eventos { tipo: 'nexus', mensaje: 'aprobación solicitada: <command>', origen: 'nexus' }

Panel ASH muestra pendientes:
  → GET /db/nexus/approvals?status=pending

Usuario aprueba:
  → PATCH /db/nexus/approvals/:id { status: 'approved' }
  → UPDATE nexus_approvals SET status='approved', resuelto_en=now()
  → Aurora Server ejecuta el comando
  → INSERT eventos { tipo: 'nexus', mensaje: 'aprobado: <command>' }

Usuario deniega:
  → PATCH /db/nexus/approvals/:id { status: 'denied' }
  → INSERT eventos { tipo: 'nexus', mensaje: 'denegado: <command>' }
```

---

### Detective Tokens

```
Usuario analiza texto:
  → calcula hash corto del texto
  → GET /db/token-analisis?hash=<hash> → ¿ya fue analizado?
  → si no existe:
      POST /db/token-analisis { texto_hash, chars, tokens_est }
      INSERT token_analisis
  → UI muestra resultado + historial de análisis similares
```

---

### Toolkit

```
Ejecutar herramienta (resumir, traducir, etc.):
  → Toolkit → Gemita WS → output completo
  → POST /db/prompts { tipo: 'output', subtipo: 'toolkit',
      nombre: '<herramienta> <timestamp>', contenido: output, meta: { herramienta, input_hash } }
  → INSERT prompts

Historial de outputs:
  → GET /db/prompts?tipo=output&subtipo=toolkit&limit=20
```

---

### Eventos del sistema

```
Nexus ejecuta comando:
  → INSERT eventos { tipo: 'nexus', mensaje, origen: 'nexus', meta: JSON resultado }

Error en cualquier módulo:
  → INSERT eventos { tipo: 'error', mensaje, origen: 'aihub'|'ash'|'gemita', meta: JSON stack }

Notificación al usuario:
  → INSERT eventos { tipo: 'notif', mensaje, origen }
  → notify-send al OS (si disponible)

Leer historial para contexto LLM:
  → GET /db/eventos?limit=50&tipo=nexus → últimos 50 eventos Nexus
  → LLM tiene contexto de qué pasó en la sesión
```

---

### ASH Prompts Capturados

```
ASH detecta prompt enviado a ChatGPT/Claude/Gemini:
  → POST /db/ash/prompts-capturados { plataforma, plataforma_k, prompt, status: 'pending' }
  → INSERT ash_prompts_capturados → devuelve id

ASH captura respuesta del assistant:
  → PATCH /db/ash/prompts-capturados/:id { response, code_blocks, status: 'completed' }
  → UPDATE ash_prompts_capturados

Listar historial:
  → GET /db/ash/prompts-capturados?limit=50&plataforma=chatgpt
```

---

### Browser Cabin Sesiones

```
Browser Cabin inicia sesión:
  → PUT /db/bc/sesiones/default { tab_id, window_id, url, titulo, id_by_key, activa: 1 }
  → INSERT OR REPLACE bc_sesiones

Cambiar sesión activa:
  → PATCH /db/bc/sesiones/:id/activar
  → UPDATE bc_sesiones SET activa=0 WHERE usuario_id=?
  → UPDATE bc_sesiones SET activa=1 WHERE id=?

Guardar windowId fallback:
  → PUT /db/ajustes/bc_pending_window { valor: windowId }

Restaurar sesiones al arrancar:
  → GET /db/bc/sesiones → lista todas
  → extensión reconstruye estado en memoria
```

---

### YouTube Extracciones

```
au-browsernebula extrae video/página:
  → POST /db/yt/extracciones { fuente: 'browsernebula', url, titulo, tipo: 'youtube', contenido, meta }

au-pcp4 captura página:
  → POST /db/yt/extracciones { fuente: 'pcp4', url, titulo, tipo: 'page', contenido }

Listar historial:
  → GET /db/yt/extracciones?fuente=browsernebula&limit=50
  → GET /db/yt/extracciones?tipo=youtube
```

---

### ASH Descargas

```
ASH descarga archivo desde ChatGPT:
  → POST /db/ash/descargas { filename, path, url_origen, tamanio }
  → INSERT ash_descargas

ASH popup carga historial:
  → GET /db/ash/descargas?limit=50
  → Lista ordenada por descargado_en DESC

Limpiar historial:
  → DEL /db/ash/descargas (borra todos del usuario)

Eliminar entrada:
  → DEL /db/ash/descargas/:id
```

---

### Custom Tools (Local)

```
Registrar herramienta custom:
  → POST /db/prompts { tipo: 'tool', nombre, contenido: esquema_json, meta: { handler, descripcion } }

Listar herramientas:
  → GET /db/prompts?tipo=tool

Activar/desactivar:
  → PATCH /db/prompts/:id/favorito  — favorito=1 activa, =0 desactiva
  (o columna activo en meta JSON si se prefiere semántica explícita)
```

---

### Ideas Guardadas (Prompts)

```
Guardar idea rápida:
  → POST /db/prompts { tipo: 'idea', nombre: 'idea_<timestamp>', contenido }

Listar ideas:
  → GET /db/prompts?tipo=idea

Borrar idea:
  → DEL /db/prompts/:id
```

---

## Endpoints Aurora Server /db/*

```
-- Usuarios
POST /db/usuarios/init              — primer arranque, crea usuario
GET  /db/usuarios/me                — datos del usuario actual
GET  /db/usuarios/list              — lista todos los usuarios
POST /db/usuarios/login             — login por nombre, devuelve token
POST /db/usuarios/crear             — crear usuario con nombre

-- Chats
GET  /db/chats                      — lista chats
GET  /db/chats/:id/mensajes         — mensajes de un chat
POST /db/chats                      — crear chat
PUT  /db/chats/:id                  — actualizar chat (completo)
PATCH /db/chats/:id                 — actualizar chat (parcial)
POST /db/mensajes                   — agregar mensaje
DEL  /db/chats/:id                  — borrar chat + mensajes (CASCADE)
PATCH /db/chats/mensajes/:id/pin    — toggle pin de mensaje
DEL  /db/chats/mensajes/:id         — borrar mensaje individual
GET  /db/chats/:id/fijados          — mensajes fijados de un chat

-- Prompts
GET  /db/prompts                    — lista (filtros: tipo, subtipo, categoria, favorito)
POST /db/prompts                    — crear/actualizar
PATCH /db/prompts/:id/uso           — incrementar usos
PATCH /db/prompts/:id/favorito      — toggle favorito
DEL  /db/prompts/:id                — borrar
POST /db/prompts/historial          — agregar al historial
GET  /db/prompts/historial          — últimos N usados
DEL  /db/prompts/historial          — limpiar historial completo
POST /db/prompts/guardados          — guardar prompt (con límite 200)
GET  /db/prompts/guardados          — prompts guardados
DEL  /db/prompts/guardados/:id      — borrar prompt guardado

-- Ajustes
GET  /db/ajustes                    — todos los ajustes del usuario
GET  /db/ajustes/:clave             — un ajuste
PUT  /db/ajustes/:clave             — escribir ajuste

-- URLs custom
GET  /db/urls-custom                — lista
POST /db/urls-custom                — crear
DEL  /db/urls-custom/:id            — borrar

-- LLM iframes
GET  /db/llm/history                — historia por slot
PUT  /db/llm/history                — actualizar URL de slot
GET  /db/llm/adapters/:dominio      — adapter DOM
PUT  /db/llm/adapters/:dominio      — guardar adapter

-- LLMCloud conversaciones
GET  /db/llm/cloud/conversaciones              — lista conversaciones capturadas
POST /db/llm/cloud/conversaciones              — nueva conversación capturada
DEL  /db/llm/cloud/conversaciones/:id          — eliminar conversación
GET  /db/llm/cloud/conversaciones/:id/mensajes — mensajes de una conversación
POST /db/llm/cloud/mensajes                    — agregar mensajes

-- WebNavigator
POST /db/nav/sesiones               — iniciar sesión navegación
GET  /db/nav/sesiones               — lista sesiones
PATCH /db/nav/sesiones/:id          — cerrar sesión
POST /db/nav/log                    — agregar entrada log
GET  /db/nav/log                    — lista log
POST /db/nav/capturas               — guardar captura elemento
GET  /db/nav/capturas               — lista capturas

-- Stats
GET  /db/stats                      — métricas completas calculadas en SQL

-- Wiki
GET  /db/wiki/search                — búsqueda en índice
GET  /db/wiki/grep                  — grep en archivos wiki
POST /db/wiki/indice                — forzar re-indexar archivo
GET  /db/wiki/indice                — lista índice
GET  /db/wiki/pending               — archivos pendientes de resumen

-- Scratchpad
POST /db/scratchpad/imagenes        — guardar imagen, devuelve path
GET  /db/scratchpad/imagenes        — lista imágenes

-- ASH Proyectos
GET  /db/ash/proyectos                       — lista proyectos
POST /db/ash/proyectos/activar               — activar proyecto
PATCH /db/ash/proyectos/desactivar-todos
PATCH /db/ash/proyectos/:id/contexto         — actualizar resumen proyecto

-- ASH Descargas
GET  /db/ash/descargas                       — historial de descargas
POST /db/ash/descargas                       — registrar descarga
DEL  /db/ash/descargas                       — limpiar historial
DEL  /db/ash/descargas/:id                   — eliminar entrada

-- ASH Downloads (endpoint alternativo en inglés)
GET  /db/ash/downloads               — historial de descargas
POST /db/ash/downloads               — registrar descarga
DEL  /db/ash/downloads/:id           — eliminar descarga

-- ASH Prompts Capturados
GET  /db/ash/prompts-capturados              — historial (filtros: plataforma, limit)
POST /db/ash/prompts-capturados              — registrar prompt capturado
PATCH /db/ash/prompts-capturados/:id         — completar con response + codeBlocks

-- Nexus Approvals
GET  /db/ash/nexus/approvals                 — lista (filtro: status)
PATCH /db/ash/nexus/approvals/:id            — aprobar/denegar

-- Browser Cabin
GET  /db/bc/sesiones                         — lista sesiones
PUT  /db/bc/sesiones/:id                     — crear/actualizar sesión
PATCH /db/bc/sesiones/:id/activar            — marcar sesión activa

-- YouTube Extracciones
GET  /db/yt/extracciones                     — lista (filtros: fuente, tipo, limit)
POST /db/yt/extracciones                     — registrar extracción
DEL  /db/yt/extracciones/:id                 — eliminar

-- Detective Tokens
GET  /db/token-analisis             — buscar por hash
POST /db/token-analisis             — guardar análisis

-- Sesiones telemetría
POST /db/sesiones                   — registrar sesión

-- Eventos
GET  /db/eventos                    — historial (filtros: tipo, origen, limit)
POST /db/eventos                    — registrar evento

-- Extensions
GET  /db/extensions                 — registry + estados de extensiones
GET  /db/extensions/:id             — estado de una extensión
PUT  /db/extensions/:id             — actualizar estado de extensión

-- Ext Capturas
POST /db/ext-capturas               — crear captura de extensión
GET  /db/ext-capturas               — lista capturas (filtro: tipo)
GET  /db/ext-capturas/:id           — detalle de captura
DEL  /db/ext-capturas/:id           — eliminar captura
DEL  /db/ext-capturas               — limpiar todas las capturas

-- Jobs
POST /db/jobs/cleanup-capturas              — limpieza de ext_capturas para el usuario
POST /db/jobs/cleanup-capturas/all          — limpieza global (todos los usuarios)
GET  /db/jobs/cleanup-capturas/config       — configuración efectiva de limpieza

-- Backup
GET  /db/backup                      — exportar datos del usuario como JSON
GET  /db/backup/resumen              — conteo de filas por tabla

-- MD Reader
GET  /db/mdreader/prefs              — preferencias del lector
PUT  /db/mdreader/prefs              — guardar preferencias
POST /db/mdreader/index              — subir índice de archivos/nodos/edges
GET  /db/mdreader/index              — obtener índice por raíz

-- Productividad
GET  /db/productividad/overview              — resumen (conteos + capturas recientes)
POST /db/productividad/capturas              — crear captura web
GET  /db/productividad/capturas              — lista capturas
GET  /db/productividad/capturas/:id          — detalle captura
DEL  /db/productividad/capturas/:id          — eliminar captura
POST /db/productividad/research              — crear análisis research
GET  /db/productividad/research              — lista research
POST /db/productividad/tasks                 — crear tarea
GET  /db/productividad/tasks                 — lista tareas
PATCH /db/productividad/tasks/:id            — actualizar tarea
DEL  /db/productividad/tasks/:id             — eliminar tarea
POST /db/productividad/clipboard             — agregar al clipboard
GET  /db/productividad/clipboard             — lista clipboard
DEL  /db/productividad/clipboard/:id         — eliminar item clipboard
POST /db/productividad/forms/profiles        — crear perfil de formulario
GET  /db/productividad/forms/profiles        — lista perfiles
POST /db/productividad/forms/templates       — crear template de formulario
GET  /db/productividad/forms/templates       — lista templates (filtro: dominio)
POST /db/productividad/forms/fills           — registrar autofill
POST /db/productividad/meetings              — crear reunión
GET  /db/productividad/meetings              — lista reuniones
POST /db/productividad/tabs/sessions         — guardar sesión de tabs
GET  /db/productividad/tabs/sessions         — lista sesiones de tabs
GET  /db/productividad/tabs/sessions/:id     — detalle de sesión + tabs
POST /db/productividad/prices                — crear item de precio
GET  /db/productividad/prices                — lista items (filtro: active)
POST /db/productividad/prices/:id/checks     — agregar chequeo de precio
POST /db/productividad/prices/:id/scan       — escanear precio vía extensión
GET  /db/productividad/prices/:id/checks     — historial de chequeos
```

Todos los endpoints reciben `Authorization: Bearer <token>` en header. Server resuelve `usuario_id` internamente.

**Nota:** Los endpoints de Nexus Approvals están bajo `/db/ash/nexus/approvals` (no `/db/nexus/approvals`).

---

## Roadmap

```
✅ Schema v5 diseñado — mapa storage completo, todas las extensiones cubiertas
✅ aihub.db creado + schema ejecutado en init_db()
✅ Todos los /db/* endpoints (22 controllers, 140+ rutas)
✅ Tabla ajustes operativa — chrome.storage migrado a DB
✅ Migración localStorage (llama_chats, llama_params, llama_instruccion) → chats
✅ Migración prompts → prompts
✅ Migración iframe history + adapters → llm_*
✅ Migración nexus approvals JSON → nexus_approvals
✅ Migración templates/*.tmpl.json → prompts tipo=template
✅ Login con token (primer arranque + POST /db/usuarios/login)
✅ Background worker RAG wiki_indice (pendiente implementación worker periódico)
✅ Stats SQL endpoint — GET /db/stats con 12+ métricas
✅ Telemetría: tabla sesiones + POST /db/sesiones
⬜ Client-side migration scripts (chrome.storage → DB data copy desde extensión)
⬜ Migración SQLite → PostgreSQL (futuro nube)
```
