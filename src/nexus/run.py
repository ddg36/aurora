import pathlib
import subprocess

from litestar import get, post

from .config import IS_WIN, WORKSPACE, clip
from .workspace import safe


@get('/nexus/help')
async def nexus_help() -> str:
    return """Tools disponibles:
  POST /nexus/read     - Leer archivo (con números de línea)
  POST /nexus/edit     - Editar archivo (find-and-replace)
  POST /nexus/write    - Escribir archivo
  POST /nexus/grep     - Buscar patrones en archivos
  POST /nexus/glob     - Buscar archivos por nombre
  POST /nexus/shell    - Ejecutar comando del sistema
  GET  /nexus/help     - Mostrar esta ayuda"""


@post('/nexus/read')
async def nexus_read(data: dict) -> str:
    path = data.get('path', '')
    offset = data.get('offset', 1)
    limit = data.get('limit', 0)

    try:
        target = safe(path)
    except Exception as e:
        return f'Error: {e}'

    if not target.is_file():
        return f'Error: no es archivo: {path}'

    try:
        content = target.read_text(encoding='utf-8', errors='replace')
    except Exception as e:
        return f'Error leyendo archivo: {e}'

    lines = content.splitlines()
    total = len(lines)

    start = max(0, offset - 1)
    if limit > 0:
        end = min(total, start + limit)
    else:
        end = total

    result_lines = []
    for i in range(start, end):
        result_lines.append(f'{i + 1}: {lines[i]}')

    output = '\n'.join(result_lines)
    output, truncated = clip(output)
    if truncated:
        output += '\n... (truncado)'

    return output


@post('/nexus/edit')
async def nexus_edit(data: dict) -> str:
    path = data.get('path', '')
    old = data.get('oldString', '')
    new = data.get('newString', '')

    if not old:
        return 'Error: oldString es requerido'

    try:
        target = safe(path)
    except Exception as e:
        return f'Error: {e}'

    if not target.is_file():
        return f'Error: no es archivo: {path}'

    try:
        content = target.read_text(encoding='utf-8', errors='replace')
    except Exception as e:
        return f'Error leyendo archivo: {e}'

    if old not in content:
        return 'Error: oldString no encontrado en el archivo'

    count = content.count(old)
    new_content = content.replace(old, new, 1)

    try:
        target.write_text(new_content, encoding='utf-8')
    except Exception as e:
        return f'Error escribiendo archivo: {e}'

    msg = 'Editado correctamente'
    if count > 1:
        msg += f' (advertencia: {count} coincidencias, solo primera reemplazada)'
    return msg


@post('/nexus/write')
async def nexus_write(data: dict) -> str:
    path = data.get('path', '')
    content = data.get('content', '')

    try:
        target = safe(path)
    except Exception as e:
        return f'Error: {e}'

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
    except Exception as e:
        return f'Error escribiendo archivo: {e}'

    return f'Escrito correctamente: {path}'


@post('/nexus/grep')
async def nexus_grep(data: dict) -> str:
    pattern = data.get('pattern', '')
    path = data.get('path', '.')
    max_results = data.get('max', 40)

    if not pattern:
        return 'Error: pattern es requerido'

    try:
        root = safe(path)
    except Exception as e:
        return f'Error: {e}'

    results = []
    for fp in root.rglob('*'):
        if len(results) >= max_results:
            break
        try:
            if not fp.is_file() or fp.stat().st_size > 500_000:
                continue
            for n, line in enumerate(fp.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
                if pattern in line:
                    results.append(f'{fp.name}:{n}: {line[:200]}')
                    if len(results) >= max_results:
                        break
        except Exception:
            continue

    if not results:
        return '(sin resultados)'

    output = '\n'.join(results)
    output, truncated = clip(output)
    return output


@post('/nexus/glob')
async def nexus_glob(data: dict) -> str:
    pattern = data.get('pattern', '*')
    path = data.get('path', '.')

    try:
        root = safe(path)
    except Exception as e:
        return f'Error: {e}'

    results = []
    for fp in root.rglob(pattern):
        if len(results) >= 100:
            break
        try:
            rel = fp.relative_to(root)
            results.append(str(rel))
        except Exception:
            continue

    if not results:
        return '(sin resultados)'

    return '\n'.join(results)


@post('/nexus/shell')
async def nexus_shell(data: dict) -> str:
    cmd = data.get('cmd', '')
    cwd = data.get('cwd', None)
    timeout = data.get('timeout', 30)

    if not cmd:
        return 'Error: cmd es requerido'

    try:
        target_cwd = safe(cwd) if cwd else WORKSPACE
    except Exception:
        target_cwd = WORKSPACE

    try:
        if IS_WIN:
            result = subprocess.run(
                ['powershell', '-Command', cmd],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(target_cwd),
                encoding='utf-8',
                errors='replace'
            )
        else:
            result = subprocess.run(
                ['bash', '-c', cmd],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(target_cwd)
            )

        output = result.stdout
        if result.stderr:
            output += f'\n[stderr] {result.stderr}' if output else result.stderr

        output = output.strip()
        if not output:
            output = '(sin salida)'

        output, truncated = clip(output)
        return output

    except subprocess.TimeoutExpired:
        return f'Error: comando excedió timeout de {timeout}s'
    except Exception as e:
        return f'Error ejecutando comando: {e}'


RUN_ROUTES = [nexus_help, nexus_read, nexus_edit, nexus_write, nexus_grep, nexus_glob, nexus_shell]
