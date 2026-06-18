from dataclasses import dataclass
from typing import Optional

from litestar import Controller, get, post, delete
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class DownloadItemBody:
    filename: str
    url: str = ""
    path: Optional[str] = None
    file_size: Optional[int] = None


class AshDownloadController(Controller):
    path = "/db/ash/downloads"
    guards = [auth_guard]

    @get("")
    async def list_downloads(self, request: Request, limit: int = 100) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM ash_descargas WHERE usuario_id=? ORDER BY descargado_en DESC LIMIT ?",
            (uid, limit),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("")
    async def add_download(self, request: Request, data: DownloadItemBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "INSERT INTO ash_descargas (usuario_id, filename, path, url_origen, tamanio) VALUES (?,?,?,?,?)",
            (uid, data.filename, data.path, data.url, data.file_size),
        )
        await db.commit()
        return {"ok": True}

    @delete("/{item_id:int}", status_code=200)
    async def delete_download(self, request: Request, item_id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM ash_descargas WHERE id=? AND usuario_id=?",
            (item_id, uid),
        )
        await db.commit()
        return {"ok": True}
