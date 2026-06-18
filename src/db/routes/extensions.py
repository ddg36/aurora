import json
import pathlib
from dataclasses import dataclass
from typing import Any

from litestar import Controller, get, put
from litestar.connection import Request

from ..auth import auth_guard
from ..connection import get_db


REGISTRY_PATH = pathlib.Path(__file__).parents[3] / "extensions" / "registry.json"


@dataclass
class ExtensionStateBody:
    enabled: bool | None = None
    config: Any = None


def _load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {"version": 1, "extensions": []}
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _state_key(extension_id: str) -> str:
    return f"extension:{extension_id}:state"


class ExtensionsController(Controller):
    path = "/db/extensions"
    guards = [auth_guard]

    @get("")
    async def get_registry(self, request: Request) -> dict:
        uid = request.state.usuario_id
        registry = _load_registry()
        db = await get_db()
        async with db.execute(
            "SELECT clave, valor FROM ajustes WHERE usuario_id=? AND clave LIKE 'extension:%:state'",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()

        states = {}
        for row in rows:
            extension_id = row["clave"].split(":")[1]
            try:
                states[extension_id] = json.loads(row["valor"] or "{}")
            except json.JSONDecodeError:
                states[extension_id] = {}

        return {"registry": registry, "states": states}

    @get("/{extension_id:str}")
    async def get_state(self, request: Request, extension_id: str) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT valor FROM ajustes WHERE usuario_id=? AND clave=?",
            (uid, _state_key(extension_id)),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return {"id": extension_id, "enabled": None, "config": None}
        try:
            state = json.loads(row["valor"] or "{}")
        except json.JSONDecodeError:
            state = {}
        return {"id": extension_id, **state}

    @put("/{extension_id:str}")
    async def set_state(self, request: Request, extension_id: str, data: ExtensionStateBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        value = json.dumps({"enabled": data.enabled, "config": data.config}, ensure_ascii=False)
        await db.execute(
            "INSERT INTO ajustes (usuario_id, clave, valor) VALUES (?,?,?) ON CONFLICT(usuario_id, clave) DO UPDATE SET valor=excluded.valor",
            (uid, _state_key(extension_id), value),
        )
        await db.commit()
        return {"ok": True}
