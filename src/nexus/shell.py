import pathlib

from litestar import post

from .config import BLOCK_PATTERNS, DESTRUCTIVE, IS_WIN, clip
from .tasks import create_job
from .workspace import safe


async def ejecutar_shell_async(cmd: str, cwd: str = '.', origin: dict | None = None) -> dict:
    cmd = (cmd or '').strip()
    if not cmd:
        return {'ok': False, 'error': 'Falta cmd'}
    lowered = cmd.lower()
    if any(pat.lower() in lowered for pat in BLOCK_PATTERNS):
        return {'ok': False, 'blocked': True, 'error': 'Comando peligroso bloqueado'}
    first = cmd.split()[0] if cmd.split() else ''
    if pathlib.Path(first).name.lower() in DESTRUCTIVE:
        from .approvals import crear_aprobacion
        return crear_aprobacion('shell/run', {'cmd': cmd, 'cwd': cwd},
                                f'Comando destructivo requiere aprobación: {first}')
    try:
        cwd_path = safe(cwd)
    except PermissionError as e:
        return {'ok': False, 'error': str(e)}

    job = create_job(cmd, str(cwd_path), origin)
    r = await job.run()
    return {
        'ok': r['exit_code'] == 0 if r['exit_code'] is not None else False,
        'code': r['exit_code'],
        'stdout': r['stdout'],
        'stderr': r['stderr'],
        'job_id': r['id'],
        'killed': r['status'] == 'killed',
    }


@post('/nexus/shell/run')
async def shell_run(data: dict) -> dict:
    r = await ejecutar_shell_async(
        str(data.get('cmd') or ''),
        str(data.get('cwd') or '.'),
        data.get('origin'),
    )
    if r.get('approval_required'):
        return r
    if r.get('killed'):
        r['ok'] = False
        r['error'] = 'Interrupted'
    return r


@post('/nexus/shell/exec')
async def shell_exec(data: dict) -> dict:
    return await shell_run(data)


SHELL_ROUTES = [shell_run, shell_exec]

# Backwards compat: sync wrapper for approvals
def ejecutar_shell(cmd: str, cwd: str = '.', timeout: int | None = None, approved: bool = False) -> dict:
    import subprocess
    cmd = (cmd or '').strip()
    if not cmd:
        return {'ok': False, 'error': 'Falta cmd'}
    lowered = cmd.lower()
    if any(pat.lower() in lowered for pat in BLOCK_PATTERNS):
        return {'ok': False, 'blocked': True, 'error': 'Comando peligroso bloqueado'}
    first = cmd.split()[0] if cmd.split() else ''
    if not approved and pathlib.Path(first).name.lower() in DESTRUCTIVE:
        from .approvals import crear_aprobacion
        return crear_aprobacion('shell/run', {'cmd': cmd, 'cwd': cwd, 'timeout': timeout},
                                f'Comando destructivo requiere aprobación: {first}')
    try:
        cwd_path = safe(cwd)
    except PermissionError as e:
        return {'ok': False, 'error': str(e)}
    if IS_WIN:
        run_args = ['powershell', '-NoProfile', '-NonInteractive', '-Command', cmd]
    else:
        run_args = ['bash', '-lc', cmd]
    try:
        result = subprocess.run(run_args, cwd=str(cwd_path), capture_output=True, text=True,
                                timeout=timeout or 600)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': f'Timeout tras {timeout or 600}s'}
    stdout, st = clip(result.stdout)
    stderr, se = clip(result.stderr)
    return {'ok': result.returncode == 0, 'code': result.returncode, 'stdout': stdout, 'stderr': stderr, 'truncated': st or se}
