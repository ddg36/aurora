import json
import logging
import os
import fnmatch
import subprocess
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

from tools.contract import ToolContract, schema
from tools.registry import register

log = logging.getLogger("aurora.gemita.tools")


def _resolve_path(path: str, config) -> str:
    if not os.path.isabs(path) and config:
        path = os.path.join(config.PROJECT_ROOT, path)
    return os.path.expanduser(path)


async def _get_current_datetime(args: dict, caller: dict) -> dict:
    return {"ok": True, "text": datetime.now(timezone.utc).isoformat()}


async def _run_bash(args: dict, caller: dict) -> dict:
    shell = caller.get('shell')
    if not shell:
        return {"ok": False, "error": "shell no disponible"}
    cmd = args.get('command', '').strip()
    if not cmd:
        return {"ok": False, "error": "comando vacío"}
    resultado = await shell.ejecutar(cmd)
    return {"ok": True, "text": resultado['output']}


async def _nexus_run(args: dict, caller: dict) -> dict:
    cmd = args.get('command', '').strip()
    if not cmd:
        return {"ok": False, "error": "comando vacío"}
    config = caller.get('config')
    nexus_url = getattr(config, 'NEXUS_URL', 'http://127.0.0.1:7779') if config else 'http://127.0.0.1:7779'
    workspace = (args.get('workspace') or 'aihub').strip().strip('/')
    shell_type = args.get('shell') or 'bash'
    url = f"{nexus_url.rstrip('/')}/{workspace}/run-shell"
    payload = json.dumps({
        'id': 'gemita_nexus_' + uuid.uuid4().hex[:8],
        'cmd': cmd,
        'shell': shell_type,
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            data = json.loads(res.read().decode('utf-8', errors='replace'))
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"NEXUS no disponible en {nexus_url}: {e.reason}"}
    except (json.JSONDecodeError, OSError) as e:
        return {"ok": False, "error": f"Error procesando respuesta de NEXUS: {e}"}
    if data.get('formatted'):
        return {"ok": True, "text": data['formatted']}
    if data.get('ok'):
        result = data.get('result') or {}
        text = '\n'.join(str(x) for x in [result.get('stdout'), result.get('stderr')] if x).strip() or 'ok'
        return {"ok": True, "text": text}
    return {"ok": False, "error": data.get('error') or str(data)}


async def _read_file(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    path = args.get('path', '').strip()
    if not path:
        return {"ok": False, "error": "path vacío"}
    path = _resolve_path(path, config)
    if not os.path.exists(path):
        return {"ok": False, "error": f"no existe: {path}"}
    if not os.path.isfile(path):
        return {"ok": False, "error": f"no es un archivo: {path}"}
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        return {"ok": False, "error": f"leyendo: {e}"}
    MAX = 50_000
    if len(content) <= MAX:
        return {"ok": True, "text": content}
    head = content[:MAX // 2]
    tail = content[-(MAX // 2):]
    return {"ok": True, "text": f"{head}\n\n…[{len(content) - MAX} chars omitidos]…\n\n{tail}"}


async def _write_file(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    path = args.get('path', '').strip()
    content = args.get('content', '')
    if not path:
        return {"ok": False, "error": "path vacío"}
    path = _resolve_path(path, config)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return {"ok": True, "text": f"ok: {len(content.encode())} bytes escritos en {path}"}
    except Exception as e:
        return {"ok": False, "error": f"escribiendo: {e}"}


async def _list_directory(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    path = args.get('path', '').strip()
    if not path:
        return {"ok": False, "error": "path vacío"}
    path = _resolve_path(path, config)
    if not os.path.exists(path):
        return {"ok": False, "error": f"no existe: {path}"}
    if not os.path.isdir(path):
        return {"ok": False, "error": f"no es un directorio: {path}"}
    try:
        items = []
        for name in sorted(os.listdir(path)):
            full = os.path.join(path, name)
            stat = os.stat(full)
            mtime = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M')
            tipo = 'dir' if os.path.isdir(full) else 'file'
            size = stat.st_size if tipo == 'file' else '-'
            items.append({'name': name, 'type': tipo, 'size': size, 'mtime': mtime})
        return {"ok": True, "data": items, "text": json.dumps(items, ensure_ascii=False)}
    except Exception as e:
        return {"ok": False, "error": f"listando: {e}"}


async def _search_in_files(args: dict, caller: dict) -> dict:
    import re
    config = caller.get('config')
    pattern = args.get('pattern', '').strip()
    path = args.get('path', '').strip()
    glob_filter = args.get('glob', '*')
    max_l = int(args.get('max_lines', 50))
    if not pattern or not path:
        return {"ok": False, "error": "pattern y path son requeridos"}
    path = _resolve_path(path, config)
    if not os.path.exists(path):
        return {"ok": False, "error": f"no existe: {path}"}
    matches = []
    for root, _, files in os.walk(path):
        for fname in files:
            if not fnmatch.fnmatch(fname, glob_filter):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                    for i, line in enumerate(f, 1):
                        if re.search(pattern, line):
                            matches.append(f"{fpath}:{i}: {line.rstrip()}")
                            if len(matches) >= max_l:
                                return {"ok": True, "text": '\n'.join(matches)}
            except Exception:
                continue
    return {"ok": True, "text": '\n'.join(matches) if matches else f"Sin resultados para '{pattern}'"}


async def _find_files(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    pattern = args.get('pattern', '').strip()
    path = args.get('path', '').strip()
    tipo = args.get('type', 'any')
    if not pattern or not path:
        return {"ok": False, "error": "pattern y path son requeridos"}
    path = _resolve_path(path, config)
    matches = []
    for root, dirs, files in os.walk(path):
        targets = files if tipo == 'file' else (dirs if tipo == 'dir' else files + dirs)
        for name in targets:
            if fnmatch.fnmatch(name, pattern):
                matches.append(os.path.join(root, name))
                if len(matches) >= 100:
                    return {"ok": True, "data": matches, "text": json.dumps(matches)}
    return {"ok": True, "data": matches, "text": json.dumps(matches) if matches else f"No encontrado: '{pattern}'"}


async def _update_memory(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    if not config:
        return {"ok": False, "error": "config no disponible"}
    entry = args.get('entry', '').strip()
    tipo = args.get('type', 'general')
    if not entry:
        return {"ok": False, "error": "entry vacío"}
    os.makedirs(os.path.dirname(config.RUTA_MEMORIA), exist_ok=True)
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')
    line = f"\n- [{tipo}] {ts}: {entry}\n"
    with open(config.RUTA_MEMORIA, 'a', encoding='utf-8') as f:
        f.write(line)
    return {"ok": True, "text": f"Guardado: {entry[:80]}"}


async def _read_memory(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    if not config:
        return {"ok": False, "error": "config no disponible"}
    if not os.path.exists(config.RUTA_MEMORIA):
        return {"ok": True, "text": "(Sin memoria guardada aún)"}
    with open(config.RUTA_MEMORIA, 'r', encoding='utf-8') as f:
        content = f.read().strip()
    if not content:
        return {"ok": True, "text": "(Memoria vacía)"}
    filtro = args.get('filter', '').strip()
    if filtro:
        lines = [l for l in content.splitlines() if filtro in l]
        return {"ok": True, "text": '\n'.join(lines) if lines else f"Sin entradas de tipo '{filtro}'"}
    return {"ok": True, "text": content}


async def _get_user_profile(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    if not config or not os.path.exists(config.RUTA_PERFIL):
        return {"ok": True, "text": "{}"}
    with open(config.RUTA_PERFIL, 'r', encoding='utf-8') as f:
        return {"ok": True, "text": f.read()}


async def _save_user_profile(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    if not config:
        return {"ok": False, "error": "config no disponible"}
    data = args.get('data', {})
    if not isinstance(data, dict):
        return {"ok": False, "error": "data debe ser un objeto JSON"}
    os.makedirs(os.path.dirname(config.RUTA_PERFIL), exist_ok=True)
    with open(config.RUTA_PERFIL, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return {"ok": True, "text": f"Perfil guardado ({len(data)} campos)"}


async def _wiki_search(args: dict, caller: dict) -> dict:
    config = caller.get('config')
    query = args.get('query', '').strip()
    max_r = int(args.get('max_results', 8))
    if not query:
        return {"ok": False, "error": "query es requerido"}
    root = config.PROJECT_ROOT if config else os.getcwd()
    wiki_dir = os.path.join(root, "nexus", "workspaces", "aihub", "wiki")
    if not os.path.isdir(wiki_dir):
        return {"ok": True, "text": f"La wiki está vacía (no existe {wiki_dir})."}
    matches = []
    q = query.lower()
    for r, _, files in os.walk(wiki_dir):
        for fname in files:
            fpath = os.path.join(r, fname)
            try:
                with open(fpath, encoding='utf-8', errors='ignore') as f:
                    lineas = f.readlines()
            except OSError:
                continue
            hits = [f"{i+1}:{ln.strip()}" for i, ln in enumerate(lineas) if q in ln.lower()][:3]
            if hits:
                rel_path = os.path.relpath(fpath, wiki_dir)
                matches.append(f"## {rel_path}\n" + "\n".join(hits))
                if len(matches) >= max_r:
                    break
        if len(matches) >= max_r:
            break
    return {"ok": True, "text": "\n\n".join(matches) if matches else f"Sin coincidencias para '{query}' en la wiki."}


def registrar_herramientas_python():
    tools = [
        ToolContract(
            name="get_current_datetime", description="Retorna fecha y hora actual en ISO 8601.",
            input_schema=schema({}), handler=_get_current_datetime,
        ),
        ToolContract(
            name="run_bash",
            description="Ejecuta un comando bash. El cwd por defecto es la raíz del proyecto. El shell persiste entre llamadas.",
            input_schema=schema({"command": {"type": "string"}}, ["command"]),
            handler=_run_bash, risk="high", timeout=60,
        ),
        ToolContract(
            name="nexus_run",
            description="Ejecuta una acción local a través de NEXUS primero. Usa esto antes de run_bash cuando la acción pueda pasar por el carril común AU/NEXUS.",
            input_schema=schema({
                "command": {"type": "string"},
                "workspace": {"type": "string", "default": "aihub"},
                "shell": {"type": "string", "default": "bash"},
            }, ["command"]),
            handler=_nexus_run, risk="high", timeout=60,
        ),
        ToolContract(
            name="read_file",
            description="Lee un archivo de texto. Rutas relativas se resuelven desde la raíz del proyecto. Trunca a 50 000 chars si es muy grande.",
            input_schema=schema({"path": {"type": "string"}}, ["path"]),
            handler=_read_file,
        ),
        ToolContract(
            name="write_file",
            description="Escribe o sobreescribe un archivo. Crea directorios padres si no existen.",
            input_schema=schema({"path": {"type": "string"}, "content": {"type": "string"}}, ["path", "content"]),
            handler=_write_file, risk="medium",
        ),
        ToolContract(
            name="list_directory",
            description="Lista archivos y carpetas de un directorio con nombre, tipo, tamaño y fecha.",
            input_schema=schema({"path": {"type": "string"}}, ["path"]),
            handler=_list_directory,
        ),
        ToolContract(
            name="search_in_files",
            description="Busca un texto o patrón dentro del contenido de archivos (grep). Retorna líneas coincidentes.",
            input_schema=schema({
                "pattern": {"type": "string"}, "path": {"type": "string"},
                "glob": {"type": "string", "default": "*"}, "max_lines": {"type": "integer", "default": 50},
            }, ["pattern", "path"]),
            handler=_search_in_files,
        ),
        ToolContract(
            name="find_files",
            description="Encuentra archivos por nombre/patrón (find).",
            input_schema=schema({
                "pattern": {"type": "string"}, "path": {"type": "string"},
                "type": {"type": "string", "enum": ["file", "dir", "any"], "default": "any"},
            }, ["pattern", "path"]),
            handler=_find_files,
        ),
        ToolContract(
            name="update_memory",
            description="Guarda un recuerdo persistente en markdown entre sesiones.",
            input_schema=schema({
                "entry": {"type": "string"},
                "type": {"type": "string", "enum": ["user_fact", "decision", "artifact", "task", "error_fix", "general"], "default": "general"},
            }, ["entry"]),
            handler=_update_memory,
        ),
        ToolContract(
            name="read_memory",
            description="Lee toda la memoria persistente guardada con update_memory.",
            input_schema=schema({"filter": {"type": "string"}}),
            handler=_read_memory,
        ),
        ToolContract(
            name="get_user_profile", description="Lee el perfil del usuario.",
            input_schema=schema({}), handler=_get_user_profile,
        ),
        ToolContract(
            name="save_user_profile", description="Guarda el perfil del usuario en disco.",
            input_schema=schema({"data": {"type": "object"}}, ["data"]),
            handler=_save_user_profile, risk="medium",
        ),
        ToolContract(
            name="wiki_search",
            description="Busca en la wiki personal del usuario. Retorna archivos cuyo contenido coincide.",
            input_schema=schema({
                "query": {"type": "string"}, "max_results": {"type": "integer", "default": 8},
            }, ["query"]),
            handler=_wiki_search,
        ),
    ]
    for t in tools:
        register(t)
    log.info("%d herramientas Python registradas", len(tools))
