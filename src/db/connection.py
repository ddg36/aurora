import asyncio
import json
import logging
import os
import pathlib
import platform
import time
import tomllib

import aiosqlite

log = logging.getLogger("aurora.db")

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent


def json_loose(texto, fallback=None):
    """json.loads tolerante: si la columna TEXT tiene JSON malformado (bug de
    escritura, edición manual), devuelve `fallback` en vez de reventar la
    lectura sin contexto. SQLite guarda JSON como TEXT sin garantía de forma."""
    if not texto:
        return fallback
    try:
        return json.loads(texto)
    except (ValueError, TypeError):
        log.warning("JSON malformado en columna, usando fallback")
        return fallback


def _normalizar_ruta_db(valor: str | os.PathLike[str]) -> pathlib.Path:
    """Resuelve rutas relativas contra la raíz de Aurora, no contra el CWD."""
    ruta = pathlib.Path(valor).expanduser()
    if not ruta.is_absolute():
        ruta = ROOT / ruta
    return ruta.resolve(strict=False)


def _resolve_db_path() -> pathlib.Path:
    """Única verdad de la DB: env > config por SO > config común > default."""
    if env := os.environ.get("AURORA_DB_PATH"):
        return _normalizar_ruta_db(env)

    toml_path = ROOT / "config" / "server.toml"
    if toml_path.exists():
        try:
            cfg = tomllib.loads(toml_path.read_text(encoding="utf-8")).get("db", {})
            key = "path_windows" if platform.system() == "Windows" else "path_linux"
            if valor := cfg.get(key) or cfg.get("path"):
                return _normalizar_ruta_db(valor)
        except Exception as e:
            log.warning("server.toml [db] ilegible (%s), usando default", e)

    return _normalizar_ruta_db("databases/aihub.db")


DB_PATH = _resolve_db_path()

_db: aiosqlite.Connection | None = None
_init_lock = asyncio.Lock()


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        async with _init_lock:
            if _db is None:
                if DB_PATH.exists() and DB_PATH.is_dir():
                    raise IsADirectoryError(f"AURORA_DB_PATH apunta a un directorio: {DB_PATH}")
                try:
                    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
                except OSError as exc:
                    raise RuntimeError(
                        f"No se pudo preparar el directorio de la DB: {DB_PATH.parent}"
                    ) from exc

                log.info("abriendo SQLite en %s", DB_PATH)
                conn = await aiosqlite.connect(str(DB_PATH))
                conn.row_factory = aiosqlite.Row
                await conn.execute("PRAGMA journal_mode=WAL")
                await conn.execute("PRAGMA foreign_keys=ON")
                await conn.execute("PRAGMA busy_timeout=5000")
                await conn.execute("PRAGMA synchronous=NORMAL")
                _db = conn
    return _db


# ══════════════════════════════════════════════════════
#  MIGRACIONES NUMERADAS
#  schema.sql es la verdad para DB nueva (versión 1).
#  Todo cambio incremental entra acá como (versión, descripción, fn).
#  Cada fn es idempotente: DBs viejas con schema_migrations vacía
#  pueden correr todo sin romper.
# ══════════════════════════════════════════════════════


async def _tiene_columna(db, tabla: str, columna: str) -> bool:
    async with db.execute(f"PRAGMA table_info({tabla})") as cur:
        return any(r["name"] == columna for r in await cur.fetchall())


async def _tiene_tabla(db, tabla: str) -> bool:
    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tabla,)
    ) as cur:
        return bool(await cur.fetchone())


async def _mig_fijado(db):
    if not await _tiene_columna(db, "mensajes", "fijado"):
        await db.execute("ALTER TABLE mensajes ADD COLUMN fijado INTEGER NOT NULL DEFAULT 0")


async def _mig_parent_chat(db):
    if not await _tiene_columna(db, "chats", "parent_chat_id"):
        await db.execute("ALTER TABLE chats ADD COLUMN parent_chat_id INTEGER REFERENCES chats(id)")


async def _mig_tablas_modulos(db):
    await _ensure_productividad(db)


