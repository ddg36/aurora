# NEXUS_CAPABILITIES.md

Documento de handoff. Solo capacidades confirmadas en sesión 2026-05-25.

## Estado actual

- Bridge: `http://127.0.0.1:7777`
- Workspace: `/media/almacen/deml/Downloads/core_instruction/au-ash`
- Base: `/media/almacen/deml/Downloads/core_instruction`
- OS: Linux
- Shell: bash
- Logs: `/tmp/nexus-7777.log`

## Protocolo @@nexus

```
@@nexus:<id> action=<action> [param=value ...]
body opcional
@@end:<id>
```

Resultado:

```
@@nexus-result:<id> action=<action> status=ok|error|blocked [reason=...]
...
@@end-result:<id>
```

El `<id>` en `@@nexus:` y `@@end:` debe coincidir exactamente. Si no coinciden, el bloque se ignora (streaming incompleto).

## Acciones confirmadas

### Filesystem

| Acción | Params principales | Notas |
|---|---|---|
| `fs/list` | `path` | Lista archivos/dirs en path |
| `fs/stat` | `path` | Tamaño, líneas, mtime |
| `fs/write` | `path`, body=contenido | Crea o sobreescribe |
| `fs/read` | `path` | Lee archivo completo |
| `fs/head` | `path`, `lines` (default 40) | Primeras N líneas |
| `fs/tail` | `path`, `lines` (default 40) | Últimas N líneas |
| `fs/read-range` | `path`, `start`, `end` | Rango de líneas numeradas |
| `file/range` | `<path> <start> <end>` | Alias CLI para `fs/read-range` |
| `file/around` | `<path> <line> [radius]` | Lee contexto alrededor de una línea |
| `fs/summarize` | `path` | Imports, funciones, rutas HTTP |
| `fs/patch` | `path`, `old`, body=nuevo | Reemplaza primera ocurrencia |
| `fs/move` | `from`, `to` | Mueve/renombra dentro del workspace |
| `fs/delete` | `path` | Borra archivo o directorio completo |

### Project

| Acción | Params | Notas |
|---|---|---|
| `project/tree` | `path`, `depth` (default 3) | Árbol de directorios |
| `project/grep` | `pattern`, `path`, `max` | Búsqueda literal en archivos |
| `project/search` | `query`, `path`, `max` | Alias de project/grep |

### Python workspace

Nexus usa un workspace Python aislado por extensión, por ejemplo `nexus/workspaces/ash`.
Su entorno vive en `nexus/workspaces/ash/.venv`.
`py/run`, `py/module` y `py/pip-install` ejecutan con ese entorno como `VIRTUAL_ENV` y `PATH` activo.
No se usa `pip` global.

| Acción | Params | Notas |
|---|---|---|
| `py/status` | — | Muestra Python y `.venv` del workspace |
| `py/venv-create` | — | Crea `nexus/workspaces/<ext>/.venv` |
| `py/files` | `[path] [depth]` | Lista archivos del workspace Python |
| `py/read` | `<path>` | Lee archivo del workspace Python |
| `py/write` | `<path>`, body=contenido | Escribe archivo en el workspace Python |
| `py/pip-list` | — | Lista paquetes instalados en `.venv` |
| `py/run` | `<script.py> [args...]` | Ejecuta script con `.venv` activado |
| `py/module` | `<module> [args...]` | Ejecuta `python -m module` con `.venv` activado |
| `py/pip-install` | `<paquete...>` | Instala paquetes en `.venv`; requiere aprobación |

### Shell

| Acción | Params | Notas |
|---|---|---|
| `shell/run` | body=cmd | Ejecuta en bash |
| `shell/exec` | body=cmd | Alias de shell/run |

Comandos destructivos (`rm`, `dd`, etc.) y paths fuera de BASE están bloqueados.

### Sandbox (aliases)

| Acción | Equivale a |
|---|---|
| `sandbox/write` | `fs/write` con path prefijado en `sandbox/` |
| `sandbox/read` | `fs/read` con path en `sandbox/` |
| `sandbox/list` | `fs/list` en `sandbox/` |
| `sandbox/run` | `shell/exec` con cwd=workspace raíz |

## Policy y autoloop

Configurar desde la cabina ASH o con `cdp.mjs ash-policy '...'`.

## Workspaces Nexus

Los workspaces de IA viven bajo `nexus/workspaces/`.

| Extensión | Workspace |
|---|---|
| `ash` | `nexus/workspaces/ash` para Python/laboratorio; archivos de extensión en `au-ash` |
| `aihub` | `nexus/workspaces/aihub` |

`au-aihub/workspace` queda como respaldo histórico; Nexus ya no debe escribir ahí.

| Comportamiento | Resultado |
|---|---|
| `manualOnly=true` | `status=blocked reason=policy_manual_only` |
| `allowNexusAuto=false` | `status=blocked reason=policy_channel_disabled` |
| `maxBlocksPerMessage=N` | Ejecuta N, bloquea el resto con `reason=max_blocks_exceeded` |
| ID duplicado | Primer bloque ejecuta, segundo: `reason=already_executed` |
| Reload con historial viejo | No revive bloques ya ejecutados |
| Texto plano `@@nexus` | Funciona, no requiere estar dentro de `<pre>` |
| Watcher realtime | Detecta mensajes nuevos cada ~350ms, ejecuta tras 1100ms de estabilidad |

## Ejemplos mínimos

**Escribir y leer un archivo:**
```
@@nexus:ej_write action=fs/write path=sandbox/work/test.txt
hola mundo
@@end:ej_write

@@nexus:ej_read action=fs/read path=sandbox/work/test.txt
@@end:ej_read
```

**Mover y borrar:**
```
@@nexus:ej_move action=fs/move from=sandbox/work/test.txt to=sandbox/work/test2.txt
@@end:ej_move

@@nexus:ej_del action=fs/delete path=sandbox/work/test2.txt
@@end:ej_del
```

**Ejecutar shell:**
```
@@nexus:ej_shell action=shell/run
echo hola && pwd
@@end:ej_shell
```

**Buscar en proyecto:**
```
@@nexus:ej_grep action=project/grep pattern=_execute_nexus path=. max=10
@@end:ej_grep
```

## Casos especiales

- `fs/delete` borra archivos **y** directorios completos (usa `shutil.rmtree` internamente).
- `sandbox/run` ejecuta desde workspace raíz, no desde `sandbox/` — comportamiento esperado.
- `rm` vía `shell/run` está bloqueado como comando destructivo.
- `fs/move` y `fs/delete` requieren nexus.py reiniciado tras el cambio del 2026-05-25.

## Pendientes / Backlog

- `@@browser` — navegación web
- `@@message` — mensajería
- `@@llm` dry-run
- `@@artifact` — artefactos futuros
- `NEXUS_SECURITY_DECISIONS.md`
- `NEXUS_SMOKE_SUITE.md`
