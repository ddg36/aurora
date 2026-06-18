from typing import Optional
from dataclasses import dataclass
from litestar import Controller, get, post, delete
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class ExtCapturaBody:
    tipo:      str
    titulo:    Optional[str] = None
    url:       Optional[str] = None
    contenido: Optional[str] = None
    tab_title: Optional[str] = None
    tab_url:   Optional[str] = None


class ExtCapturasController(Controller):
    path = "/db/ext-capturas"
    guards = [auth_guard]

    @post("")
    async def crear(self, request: Request, data: ExtCapturaBody) -> dict:
        uid = request.state.usuario_id
        chars = len(data.contenido) if data.contenido else 0
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO ext_capturas
               (usuario_id, tipo, titulo, url, contenido, chars, tab_title, tab_url)
               VALUES (?,?,?,?,?,?,?,?)""",
            (uid, data.tipo, data.titulo, data.url, data.contenido,
             chars, data.tab_title, data.tab_url),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid, "chars": chars}

    @get("")
    async def listar(
        self,
        request: Request,
        tipo: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        if tipo:
            q = """SELECT id, tipo, titulo, url, chars, tab_title, tab_url, capturado_en
                   FROM ext_capturas WHERE usuario_id=? AND tipo=?
                   ORDER BY id DESC LIMIT ? OFFSET ?"""
            args = (uid, tipo, limit, offset)
        else:
            q = """SELECT id, tipo, titulo, url, chars, tab_title, tab_url, capturado_en
                   FROM ext_capturas WHERE usuario_id=?
                   ORDER BY id DESC LIMIT ? OFFSET ?"""
            args = (uid, limit, offset)
        async with db.execute(q, args) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @get("/{id:int}")
    async def obtener(self, request: Request, id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM ext_capturas WHERE id=? AND usuario_id=?", (id, uid)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return {"ok": False, "error": "not found"}
        return dict(row)

    @delete("/{id:int}", status_code=200)
    async def eliminar(self, request: Request, id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM ext_capturas WHERE id=? AND usuario_id=?", (id, uid)
        )
        await db.commit()
        return {"ok": True}

    @delete("", status_code=200)
    async def limpiar(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute("DELETE FROM ext_capturas WHERE usuario_id=?", (uid,))
        await db.commit()
        return {"ok": True}
