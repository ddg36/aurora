import aiosqlite
import os
import pathlib
import time

DB_PATH = pathlib.Path(
    os.environ.get(
        "AURORA_DB_PATH",
        pathlib.Path(__file__).resolve().parent.parent.parent / "databases" / "aihub.db",
    )
)

_db: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        _db = await aiosqlite.connect(DB_PATH)
        _db.row_factory = aiosqlite.Row
        await _db.execute("PRAGMA journal_mode=WAL")
        await _db.execute("PRAGMA foreign_keys=ON")
    return _db


async def init_db():
    db = await get_db()
    schema = pathlib.Path(__file__).parent / "schema.sql"
    if schema.exists():
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        ) as cur:
            exists = await cur.fetchone()
        if not exists:
            await db.executescript(schema.read_text())
            await db.commit()

    async with db.execute(f"PRAGMA table_info(mensajes)") as cur:
        has_fijado = any(r["name"] == "fijado" for r in await cur.fetchall())
    if not has_fijado:
        await db.execute("ALTER TABLE mensajes ADD COLUMN fijado INTEGER NOT NULL DEFAULT 0")
        await db.commit()

    await _ensure_productividad(db)

    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='prompts_guardados'"
    ) as cur:
        if not await cur.fetchone():
            await db.execute("""
                CREATE TABLE prompts_guardados (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id INTEGER NOT NULL,
                    tipo TEXT NOT NULL DEFAULT 'general',
                    nombre TEXT,
                    contenido TEXT NOT NULL,
                    meta TEXT,
                    creado_en INTEGER NOT NULL DEFAULT (unixepoch())
                )
            """)
            await db.commit()


