from tools.registry import list_tools, run_tool

from .config import load_config
from .external import list_external_servers
from .prompts import get_prompt, list_prompts
from .resources import list_resources, read_resource


async def handle_rpc(message: dict) -> dict:
    req_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}
    try:
        result = await _dispatch(method, params)
        return {"jsonrpc": "2.0", "id": req_id, "result": result}
    except Exception as exc:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32000, "message": str(exc)}}


async def _dispatch(method: str, params: dict) -> dict:
    if method == "initialize":
        server_cfg = load_config().get("mcp", {}).get("server", {})
        return {
            "protocolVersion": "2024-11-05",
            "serverInfo": {
                "name": server_cfg.get("name", "aurora"),
                "version": server_cfg.get("version", "0.1.0"),
            },
            "capabilities": {
                "tools": {},
                "resources": {},
                "prompts": {},
            },
        }
    if method == "tools/list":
        return {"tools": [
            {"name": t["name"], "description": t["description"], "inputSchema": t["input_schema"],
             "annotations": {"risk": t["risk"], "scopes": t["scopes"], "requiresApproval": t["requires_approval"]}}
            for t in list_tools() if "mcp" in (t.get("tags") or [])
        ]}
    if method == "tools/call":
        result = await run_tool(
            params.get("name", ""),
            params.get("arguments") or {},
            {"kind": "external", "source": "mcp"},
        )
        text = result.get("text")
        if text is None:
            text = result.get("error") or str(result.get("data") or result)
        return {
            "isError": not bool(result.get("ok")),
            "content": [{"type": "text", "text": str(text)}],
            "_meta": {k: v for k, v in result.items() if k != "text"},
        }
    if method == "resources/list":
        return {"resources": list_resources()}
    if method == "resources/read":
        result = await read_resource(params.get("uri", ""))
        if not result.get("ok"):
            raise ValueError(result.get("error"))
        return {"contents": result["contents"]}
    if method == "prompts/list":
        return {"prompts": list_prompts()}
    if method == "prompts/get":
        result = get_prompt(params.get("name", ""), params.get("arguments") or {})
        if not result.get("ok"):
            raise ValueError(result.get("error"))
        return {k: v for k, v in result.items() if k != "ok"}
    if method == "aurora/externalServers":
        return {"servers": list_external_servers()}
    if method in ("notifications/initialized", "ping"):
        return {}
    raise ValueError(f"Método MCP no soportado: {method}")
