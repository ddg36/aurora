import json
import time
from dataclasses import dataclass
from litestar import Controller, delete, get, put
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class IdeasBody:
    tematica: str
    datos: dict


class CreativityIdeasController(Controller):
    path = "/db/creativity-ideas"
    guards = [auth_guard]

    @get("")
    async def list_ideas(
        self,
        request: Request,
        tematica: str | None = None,
    ) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        q = "SELECT * FROM creativity_ideas WHERE usuario_id=?"
        params: list = [uid]
        if tematica:
            q += " AND tematica=?"; params.append(tematica)
        q += " ORDER BY tematica"
        async with db.execute(q, params) as cur:
            rows = await cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["datos"] = json.loads(d["datos"])
            result.append(d)
        return result

    @get("/{tematica:str}")
    async def get_ideas_by_tematica(self, tematica: str, request: Request) -> dict | None:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM creativity_ideas WHERE tematica=? AND usuario_id=?", (tematica, uid)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["datos"] = json.loads(d["datos"])
        return d

    @put("/{tematica:str}")
    async def upsert_ideas(self, tematica: str, data: IdeasBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        await db.execute(
            """INSERT INTO creativity_ideas (usuario_id, tematica, datos, creado_en, actualizado)
               VALUES (?,?,?,?,?)
               ON CONFLICT(usuario_id, tematica) DO UPDATE SET
                 datos=excluded.datos, actualizado=excluded.actualizado""",
            (uid, tematica, json.dumps(data.datos, ensure_ascii=False), now, now),
        )
        await db.commit()
        return {"ok": True}

    @delete("/{tematica:str}", status_code=200)
    async def delete_ideas(self, tematica: str, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM creativity_ideas WHERE tematica=? AND usuario_id=?", (tematica, uid)
        )
        await db.commit()
        return {"ok": True}
