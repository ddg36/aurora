# Auditoría de Base de Datos — Aurora v2

> **Contexto**: Aurora usa **SQLite** (vía `aiosqlite`) como único almacén. DB en
> `aurora/databases/aihub.db` (~16 MB, WAL). Es un experimento **local mono-usuario**
> sobre el harness pi. Este documento está escrito para que **otra IA codeadora**
> aplique mejoras. Foco: **funcionalidad** (qué está fallando o puede fallar) y luego
> **ideas de mejora**. Cada punto trae ubicación exacta y fix concreto.
>
> Estado verificado al auditar:
> - `PRAGMA integrity_check` → `ok`
> - `PRAGMA foreign_key_check` → sin violaciones
> - `journal_mode` → `wal` · `foreign_keys` → se activa por conexión (`ON`)
> - Tablas: 46 · usuarios: 2 · chats: 5 · mensajes: 131 · prompts: 60
>
> Fecha: 2026-07-10 · Rama: `master`

---

> ## ✅ Estado de resolución (actualizado 2026-07-10)
> **Todos los hallazgos DB resueltos.** Además se detectó y arregló un bug nuevo
> (FTS vacío por backfill frágil) y se agregaron mejoras (VACUUM a demanda,
> `json_loose` tolerante, búsqueda global en la UI). Ver detalle al pie y tachado abajo.

## Resumen de hallazgos

