# Nexus — Arquitectura Actual (v2)

> Última actualización: 2026-06-17

---

## Qué es

Sistema de ejecución unificado para el ecosistema Aurora v2. Consiste en:

1. **Servidor HTTP** modular en `src/nexus/` (puerto `:7779`)
2. **Extensiones Chrome** en `extensions/aihub/` que parsean bloques `✦✦✦` / `✧✧✧` en LLMs cloud y los ejecutan contra el servidor
3. **Gemita** — agente LLM vía WebSocket (`/gemita`) con tools que invocan shell persistente o Nexus

```
LLM Cloud Chat                Aurora Sidepanel (Gemita)
     │                              │
  gem-observer.js               RunBashTool / NexusRunTool
  (parsea ✦✦✦ / ✧✧✧)               │
     │                         ShellBash persistente
  background.js (proxy)         o HTTP :7779/nexus/shell/run
     │                              │
  POST :7779/nexus/shell/run         │
     └──────┬───────────────┬────────┘
            ▼               ▼
     src/nexus/shell.py   src/gemita/shell.py
     (Job.run async)      (ShellBash sync)
```

---

## Server-side: `src/nexus/`

### Estructura del paquete

```
src/nexus/
  __init__.py
  config.py      — constantes cross-platform: IS_WIN, DESTRUCTIVE, BLOCK_PATTERNS, clip()
  shell.py       — POST /nexus/shell/run, POST /nexus/shell/exec, ejecutar_shell() sync
  tasks.py       — Job async runner, SSE streaming, kill/forget
  approvals.py   — sistema de aprobaciones para comandos destructivos
  editor.py      — POST /nexus/editor/run — ejecuta código (py, js, sh) en sandbox
  fs.py          — operaciones de archivo
  py.py          — gestión de entornos Python (venvs, pip)
  workspace.py   — path safety, sandbox
  router.py      — agrega todas las rutas en NEXUS_ROUTES
```

### Rutas activas

```
POST /nexus/shell/run   — ejecuta comando shell (Job.run async)
POST /nexus/shell/exec  — alias de shell/run
GET  /nexus/tasks       — lista jobs (running + done)
POST /nexus/tasks/{id}/kill    — mata job en ejecución
POST /nexus/tasks/{id}/forget  — elimina job del historial
GET  /nexus/tasks/{id}/stream  — SSE streaming de output
POST /nexus/editor/run — ejecuta código Python/JS/Shell en sandbox
```

### Registro global

En `src/main.py:94`:
```
ROUTES = [...] + GEMITA_ROUTES + NEXUS_ROUTES + PARSER_ROUTES + EXT_ROUTES + ...
```

---

## Extension Chrome: `extensions/aihub/`

### background.js

Service Worker principal. Puente entre extension API y servidor Aurora (`:7779`).

| Handler | Mensaje | Acción |
|---------|---------|--------|
| `NEXUS_EXECUTE` | `{command, shell:'bash'}` | `POST :7779/nexus/run-shell` |
| `PROXY_FETCH` | `{path, body, method}` | Relay a `:7779{path}` (evita Private Network Access) |
| `NEXUS_STATUS` | — | `GET :7779/health` |
| WebSocket | control bus | `ws://localhost:7779/ext/ws` |

### content-scripts/gem-observer.js

Se inyecta en páginas de LLMs cloud (ChatGPT, Claude, Grok). **Parser real dentro del repo**.

```
const RE_SHELL = /✦✦✦\n([\s\S]*?)\n✦✦✦/g    → shell commands
const RE_NEXUS = /✧✧✧\n([\s\S]*?)\n✧✧✧/g   → nexus actions
```

Flujo:
1. Observa el DOM del chat en busca de nuevos mensajes del asistente
2. Extrae texto y busca bloques `✦✦✦...✦✦✦` y `✧✧✧...✧✧✧`
3. Para cada bloque shell: `_bgFetch('/nexus/shell/run', {cmd})` → background.js proxy → servidor
4. Para cada bloque nexus: parsea `action= key=value`, hace `_bgFetch('/nexus/' + action, kv)`
5. Inyecta el resultado como placeholder en el chat

**No usa `@@nx` ni `@@nexus`.** Usa `✦✦₃` (shell) y `✧✧✧` (nexus).

---

## Gemita (WebSocket): `src/gemita/`

### shell.py — ShellBash

Shell persistente por sesión WebSocket. El estado (cwd, variables) se mantiene entre comandos.

```
class ShellBash:
  _iniciar()    — spawn: /bin/bash (Linux) o powershell (Windows)
  ejecutar()    — escribe comando + sentinel, lee hasta sentinel
  cwd()         — pwd (Linux) o (Get-Location).Path (Windows)
  cerrar()      — termina proceso
```

Usa sentinel (`__GEMITA_EOF__<uuid>`) para detectar fin de output sin cerrar el proceso.

### tools.py — Tools del agente

| Tool | Función | Ejecuta vía |
|------|---------|------------|
| `RunBashTool` | `run_bash(command)` | `ShellBash.ejecutar()` |
| `NexusRunTool` | `nexus_run(command, workspace, shell)` | HTTP POST a `{nexus_url}/{workspace}/run-shell` |
| `ReadFileTool` | `read_file(path)` | Python puro |
| `WriteFileTool` | `write_file(path, content)` | Python puro |
| `GlobTool` | `glob(pattern)` | Python puro |
| `GrepTool` | `grep(pattern, include)` | Python puro o `grep` shell |
| `SearchInFilesTool` | `search_in_files(...)` | Python puro o `grep` shell |
| `FindFilesTool` | `find_files(pattern)` | Python puro o `find` shell |
| `BashTool` | `bash(cmd)` | `ShellBash.ejecutar()` |

