from dataclasses import dataclass
from typing import Optional

from litestar import Controller, get, post, delete
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class ExtraccionBody:
    fuente: str
    url: str
    titulo: Optional[str] = None
    tipo: Optional[str] = None
    contenido: Optional[str] = None
    meta: Optional[str] = None


class YtController(Controller):
    path = "/db/yt"
    guards = [auth_guard]

    @get("/extracciones")
    async def list_extracciones(
        self,
        request: Request,
        fuente: Optional[str] = None,
        tipo: Optional[str] = None,
        limit: int = 50,
    ) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        query = "SELECT * FROM yt_extracciones WHERE usuario_id=?"
        params: list = [uid]
        if fuente:
            query += " AND fuente=?"
            params.append(fuente)
        if tipo:
            query += " AND tipo=?"
            params.append(tipo)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        async with db.execute(query, params) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("/extracciones")
    async def create_extraccion(self, request: Request, data: ExtraccionBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            """INSERT INTO yt_extracciones (usuario_id, fuente, url, titulo, tipo, contenido, meta)
               VALUES (?,?,?,?,?,?,?)""",
            (uid, data.fuente, data.url, data.titulo, data.tipo, data.contenido, data.meta),
        ) as cur:
            record_id = cur.lastrowid
        await db.commit()
        return {"id": record_id}

    @delete("/extracciones/{id:int}", status_code=200)
    async def delete_extraccion(self, request: Request, id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM yt_extracciones WHERE id=? AND usuario_id=?",
            (id, uid),
        )
        await db.commit()
        return {"ok": True}

    @delete("/extracciones", status_code=200)
    async def clear_extracciones(
        self, request: Request, fuente: Optional[str] = None
    ) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        if fuente:
            await db.execute(
                "DELETE FROM yt_extracciones WHERE usuario_id=? AND fuente=?", (uid, fuente)
            )
        else:
            await db.execute("DELETE FROM yt_extracciones WHERE usuario_id=?", (uid,))
        await db.commit()
        return {"ok": True}
