from .contract import ToolContract

EXTERNAL_ALLOWED_RISKS = {"low"}


def check_policy(tool: ToolContract, arguments: dict, caller: dict) -> dict:
    caller_kind = caller.get("kind", "internal")
    if caller_kind != "internal" and tool.risk not in EXTERNAL_ALLOWED_RISKS:
        return {
            "allowed": False,
            "reason": "Tool no permitida para callers externos sin perfil explícito.",
            "risk": tool.risk,
        }
    if tool.requires_approval:
        return {
            "allowed": True,
            "approval_required": True,
            "reason": "approval_required",
            "risk": tool.risk,
            "scopes": tool.scopes,
        }
    return {
        "allowed": True,
        "approval_required": False,
        "reason": "allowed",
        "risk": tool.risk,
        "scopes": tool.scopes,
    }
