from dataclasses import dataclass
from typing import Optional

from litestar import Controller, get, post
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class SesionBody:
    chat_id: Optional[int] = None
    modelo_id: Optional[str] = None
    duracion_ms: Optional[int] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    herramienta: Optional[str] = None
    os: Optional[str] = None


class SesionesController(Controller):
    path = "/db/sesiones"
    guards = [auth_guard]

    @post("")
    async def insert_sesion(self, request: Request, data: SesionBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "INSERT INTO sesiones (usuario_id, chat_id, modelo_id, duracion_ms, tokens_in, tokens_out, herramienta, os) VALUES (?,?,?,?,?,?,?,?)",
            (uid, data.chat_id, data.modelo_id, data.duracion_ms, data.tokens_in, data.tokens_out, data.herramienta, data.os),
        ) as cur:
            row_id = cur.lastrowid
        await db.commit()
        return {"id": row_id}

    @get("")
    async def list_sesiones(self, request: Request, limit: int = 50) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM sesiones WHERE usuario_id=? ORDER BY iniciada_en DESC LIMIT ?",
            (uid, limit),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
