# ══════════════════════════════════════════════════════
#  PI CONFIG — Constantes desde config/llm.toml. Solo datos.
# ══════════════════════════════════════════════════════

import pathlib
import platform
import tomllib

VERSION = '1.0.0'

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]

_LLM_TOML = PROJECT_ROOT / 'config' / 'llm.toml'
_cfg: dict = {}
if _LLM_TOML.exists():
    _cfg = tomllib.loads(_LLM_TOML.read_text(encoding='utf-8'))

_pi = _cfg.get('pi', {})

_HOME = pathlib.Path.home()

# Resolución por SO, mismo patrón que [db] path_windows/path_linux en
# server.toml: clave con sufijo de plataforma gana, clave pelada es fallback
# (configs Linux existentes siguen funcionando sin tocar nada).
_WIN = platform.system() == 'Windows'
_SUFIJO = '_windows' if _WIN else '_linux'


def _por_so(clave: str, default: str) -> str:
    return _pi.get(clave + _SUFIJO) or _pi.get(clave) or default


# El shim de pi usa el node del sistema (v18, incompatible) — se ejecuta vía bun.
PI_BIN = _por_so('bin', str(_HOME / '.bun' / 'bin' / ('pi.cmd' if _WIN else 'pi')))
RUNTIME = _por_so('runtime', str(_HOME / '.bun' / 'bin' / ('bun.exe' if _WIN else 'bun')))

# pi maneja sus sesiones donde las maneja SIEMPRE (~/.pi/agent/sessions/,
# vía getAgentDir() de pi) — Aurora es sólo una interfaz distinta sobre el
# mismo pi, no debe redirigir dónde guarda sus datos. Sin session_dir en
# config/llm.toml, no se pasa --session-dir en absoluto y pi usa su default
# real (idéntico a correr `pi` a mano en esta misma carpeta).
_session_dir_cfg = _pi.get('session_dir')
SESSION_DIR = None
if _session_dir_cfg:
    _session_dir = pathlib.Path(_session_dir_cfg)
    SESSION_DIR = str(_session_dir if _session_dir.is_absolute() else PROJECT_ROOT / _session_dir)

# Bookkeeping propio de Aurora (mapa chat_id↔sessionFile, favoritos de
# modelo) — NUNCA junto a los datos reales de pi, viven acá aparte.
AURORA_DATA_DIR = str(PROJECT_ROOT / 'databases')

CWD = _pi.get('cwd', str(PROJECT_ROOT))
EXTRA_ARGS = list(_pi.get('extra_args', []))

TIMEOUT_CMD = float(_pi.get('timeout_cmd', 30))
