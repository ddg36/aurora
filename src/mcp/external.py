import asyncio
import json

from .config import external_servers


def list_external_servers() -> list[dict]:
    return [
        {k: v for k, v in server.items() if k != "env"}
        for server in external_servers()
    ]


async def call_external(server_id: str, method: str, params: dict | None = None, timeout: int = 20) -> dict:
    server = next((s for s in external_servers() if s["id"] == server_id), None)
    if not server:
        return {"ok": False, "error": f"MCP server externo no encontrado: {server_id}"}
    if not server.get("enabled"):
        return {"ok": False, "error": f"MCP server externo deshabilitado: {server_id}"}
    if server.get("type") != "command":
        return {"ok": False, "error": "Solo type=command está soportado en este first shot"}

    proc = await asyncio.create_subprocess_exec(
        server["command"],
        *server.get("args", []),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**server.get("env", {})} or None,
    )
    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        {"jsonrpc": "2.0", "id": 2, "method": method, "params": params or {}},
    ]
    payload = "".join(json.dumps(item) + "\n" for item in requests).encode()
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(payload), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return {"ok": False, "error": f"Timeout llamando MCP externo {server_id}"}

    responses = []
    for line in stdout.decode("utf-8", errors="replace").splitlines():
        try:
            responses.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return {
        "ok": proc.returncode == 0,
        "responses": responses,
        "result": responses[-1].get("result") if responses else None,
        "stderr": stderr.decode("utf-8", errors="replace")[-4000:],
        "code": proc.returncode,
    }