async def _ensure_productividad(db):
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS productividad_capturas (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          tipo         TEXT NOT NULL DEFAULT 'page',
          titulo       TEXT,
          url          TEXT,
          favicon      TEXT,
          seleccion    TEXT,
          contenido    TEXT,
          html_limpio  TEXT,
          metadata_json TEXT,
          screenshot   TEXT,
          origen       TEXT DEFAULT 'aurora-productivity',
          capturado_en INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_research (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          captura_id   INTEGER REFERENCES productividad_capturas(id) ON DELETE SET NULL,
          resumen_corto TEXT,
          resumen_largo TEXT,
          entidades_json TEXT,
          argumentos_json TEXT,
          decisiones_json TEXT,
          fuentes_json TEXT,
          preguntas_json TEXT,
          prompt       TEXT,
          creado_en    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_tasks (
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

        CREATE TABLE IF NOT EXISTS productividad_clipboard (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          contenido    TEXT NOT NULL,
          tipo         TEXT NOT NULL DEFAULT 'nota',
          tags_json    TEXT,
          destino      TEXT,
          url          TEXT,
          creado_en    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_form_profiles (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          nombre       TEXT NOT NULL,
          datos_json   TEXT NOT NULL,
          activo       INTEGER NOT NULL DEFAULT 1,
          creado_en    INTEGER NOT NULL DEFAULT (unixepoch()),
          actualizado  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_form_templates (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          dominio      TEXT NOT NULL,
          nombre       TEXT,
          campos_json  TEXT NOT NULL,
          creado_en    INTEGER NOT NULL DEFAULT (unixepoch()),
          actualizado  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_form_fills (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          template_id  INTEGER REFERENCES productividad_form_templates(id) ON DELETE SET NULL,
          url          TEXT,
          resultado_json TEXT,
          ejecutado_en INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_meetings (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          titulo       TEXT,
          url          TEXT,
          plataforma   TEXT,
          participantes_json TEXT,
          transcript   TEXT,
          chat         TEXT,
          resumen      TEXT,
          decisiones_json TEXT,
          pendientes_json TEXT,
          timeline_json TEXT,
          creado_en    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_tab_sessions (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          nombre       TEXT NOT NULL,
          resumen      TEXT,
          meta_json    TEXT,
          creado_en    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_tab_items (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          session_id   INTEGER REFERENCES productividad_tab_sessions(id) ON DELETE CASCADE,
          title        TEXT,
          url          TEXT,
          favicon      TEXT,
          active       INTEGER DEFAULT 0,
          window_id    INTEGER,
          group_id     INTEGER,
          preview      TEXT,
          abierto_en   INTEGER,
          creado_en    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_price_items (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          nombre       TEXT NOT NULL,
          url          TEXT NOT NULL,
          tienda       TEXT,
          moneda       TEXT,
          precio_objetivo REAL,
          selector_precio TEXT,
          selector_stock TEXT,
          imagen       TEXT,
          activo       INTEGER NOT NULL DEFAULT 1,
          creado_en    INTEGER NOT NULL DEFAULT (unixepoch()),
          actualizado  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS productividad_price_checks (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
          item_id      INTEGER NOT NULL REFERENCES productividad_price_items(id) ON DELETE CASCADE,
          precio       REAL,
          moneda       TEXT,
          stock        TEXT,
          raw_json     TEXT,
          revisado_en  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_prod_capturas_usuario ON productividad_capturas(usuario_id, capturado_en);
        CREATE INDEX IF NOT EXISTS idx_prod_tasks_usuario ON productividad_tasks(usuario_id, estado, actualizado);
        CREATE INDEX IF NOT EXISTS idx_prod_clipboard_usuario ON productividad_clipboard(usuario_id, creado_en);
        CREATE INDEX IF NOT EXISTS idx_prod_prices_usuario ON productividad_price_items(usuario_id, activo);
        CREATE INDEX IF NOT EXISTS idx_prod_price_checks_item ON productividad_price_checks(usuario_id, item_id, revisado_en);
    """)
    await db.commit()

    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ext_capturas'"
    ) as cur:
        if not await cur.fetchone():
            await db.execute("""
                CREATE TABLE ext_capturas (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
                    tipo         TEXT    NOT NULL,
                    titulo       TEXT,
                    url          TEXT,
                    contenido    TEXT,
                    chars        INTEGER,
                    tab_title    TEXT,
                    tab_url      TEXT,
                    capturado_en INTEGER NOT NULL DEFAULT (unixepoch())
                )
            """)
            await db.execute("CREATE INDEX idx_ext_capturas_usuario ON ext_capturas(usuario_id, capturado_en)")
            await db.execute("CREATE INDEX idx_ext_capturas_tipo    ON ext_capturas(usuario_id, tipo)")
            await db.commit()

    await _ensure_builder_templates(db)
    await _ensure_team_roles(db)
    await _ensure_creativity_ideas(db)

    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='md_reader_prefs'"
    ) as cur:
        if not await cur.fetchone():
            await db.executescript("""
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
            """)
            await db.commit()


async def _ensure_builder_templates(db):
    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='builder_templates'"
    ) as cur:
        if not await cur.fetchone():
            await db.executescript("""
                CREATE TABLE builder_templates (
                    id          TEXT PRIMARY KEY,
                    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
                    tipo        TEXT NOT NULL,
                    datos       TEXT NOT NULL,
                    version     INTEGER NOT NULL DEFAULT 1,
                    creado_en   INTEGER NOT NULL DEFAULT (unixepoch()),
                    actualizado INTEGER NOT NULL DEFAULT (unixepoch())
                );
                CREATE INDEX IF NOT EXISTS idx_builder_templates_usuario ON builder_templates(usuario_id, tipo);
            """)
            await db.commit()


async def _ensure_team_roles(db):
    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_team_roles'"
    ) as cur:
        if not await cur.fetchone():
            await db.executescript("""
                CREATE TABLE ai_team_roles (
                    id              TEXT PRIMARY KEY,
                    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
                    nombre          TEXT NOT NULL,
                    icono           TEXT,
                    color           TEXT,
                    prompt_template TEXT,
                    default_members TEXT,
                    orden           INTEGER NOT NULL DEFAULT 0,
                    creado_en       INTEGER NOT NULL DEFAULT (unixepoch()),
                    actualizado     INTEGER NOT NULL DEFAULT (unixepoch())
                );
                CREATE INDEX IF NOT EXISTS idx_team_roles_usuario ON ai_team_roles(usuario_id, orden);
            """)
            await db.commit()


async def _ensure_creativity_ideas(db):
    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='creativity_ideas'"
    ) as cur:
        if not await cur.fetchone():
            await db.executescript("""
                CREATE TABLE creativity_ideas (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
                    tematica   TEXT NOT NULL,
                    datos      TEXT NOT NULL,
                    creado_en  INTEGER NOT NULL DEFAULT (unixepoch()),
                    actualizado INTEGER NOT NULL DEFAULT (unixepoch()),
                    UNIQUE(usuario_id, tematica)
                );
            """)
            await db.commit()
    await seed_builder_data(db)


async def seed_builder_data(db):
    import json as _json

    templates_dir = pathlib.Path(__file__).resolve().parent.parent.parent / "ui" / "modules" / "prompts" / "templates"
    if not templates_dir.exists():
        return

    async with db.execute("SELECT id FROM usuarios") as cur:
        users = [r["id"] for r in await cur.fetchall()]
    if not users:
        return

    async with db.execute("SELECT COUNT(*) as n FROM builder_templates") as cur:
        existing = (await cur.fetchone())["n"]
    if existing > 0:
        return

    seed_files = {
        "builder_comfyui": ("comfyui", "comfyui-chips.tmpl.json"),
        "builder_wan":     ("wan",     "wan-video.tmpl.json"),
    }
    now = int(time.time())
    for tid, (tipo, fname) in seed_files.items():
        fpath = templates_dir / fname
        if not fpath.exists():
            continue
        try:
            data = _json.loads(fpath.read_text(encoding="utf-8"))
        except Exception:
            continue
        blob = _json.dumps(data, ensure_ascii=False)
        for uid in users:
            await db.execute(
                """INSERT OR IGNORE INTO builder_templates (id, usuario_id, tipo, datos, creado_en, actualizado)
                   VALUES (?,?,?,?,?,?)""",
                (tid, uid, tipo, blob, now, now),
            )

    roles_path = templates_dir / "roles-equipo.tmpl.json"
    if roles_path.exists():
        try:
            roles_data = _json.loads(roles_path.read_text(encoding="utf-8"))
            default_members = _json.dumps(roles_data.get("defaultMembers", []), ensure_ascii=False)
            for i, rol in enumerate(roles_data.get("roles", [])):
                rid = f"rol_{rol['id']}"
                for uid in users:
                    await db.execute(
                        """INSERT OR IGNORE INTO ai_team_roles
                           (id, usuario_id, nombre, icono, color, prompt_template, default_members, orden, creado_en, actualizado)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (rid, uid, rol.get("label", rol["id"]), rol.get("icono"), rol.get("color"),
                         rol.get("prompt"), default_members, i, now, now),
                    )
        except Exception:
            pass

    ideas_path = templates_dir / "conceptos-creatividad.tmpl.json"
    if ideas_path.exists():
        try:
            ideas_data = _json.loads(ideas_path.read_text(encoding="utf-8"))
            for tematica, datos in ideas_data.items():
                blob = _json.dumps(datos, ensure_ascii=False)
                for uid in users:
                    await db.execute(
                        """INSERT OR IGNORE INTO creativity_ideas (usuario_id, tematica, datos, creado_en, actualizado)
                           VALUES (?,?,?,?,?)""",
                        (uid, tematica, blob, now, now),
                    )
        except Exception:
            pass

    await db.commit()
