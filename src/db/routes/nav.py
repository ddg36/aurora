from typing import Optional
from dataclasses import dataclass
from litestar import Controller, get, post, patch
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class SesionBody:
    objetivo: str


@dataclass
class SesionPatchBody:
    resultado: Optional[str] = None


@dataclass
class LogBody:
    tipo: str
    mensaje: str
    nav_sesion_id: Optional[int] = None
    url: Optional[str] = None


@dataclass
class CapturaBody:
    titulo: str
    url: str
    nav_sesion_id: Optional[int] = None
    selector: Optional[str] = None
    aria: Optional[str] = None
    testid: Optional[str] = None
    placeholder: Optional[str] = None
    rol: Optional[str] = None
    rect_json: Optional[str] = None


class NavController(Controller):
    path = "/db/nav"
    guards = [auth_guard]

    @post("/sesiones")
    async def create_sesion(self, request: Request, data: SesionBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        cur = await db.execute(
            "INSERT INTO nav_sesiones (usuario_id, objetivo) VALUES (?,?)",
            (uid, data.objetivo),
        )
        await db.commit()
        return {"id": cur.lastrowid}

    @patch("/sesiones/{id:int}")
    async def patch_sesion(self, request: Request, id: int, data: SesionPatchBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "UPDATE nav_sesiones SET resultado=?, fin=unixepoch() WHERE id=? AND usuario_id=?",
            (data.resultado, id, uid),
        )
        await db.commit()
        return {"ok": True}

    @post("/log")
    async def create_log(self, request: Request, data: LogBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        cur = await db.execute(
            "INSERT INTO nav_log (usuario_id, nav_sesion_id, tipo, mensaje, url) VALUES (?,?,?,?,?)",
            (uid, data.nav_sesion_id, data.tipo, data.mensaje, data.url),
        )
        await db.commit()
        return {"id": cur.lastrowid}

    @post("/capturas")
    async def create_captura(self, request: Request, data: CapturaBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO nav_capturas
               (usuario_id, nav_sesion_id, titulo, url, selector, aria, testid, placeholder, rol, rect_json)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (uid, data.nav_sesion_id, data.titulo, data.url, data.selector,
             data.aria, data.testid, data.placeholder, data.rol, data.rect_json),
        )
        await db.commit()
        return {"id": cur.lastrowid}

    @get("/sesiones")
    async def list_sesiones(self, request: Request, limit: int = 50) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM nav_sesiones WHERE usuario_id=? ORDER BY id DESC LIMIT ?",
            (uid, limit),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @get("/capturas")
    async def list_capturas(self, request: Request, nav_sesion_id: Optional[int] = None, limit: int = 100) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        if nav_sesion_id is not None:
            q = "SELECT * FROM nav_capturas WHERE usuario_id=? AND nav_sesion_id=? ORDER BY id DESC LIMIT ?"
            args = (uid, nav_sesion_id, limit)
        else:
            q = "SELECT * FROM nav_capturas WHERE usuario_id=? ORDER BY id DESC LIMIT ?"
            args = (uid, limit)
        async with db.execute(q, args) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @get("/log")
    async def list_log(self, request: Request, limit: int = 100, nav_sesion_id: Optional[int] = None) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        if nav_sesion_id is not None:
            q = "SELECT * FROM nav_log WHERE usuario_id=? AND nav_sesion_id=? ORDER BY id DESC LIMIT ?"
            args = (uid, nav_sesion_id, limit)
        else:
            q = "SELECT * FROM nav_log WHERE usuario_id=? ORDER BY id DESC LIMIT ?"
            args = (uid, limit)
        async with db.execute(q, args) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