async def _mig_prompts_guardados(db):
    if not await _tiene_tabla(db, "prompts_guardados"):
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


async def _mig_idx_mensajes(db):
    await db.execute("CREATE INDEX IF NOT EXISTS idx_mensajes_chat_ts ON mensajes(chat_id, creado_en)")


async def _mig_mensajes_estructura(db):
    if not await _tiene_columna(db, "mensajes", "estructura_json"):
        await db.execute("ALTER TABLE mensajes ADD COLUMN estructura_json TEXT")


async def _mig_fts(db):
    """Búsqueda full-text: search_fts indexa mensajes, prompts y wiki_indice.
    Triggers mantienen el índice; el trigger de insert borra antes de insertar
    (self-healing ante REPLACE, que no dispara delete triggers)."""
    await db.executescript("""
        CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
            texto, tipo UNINDEXED, ref_id UNINDEXED, usuario_id UNINDEXED,
            tokenize='unicode61 remove_diacritics 2'
        );

        CREATE TRIGGER IF NOT EXISTS fts_mensajes_ins AFTER INSERT ON mensajes BEGIN
            DELETE FROM search_fts WHERE tipo='mensaje' AND ref_id=NEW.id;
            INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
                SELECT NEW.contenido, 'mensaje', NEW.id, c.usuario_id
                FROM chats c WHERE c.id = NEW.chat_id;
        END;
        CREATE TRIGGER IF NOT EXISTS fts_mensajes_upd AFTER UPDATE OF contenido ON mensajes BEGIN
            DELETE FROM search_fts WHERE tipo='mensaje' AND ref_id=OLD.id;
            INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
                SELECT NEW.contenido, 'mensaje', NEW.id, c.usuario_id
                FROM chats c WHERE c.id = NEW.chat_id;
        END;
        CREATE TRIGGER IF NOT EXISTS fts_mensajes_del AFTER DELETE ON mensajes BEGIN
            DELETE FROM search_fts WHERE tipo='mensaje' AND ref_id=OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS fts_prompts_ins AFTER INSERT ON prompts BEGIN
            DELETE FROM search_fts WHERE tipo='prompt' AND ref_id=NEW.id;
            INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
                VALUES (NEW.nombre || ' ' || NEW.contenido, 'prompt', NEW.id, NEW.usuario_id);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_prompts_upd AFTER UPDATE OF nombre, contenido ON prompts BEGIN
            DELETE FROM search_fts WHERE tipo='prompt' AND ref_id=OLD.id;
            INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
                VALUES (NEW.nombre || ' ' || NEW.contenido, 'prompt', NEW.id, NEW.usuario_id);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_prompts_del AFTER DELETE ON prompts BEGIN
            DELETE FROM search_fts WHERE tipo='prompt' AND ref_id=OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS fts_wiki_ins AFTER INSERT ON wiki_indice BEGIN
            DELETE FROM search_fts WHERE tipo='wiki' AND ref_id=NEW.id;
            INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
                VALUES (COALESCE(NEW.titulo,'') || ' ' || COALESCE(NEW.resumen,'') || ' ' || COALESCE(NEW.tags,'') || ' ' || NEW.path,
                        'wiki', NEW.id, NEW.usuario_id);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_wiki_upd AFTER UPDATE ON wiki_indice BEGIN
            DELETE FROM search_fts WHERE tipo='wiki' AND ref_id=OLD.id;
            INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
                VALUES (COALESCE(NEW.titulo,'') || ' ' || COALESCE(NEW.resumen,'') || ' ' || COALESCE(NEW.tags,'') || ' ' || NEW.path,
                        'wiki', NEW.id, NEW.usuario_id);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_wiki_del AFTER DELETE ON wiki_indice BEGIN
            DELETE FROM search_fts WHERE tipo='wiki' AND ref_id=OLD.id;
        END;
    """)
    await _fts_backfill(db)


