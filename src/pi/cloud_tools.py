# ══════════════════════════════════════════════════════
#  CLOUD TOOLS — ejecución DIRECTA de las 4 tools básicas de pi
#  (read/bash/edit/write) para el LLM de la nube. SIN turno LLM del ejecutor
#  pi: una tool básica no necesita que un LLM la corra — es instantánea,
#  determinista y su output es fiable. Espeja el comportamiento y los mensajes
#  exactos de pi (verificado): edit → "Successfully replaced N block(s)...",
#  write → "Successfully wrote N bytes...", edit-fail → "Could not find the
#  exact text...". Paths relativos se resuelven contra el cwd de pi.
# ══════════════════════════════════════════════════════

import asyncio
import base64
import mimetypes
import pathlib

from . import config

MAX_OUT = 50 * 1024   # igual que pi: trunca a 50KB
MAX_IMG = 4 * 1024 * 1024   # 4MB: tope para adjuntar una imagen al LLM nube
IMG_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'}
BASE = pathlib.Path(config.CWD)


def _resolver(path: str) -> pathlib.Path:
    p = pathlib.Path(str(path or ''))
    return p if p.is_absolute() else (BASE / p)


def _err(msg: str) -> dict:
    """Error de tool que la nube ve (rojo en UI) para auto-corregirse."""
    return {'ok': True, 'is_error': True, 'output': msg}


def _arg(args: dict, *nombres) -> str:
    """Primer alias no vacío. Los LLMs no respetan el nombre exacto del arg
    (bash: cmd/command, edit: oldText/old_string). Toleramos los comunes."""
    for n in nombres:
        v = args.get(n)
        if v not in (None, ''):
            return str(v)
    return ''


async def ejecutar_tool(tool: str, args: dict) -> dict:
    """Devuelve {ok, output, is_error}. is_error=True es un error de la tool
    (arg mal escrito, archivo inexistente, edit no matchea) que la nube debe
    ver en ROJO para auto-corregirse — nunca silencioso."""
    args = args or {}
    if not isinstance(args, dict):
        return _err(f'Error: "args" debe ser un objeto JSON, no {type(args).__name__}.')
    try:
        if tool == 'read':
            path = _arg(args, 'path', 'file_path', 'filename')
            if not path:
                return _err('Error: read requiere el argumento "path" (ruta del archivo).')
            p = _resolver(path)
            # Imagen: no leer como texto — devolver la imagen misma (data URL) para
            # que la nube la VEA (se adjunta a su próximo mensaje), no una descripción.
            if p.suffix.lower() in IMG_EXT:
                data = p.read_bytes()
                if len(data) > MAX_IMG:
                    return _err(f'Error: imagen {path} muy grande ({len(data)//1024}KB, máx 4MB).')
                mime = mimetypes.guess_type(str(p))[0] or 'image/png'
                b64 = base64.b64encode(data).decode('ascii')
                return {'ok': True, 'is_error': False, 'is_image': True,
                        'image': f'data:{mime};base64,{b64}',
                        'output': f'[Imagen adjuntada: {path} ({len(data)//1024}KB)]'}
            txt = p.read_text(encoding='utf-8', errors='replace')
            out = txt[:MAX_OUT] + ('\n…(truncado a 50KB)' if len(txt) > MAX_OUT else '')
            return {'ok': True, 'output': out, 'is_error': False}

        if tool == 'bash':
            cmd = _arg(args, 'cmd', 'command', 'shell')
            if not cmd:
                return _err('Error: bash requiere el argumento "cmd" con un comando no vacío. '
                            'Ejemplo: {"tool":"bash","args":{"cmd":"ls -la"}}')
            proc = await asyncio.create_subprocess_shell(
                cmd, cwd=str(BASE),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            salida, _ = await asyncio.wait_for(proc.communicate(), 60)
            txt = salida.decode('utf-8', 'replace')
            rc = proc.returncode
            out = txt[:MAX_OUT] if txt else (f'(sin salida, exit {rc})' if rc == 0 else f'(sin salida) exit {rc}')
            return {'ok': True, 'output': out, 'is_error': rc != 0}

        if tool == 'write':
            path = _arg(args, 'path', 'file_path', 'filename')
            if not path:
                return _err('Error: write requiere "path". Ejemplo: {"tool":"write","args":{"path":"x.txt","content":"..."}}')
            if 'content' not in args:
                return _err('Error: write requiere "content" (el texto a escribir).')
            p = _resolver(path)
            p.parent.mkdir(parents=True, exist_ok=True)
            content = str(args.get('content', ''))
            p.write_text(content, encoding='utf-8')
            return {'ok': True, 'output': f'Successfully wrote {len(content.encode("utf-8"))} bytes to {p}', 'is_error': False}

        if tool == 'edit':
            path = _arg(args, 'path', 'file_path', 'filename')
            old = _arg(args, 'oldText', 'old_string', 'old')
            new = _arg(args, 'newText', 'new_string', 'new')
            if not path or not old:
                return _err('Error: edit requiere "path", "oldText" y "newText". '
                            'Ejemplo: {"tool":"edit","args":{"path":"x.py","oldText":"a","newText":"b"}}')
            txt = _resolver(path).read_text(encoding='utf-8')
            n = txt.count(old)
            if n == 0:
                return _err(f'Could not find the exact text in {path}. '
                            'The old text must match exactly including all whitespace and newlines.')
            if n > 1:
                return _err(f'The old text matches {n} places in {path}; it must be unique. Add surrounding context.')
            _resolver(path).write_text(txt.replace(old, new, 1), encoding='utf-8')
            return {'ok': True, 'output': f'Successfully replaced 1 block(s) in {_resolver(path)}.', 'is_error': False}

        return _err(f'Error: tool no soportada: "{tool}". Válidas: read, bash, edit, write.')
    except FileNotFoundError:
        return _err(f'Error: no such file: {_arg(args, "path", "file_path", "filename")}')
    except asyncio.TimeoutError:
        return _err('Error: bash timeout (60s)')
    except Exception as e:
        return _err(f'Error: {e}')
