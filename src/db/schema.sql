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

CREATE INDEX idx_md_reader_files_usuario_root ON md_reader_files(usuario_id, root);
CREATE INDEX idx_md_reader_nodes_usuario_root ON md_reader_nodes(usuario_id, root);
CREATE INDEX idx_md_reader_edges_usuario_root ON md_reader_edges(usuario_id, root);

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
-- Historial de capturas de página, screenshot y YouTube desde extensiones Chrome
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
CREATE INDEX idx_ext_capturas_usuario      ON ext_capturas(usuario_id, capturado_en);
CREATE INDEX idx_ext_capturas_tipo         ON ext_capturas(usuario_id, tipo);
CREATE INDEX idx_prod_capturas_usuario     ON productividad_capturas(usuario_id, capturado_en);
CREATE INDEX idx_prod_tasks_usuario        ON productividad_tasks(usuario_id, estado, actualizado);
CREATE INDEX idx_prod_clipboard_usuario    ON productividad_clipboard(usuario_id, creado_en);
CREATE INDEX idx_prod_prices_usuario       ON productividad_price_items(usuario_id, activo);
CREATE INDEX idx_prod_price_checks_item    ON productividad_price_checks(usuario_id, item_id, revisado_en);
CREATE INDEX idx_bc_sesiones_usuario       ON bc_sesiones(usuario_id);
CREATE INDEX idx_bc_sesiones_activa        ON bc_sesiones(usuario_id, activa);
CREATE INDEX idx_yt_extracciones_usuario   ON yt_extracciones(usuario_id, extraido_en);
CREATE INDEX idx_yt_extracciones_fuente    ON yt_extracciones(usuario_id, fuente);