async def _fts_backfill(db):
    """Puebla search_fts si está VACÍA (no sólo "si no existía"): un arranque
    previo pudo crear la tabla pero dejar el backfill a medias o vacío, y con
    el chequeo por-existencia nunca se re-poblaba — quedaba la búsqueda sin
    datos históricos para siempre. Por vacía es idempotente y auto-repara."""
    if not await _tiene_tabla(db, "search_fts"):
        return
    async with db.execute("SELECT 1 FROM search_fts LIMIT 1") as cur:
        if await cur.fetchone() is not None:
            return
    await db.execute("""
        INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
            SELECT m.contenido, 'mensaje', m.id, c.usuario_id
            FROM mensajes m JOIN chats c ON c.id = m.chat_id
    """)
    await db.execute("""
        INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
            SELECT nombre || ' ' || contenido, 'prompt', id, usuario_id FROM prompts
    """)
    await db.execute("""
        INSERT INTO search_fts(texto, tipo, ref_id, usuario_id)
            SELECT COALESCE(titulo,'') || ' ' || COALESCE(resumen,'') || ' ' || COALESCE(tags,'') || ' ' || path,
                   'wiki', id, usuario_id
            FROM wiki_indice
    """)


async def _mig_cloud_agent_journal(db):
    # Journal durable del diálogo Cloud. Tools viven en JSON Family.
    await db.executescript('''
        CREATE TABLE IF NOT EXISTS cloud_agent_turns (
            usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            turn_id      TEXT    NOT NULL,
            conv_id      INTEGER REFERENCES cloud_conversaciones(id) ON DELETE SET NULL,
            ai_id        TEXT,
            url          TEXT,
            pane_id      TEXT    NOT NULL DEFAULT 'cloud',
            status       TEXT    NOT NULL DEFAULT 'prepared',
            iteration    INTEGER NOT NULL DEFAULT 0,
            request_id   TEXT,
            prompt       TEXT,
            next_prompt  TEXT,
            state_json   TEXT,
            created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
            completed_at INTEGER,
            PRIMARY KEY (usuario_id, turn_id)
        );
        CREATE INDEX IF NOT EXISTS idx_cloud_turn_pending
            ON cloud_agent_turns(usuario_id, pane_id, status, updated_at);
    ''')


async def _mig_json_family_runs(db):
    await db.executescript('''
        CREATE TABLE IF NOT EXISTS json_family_runs (
            usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            request_id    TEXT    NOT NULL,
            input_hash    TEXT    NOT NULL,
            status        TEXT    NOT NULL DEFAULT 'running',
            response_json TEXT,
            created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
            completed_at  INTEGER,
            PRIMARY KEY (usuario_id, request_id)
        );
        CREATE INDEX IF NOT EXISTS idx_json_family_runs_status
            ON json_family_runs(usuario_id, status, updated_at);
    ''')


async def _mig_json_family_delivery_ack(db):
    if not await _tiene_columna(db, "json_family_runs", "delivered_at"):
        await db.execute("ALTER TABLE json_family_runs ADD COLUMN delivered_at INTEGER")


async def _mig_nexus_v2_runs(db):
    await db.executescript('''
        CREATE TABLE IF NOT EXISTS nexus_v2_runs (
            usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            request_id    TEXT    NOT NULL,
            input_hash    TEXT    NOT NULL,
            status        TEXT    NOT NULL DEFAULT 'running',
            response_json TEXT,
            created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
            completed_at  INTEGER,
            delivered_at  INTEGER,
            PRIMARY KEY (usuario_id, request_id)
        );
        CREATE INDEX IF NOT EXISTS idx_nexus_v2_runs_status
            ON nexus_v2_runs(usuario_id, status, updated_at);
    ''')


async def _mig_drop_legacy_cloud_tool_journal(db):
    # JSON Family reemplazó por completo este journal duplicado. Los snapshots
    # reanudables permanecen en cloud_agent_turns/json_family_runs.
    await db.execute("DROP TABLE IF EXISTS cloud_tool_journal")


