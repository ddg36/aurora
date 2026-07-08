# ══════════════════════════════════════════════════════
#  PI CONFIG — Constantes desde config/llm.toml. Solo datos.
# ══════════════════════════════════════════════════════

import pathlib
import tomllib

VERSION = '1.0.0'

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]

_LLM_TOML = PROJECT_ROOT / 'config' / 'llm.toml'
_cfg: dict = {}
if _LLM_TOML.exists():
    _cfg = tomllib.loads(_LLM_TOML.read_text(encoding='utf-8'))

_pi = _cfg.get('pi', {})

_HOME = pathlib.Path.home()

# El shim de pi usa el node del sistema (v18, incompatible) — se ejecuta vía bun.
PI_BIN = _pi.get('bin', str(_HOME / '.bun' / 'bin' / 'pi'))
RUNTIME = _pi.get('runtime', str(_HOME / '.bun' / 'bin' / 'bun'))

_session_dir = pathlib.Path(_pi.get('session_dir', 'databases/pi-sessions'))
SESSION_DIR = str(_session_dir if _session_dir.is_absolute() else PROJECT_ROOT / _session_dir)

CWD = _pi.get('cwd', str(PROJECT_ROOT))
EXTRA_ARGS = list(_pi.get('extra_args', []))

TIMEOUT_CMD = float(_pi.get('timeout_cmd', 30))
