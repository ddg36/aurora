from .contract import ToolContract

_TOOLS: dict[str, ToolContract] = {}


def register(tool: ToolContract) -> None:
    _TOOLS[tool.name] = tool


def get_tool(name: str) -> ToolContract | None:
    return _TOOLS.get(name)


def list_tools() -> list[dict]:
    return [tool.public() for tool in sorted(_TOOLS.values(), key=lambda item: item.name)]


async def run_tool(name: str, arguments: dict, caller: dict | None = None) -> dict:
    tool = get_tool(name)
    if not tool:
        return {"ok": False, "error": f"Tool no encontrada: {name}"}
    caller = caller or {"kind": "internal"}
    from .policy import check_policy
    decision = check_policy(tool, arguments, caller)
    if not decision["allowed"]:
        return {"ok": False, "blocked": True, "error": decision["reason"], "policy": decision}
    if decision.get("approval_required"):
        return {
            "ok": False,
            "approval_required": True,
            "error": "Esta tool requiere aprobación antes de ejecutarse.",
            "policy": decision,
        }
    try:
        result = await tool.handler(arguments or {}, caller)
    except PermissionError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    if isinstance(result, dict) and "ok" in result:
        return result
    return {"ok": True, "data": result}
