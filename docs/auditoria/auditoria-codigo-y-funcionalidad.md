# Auditoría de Código y Funcionalidad — Aurora v2

> **Contexto**: Aurora es un mini-proyecto **local, mono-usuario**, un experimento
> para probar una UI web (hub de IA + productividad) montada encima del harness
> **pi** vía RPC. Este documento está escrito para que **otra IA codeadora** aplique
> las correcciones. Cada hallazgo trae: severidad, ubicación exacta (`archivo:línea`),
> qué está mal, **por qué importa** (en criollo) y el **fix concreto**.
>
> La severidad está calibrada al escenario real (local, un solo usuario en su propia
> máquina). No es un producto en producción; aun así hay agujeros que exponen la
> máquina del usuario a cualquier web que visite mientras Aurora corre.
>
> Fecha auditoría: 2026-07-10 · Rama: `master`

---

> ## ✅ Estado de resolución (actualizado 2026-07-10)
> Auditoría **resuelta casi por completo**. Ver detalle tachado abajo. Resumen:
> - **Resueltos**: #1, #2, #3, #4, #5, #6, #7 (parcial), #9, #10 (todos los ítems).
> - **Aceptados por decisión** (experimento local): #1 `host=0.0.0.0` y #8 `<all_urls>`/`debugger`
>   siguen porque la extensión/red local los necesita; el riesgo real ya lo cortan el CORS
>   acotado + guard global. `externally_connectable` sí se acotó a un id.
> - Ver también memoria del proyecto: `arquitectura-post-auditoria`.

## Tabla de severidad

| # | Severidad | Área | Título | Estado |
|---|-----------|------|--------|--------|
| 1 | 🔴 Crítica | Seguridad | RCE por drive-by: rutas `/nexus/*` sin auth + CORS `*` + private-network | ✅ CORS acotado + guard global |
| 2 | 🔴 Crítica | Seguridad | Casi ningún router aplica `auth_guard` (pi, nexus, tools, mcp, ext, parser, voz) | ✅ `auth_guard_global` + `RUTAS_PUBLICAS` |
| 3 | 🟠 Alta | Seguridad | `/tools/{name}/run`: `caller` y `approved` vienen del body → bypass de gates | ✅ `caller` derivado del servidor |
| 4 | 🟠 Alta | Funcional | WebNavigator muerto: `browser_use` no está instalado ni en `requirements.txt` | ✅ `browser_use_disponible()` + error claro + `/health` |
| 5 | 🟠 Alta | Funcional | Backup incompleto: `TABLAS_USUARIO` desincronizada del schema real (pérdida de datos) | ✅ `tablas_con_usuario` (introspección) + `/restore` |
| 6 | 🟡 Media | Config | `config/server.toml [db]` es configuración muerta (nadie la lee) | ✅ `_resolve_db_path` la lee |
| 7 | 🟡 Media | Seguridad | `usuarios/init|crear|list` sin auth → cualquiera obtiene token; `/list` filtra todos | ✅ `/list` con `auth_guard`; init/login públicos por diseño |
| 8 | 🟡 Media | Seguridad | Extensión `aihub`: permisos enormes (`debugger`, `<all_urls>`, `externally_connectable:["*"]`) | 🔸 `externally_connectable` acotado; resto aceptado (local) |
| 9 | 🟡 Media | Robustez | Sin backup/restore inverso ni migraciones versionadas | ✅ `MIGRACIONES` numeradas + `/restore` |
| 10 | 🟢 Baja | Higiene | `src/db/aurora.db` huérfano (0 bytes), `logs/aurora.log` vacío, `BASE` hardcodeado en `boot.js` | ✅ borrado + `RotatingFileHandler` + `location.origin` |

---

## 1. 🔴 RCE por drive-by — `/nexus/*` sin autenticación + CORS abierto

**Ubicación**:
- `src/main.py:94` — los routers se registran sin guard global.
- `src/main.py:125` — `CORSConfig(allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])`.
- `src/main.py:106-120` — `PrivateNetworkMiddleware` inyecta `access-control-allow-private-network: true`.
- `config/server.toml:2` — `host = "0.0.0.0"`.
- `src/nexus/shell.py:39`, `src/nexus/fs.py:*`, `src/nexus/py.py:*` — rutas sin `guards=[auth_guard]`.

