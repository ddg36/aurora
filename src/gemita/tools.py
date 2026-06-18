# ══════════════════════════════════════════════════════
#  GEMITA HERRAMIENTAS PYTHON — Tools reales que funcionan
#  Sin humo. Cada tool hace exactamente lo que dice.
# ══════════════════════════════════════════════════════

import json
import os
import fnmatch
import subprocess
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List

from .protocol import (
    BaseTool, ToolParameter, ToolCategory, ToolRisk,
    register_tool, get_catalog
)


# ── get_current_datetime ──────────────────────────────

class GetCurrentDatetimeTool(BaseTool):
    name        = "get_current_datetime"
    description = "Retorna fecha y hora actual en ISO 8601."
    category    = ToolCategory.SYSTEM
    risk        = ToolRisk.LOW

    def _get_parameters(self): return []

    async def execute(self, args, context):
        return datetime.now(timezone.utc).isoformat()


# ── run_bash ──────────────────────────────────────────

class RunBashTool(BaseTool):
    name        = "run_bash"
    description = (
        "Ejecuta un comando bash. El cwd por defecto es la raíz del proyecto "
        "(el repo del proyecto). El estado del shell persiste entre llamadas "
        "(puedes hacer cd, export, etc. y se mantienen)."
    )
    category = ToolCategory.SHELL
    risk     = ToolRisk.HIGH
    timeout  = 60

    def _get_parameters(self):
        return [
            ToolParameter("command", "string", "Comando bash a ejecutar.", required=True)
        ]

    async def execute(self, args, context):
        shell = context.get('shell')
        if not shell:
            return "Error: shell no disponible"
        cmd = args.get('command', '').strip()
        if not cmd:
            return "Error: comando vacío"
        resultado = await shell.ejecutar(cmd)
        return resultado['output']


# ── nexus_run ───────────────────────────────────────────

