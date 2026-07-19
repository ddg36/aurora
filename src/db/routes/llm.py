import time
from typing import Optional
from dataclasses import dataclass
from litestar import Controller, get, post, put, delete
from litestar.connection import Request

from eventos_ws import emitir

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class HistoryBody:
    slot: str
    ai_id: str
    url: str


@dataclass
class AdapterBody:
    adapter_json: str


@dataclass
class ConversacionBody:
    llm: str
    url: str
    titulo: Optional[str] = None


@dataclass
class MensajeCloudBody:
    conv_id: int
    rol: str
    contenido: str


class LlmController(Controller):
    path = "/db/llm"
    guards = [auth_guard]

    @get("/history")
    async def list_history(self, request: Request, slot: Optional[str] = None, ai_id: Optional[str] = None) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        query = "SELECT slot, ai_id, url, guardado_en FROM llm_iframe_history WHERE usuario_id=?"
        params: list = [uid]
        if slot is not None:
            query += " AND slot=?"
            params.append(slot)
        if ai_id is not None:
            query += " AND ai_id=?"
            params.append(ai_id)
        query += " ORDER BY guardado_en DESC"
        async with db.execute(query, params) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @put("/history")
    async def upsert_history(self, request: Request, data: HistoryBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        await db.execute(
            """INSERT OR REPLACE INTO llm_iframe_history (usuario_id, slot, ai_id, url, guardado_en)
               VALUES (?,?,?,?,?)""",
            (uid, data.slot, data.ai_id, data.url, now),
        )
        await db.commit()
        await emitir(uid, "llm_history", {"slot": data.slot, "ai_id": data.ai_id, "url": data.url})
        return {"ok": True}

    @get("/adapters/{dominio:str}")
    async def get_adapter(self, request: Request, dominio: str) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT adapter_json, fuente FROM llm_adapters WHERE dominio=?", (dominio,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return {"dominio": dominio, "adapter_json": None}
        return {"dominio": dominio, "adapter_json": row["adapter_json"], "fuente": row["fuente"]}

    @put("/adapters/{dominio:str}")
    async def upsert_adapter(self, request: Request, dominio: str, data: AdapterBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            """INSERT OR REPLACE INTO llm_adapters (dominio, adapter_json, fuente)
               VALUES (?,?,?)""",
            (dominio, data.adapter_json, "user"),
        )
        await db.commit()
        return {"ok": True}

    @post("/cloud/conversaciones")
    async def create_conversacion(self, request: Request, data: ConversacionBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        async with db.execute(
            "SELECT id FROM cloud_conversaciones WHERE usuario_id=? AND url=?",
            (uid, data.url),
        ) as cur:
            existente = await cur.fetchone()
        if existente:
            if data.titulo:
                await db.execute(
                    "UPDATE cloud_conversaciones SET titulo=?, capturado_en=? WHERE id=?",
                    (data.titulo, now, existente["id"]),
                )
                await db.commit()
            return {"id": existente["id"]}
        cur = await db.execute(
            """INSERT INTO cloud_conversaciones (usuario_id, llm, url, titulo, capturado_en)
               VALUES (?,?,?,?,?)""",
            (uid, data.llm, data.url, data.titulo, now),
        )
        await db.commit()
        return {"id": cur.lastrowid}

    @post("/cloud/mensajes")
    async def add_mensaje_cloud(self, request: Request, data: MensajeCloudBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        await db.execute(
            """INSERT INTO cloud_mensajes (conv_id, rol, contenido, capturado_en)
               VALUES (?,?,?,?)""",
            (data.conv_id, data.rol, data.contenido, now),
        )
        await db.commit()
        return {"ok": True}

    @get("/cloud/conversaciones/by-url")
    async def get_conversacion_by_url(self, request: Request, url: str) -> Optional[dict]:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id, titulo, capturado_en FROM cloud_conversaciones WHERE usuario_id=? AND url=?",
            (uid, url),
        ) as cur:
            conv = await cur.fetchone()
        if not conv:
            return None
        async with db.execute(
            """SELECT id, rol, contenido, capturado_en
               FROM cloud_mensajes WHERE conv_id=?
               ORDER BY id""",
            (conv["id"],),
        ) as cur:
            mensajes = await cur.fetchall()
        return {"id": conv["id"], "titulo": conv["titulo"], "mensajes": [dict(m) for m in mensajes]}

    @get("/cloud/conversaciones")
    async def list_conversaciones(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            """SELECT id, llm, url, titulo, capturado_en
               FROM cloud_conversaciones WHERE usuario_id=?
               ORDER BY capturado_en DESC LIMIT 50""",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @get("/cloud/conversaciones/{conv_id:int}/mensajes")
    async def list_mensajes(self, request: Request, conv_id: int) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id FROM cloud_conversaciones WHERE id=? AND usuario_id=?",
            (conv_id, uid),
        ) as cur:
            if not await cur.fetchone():
                return []
        async with db.execute(
            """SELECT id, rol, contenido, capturado_en
               FROM cloud_mensajes WHERE conv_id=?
               ORDER BY id""",
            (conv_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @delete("/cloud/conversaciones/{conv_id:int}", status_code=200)
    async def delete_conversacion(self, request: Request, conv_id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM cloud_conversaciones WHERE id=? AND usuario_id=?",
            (conv_id, uid),
        )
        await db.commit()
        return {"ok": True}
