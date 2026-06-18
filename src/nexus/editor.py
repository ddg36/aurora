import platform
import shutil
import subprocess
import tempfile
import time

from litestar import post

from .config import IS_WIN, SANDBOX, TIMEOUT_RUN, clip
from .py import _venv_python

LANGS = {
    'py': {'suffix': '.py'},
    'python': {'suffix': '.py'},
    'js': {'suffix': '.js'},
    'node': {'suffix': '.js'},
    'sh': {'suffix': '.ps1' if IS_WIN else '.sh'},
    'bash': {'suffix': '.ps1' if IS_WIN else '.sh'},
}


def _runner(lang: str, path: str) -> list[str] | None:
    if lang in ('py', 'python'):
        py, _ = _venv_python()
        return [py, path]
    if lang in ('js', 'node'):
        node = shutil.which('node')
        return [node, path] if node else None
    if lang in ('sh', 'bash'):
        return ['powershell', '-File', path] if IS_WIN else ['bash', path]
    return None


@post('/nexus/editor/run')
async def editor_run(data: dict) -> dict:
    lang = str(data.get('lang') or 'py').lower()
    code = str(data.get('code') or '')
    timeout = int(data.get('timeout') or TIMEOUT_RUN)
    if lang not in LANGS:
        return {'ok': False, 'error': f'Lenguaje no soportado: {lang}. Usa: py, js, sh'}
    if not code.strip():
        return {'ok': False, 'error': 'Falta code'}
    SANDBOX.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', suffix=LANGS[lang]['suffix'], dir=str(SANDBOX),
                                     delete=False, encoding='utf-8') as f:
        f.write(code)
        tmp = f.name
    args = _runner(lang, tmp)
    if not args:
        return {'ok': False, 'error': f'Runtime no disponible para {lang}'}
    inicio = time.monotonic()
    try:
        result = subprocess.run(args, cwd=str(SANDBOX), capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': f'Timeout tras {timeout}s', 'duracion_ms': int((time.monotonic() - inicio) * 1000)}
    finally:
        try:
            import os
            os.unlink(tmp)
        except Exception:
            pass
    duracion = int((time.monotonic() - inicio) * 1000)
    stdout, st = clip(result.stdout)
    stderr, se = clip(result.stderr)
    return {'ok': result.returncode == 0, 'code': result.returncode, 'stdout': stdout, 'stderr': stderr,
            'duracion_ms': duracion, 'truncated': st or se}


EDITOR_ROUTES = [editor_run]
