from .contract import ToolContract

_TOOLS: dict[str, ToolContract] = {}
_EXTERNAL_ALLOWED_RISKS = {"low"}


def register(tool: ToolContract) -> None:
    _TOOLS[tool.name] = tool


def get_tool(name: str) -> ToolContract | None:
    return _TOOLS.get(name)


def list_tools() -> list[dict]:
    return [tool.public() for tool in sorted(_TOOLS.values(), key=lambda item: item.name)]


def to_openai_format() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema,
            },
        }
        for tool in sorted(_TOOLS.values(), key=lambda t: t.name)
        if not tool.requires_approval
    ]


async def run_tool(
    name: str, arguments: dict, caller: dict | None = None, *, approved: bool = False,
) -> dict:
    tool = get_tool(name)
    if not tool:
        return {"ok": False, "error": f"Tool no encontrada: {name}"}
    caller = caller or {"kind": "internal"}
    if caller.get("kind") != "internal" and tool.risk not in _EXTERNAL_ALLOWED_RISKS:
        return {"ok": False, "blocked": True, "error": "Tool no permitida para callers externos sin perfil explícito."}
    if tool.requires_approval and not approved:
        return {"ok": False, "approval_required": True, "error": "Esta tool requiere aprobación antes de ejecutarse."}
    try:
        result = await tool.handler(arguments or {}, caller)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    if isinstance(result, dict) and "ok" in result:
        return result
    return {"ok": True, "data": result}
