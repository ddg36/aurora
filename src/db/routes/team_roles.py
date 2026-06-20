import json
import time
from dataclasses import dataclass, field
from litestar import Controller, delete, get, patch, post, put
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class RoleBody:
    nombre: str
    icono: str | None = None
    color: str | None = None
    prompt_template: str | None = None
    default_members: list | None = None
    orden: int = 0


@dataclass
class ReorderBody:
    ids: list[str]


class TeamRolesController(Controller):
    path = "/db/team-roles"
    guards = [auth_guard]

    @get("")
    async def list_roles(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM ai_team_roles WHERE usuario_id=? ORDER BY orden, nombre",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["default_members"] = json.loads(d["default_members"]) if d["default_members"] else []
            result.append(d)
        return result

    @get("/{rid:str}")
    async def get_role(self, rid: str, request: Request) -> dict | None:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM ai_team_roles WHERE id=? AND usuario_id=?", (rid, uid)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["default_members"] = json.loads(d["default_members"]) if d["default_members"] else []
        return d

    @post("")
    async def create_role(self, data: RoleBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        rid = f"rol_{int(time.time() * 1000)}"
        await db.execute(
            """INSERT INTO ai_team_roles (id, usuario_id, nombre, icono, color, prompt_template, default_members, orden, creado_en, actualizado)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (rid, uid, data.nombre, data.icono, data.color, data.prompt_template,
             json.dumps(data.default_members, ensure_ascii=False) if data.default_members else None,
             data.orden, now, now),
        )
        await db.commit()
        return {"ok": True, "id": rid}

    @put("/{rid:str}")
    async def update_role(self, rid: str, data: RoleBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        await db.execute(
            """UPDATE ai_team_roles SET nombre=?, icono=?, color=?, prompt_template=?,
               default_members=?, orden=?, actualizado=?
               WHERE id=? AND usuario_id=?""",
            (data.nombre, data.icono, data.color, data.prompt_template,
             json.dumps(data.default_members, ensure_ascii=False) if data.default_members else None,
             data.orden, now, rid, uid),
        )
        await db.commit()
        return {"ok": True}

    @delete("/{rid:str}", status_code=200)
    async def delete_role(self, rid: str, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute("DELETE FROM ai_team_roles WHERE id=? AND usuario_id=?", (rid, uid))
        await db.commit()
        return {"ok": True}

    @patch("/order")
    async def reorder_roles(self, data: ReorderBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        for i, rid in enumerate(data.ids):
            await db.execute(
                "UPDATE ai_team_roles SET orden=?, actualizado=? WHERE id=? AND usuario_id=?",
                (i, int(time.time()), rid, uid),
            )
        await db.commit()
        return {"ok": True}
