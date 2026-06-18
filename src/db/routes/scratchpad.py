from typing import Optional
from dataclasses import dataclass
from litestar import Controller, get, post, delete
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class ImagenBody:
    filename: str
    path: str
    tamanio: Optional[int] = None
    mime: Optional[str] = None


class ScratchpadController(Controller):
    path = "/db/scratchpad"
    guards = [auth_guard]

    @get("/imagenes")
    async def list_imagenes(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM scratchpad_imagenes WHERE usuario_id=? ORDER BY creado_en DESC",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("/imagenes")
    async def create_imagen(self, request: Request, data: ImagenBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        cur = await db.execute(
            "INSERT INTO scratchpad_imagenes (usuario_id, filename, path, tamanio, mime) VALUES (?,?,?,?,?)",
            (uid, data.filename, data.path, data.tamanio, data.mime),
        )
        await db.commit()
        return {"id": cur.lastrowid, "path": data.path}

    @delete("/imagenes/{id:int}", status_code=200)
    async def delete_imagen(self, request: Request, id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM scratchpad_imagenes WHERE id=? AND usuario_id=?",
            (id, uid),
        )
        await db.commit()
        return {"ok": True}
