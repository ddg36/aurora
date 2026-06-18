import time
from typing import Optional
from dataclasses import dataclass
from litestar import Controller, get, post, put, delete
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class UrlCustomBody:
    nombre: str
    url: str
    icono: Optional[str] = None


@dataclass
class UrlCustomUpdateBody:
    nombre: str
    url: str
    icono: Optional[str] = None


class UrlsCustomController(Controller):
    path = "/db/urls-custom"
    guards = [auth_guard]

    @get("")
    async def list_urls(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id, nombre, url, icono FROM urls_custom WHERE usuario_id=? AND activo=1",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("")
    async def create_url(self, request: Request, data: UrlCustomBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        new_id = f"u_{int(time.time() * 1000)}"
        await db.execute(
            """INSERT INTO urls_custom (id, usuario_id, nombre, url, icono, activo)
               VALUES (?,?,?,?,?,1)""",
            (new_id, uid, data.nombre, data.url, data.icono),
        )
        await db.commit()
        return {"id": new_id}

    @put("/{url_id:str}")
    async def update_url(self, request: Request, url_id: str, data: UrlCustomUpdateBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            """UPDATE urls_custom SET nombre=?, url=?, icono=?
               WHERE id=? AND usuario_id=?""",
            (data.nombre, data.url, data.icono, url_id, uid),
        )
        await db.commit()
        return {"ok": True}

    @delete("/{url_id:str}", status_code=200)
    async def delete_url(self, request: Request, url_id: str) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "UPDATE urls_custom SET activo=0 WHERE id=? AND usuario_id=?",
            (url_id, uid),
        )
        await db.commit()
        return {"ok": True}
