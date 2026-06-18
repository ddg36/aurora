from dataclasses import dataclass
from typing import Optional

from litestar import Controller, get, put, patch
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class SesionBody:
    activa: int = 0
    tab_id: Optional[int] = None
    window_id: Optional[int] = None
    url: Optional[str] = None
    titulo: Optional[str] = None
    id_by_key: Optional[str] = None
    next_map_id: Optional[int] = None


class BcController(Controller):
    path = "/db/bc"
    guards = [auth_guard]

    @get("/sesiones")
    async def list_sesiones(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM bc_sesiones WHERE usuario_id=? ORDER BY id DESC",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @put("/sesiones/{sesion_id:str}")
    async def upsert_sesion(self, request: Request, sesion_id: str, data: SesionBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            """INSERT OR REPLACE INTO bc_sesiones
               (id, usuario_id, tab_id, window_id, url, titulo, id_by_key, next_map_id, activa)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (sesion_id, uid, data.tab_id, data.window_id, data.url,
             data.titulo, data.id_by_key, data.next_map_id, data.activa),
        )
        await db.commit()
        return {"ok": True}

    @patch("/sesiones/{sesion_id:str}/activar")
    async def activar_sesion(self, request: Request, sesion_id: str) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "UPDATE bc_sesiones SET activa=0 WHERE usuario_id=?",
            (uid,),
        )
        await db.execute(
            "UPDATE bc_sesiones SET activa=1 WHERE id=? AND usuario_id=?",
            (sesion_id, uid),
        )
        await db.commit()
        return {"ok": True}