**Qué está mal**: las rutas de nexus (`/nexus/shell/run`, `/nexus/fs/write`,
`/nexus/fs/delete`, `/nexus/py/run`, `/nexus/py/pip-install`, …) **no tienen ningún
guard**. Cualquiera que llegue al puerto ejecuta comandos shell y lee/escribe/borra
archivos. Como el CORS responde `*` a todo y el server acepta preflights de
red privada, **cualquier página web que el usuario visite mientras Aurora corre**
puede hacer `fetch('http://localhost:7779/nexus/shell/run', {method:'POST', body: JSON.stringify({cmd:'...'})})`
y el navegador lo permite (no hay token, no hay CSRF, el preflight pasa).

**Por qué importa**: es una cadena de RCE real. Una web maliciosa (o un anuncio,
o un iframe) puede correr comandos arbitrarios en la máquina del usuario. Es el
riesgo #1 aunque el proyecto sea "local".

**Fix** (elegir uno, en orden de menor esfuerzo):
- **Mínimo**: cambiar `host` a `127.0.0.1` y **restringir CORS** a
  `["http://localhost:7779", "http://127.0.0.1:7779"]` en vez de `*`. Eso corta el
  drive-by cross-site (el preflight de una web externa fallaría).
- **Correcto**: aplicar `auth_guard` a **todos** los routers que hoy no lo tienen
  (ver hallazgo #2). Un fetch cross-site no lleva el `Authorization: Bearer`.
- **Robusto**: agregar un middleware que rechace requests cuyo header `Origin` no
  esté en una allowlist, salvo `GET`/UI estática.

```python
# src/main.py — CORS acotado
cors_config=CORSConfig(
    allow_origins=["http://localhost:7779", "http://127.0.0.1:7779"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

> ⚠️ El `PrivateNetworkMiddleware` (main.py:106) fue puesto para que la extensión
> Chrome pudiera hablar con localhost. Si se acota el CORS, revisar que la extensión
> siga funcionando (su origen `chrome-extension://…` tendría que ir en la allowlist).

---

## 2. 🔴 Casi ningún router aplica `auth_guard`

**Ubicación**: `src/db/auth.py:8` define `auth_guard`. Solo lo usan los controllers
de `db/` (`grep` confirma ~24 controllers) y `browser/router.py:88,111`. **No lo usan**:

| Router | Archivo | Rutas expuestas sin auth |
|--------|---------|--------------------------|
| pi (Lyra) | `src/pi/router.py:16` | WS `/lyra` — chatear, arrancar pi, `/login` (guardar API keys), `/quit` |
| nexus | `src/nexus/router.py` | fs/shell/py/editor/tasks/approvals — RCE + FS |
| tools | `src/tools/router.py` | `/tools/{name}/run`, `/tools/ocr` |
| mcp | `src/mcp/router.py` | `/mcp/rpc`, `/mcp/external/*` |
| ext | `src/ext/router.py` | `/ext/cmd`, `/ext/ws` — comandar la extensión |
| parser | `src/parser/router.py` | endpoints de parseo |
| voz | `src/voz/router.py` | STT/TTS |

**Qué está mal**: el modelo de autenticación por token existe (tabla `usuarios.token`,
`auth_guard` valida `Bearer`), pero solo protege la capa `/db/*`. Todo lo peligroso
(shell, filesystem, control de pi, control de la extensión) está abierto.

**Por qué importa**: el token da una **falsa sensación de seguridad**. La superficie
real de ataque no está protegida por él.

**Fix**: registrar los routers peligrosos detrás del guard. En Litestar se puede
poner el guard a nivel de `Router` o incluso global en la app y hacer whitelist de
las rutas públicas (`/`, `/ping`, `/health`, `/ui`, `/db/usuarios/init`, `/db/usuarios/login`).

```python
# opción: guard global + excepciones
app = Litestar(
    route_handlers=ROUTES,
    guards=[auth_guard_global],   # que deje pasar rutas públicas por path
    ...
)
```

Para los **WebSocket** (`/lyra`, `/ext/ws`) el guard tiene que validar el token en
el primer mensaje o en query param, porque los WS no siempre mandan `Authorization`.

---

## 3. 🟠 `/tools/{name}/run`: `caller` y `approved` controlados por el cliente

**Ubicación**:
- `src/tools/router.py:28-33` — `caller = data.get("caller") or {"kind": "internal", ...}`.
- `src/tools/registry.py:38-42` — el gate de riesgo externo se salta si `caller.kind == "internal"`.
- `src/tools/builtin.py:68-76` — `nexus_shell_run` pasa `approved=bool(args.get("approved"))`.

**Qué está mal**: el `caller` llega **desde el body de la request**. Un cliente
externo manda `{"caller": {"kind": "internal"}}` y pasa el chequeo
`_EXTERNAL_ALLOWED_RISKS`. Y `approved` para shell también viene de `args`.

**Por qué importa**: aunque `run_tool` corta las tools con `requires_approval` antes
de ejecutar (registry.py:41 — eso sí protege `aurora.nexus.shell.run`), la
distinción interno/externo es puro teatro: cualquiera se declara interno.

**Fix**: derivar `caller.kind` del **servidor**, no del body. Si la request pasó por
`auth_guard`, es interna (`connection.state.usuario_id`); si no, es externa. Nunca
confiar en `data["caller"]`. Y `approved` para shell solo debe venir del flujo de
approvals real (tabla `nexus_approvals`), no de un campo del request.

---

## 4. 🟠 WebNavigator muerto — `browser_use` no instalado ni declarado

**Ubicación**:
- `src/browser/agent.py:22-26` — `from browser_use import Agent`.
- `src/browser/router.py:52` — import lazy `from browser.agent import run_agent`.
- `requirements.txt` — **no incluye** `browser_use` ni `pydantic`.
- Verificado: `.venv-linux/bin/python3 -c "import browser_use"` → `ModuleNotFoundError`.

**Qué está mal**: el módulo WebNavigator (`/nav/run`, UI `webnavigator`) importa
`browser_use`, que no está instalado ni listado. El import es lazy, así que el server
**bootea igual**, pero en cuanto el usuario dispara una navegación → `ModuleNotFoundError`
en runtime. La feature está muerta out-of-the-box.

**Por qué importa**: es una funcionalidad completa (UI + router + agente + tabla
`nav_sesiones`) que no funciona y no lo dice hasta que la usás.

**Fix**:
- Si se quiere la feature: agregar `browser-use` y `pydantic` a `requirements.txt` y
  documentar que trae dependencias pesadas (Playwright/Chromium).
- Si no: marcar la feature como opcional y que `/nav/run` devuelva un error claro
  (`"WebNavigator no instalado: pip install browser-use"`) en vez de un stacktrace.
- Detectar la ausencia en `/health` y deshabilitar el tab en la UI si falta.

---

## 5. 🟠 Backup incompleto — pérdida silenciosa de datos

**Ubicación**: `src/db/routes/backup.py:10-17` — lista fija `TABLAS_USUARIO`.

**Qué está mal**: el export recorre una **lista hardcodeada** de tablas. Faltan
tablas con datos reales del usuario que sí existen en el schema:
`builder_templates`, `ai_team_roles`, `creativity_ideas`, `ext_capturas`,
`prompts_guardados`, y **todo** el conjunto `md_reader_*` y `productividad_*`
(capturas, research, tasks, clipboard, meetings, tabs, price_items/checks, forms).

**Por qué importa**: un usuario que hace "backup" cree que salvó todo y perdió
Productividad, MD-Reader, plantillas del builder, roles de equipo, etc. Además **no
hay endpoint de restore/import** — el backup es de una sola vía.

**Fix**:
- **Mejor**: derivar la lista por introspección — todas las tablas de `sqlite_master`
  que tengan columna `usuario_id`, más las hijas por JOIN (mensajes, cloud_mensajes,
  productividad_tab_items, productividad_price_checks).
- Agregar `POST /db/backup/restore` que inserte de vuelta (con `INSERT OR REPLACE`).

```python
async def tablas_con_usuario(db):
    async with db.execute("SELECT name FROM sqlite_master WHERE type='table'") as cur:
        tablas = [r["name"] for r in await cur.fetchall()]
    out = []
    for t in tablas:
        async with db.execute(f"PRAGMA table_info({t})") as cur:
            if any(c["name"] == "usuario_id" for c in await cur.fetchall()):
                out.append(t)
    return out
```

---

## 6. 🟡 `config/server.toml [db]` es configuración muerta

**Ubicación**:
- `config/server.toml:6-8` — `[db].path_linux = ".../databases/aihub/aihub.db"`.
- `src/db/connection.py:6-11` — `DB_PATH` sale de `AURORA_DB_PATH` o del default
  `aurora/databases/aihub.db`. **Nunca lee `server.toml`.**

**Qué está mal**: hay dos "verdades" para dónde vive la DB y **no coinciden**:
`server.toml` apunta a `.../databases/aihub/aihub.db` (subcarpeta `aihub/`), pero la
DB real que usa la app es `aurora/databases/aihub.db`. La config de server.toml no la
lee nadie.

**Por qué importa**: quien lea `server.toml` para saber dónde está la DB va a mirar el
archivo equivocado. Confunde debugging y backups manuales.

**Fix**: que `connection.py` lea `config/server.toml [db]` (respetando SO) como fuente
única, con `AURORA_DB_PATH` como override. Borrar la ambigüedad. Ver reporte de DB.

---

## 7. 🟡 Bootstrap de usuario sin auth — el token es teatro

**Ubicación**: `src/db/routes/usuarios.py:32` (`/list`), `:41` (`/login`), `:53`
(`/crear`), `:72` (`/init`) — ninguno tras `auth_guard` (correcto para bootstrap,
pero…).

**Qué está mal**: `/db/usuarios/init` y `/crear` crean usuario y **devuelven el
token** sin ninguna credencial previa. `/list` devuelve todos los usuarios. Cualquiera
que llegue al puerto se fabrica un token válido y ya pasa todos los `auth_guard`.

**Por qué importa**: combinado con `host=0.0.0.0`, cualquiera en la red obtiene acceso
completo a la capa `/db/*`. El token no autentica a nadie; solo distingue "espacios de
datos".

**Fix**: para un experimento local, aceptar el modelo pero (a) bindear a `127.0.0.1`,
(b) no exponer `/list` sin auth, (c) documentar que el token es un identificador de
espacio, no una credencial de seguridad.

---

## 8. 🟡 Extensión `aihub` — superficie de permisos enorme

**Ubicación**: `extensions/aihub/manifest.json`.

**Qué está mal** (para un experimento personal puede ser aceptable, pero conviene
saberlo):
- `permissions` incluye `debugger` (línea 18) — control CDP total del navegador.
- `host_permissions` incluye `<all_urls>` y `https://*/*` (líneas 52-53).
- `externally_connectable: {"ids": ["*"]}` (línea 78) — **cualquier otra extensión**
  puede mandarle mensajes.
- `web_accessible_resources: [{resources:["*"], matches:["<all_urls>"]}]` (líneas
  67-72) — expone todos los archivos de la extensión a cualquier página.
- CSP sandbox con `unsafe-inline unsafe-eval` (línea 75).

**Por qué importa**: es la extensión más privilegiada posible. Si se instala en un
Chrome de uso diario, es un riesgo alto. `externally_connectable:["*"]` es el más
gratuito de arreglar.

**Fix**: acotar `externally_connectable.ids` a la propia app / vacío,
`web_accessible_resources` solo a los archivos que de verdad se embeban, y quitar
`debugger` si no lo usa el flujo activo. `host_permissions` idealmente a la lista
explícita de dominios que ya está arriba, sin `<all_urls>`.

---

## 9. 🟡 Sin migraciones versionadas ni restore

Ver reporte de base de datos (`auditoria-base-de-datos.md`, hallazgos DB-3 y DB-4).
Resumen: la tabla `schema_migrations` existe pero **está vacía** — nunca se inserta una
fila. Las "migraciones" son chequeos ad-hoc `PRAGMA table_info` + `ALTER` dispersos en
`connection.py`. No hay forma de saber en qué versión de schema está una DB.

---

## 10. 🟢 Higiene / detalles

| Ítem | Ubicación | Fix |
|------|-----------|-----|
| `src/db/aurora.db` huérfano (0 bytes) — creado por accidente con CWD en `src/db` | disco | Borrar; ya está en `.gitignore`. |
| `logs/aurora.log` 0 bytes — logging a archivo no escribe | `src/logging_config.py` | Verificar handler de archivo; hoy solo va a consola. |
| `BASE` hardcodeado `http://localhost:7779` | `ui/boot.js:56` | Derivar de `location.origin` para que la UI funcione si se sirve desde otro host/puerto. |
| `nombre:"deml"` y `workspace_root` hardcodeados en el bootstrap | `ui/boot.js:200-203` | Aceptable para local; parametrizar si se comparte. |
| Cache-bust solo en `app.js` (`?v=v2-visual-variants-6`) | `ui/boot.js:228` | `store.js` y `ext-bridge.js` pueden quedar stale al actualizar. Versionar todos o usar un query global. Ver memoria: `cdp cache de módulos`. |
| DDL duplicado: `schema.sql` **y** `_ensure_*` en `connection.py` crean las mismas tablas | `connection.py:70-469` | Una sola fuente de verdad. Ver reporte DB. |
| 23 marcadores `TODO/FIXME/HACK` en `src/` | varios | Triage: convertir en issues o resolver. |
| Cobertura de tests solo en `tests/pi/` (5 archivos) | `tests/` | Sin tests para nexus (shell/fs), db routes, tools, parser. Priorizar un smoke test de arranque + un test de `auth_guard`. |

---

## Cosas nuevas y útiles a proponer (para el codeador)

1. **Guard global con allowlist de rutas públicas** — un solo lugar decide qué es
   público (`/`, `/ping`, `/health`, `/ui/*`, `/db/usuarios/init|login`) y todo lo
   demás exige token. Elimina de raíz los hallazgos #1, #2, #7. *(arquitectura
   compartida, no fix por-archivo — coincide con la preferencia registrada del
   proyecto.)*

