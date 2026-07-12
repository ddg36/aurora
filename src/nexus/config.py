import os
import pathlib
import platform
import tomllib

BASE = pathlib.Path(__file__).resolve().parents[3]
WORKSPACE = BASE
SANDBOX = BASE / 'nexus' / 'workspaces' / 'aihub'
PY_WORKSPACE = BASE / 'nexus' / 'workspaces' / 'aihub'
STATE_DIR = BASE / 'nexus' / 'state' / 'aurora'

IS_WIN = platform.system() == 'Windows'
MAX_OUTPUT_CHARS = 20000
TIMEOUT_SHELL = 30
TIMEOUT_RUN = 60

DESTRUCTIVE = {'rm', 'dd', 'mkfs', 'shred', 'wipefs', 'fdisk', 'rmdir', 'del', 'rd', 'diskpart', 'cipher', 'sfc'}
BLOCK_PATTERNS = (
    'rm -rf', 'rm -fr', 'chmod -R', 'chown -R', ':(){',
    'curl | bash', 'wget | bash',
    'del /s', 'rmdir /s', 'rd /s', 'format c:', 'format d:', 'cipher /w',
)

SKIP_DIRS = {'node_modules', '.git', '__pycache__', '.venv', 'venv', 'cloud'}


def _leer_solo_lectura() -> bool:
    if (env := os.environ.get('AURORA_NEXUS_READONLY')) is not None:
        return env.strip().lower() in ('1', 'true', 'si', 'sí', 'yes')
    toml_path = pathlib.Path(__file__).resolve().parents[2] / 'config' / 'server.toml'
    try:
        return bool(tomllib.loads(toml_path.read_text(encoding='utf-8')).get('nexus', {}).get('solo_lectura', False))
    except Exception:
        return False


SOLO_LECTURA = _leer_solo_lectura()


def bloqueo_solo_lectura() -> dict | None:
    """Respuesta de bloqueo si nexus está en modo solo lectura, o None."""
    if SOLO_LECTURA:
        return {'ok': False, 'blocked': True,
                'error': 'Nexus en modo solo lectura (config/server.toml [nexus].solo_lectura o AURORA_NEXUS_READONLY)'}
    return None


def clip(text: str) -> tuple[str, bool]:
    text = text or ''
    if len(text) <= MAX_OUTPUT_CHARS:
        return text, False
    return text[:MAX_OUTPUT_CHARS], True
