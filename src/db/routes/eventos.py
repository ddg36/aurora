import json
from dataclasses import dataclass
from typing import Any, Optional

from litestar import Controller, get, post, delete
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class EventoBody:
    tipo: str
    mensaje: str
    origen: Optional[str] = None
    meta: Optional[Any] = None


class EventosController(Controller):
    path = "/db/eventos"
    guards = [auth_guard]

    @get("")
    async def list_eventos(
        self,
        request: Request,
        tipo: Optional[str] = None,
        origen: Optional[str] = None,
        limit: int = 50,
    ) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        filters = ["usuario_id=?"]
        params: list = [uid]
        if tipo:
            filters.append("tipo=?")
            params.append(tipo)
        if origen:
            filters.append("origen=?")
            params.append(origen)
        where = " AND ".join(filters)
        params.append(limit)
        async with db.execute(
            f"SELECT * FROM eventos WHERE {where} ORDER BY creado_en DESC LIMIT ?",
            params,
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("")
    async def insert_evento(self, request: Request, data: EventoBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        meta_str = json.dumps(data.meta) if data.meta is not None else None
        async with db.execute(
            "INSERT INTO eventos (usuario_id, tipo, mensaje, origen, meta) VALUES (?,?,?,?,?)",
            (uid, data.tipo, data.mensaje, data.origen, meta_str),
        ) as cur:
            row_id = cur.lastrowid
        await db.commit()
        return {"id": row_id}

    @delete("", status_code=200)
    async def clear_eventos(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute("DELETE FROM eventos WHERE usuario_id=?", (uid,))
        await db.commit()
        return {"ok": True}