| # | Severidad | Título | Estado |
|---|-----------|--------|--------|
| DB-1 | 🟠 Alta | Resolución de la ruta de DB fragmentada en 3 fuentes que no coinciden | ✅ `_resolve_db_path` (env > server.toml > default) |
| DB-2 | 🟠 Alta | DDL duplicado: `schema.sql` **y** `_ensure_*` en `connection.py` (drift) | ✅ migraciones numeradas absorbieron los `_ensure_*` |
| DB-3 | 🟡 Media | `schema_migrations` existe pero **está vacía**: no hay versionado real | ✅ `MIGRACIONES` en uso (schema v8) |
| DB-4 | 🟡 Media | Backup por lista fija desincronizada del schema | ✅ `tablas_con_usuario` por introspección |
| DB-5 | 🟡 Media | Sin `busy_timeout`: "database is locked" bajo concurrencia | ✅ `busy_timeout=5000` + `synchronous=NORMAL` |
| DB-6 | 🟡 Media | Borrado de usuario imposible/inseguro: FKs a `usuarios` sin `ON DELETE` | ✅ `DELETE /{usuario_id}` transaccional (`TABLAS_HIJAS`) |
| DB-7 | 🟢 Baja | `src/db/aurora.db` huérfano (0 bytes) | ✅ borrado |
| DB-8 | 🟢 Baja | Conexión global única sin lock de init | ✅ `_init_lock = asyncio.Lock()` |
| DB-9 | 🟢 Baja | Falta índice compuesto `mensajes(chat_id, creado_en)` | ✅ `idx_mensajes_chat_ts` (schema.sql + migración #6) |
| DB-10 | 🟢 Baja | JSON guardado como TEXT sin validación de forma | ✅ `json_loose` tolerante (productividad, builder_templates) |

---

## DB-1 · 🟠 La ruta de la DB sale de 3 fuentes distintas

**Ubicación**:
- `src/db/connection.py:6-11` → `DB_PATH = AURORA_DB_PATH` env **o** default
  `<repo>/databases/aihub.db`.
- `config/server.toml:6-8` → `[db].path_linux = ".../databases/aihub/aihub.db"`
  (subcarpeta `aihub/`, ruta distinta) — **nadie la lee**.
- `src/pi/config.py:38` → `AURORA_DATA_DIR = <repo>/databases` (para `aurora-map.json`,
  `scoped-models.json`).

**Qué está mal**: hay tres lugares que "saben" dónde viven los datos y dan respuestas
distintas. La app usa `databases/aihub.db`; `server.toml` apunta a
`databases/aihub/aihub.db` (que no existe/no se usa).

**Por qué importa**: cualquiera (o cualquier IA) que quiera hacer un backup manual,
migrar o depurar mira `server.toml`, va al archivo equivocado y trabaja sobre una DB
que no es la real.

**Fix**: una sola función de resolución, `server.toml` como fuente declarada,
`AURORA_DB_PATH` como override explícito:

```python
# src/db/connection.py
import tomllib, platform
def _resolve_db_path() -> pathlib.Path:
    if env := os.environ.get("AURORA_DB_PATH"):
        return pathlib.Path(env)
    cfg = tomllib.loads((ROOT/"config/server.toml").read_text()).get("db", {})
    key = "path_windows" if platform.system() == "Windows" else "path_linux"
    if p := cfg.get(key):
        return pathlib.Path(p)
    return ROOT / "databases" / "aihub.db"
DB_PATH = _resolve_db_path()
```

Y corregir `server.toml` para que apunte a la ruta real (`databases/aihub.db`), o
mover la DB a donde dice `server.toml` — pero **una sola verdad**.

---

## DB-2 · 🟠 DDL duplicado — `schema.sql` y `_ensure_*` crean las mismas tablas

**Ubicación**:
- `src/db/schema.sql` (594 líneas) — define `productividad_*`, `ext_capturas`,
  `md_reader_*`, etc.
- `src/db/connection.py:70-352` — `_ensure_productividad`, `_ensure_builder_templates`,
  `_ensure_team_roles`, `_ensure_creativity_ideas` + bloques inline (`ext_capturas`,
  `md_reader_*`, `prompts_guardados`) **vuelven a crear las mismas tablas** con
  `CREATE TABLE IF NOT EXISTS` / chequeo de existencia.

**Qué está mal**: dos fuentes de verdad para el mismo DDL. En una DB nueva, `schema.sql`
crea todo primero; después los `_ensure_*` ven que la tabla existe y no hacen nada
(código muerto en el camino feliz). Solo sirven para DBs viejas creadas antes de que
esas tablas entraran a `schema.sql`.

**Por qué importa**: es la receta del **drift**. Si alguien agrega una columna en
`schema.sql` pero no en el `_ensure_*` correspondiente (o al revés), dos entornos
terminan con esquemas distintos según cuándo se creó su DB. Difícil de depurar.

**Fix**: elegir **una** estrategia:
- **Recomendado**: `schema.sql` es la verdad para DB nueva; todo cambio incremental va
  como **migración numerada** (ver DB-3). Borrar los `_ensure_*` una vez que exista el
  sistema de migraciones, o convertir cada uno en una migración con su número.
- Mientras tanto, dejar **un comentario** en ambos lados apuntando al otro para que
  nadie edite uno solo.

---

## DB-3 · 🟡 `schema_migrations` vacía — no hay versionado de schema

**Ubicación**:
- `src/db/schema.sql:6-11` — define la tabla `schema_migrations(version, descripcion, aplicada_en)`.
- `src/db/connection.py:26-48` — `init_db` corre `schema.sql` una vez, y aplica
  `ALTER TABLE` ad-hoc (`mensajes.fijado`, `chats.parent_chat_id`) con chequeos
  `PRAGMA table_info`. **Nunca hace `INSERT INTO schema_migrations`.**

Verificado: `SELECT * FROM schema_migrations` → **0 filas**.

**Qué está mal**: la infraestructura de migraciones existe (la tabla) pero no se usa.
No hay forma de preguntarle a una DB "¿en qué versión de schema estás?". Cada cambio de
esquema es un `if not columna: ALTER` suelto que se acumula en `init_db`.

**Por qué importa**: a medida que el experimento crezca, `init_db` se vuelve un
espagueti de chequeos y no hay garantía de orden ni de idempotencia real. Un cambio de
tipo o un rename no se puede expresar así.

**Fix**: sistema de migraciones mínimo, idempotente, numerado:

```python
MIGRATIONS = [
    (1, "base schema", None),               # ya aplicado por schema.sql
    (2, "mensajes.fijado", "ALTER TABLE mensajes ADD COLUMN fijado INTEGER NOT NULL DEFAULT 0"),
    (3, "chats.parent_chat_id", "ALTER TABLE chats ADD COLUMN parent_chat_id INTEGER REFERENCES chats(id)"),
    # ...las que hoy son _ensure_* pasan a ser migraciones numeradas
]
async def migrate(db):
    async with db.execute("SELECT COALESCE(MAX(version),0) v FROM schema_migrations") as c:
        actual = (await c.fetchone())["v"]
    for ver, desc, sql in MIGRATIONS:
        if ver > actual and sql:
            await db.executescript(sql)
            await db.execute("INSERT INTO schema_migrations(version, descripcion) VALUES (?,?)", (ver, desc))
            await db.commit()
```

Esto reemplaza los `ALTER` ad-hoc y (con el tiempo) los `_ensure_*` de DB-2.

---

## DB-4 · 🟡 Backup por lista fija desincronizada

**Ubicación**: `src/db/routes/backup.py:10-17` (`TABLAS_USUARIO`).

**Qué está mal**: el export solo cubre una lista hardcodeada. Faltan tablas con datos
del usuario: `builder_templates`, `ai_team_roles`, `creativity_ideas`, `ext_capturas`,
`prompts_guardados`, `md_reader_*`, `productividad_*` (todas). Detalle y fix completo en
`auditoria-codigo-y-funcionalidad.md` (hallazgo #5). Desde el ángulo DB: **derivar la
lista por introspección** de `sqlite_master` (tablas con columna `usuario_id`) para que
nunca quede desincronizada del schema al agregar tablas nuevas.

---

## DB-5 · 🟡 Sin `busy_timeout` — riesgo de "database is locked"

**Ubicación**: `src/db/connection.py:16-23` — `get_db` setea `PRAGMA journal_mode=WAL`
y `foreign_keys=ON`, pero **no** setea `busy_timeout`.

**Qué está mal**: hay una única conexión global compartida (bien para serializar), pero
SQLite en WAL todavía puede dar `SQLITE_BUSY` si un checkpoint o un lector externo (por
ejemplo abrir la DB con el CLI, o un segundo proceso) coincide con una escritura. Sin
`busy_timeout`, el error es inmediato en vez de reintentar.

**Por qué importa**: la extensión Chrome y la UI escriben seguido (capturas,
productividad, tabs). Un lock ocasional aborta la operación en vez de esperar unos ms.

**Fix**:

```python
await _db.execute("PRAGMA busy_timeout=5000")   # 5s de reintento automático
await _db.execute("PRAGMA synchronous=NORMAL")  # seguro en WAL, más rápido
```

---

## DB-6 · 🟡 Borrar un usuario es imposible/inseguro — FKs sin `ON DELETE`

**Ubicación**: casi todas las tablas hijas referencian `usuarios(id)` **sin** cláusula
`ON DELETE` (ej. `schema.sql:107` `nav_sesiones`, `:184` `ajustes`, `:193`
`wiki_indice`, `chats`, `prompts`, `sesiones`, etc.). No existe endpoint de borrado de
usuario (`usuarios.py` no tiene `DELETE`).

**Qué está mal**: con `foreign_keys=ON`, intentar borrar un usuario que tiene datos
**falla** por violación de FK; y como no hay `ON DELETE CASCADE`, no hay forma limpia de
limpiar todo lo suyo. Hoy no se puede ni resetear un usuario.

**Por qué importa**: un experimento acumula usuarios de prueba y basura. Sin poder
borrarlos limpio, la DB solo crece. También bloquea un futuro "borrar mi cuenta / mis
datos".

**Fix** (dos opciones):
- Agregar `ON DELETE CASCADE` a las FKs hacia `usuarios(id)` en `schema.sql` (requiere
  migración: SQLite no permite alterar FKs in-place, hay que recrear tablas — costoso).
- **Más simple para local**: un endpoint `DELETE /db/usuarios/{id}` que borre en orden
  todas las tablas del usuario dentro de una transacción (reusando la lista por
  introspección de DB-4).

---

## DB-7 · 🟢 `src/db/aurora.db` huérfano

**Ubicación**: `src/db/aurora.db` — archivo de **0 bytes**, creado por accidente
(probablemente al correr algo con CWD en `src/db`). No lo usa el código
(`DB_PATH` resuelve a `databases/aihub.db`).

**Fix**: borrarlo. Ya está en `.gitignore` (`src/db/aurora.db`).

---

## DB-8 · 🟢 Conexión global sin lock de inicialización

**Ubicación**: `src/db/connection.py:16-23` — `get_db` hace lazy-init de `_db` sin lock.

**Qué está mal**: si dos corrutinas llaman `get_db()` a la vez con `_db is None`, ambas
abren conexión y una se pierde (leak). En la práctica el init corre en `on_startup`
antes de aceptar requests, así que casi nunca pasa.

**Fix** (barato): un `asyncio.Lock` alrededor del init, o abrir la conexión una vez en
`on_startup` y guardarla, sin lazy.

---

## DB-9 · 🟢 Índice compuesto faltante para orden cronológico de mensajes

**Ubicación**: índices actuales en `mensajes` (`schema.sql:557-558`):
`idx_mensajes_chat(chat_id)` y `idx_mensajes_rol(chat_id, rol)`.

**Qué está mal**: la carga típica de un chat es `WHERE chat_id=? ORDER BY creado_en`
(ver `chats.py`). Con el índice solo por `chat_id`, SQLite ordena en memoria. Con 131
mensajes es irrelevante, pero es la query más caliente y crecerá.

**Fix**:

```sql
CREATE INDEX idx_mensajes_chat_ts ON mensajes(chat_id, creado_en);
```

(Menor: `sesiones.chat_id` tampoco tiene índice; solo importa si se consulta por chat.)

---

## DB-10 · 🟢 JSON en columnas TEXT sin validación

**Ubicación**: muchas columnas `*_json` / `meta` / `datos` guardan JSON como TEXT
(ej. `productividad_*`, `builder_templates.datos`, `ajustes.valor`). Se serializa con
`json.dumps` al insertar (`builtin.py:_json`, `productividad.py:_j`) pero no se valida
al leer.

**Qué está mal**: si una fila queda con JSON malformado (bug de escritura, edición
manual), la lectura revienta en `json.loads` sin contexto. No es un bug activo, es
fragilidad.

**Fix**: helper de lectura tolerante (`try/except → default`) y, si se quiere garantía
fuerte, `CHECK(json_valid(columna))` en las columnas JSON (SQLite lo soporta). Para un
experimento, el helper tolerante alcanza.

---

## Ideas de mejora a implementar (para el codeador)

Priorizadas por impacto/esfuerzo para un proyecto local:

1. **Resolución única de ruta de DB** (DB-1) — `resolve_db_path()`, `server.toml` como
   verdad, env como override. *Barato, alto valor: elimina confusión de datos.*

2. **Sistema de migraciones numeradas** (DB-3) — reemplaza los `ALTER` ad-hoc y absorbe
   los `_ensure_*` (DB-2). Deja la DB auto-describible por versión. *Esfuerzo medio,
   paga cada cambio de schema futuro.*

3. **Backup por introspección + restore** (DB-4 y código #5) — respaldo a prueba de
   olvidos y de ida y vuelta. `tablas_con_usuario(db)` como base compartida con el
   endpoint de borrado (DB-6). *Arquitectura compartida, no fix por-tabla.*

4. **PRAGMAs de robustez** (DB-5) — `busy_timeout=5000`, `synchronous=NORMAL`,
   `wal_autocheckpoint`. Una línea cada uno en `get_db`. *Trivial, evita locks.*

5. **Borrado/reset de usuario** (DB-6) — endpoint transaccional que limpia todas las
   tablas del usuario. Reusa la introspección del punto 3.

6. **Búsqueda full-text (FTS5)** — tabla virtual FTS5 sobre `mensajes.contenido`,
   `prompts.contenido` y `wiki_indice.resumen`. Habilita búsqueda real en el chat y RAG
   local sin escanear todo. *Esfuerzo medio; encaja con el `wiki_indice` que ya existe
   "para RAG".*

7. **Job de mantenimiento** — `VACUUM` + `ANALYZE` + checkpoint WAL periódico (ya hay
   `jobs/cleanup_capturas.py` y `db/routes/jobs.py`: colgar ahí un job semanal). La DB
   ya pesa 16 MB con pocos datos por el WAL; un checkpoint la achica.

8. **Mover el bookkeeping de pi a la DB (opcional)** — hoy `aurora-map.json` y
   `scoped-models.json` viven en `databases/` como archivos sueltos
   (`pi/config.py:38`, `pi/bridge.py:28-29`). Pasarlos a una tabla los incluiría en el
   backup y evitaría corrupción por escritura concurrente. *Evaluar: son de pi, quizá
   convenga dejarlos como archivos; documentar la decisión.*

9. **Constraint `CHECK(json_valid(...))` en columnas JSON críticas** (DB-10) — garantía
   barata contra filas corruptas.

10. **Índice `mensajes(chat_id, creado_en)`** (DB-9) — una línea, la query más caliente.

---

## Anexo — trabajo de la sesión 2026-07-10 (resolución + hallazgos nuevos)

### Bug nuevo encontrado y arreglado: FTS quedaba vacío

`_mig_fts` (migración #7) crea la tabla `search_fts` + triggers y hace backfill de
datos históricos, pero la condición de backfill era `if not existia` (por
existencia de la tabla). Si un arranque previo creaba la tabla pero el backfill
quedaba a medias o vacío, **nunca se re-poblaba** — la búsqueda quedaba sin datos
históricos para siempre (verificado: `search_fts` tenía 0 filas con 191 mensajes en
la DB). **Fix**: backfill por *tabla vacía* (`SELECT 1 ... LIMIT 1`) en vez de por
existencia, extraído a `_fts_backfill(db)` idempotente, + migración #8 que lo corre
para reparar DBs ya migradas. Resultado: 191 filas indexadas, búsqueda funcionando.

### Mejoras implementadas

- **VACUUM + ANALYZE a demanda** (idea #7): `run_mantenimiento_profundo()` en
  `jobs/db_maintenance.py` + endpoint `POST /db/jobs/db-vacuum`. El de arranque
  (`run_mantenimiento`) sigue haciendo sólo `wal_checkpoint`+`optimize` (barato). El
  profundo (caro, reescribe el archivo) es manual. *Verificado: recuperó 6.7 MB
  (16.4 → 9.7 MB), exactamente el problema de "16 MB con pocos datos".*
- **`json_loose(texto, fallback)`** en `connection.py` (idea #9 / DB-10, versión
  pragmática): helper de lectura tolerante ante JSON malformado — evita recrear
  tablas para meter `CHECK(json_valid())`. Usado en `productividad.py` (`_pj`) y
  `builder_templates.py`. Devuelve el fallback + loguea warning en vez de reventar.
- **Búsqueda global en la UI**: el CommandPalette (Ctrl+K) ahora consume `/db/search`
  (FTS) además de comandos de navegación — busca en chats/prompts/wiki con debounce y
  navega al resultado. El backend FTS ya existía sin consumidor.

### Nota sobre DB-9 (query real usa `ORDER BY id`, no `creado_en`)

`chats.py:117` carga mensajes con `ORDER BY id ASC`, no `ORDER BY creado_en`. El
índice `(chat_id, creado_en)` igual ayuda (el filtro `chat_id=?` lo usa) y otras
queries por fecha se benefician, pero la query más caliente ordena por el rowid.
No es bug — `id` autoincremental ≈ orden cronológico y usa el índice por `chat_id`.