2. **Endpoint `/health` enriquecido y usado por la UI** — que reporte: pi vivo/gen,
   providers online, extensión conectada, `browser_use` disponible, ruta y tamaño de
   DB, versión de schema. La UI deshabilita tabs de features no disponibles (mata el
   problema #4 en la cara del usuario, no en runtime).

3. **Restore de backup + backup por introspección** (ver #5) — cierra el ciclo de
   respaldo y lo vuelve a prueba de olvidos.

4. **Audit log de nexus** — cada `shell/run`, `fs/write`, `fs/delete` a la tabla
   `eventos` (ya existe) con `origen='nexus'`. Da trazabilidad de qué tocó el agente.

5. **Modo "solo lectura" para nexus** — un flag en `config` que desactive
   `write/delete/move/shell/pip` cuando se quiere usar Aurora solo para explorar.

6. **Smoke test de arranque en CI local** — un `test_boot.py` que levante la app en
   memoria y golpee `/ping`, `/health`, `/tools` y un `/db/*` con token de prueba.
   Hoy un import roto (como el de `browser_use`) solo se descubre a mano.

7. **Unificar la resolución de rutas de la DB** (ver #6 y reporte DB) — una función
   `resolve_db_path()` que sea la única verdad.

---

## Anexo — sesión 2026-07-10 (verificación + bugs nuevos + features)

Se reauditó a fondo el código NO cubierto originalmente (nexus fs/shell, pi/bridge,
voz, search, db routes). **Veredicto: código muy sólido.** Confirmado sin bugs:
- `nexus/fs.py` usa `safe()` (`.resolve()` + `is_inside(BASE)`) → **sin directory
  traversal**. Todos los subprocess usan `create_subprocess_exec` (sin `shell=True`,
  sin `eval`/`exec`) → **sin inyección de comandos**.
- `pi/bridge.py`: `_lock_streaming` se toma con `async with` → se libera siempre,
  incluso con excepción. El comentario viejo sobre "lock pegado hasta reiniciar" ya
  no aplica.
- `productividad.py:214` UPDATE con f-string usa una **whitelist fija** de columnas
  (`allowed`), valores parametrizados → **no es inyección SQL**.
- `search.py`: `_query_fts` escapa comillas (sin inyección FTS), `limit` capado a 100.

**Bugs nuevos (menores) encontrados y arreglados:**
- **N+1 en `search.py`**: resolvía el contexto de cada resultado con una query por
  fila (hasta 30). Ahora batchea por tipo → 3 queries fijas (`... WHERE id IN (...)`).
- **Temp huérfano en `voz/router.py` `stt`**: el `.wav` de ffmpeg quedaba sin borrar
  si ffmpeg fallaba (el `src` sólo se borraba en el happy path). Ahora un `_limpiar()`
  en `finally` cubre todos los caminos.

**Features nuevas** (detalle en el anexo del reporte de DB): búsqueda global en el
CommandPalette (Ctrl+K, usa el FTS), VACUUM a demanda (`/db/jobs/db-vacuum`),
`json_loose` tolerante. Y se arregló un bug real: el FTS estaba vacío por un backfill
frágil (`if not existia` → ahora por tabla-vacía + migración #8).