**No hay parseo de bloques.** El LLM invoca tools directamente por nombre.

---

## Parser: `src/parser/`

Legacy desconectado. Existe pero **no es llamado por ningún flujo activo**. El parser real es `gem-observer.js` que busca `✦✦₃` y `✧✧✧` en el DOM.

---

## Cross-platform: Windows

Toda la detección de SO se hace con `platform.system() == 'Windows'`.

### Flag IS_WIN

Definido en `src/nexus/config.py:10` y re-definido localmente donde sea necesario:

```python
IS_WIN = platform.system() == 'Windows'
# En tasks.py: _IS_WIN = platform.system() == 'Windows'
# En gemita/shell.py: self._is_win = platform.system() == 'Windows'
```

### Shell selection

| Contexto | Linux | Windows |
|----------|-------|---------|
| `tasks.py:Job.run()` | `bash -lc {cmd}` | `powershell -NoProfile -NonInteractive -Command {cmd}` |
| `shell.py:ejecutar_shell()` | `bash -lc {cmd}` | `powershell -NoProfile -NonInteractive -Command {cmd}` |
| `gemita/shell.py:ShellBash` | `/bin/bash --norc --noprofile` | `powershell -NoProfile -NonInteractive -Command -` |
| `editor.py:_runner()` sh | `bash {path}` | `powershell -File {path}` |

### Process kill

| Contexto | Linux | Windows |
|----------|-------|---------|
| `tasks.py:Job.kill()` | `os.killpg(pid, SIGTERM)` → `SIGKILL` | `taskkill /F /T /PID {pid}` |

### Process group

`start_new_session=True` solo en Linux (`tasks.py:60`). Windows no tiene process groups Unix.

```python
start_new_session=not _IS_WIN,
```

### Path resolution

Todas las rutas usan `pathlib.Path` (funciona igual en ambos OS):

```python
BASE = pathlib.Path(__file__).resolve().parents[3]
```

### Comandos destructivos

Incluye ambos OS (`config.py:15`):

```python
DESTRUCTIVE = {'rm', 'dd', 'mkfs', 'shred', 'wipefs', 'fdisk', 'rmdir',
               'del', 'rd', 'diskpart', 'cipher', 'sfc'}
```

`del`, `rd`, `diskpart`, `cipher`, `sfc` son específicos de Windows.

### ShellBash sentinel

Funciona igual en ambos OS: escribe `echo __GEMITA_EOF__<uuid>` y lee stdout hasta encontrar la línea sentinel.

---

## Resumen de caminos de ejecución

### Camino 1: Cloud LLM → gem-observer.js (✦✦✦)

```
LLM escribe: ✦✦✦
             comando
             ✦✦✦

gem-observer.js:101-117
  → RE_SHELL.exec(text) extrae cmd
  → _bgFetch('/nexus/shell/run', {cmd})         ← línea 128
  → chrome.runtime.sendMessage({type:'PROXY_FETCH'})  ← línea 170
  → background.js handler PROXY_FETCH            ← línea 352
  → fetch('http://localhost:7779/nexus/shell/run')
  → src/nexus/shell.py :: shell_run()            ← línea 39
  → ejecutar_shell_async()
  → create_job().run()
  → bash -lc '{cmd}'  o  powershell -Command '{cmd}'
```

### Camino 2: Aurora Sidepanel → Gemita WebSocket

```
Usuario envía mensaje → WS /gemita
  → gemita/router.py :: websocket_handler        ← línea 89
  → bucle.manejar_chat()                         ← línea 89
  → LLM responde invocando tool
  → catalog.get(name).execute(args, context)

RunBashTool:  context['shell'].ejecutar(cmd)     ← tools.py:61
              → ShellBash (bash/powershell persistente)

NexusRunTool: POST {nexus_url}/{workspace}/run-shell  ← tools.py:93
              → (mismo destino que Camino 1)
```

### Camino 3: POST /nexus/shell/run directo (API)

```
Cualquier cliente → POST :7779/nexus/shell/run {cmd, cwd, origin}
  → shell.py:shell_run()
  → checks: BLOCK_PATTERNS, DESTRUCTIVE → approval?
  → create_job(cmd, cwd).run()
  → subprocess async con bash/powershell
  → retorna {ok, code, stdout, stderr, job_id, killed}
```

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `src/nexus/config.py` | Constantes cross-platform, IS_WIN, DESTRUCTIVE, clip |
| `src/nexus/shell.py` | `POST /nexus/shell/run` — ejecución shell |
| `src/nexus/tasks.py` | `Job` async runner, kill, SSE stream |
| `src/nexus/approvals.py` | Aprobaciones para comandos destructivos |
| `src/nexus/editor.py` | `POST /nexus/editor/run` — sandbox code runner |
| `src/nexus/fs.py` | Operaciones de archivo |
| `src/nexus/py.py` | Gestión de entornos Python |
| `src/nexus/workspace.py` | Path safety, sandbox |
| `src/gemita/shell.py` | `ShellBash` — shell persistente por sesión |
| `src/gemita/tools.py` | Tools del agente (RunBashTool, NexusRunTool, etc.) |
| `src/gemita/bucle.py` | Loop del agente, invoca tools |
| `src/gemita/router.py` | WebSocket `/gemita` endpoint |
| `extensions/aihub/background.js` | Service Worker: proxy fetch, NEXUS_EXECUTE, WS bus |
| `extensions/aihub/content-scripts/gem-observer.js` | **Parser real** de `✦✦✦`/`✧✧✧` en DOM de LLMs cloud |
| `extensions/aihub/background/browser-cabin.js` | Content script injection, utilidades de background |
| `src/main.py` | Bootstrap, registro de rutas |
| `src/parser/` | Parser endpoint (desconectado, disponible para consumo externo) |
