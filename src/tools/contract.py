from dataclasses import dataclass, field
from typing import Awaitable, Callable

ToolHandler = Callable[[dict, dict], Awaitable[dict]]


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
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "risk": self.risk,
            "scopes": self.scopes,
            "requires_approval": self.requires_approval,
            "tags": self.tags,
            "timeout": self.timeout,
        }
