import os
import shutil
import subprocess

from litestar import get, post

from .config import IS_WIN, PY_WORKSPACE, TIMEOUT_RUN, clip
from .workspace import is_inside


def _venv():
    return PY_WORKSPACE / '.venv'


def _venv_python() -> tuple[str, bool]:
    py = _venv() / ('Scripts/python.exe' if IS_WIN else 'bin/python3')
    if py.exists():
        return str(py), True
    if IS_WIN:
        return shutil.which('python') or shutil.which('python3') or 'python', False
    return shutil.which('python3') or 'python3', False


@get('/nexus/py/status')
async def py_status() -> dict:
    py, in_venv = _venv_python()
    result = subprocess.run([py, '--version'], capture_output=True, text=True, timeout=10)
    return {
        'ok': result.returncode == 0,
        'workspace': str(PY_WORKSPACE),
        'venv': str(_venv()),
        'venv_exists': in_venv,
        'python': py,
        'version': (result.stdout or result.stderr).strip(),
    }


@post('/nexus/py/venv-create')
async def py_venv_create() -> dict:
    venv = _venv()
    if venv.exists():
        return {'ok': True, 'venv': str(venv), 'content': 'Ya existe'}
    if IS_WIN:
        host_py = shutil.which('python') or shutil.which('python3')
    else:
        host_py = shutil.which('python3') or shutil.which('python')
    if not host_py:
        return {'ok': False, 'error': 'No se encontró python'}
    PY_WORKSPACE.mkdir(parents=True, exist_ok=True)
    result = subprocess.run([host_py, '-m', 'venv', str(venv)], capture_output=True, text=True, timeout=120)
    content, truncated = clip((result.stdout or '') + (result.stderr or ''))
    return {'ok': result.returncode == 0, 'venv': str(venv), 'content': content.strip() or 'OK', 'truncated': truncated}


@post('/nexus/py/run')
async def py_run(data: dict) -> dict:
    raw = str(data.get('path') or '.').replace('\\', '/')
    target = (PY_WORKSPACE / raw.lstrip('/')).resolve()
    if not is_inside(target, PY_WORKSPACE):
        return {'ok': False, 'error': f'Path fuera del workspace Python: {data.get("path")}'}
    path = target
    if not path.is_file() or path.suffix != '.py':
        return {'ok': False, 'error': f'py/run requiere archivo .py: {data.get("path")}'}
    py, in_venv = _venv_python()
    if not in_venv:
        return {'ok': False, 'error': f'No existe .venv: {_venv()}. Usa /nexus/py/venv-create primero'}
    args = [str(a) for a in (data.get('args') or [])]
    timeout = int(data.get('timeout') or TIMEOUT_RUN)
    venv = _venv()
    env = dict(os.environ, VIRTUAL_ENV=str(venv),
               PATH=str(venv / ('Scripts' if IS_WIN else 'bin')) + os.pathsep + os.environ.get('PATH', ''))
    try:
        result = subprocess.run([py, str(path), *args], cwd=str(PY_WORKSPACE), env=env,
                                capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': f'Timeout tras {timeout}s'}
    text = (result.stdout or '') + (('\n[stderr]\n' + result.stderr) if result.stderr else '')
    content, truncated = clip(text)
    return {'ok': result.returncode == 0, 'code': result.returncode, 'content': content, 'truncated': truncated}


@post('/nexus/py/pip-install')
async def py_pip_install(data: dict) -> dict:
    packages = [str(p) for p in (data.get('packages') or [])]
    if not packages:
        return {'ok': False, 'error': 'pip-install requiere paquetes'}
    if any(p.startswith('-') for p in packages):
        return {'ok': False, 'error': 'Flags de pip no permitidos'}
    py, in_venv = _venv_python()
    if not in_venv:
        return {'ok': False, 'error': f'No existe .venv: {_venv()}. Usa /nexus/py/venv-create primero'}
    result = subprocess.run([py, '-m', 'pip', 'install', *packages], cwd=str(PY_WORKSPACE),
                            capture_output=True, text=True, timeout=180)
    content, truncated = clip((result.stdout or '') + (result.stderr or ''))
    return {'ok': result.returncode == 0, 'packages': packages, 'content': content, 'truncated': truncated}


@get('/nexus/py/pip-list')
async def py_pip_list() -> dict:
    py, in_venv = _venv_python()
    if not in_venv:
        return {'ok': False, 'error': f'No existe .venv: {_venv()}'}
    result = subprocess.run([py, '-m', 'pip', 'list'], capture_output=True, text=True, timeout=30)
    content, truncated = clip(result.stdout or result.stderr or '')
    return {'ok': result.returncode == 0, 'content': content.strip(), 'truncated': truncated}


PY_ROUTES = [py_status, py_venv_create, py_run, py_pip_install, py_pip_list]