MIGRACIONES: list[tuple[int, str, object]] = [
    (2, "mensajes.fijado", _mig_fijado),
    (3, "chats.parent_chat_id", _mig_parent_chat),
    (4, "tablas productividad/ext_capturas/md_reader/builder", _mig_tablas_modulos),
    (5, "prompts_guardados", _mig_prompts_guardados),
    (6, "indice mensajes(chat_id, creado_en)", _mig_idx_mensajes),
    (7, "busqueda full-text FTS5 (search_fts)", _mig_fts),
    (8, "repoblar FTS si quedó vacío", _fts_backfill),
    (9, "journal durable de tools y turnos Cloud", _mig_cloud_agent_journal),
    (10, "journal durable de requests JSON Family", _mig_json_family_runs),
    (11, "acuse durable de entrega JSON Family", _mig_json_family_delivery_ack),
    (12, "retirar journal legacy de cloud-tool", _mig_drop_legacy_cloud_tool_journal),
    (13, "turnos Pi estructurados en mensajes", _mig_mensajes_estructura),
    (14, "journal durable de Nexus 2", _mig_nexus_v2_runs),
]


async def init_db():
    db = await get_db()

    # Versión 1: schema base. DB nueva → schema.sql completo.
    if not await _tiene_tabla(db, "usuarios"):
        schema = pathlib.Path(__file__).parent / "schema.sql"
        await db.executescript(schema.read_text(encoding="utf-8"))
        await db.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, descripcion) VALUES (1, 'schema base (schema.sql)')"
        )
        await db.commit()
    elif await _tiene_tabla(db, "schema_migrations"):
        await db.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, descripcion) VALUES (1, 'schema base preexistente')"
        )
        await db.commit()

    async with db.execute("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations") as cur:
        actual = (await cur.fetchone())["v"]

    for version, descripcion, fn in MIGRACIONES:
        if version <= actual:
            continue
        try:
            await fn(db)
            await db.execute(
                "INSERT INTO schema_migrations (version, descripcion) VALUES (?, ?)",
                (version, descripcion),
            )
            await db.commit()
            log.info("migración %d aplicada: %s", version, descripcion)
        except Exception:
            await db.rollback()
            log.exception("migración %d falló: %s", version, descripcion)
            raise

    if await _tiene_tabla(db, "json_family_runs"):
        await db.execute(
            "UPDATE json_family_runs SET status='unknown', updated_at=unixepoch() WHERE status='running'"
        )
        await db.commit()

    if await _tiene_tabla(db, "nexus_v2_runs"):
        await db.execute(
            "UPDATE nexus_v2_runs SET status='unknown', updated_at=unixepoch() WHERE status='running'"
        )
        await db.commit()

    # El seed corre en cada arranque: en DB nueva los usuarios aparecen
    # después de la primera migración, no durante.
    await seed_builder_data(db)


async def schema_version(db) -> int:
    if not await _tiene_tabla(db, "schema_migrations"):
        return 0
    async with db.execute("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations") as cur:
        return (await cur.fetchone())["v"]


async def tablas_con_usuario(db) -> list[str]:
    """Tablas de datos del usuario, por introspección — base compartida de
    backup, restore y borrado de usuario. Nunca se desincroniza del schema."""
    async with db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_fts%'"
    ) as cur:
        tablas = [r["name"] for r in await cur.fetchall()]
    out = []
    for t in tablas:
        if t in ("usuarios", "schema_migrations"):
            continue
        if await _tiene_columna(db, t, "usuario_id"):
            out.append(t)
    return sorted(out)


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

    if not await _tiene_tabla(db, "ext_capturas"):
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

    await _ensure_builder_templates(db)
    await _ensure_team_roles(db)
    await _ensure_creativity_ideas(db)

    if not await _tiene_tabla(db, "md_reader_prefs"):
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


async def _ensure_builder_templates(db):
    if not await _tiene_tabla(db, "builder_templates"):
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


async def _ensure_team_roles(db):
    if not await _tiene_tabla(db, "ai_team_roles"):
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


async def _ensure_creativity_ideas(db):
    if not await _tiene_tabla(db, "creativity_ideas"):
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