class NexusRunTool(BaseTool):
    name        = "nexus_run"
    description = (
        "Ejecuta una acción local a través de NEXUS primero. Usa esto antes de "
        "run_bash cuando la acción pueda pasar por el carril común AU/NEXUS."
    )
    category = ToolCategory.SHELL
    risk     = ToolRisk.HIGH
    timeout  = 60

    def _get_parameters(self):
        return [
            ToolParameter("command", "string", "Comando bash a ejecutar vía NEXUS.", required=True),
            ToolParameter("workspace", "string", "Workspace Nexus: aihub por defecto.", required=False, default="aihub"),
            ToolParameter("shell", "string", "Shell a usar: bash por defecto.", required=False, default="bash"),
        ]

    async def execute(self, args, context):
        cmd = args.get('command', '').strip()
        if not cmd:
            return "Error: comando vacío"

        config = context.get('config')
        nexus_url = getattr(config, 'NEXUS_URL', 'http://127.0.0.1:7779') if config else 'http://127.0.0.1:7779'
        workspace = (args.get('workspace') or 'aihub').strip().strip('/')
        shell = args.get('shell') or 'bash'
        url = f"{nexus_url.rstrip('/')}/{workspace}/run-shell"
        payload = json.dumps({
            'id': 'gemita_nexus_' + uuid.uuid4().hex[:8],
            'cmd': cmd,
            'shell': shell,
        }).encode('utf-8')

        req = urllib.request.Request(
            url,
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                data = json.loads(res.read().decode('utf-8', errors='replace'))
        except urllib.error.URLError as e:
            return f"Error: NEXUS no disponible en {nexus_url}: {e.reason}"
        except Exception as e:
            return f"Error llamando NEXUS: {e}"

        if data.get('formatted'):
            return data['formatted']
        if data.get('ok'):
            result = data.get('result') or {}
            return '\n'.join(str(x) for x in [result.get('stdout'), result.get('stderr')] if x).strip() or 'ok'
        return f"Error NEXUS: {data.get('error') or data}"


# ── read_file ─────────────────────────────────────────

class ReadFileTool(BaseTool):
    name        = "read_file"
    description = (
        "Lee un archivo de texto. Rutas relativas se resuelven desde "
        "Trunca a 50 000 chars si es muy grande. "
        "mostrando inicio + fin."
    )
    category = ToolCategory.FILE
    risk     = ToolRisk.LOW

    def _get_parameters(self):
        return [
            ToolParameter("path", "string", "Ruta del archivo (absoluta o relativa al proyecto).", required=True)
        ]

    async def execute(self, args, context):
        config = context.get('config')
        path   = args.get('path', '').strip()
        if not path:
            return "Error: path vacío"

        # Resolver relativo al proyecto
        if not os.path.isabs(path) and config:
            path = os.path.join(config.PROJECT_ROOT, path)
        path = os.path.expanduser(path)

        if not os.path.exists(path):
            return f"Error: no existe: {path}"
        if not os.path.isfile(path):
            return f"Error: no es un archivo: {path}"

        size = os.path.getsize(path)
        MAX  = 50_000

        try:
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except Exception as e:
            return f"Error leyendo: {e}"

        if len(content) <= MAX:
            return content

        # Truncar mostrando inicio y fin
        head = content[:MAX // 2]
        tail = content[-(MAX // 2):]
        return f"{head}\n\n…[{len(content) - MAX} chars omitidos]…\n\n{tail}"


# ── write_file ────────────────────────────────────────

class WriteFileTool(BaseTool):
    name        = "write_file"
    description = (
        "Escribe o sobreescribe un archivo con el contenido dado. "
        "Crea los directorios padres si no existen. "
        "Rutas relativas se resuelven desde la raíz del proyecto."
    )
    category = ToolCategory.FILE
    risk     = ToolRisk.MEDIUM

    def _get_parameters(self):
        return [
            ToolParameter("path",    "string", "Ruta del archivo a escribir.", required=True),
            ToolParameter("content", "string", "Contenido completo a escribir.", required=True),
        ]

    async def execute(self, args, context):
        config  = context.get('config')
        path    = args.get('path', '').strip()
        content = args.get('content', '')
        if not path:
            return "Error: path vacío"

        if not os.path.isabs(path) and config:
            path = os.path.join(config.PROJECT_ROOT, path)
        path = os.path.expanduser(path)

        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            return f"ok: {len(content.encode())} bytes escritos en {path}"
        except Exception as e:
            return f"Error escribiendo: {e}"


# ── list_directory ────────────────────────────────────

class ListDirectoryTool(BaseTool):
    name        = "list_directory"
    description = (
        "Lista archivos y carpetas de un directorio. "
        "Muestra nombre, tipo (file/dir), tamaño y fecha de modificación. "
        "Rutas relativas se resuelven desde la raíz del proyecto."
    )
    category = ToolCategory.FILE
    risk     = ToolRisk.LOW

    def _get_parameters(self):
        return [
            ToolParameter("path", "string", "Directorio a listar.", required=True),
        ]

    async def execute(self, args, context):
        config = context.get('config')
        path   = args.get('path', '').strip()
        if not path:
            return "Error: path vacío"

        if not os.path.isabs(path) and config:
            path = os.path.join(config.PROJECT_ROOT, path)
        path = os.path.expanduser(path)

        if not os.path.exists(path):
            return f"Error: no existe: {path}"
        if not os.path.isdir(path):
            return f"Error: no es un directorio: {path}"

        try:
            items = []
            for name in sorted(os.listdir(path)):
                full = os.path.join(path, name)
                stat = os.stat(full)
                mtime = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M')
                tipo  = 'dir' if os.path.isdir(full) else 'file'
                size  = stat.st_size if tipo == 'file' else '-'
                items.append({'name': name, 'type': tipo, 'size': size, 'mtime': mtime})
            return json.dumps(items, ensure_ascii=False)
        except Exception as e:
            return f"Error listando: {e}"


# ── search_in_files ───────────────────────────────────

class SearchInFilesTool(BaseTool):
    name        = "search_in_files"
    description = (
        "Busca un texto o patrón dentro del contenido de archivos (como grep). "
        "Retorna las líneas que coinciden con el archivo y número de línea. "
        "Ideal para encontrar funciones, clases, o cualquier string en el código. "
        "Rutas relativas se resuelven desde la raíz del proyecto."
    )
    category = ToolCategory.FILE
    risk     = ToolRisk.LOW

    def _get_parameters(self):
        return [
            ToolParameter("pattern",   "string", "Texto o regex a buscar.", required=True),
            ToolParameter("path",      "string", "Directorio o archivo donde buscar.", required=True),
            ToolParameter("glob",      "string", "Filtro de archivos, ej: *.js, *.py (default: *)", required=False),
            ToolParameter("max_lines", "number", "Máximo de líneas a retornar (default: 50)", required=False),
        ]

    async def execute(self, args, context):
        config  = context.get('config')
        pattern = args.get('pattern', '').strip()
        path    = args.get('path', '').strip()
        glob    = args.get('glob', '*')
        max_l   = int(args.get('max_lines', 50))

        if not pattern or not path:
            return "Error: pattern y path son requeridos"

        if not os.path.isabs(path) and config:
            path = os.path.join(config.PROJECT_ROOT, path)
        path = os.path.expanduser(path)

        if not os.path.exists(path):
            return f"Error: no existe: {path}"

        # Fallback puro python — cross-platform (grep/find no existen en Windows)
        import re
        matches = []
        try:
            for root, _, files in os.walk(path):
                for fname in files:
                    if not fnmatch.fnmatch(fname, glob):
                        continue
                    fpath = os.path.join(root, fname)
                    try:
                        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                            for i, line in enumerate(f, 1):
                                if re.search(pattern, line):
                                    matches.append(f"{fpath}:{i}: {line.rstrip()}")
                                    if len(matches) >= max_l:
                                        return '\n'.join(matches)
                    except Exception:
                        continue
        except Exception as e:
            return f"Error buscando: {e}"
        return '\n'.join(matches) if matches else f"Sin resultados para '{pattern}'"


# ── find_files ────────────────────────────────────────

class FindFilesTool(BaseTool):
    name        = "find_files"
    description = (
        "Encuentra archivos por nombre/patrón (como find). "
        "Útil para localizar archivos específicos en el proyecto. "
        "Rutas relativas se resuelven desde la raíz del proyecto."
    )
    category = ToolCategory.FILE
    risk     = ToolRisk.LOW

    def _get_parameters(self):
        return [
            ToolParameter("pattern", "string", "Patrón de nombre, ej: *.js, manifest.js, *bridge*", required=True),
            ToolParameter("path",    "string", "Directorio raíz donde buscar.", required=True),
            ToolParameter("type",    "string", "Filtrar por tipo: 'file', 'dir', o 'any' (default: any)", required=False),
        ]

    async def execute(self, args, context):
        config  = context.get('config')
        pattern = args.get('pattern', '').strip()
        path    = args.get('path', '').strip()
        tipo    = args.get('type', 'any')

        if not pattern or not path:
            return "Error: pattern y path son requeridos"

        if not os.path.isabs(path) and config:
            path = os.path.join(config.PROJECT_ROOT, path)
        path = os.path.expanduser(path)

        matches = []
        for root, dirs, files in os.walk(path):
            targets = files if tipo == 'file' else (dirs if tipo == 'dir' else files + dirs)
            for name in targets:
                if fnmatch.fnmatch(name, pattern):
                    matches.append(os.path.join(root, name))
                    if len(matches) >= 100:
                        return json.dumps(matches)
        return json.dumps(matches) if matches else f"No encontrado: '{pattern}'"


# ── update_memory ─────────────────────────────────────

class UpdateMemoryTool(BaseTool):
    name        = "update_memory"
    description = (
        "Guarda un recuerdo persistente en markdown. "
        "Usa esto para guardar cosas importantes entre sesiones: "
        "decisiones técnicas, qué módulos existen, preferencias del usuario, errores resueltos."
    )
    category = ToolCategory.MEMORY
    risk     = ToolRisk.LOW

    def _get_parameters(self):
        return [
            ToolParameter("entry", "string", "Qué recordar.", required=True),
            ToolParameter("type",  "string",
                "Categoría: user_fact, decision, artifact, task, error_fix, general",
                required=False, default="general",
                enum=["user_fact", "decision", "artifact", "task", "error_fix", "general"]),
        ]

    async def execute(self, args, context):
        config = context.get('config')
        if not config:
            return "Error: config no disponible"
        entry = args.get('entry', '').strip()
        tipo  = args.get('type', 'general')
        if not entry:
            return "Error: entry vacío"

        os.makedirs(os.path.dirname(config.RUTA_MEMORIA), exist_ok=True)
        ts   = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')
        line = f"\n- [{tipo}] {ts}: {entry}\n"
        with open(config.RUTA_MEMORIA, 'a', encoding='utf-8') as f:
            f.write(line)
        return f"Guardado: {entry[:80]}"


# ── read_memory ───────────────────────────────────────

class ReadMemoryTool(BaseTool):
    name        = "read_memory"
    description = (
        "Lee toda la memoria persistente guardada con update_memory. "
        "Úsalo al inicio de una sesión para recordar el contexto anterior."
    )
    category = ToolCategory.MEMORY
    risk     = ToolRisk.LOW

    def _get_parameters(self):
        return [
            ToolParameter("filter", "string", "Filtrar por tipo (opcional): user_fact, decision, artifact, task, error_fix, general", required=False),
        ]

    async def execute(self, args, context):
        config = context.get('config')
        if not config:
            return "Error: config no disponible"
        if not os.path.exists(config.RUTA_MEMORIA):
            return "(Sin memoria guardada aún)"
        with open(config.RUTA_MEMORIA, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        if not content:
            return "(Memoria vacía)"
        filtro = args.get('filter', '').strip()
        if filtro:
            lines = [l for l in content.splitlines() if filtro in l]
            return '\n'.join(lines) if lines else f"Sin entradas de tipo '{filtro}'"
        return content


# ── get_user_profile / save_user_profile ─────────────

class GetUserProfileTool(BaseTool):
    name        = "get_user_profile"
    description = "Lee el perfil del usuario (preferencias, nombre, contexto habitual)."
    category    = ToolCategory.FILE
    risk        = ToolRisk.LOW

    def _get_parameters(self): return []

    async def execute(self, args, context):
        config = context.get('config')
        if not config or not os.path.exists(config.RUTA_PERFIL):
            return "{}"
        with open(config.RUTA_PERFIL, 'r', encoding='utf-8') as f:
            return f.read()


class SaveUserProfileTool(BaseTool):
    name        = "save_user_profile"
    description = "Guarda el perfil del usuario en disco."
    category    = ToolCategory.FILE
    risk        = ToolRisk.MEDIUM

    def _get_parameters(self):
        return [
            ToolParameter("data", "object", "Datos del perfil como objeto JSON.", required=True)
        ]

    async def execute(self, args, context):
        config = context.get('config')
        if not config:
            return "Error: config no disponible"
        data = args.get('data', {})
        if not isinstance(data, dict):
            return "Error: data debe ser un objeto JSON"
        os.makedirs(os.path.dirname(config.RUTA_PERFIL), exist_ok=True)
        with open(config.RUTA_PERFIL, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return f"Perfil guardado ({len(data)} campos)"


# ── wiki_search ───────────────────────────────────────

class WikiSearchTool(BaseTool):
    name        = "wiki_search"
    description = (
        "Busca en la wiki personal del usuario (notas, documentación). "
        "Retorna los archivos cuyo contenido coincide con la consulta, "
        "con un fragmento de contexto. Usalo cuando el usuario pregunte "
        "sobre algo que pudo haber anotado en su wiki."
    )
    category = ToolCategory.FILE
    risk     = ToolRisk.LOW

    def _get_parameters(self):
        return [
            ToolParameter("query", "string", "Texto a buscar en la wiki.", required=True),
            ToolParameter("max_results", "number", "Máximo de archivos a retornar (default: 8).", required=False),
        ]

    async def execute(self, args, context):
        config = context.get('config')
        query  = args.get('query', '').strip()
        max_r  = int(args.get('max_results', 8))
        if not query:
            return "Error: query es requerido"

        root = config.PROJECT_ROOT if config else os.getcwd()
        wiki_dir = os.path.join(root, "nexus", "workspaces", "aihub", "wiki")
        if not os.path.isdir(wiki_dir):
            return f"La wiki está vacía (no existe {wiki_dir})."

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
                    rel = os.path.relpath(fpath, wiki_dir)
                    matches.append(f"## {rel}\n" + "\n".join(hits))
                    if len(matches) >= max_r:
                        break
            if len(matches) >= max_r:
                break
        return "\n\n".join(matches) if matches else f"Sin coincidencias para '{query}' en la wiki."


# ── Registro ──────────────────────────────────────────

def registrar_herramientas_python():
    herramientas = [
        GetCurrentDatetimeTool(),
        NexusRunTool(),
        RunBashTool(),
        ReadFileTool(),
        WriteFileTool(),
        ListDirectoryTool(),
        SearchInFilesTool(),
        FindFilesTool(),
        UpdateMemoryTool(),
        ReadMemoryTool(),
        GetUserProfileTool(),
        SaveUserProfileTool(),
        WikiSearchTool(),
    ]
    for h in herramientas:
        register_tool(h)
    print(f"[GEMITA] {len(herramientas)} herramientas Python registradas")


# ── Dispatcher legado ─────────────────────────────────

async def ejecutar(nombre: str, args: dict, shell, config) -> str:
    catalog = get_catalog()
    tool    = catalog.get(nombre)
    if not tool:
        return f'Error: herramienta "{nombre}" no encontrada'
    valid, err = tool.validate_args(args)
    if not valid:
        return f'Error de validación: {err}'
    context = {'shell': shell, 'config': config}
    try:
        return await tool.execute(args, context)
    except Exception as e:
        return f'Error ejecutando "{nombre}": {e}'
