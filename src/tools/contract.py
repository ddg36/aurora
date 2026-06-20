from dataclasses import dataclass, field, fields
from typing import Awaitable, Callable

ToolHandler = Callable[[dict, dict], Awaitable[dict]]


def schema(properties: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": properties, "required": required or []}


@dataclass(frozen=True)
class ToolContract:
    name: str
    description: str
    input_schema: dict
    handler: ToolHandler
    risk: str = "low"
    scopes: list[str] = field(default_factory=list)
    requires_approval: bool = False
    output_schema: dict | None = None
    tags: list[str] = field(default_factory=list)
    timeout: int = 30

    def public(self) -> dict:
        return {f.name: getattr(self, f.name) for f in fields(self) if f.name != "handler"}
