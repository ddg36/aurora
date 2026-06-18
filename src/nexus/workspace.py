import pathlib
import shutil
import time

from .config import BASE, SANDBOX, STATE_DIR, WORKSPACE


def is_inside(path, root) -> bool:
    try:
        path = pathlib.Path(path).resolve()
        root = pathlib.Path(root).resolve()
        return path == root or root in path.parents
    except Exception:
        return False


def safe(path_str: str) -> pathlib.Path:
    raw = str(path_str or '.').replace('\\', '/')
    candidate = pathlib.Path(raw)
    if candidate.is_absolute():
        target = candidate.resolve()
    else:
        target = (WORKSPACE / raw.lstrip('/')).resolve()
    if not is_inside(target, BASE):
        raise PermissionError(f'Path fuera del área permitida: {path_str}')
    return target


def rel(path) -> str:
    try:
        return str(pathlib.Path(path).resolve().relative_to(WORKSPACE))
    except Exception:
        return str(path)


def in_sandbox(path) -> bool:
    return is_inside(path, SANDBOX)


def backup_dir() -> pathlib.Path:
    d = STATE_DIR / 'nexus-backups'
    d.mkdir(parents=True, exist_ok=True)
    return d


def make_backup(path, label: str = 'manual') -> pathlib.Path | None:
    path = pathlib.Path(path).resolve()
    if not path.exists() or not path.is_file():
        return None
    stamp = time.strftime('%Y%m%d_%H%M%S')
    dest = backup_dir() / f"{stamp}_{label}_{rel(path).replace('/', '__')}"
    shutil.copy2(path, dest)
    return dest
