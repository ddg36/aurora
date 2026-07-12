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
import pathlib

from . import config

MAX_OUT = 50 * 1024   # igual que pi: trunca a 50KB
BASE = pathlib.Path(config.CWD)


def _resolver(path: str) -> pathlib.Path:
    p = pathlib.Path(str(path or ''))
    return p if p.is_absolute() else (BASE / p)


async def ejecutar_tool(tool: str, args: dict) -> dict:
    """Devuelve {ok, output, is_error}. is_error=True es un error de la tool
    (ej: edit no matchea) que la nube debe ver para auto-corregirse."""
    args = args or {}
    try:
        if tool == 'read':
            txt = _resolver(args.get('path')).read_text(encoding='utf-8', errors='replace')
            out = txt[:MAX_OUT] + ('\n…(truncado a 50KB)' if len(txt) > MAX_OUT else '')
            return {'ok': True, 'output': out, 'is_error': False}

        if tool == 'bash':
            proc = await asyncio.create_subprocess_shell(
                str(args.get('cmd', '')), cwd=str(BASE),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            salida, _ = await asyncio.wait_for(proc.communicate(), 60)
            txt = salida.decode('utf-8', 'replace')
            return {'ok': True, 'output': (txt[:MAX_OUT] or '(sin salida)'), 'is_error': proc.returncode != 0}

        if tool == 'write':
            p = _resolver(args.get('path'))
            p.parent.mkdir(parents=True, exist_ok=True)
            content = str(args.get('content', ''))
            p.write_text(content, encoding='utf-8')
            return {'ok': True, 'output': f'Successfully wrote {len(content.encode("utf-8"))} bytes to {p}', 'is_error': False}

        if tool == 'edit':
            p = _resolver(args.get('path'))
            txt = p.read_text(encoding='utf-8')
            old, new = str(args.get('oldText', '')), str(args.get('newText', ''))
            n = txt.count(old) if old else 0
            if n == 0:
                return {'ok': True, 'is_error': True,
                        'output': f'Could not find the exact text in {args.get("path","")}. '
                                  'The old text must match exactly including all whitespace and newlines.'}
            if n > 1:
                return {'ok': True, 'is_error': True,
                        'output': f'The old text matches {n} places in {args.get("path","")}; it must be unique. Add surrounding context.'}
            p.write_text(txt.replace(old, new, 1), encoding='utf-8')
            return {'ok': True, 'output': f'Successfully replaced 1 block(s) in {p}.', 'is_error': False}

        return {'ok': False, 'error': f'Tool no soportada: {tool}', 'is_error': True, 'output': ''}
    except FileNotFoundError:
        return {'ok': True, 'is_error': True, 'output': f'Error: no such file: {args.get("path","")}'}
    except asyncio.TimeoutError:
        return {'ok': True, 'is_error': True, 'output': 'Error: bash timeout (60s)'}
    except Exception as e:
        return {'ok': True, 'is_error': True, 'output': f'Error: {e}'}
