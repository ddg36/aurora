import pathlib
import platform

from litestar import get, post

from .config import external_servers
from .external import call_external, list_external_servers
from .prompts import list_prompts
from .protocol import handle_rpc
from .resources import list_resources

_IS_WIN = platform.system() == 'Windows'
_ROOT = pathlib.Path(__file__).resolve().parents[2]


@get("/mcp/status")
async def mcp_status() -> dict:
    return {
        "ok": True,
        "server": {"enabled": True, "transport": "http-json-rpc", "endpoint": "/mcp/rpc"},
        "external": list_external_servers(),
        "resources": list_resources(),
        "prompts": list_prompts(),
    }


@get("/mcp/client-config")
async def mcp_client_config() -> dict:
    if _IS_WIN:
        py_cmd = str(_ROOT / '.venv-windows' / 'Scripts' / 'python.exe')
    else:
        py_cmd = str(_ROOT / '.venv-linux' / 'bin' / 'python3')
    script = str(_ROOT / 'scripts' / 'aurora_mcp_stdio.py')
    return {
        "ok": True,
        "claude_desktop": {
            "mcpServers": {
                "aurora": {
                    "command": py_cmd,
                    "args": [script],
                }
            }
        },
        "http": {"url": "http://127.0.0.1:7779/mcp/rpc"},
    }


@post("/mcp/rpc")
async def mcp_rpc(data: dict | list) -> dict | list:
    if isinstance(data, list):
        return [await handle_rpc(item) for item in data]
    return await handle_rpc(data)


@get("/mcp/external")
async def mcp_external_list() -> dict:
    return {"ok": True, "servers": list_external_servers()}


@post("/mcp/external/{server_id:str}/rpc")
async def mcp_external_rpc(server_id: str, data: dict) -> dict:
    return await call_external(server_id, data.get("method", "tools/list"), data.get("params") or {})


MCP_ROUTES = [mcp_status, mcp_client_config, mcp_rpc, mcp_external_list, mcp_external_rpc]
