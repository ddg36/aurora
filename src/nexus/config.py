import pathlib
import platform

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


def clip(text: str) -> tuple[str, bool]:
    text = text or ''
    if len(text) <= MAX_OUTPUT_CHARS:
        return text, False
    return text[:MAX_OUTPUT_CHARS], True
