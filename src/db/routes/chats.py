import time
from dataclasses import dataclass

from litestar import Controller, delete, get, patch, post, put
from litestar.connection import Request
from litestar.exceptions import NotFoundException

from ..auth import auth_guard
from ..connection import get_db


@dataclass
class ChatBody:
    nombre: str
    modelo_id: str | None = None
    temperatura: float = 0.8
    top_p: float = 0.9
    top_k: int = 40
    seed: int = -1
    num_ctx: int = 4096
    instruccion: str | None = None


@dataclass
class ChatUpdateBody:
    nombre: str | None = None
    modelo: str | None = None
    modelo_id: str | None = None
    temperatura: float | None = None
    top_p: float | None = None
    top_k: int | None = None
    seed: int | None = None
    num_ctx: int | None = None
    instruccion: str | None = None
    updatedAt: int | None = None
    mensajes: list | None = None


@dataclass
class MensajeBody:
    chat_id: int
    rol: str
    contenido: str
    tokens_est: int | None = None


def _chat_dict(row: dict) -> dict:
    actualizado = row.get("actualizado") or int(time.time())
    return {
        **row,
        "id": row.get("id"),
        "chat_id": row.get("id"),
        "updatedAt": actualizado * 1000,
        "modelo": row.get("modelo_id") or "",
    }


class ChatsController(Controller):
    path = "/db/chats"
    guards = [auth_guard]

    @get("")
    async def list_chats(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            """SELECT c.id, c.nombre, c.modelo_id, c.actualizado,
                      (SELECT contenido FROM mensajes WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) as ultimo_msg
               FROM chats c WHERE c.usuario_id=? ORDER BY c.actualizado DESC""",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        return [_chat_dict(dict(r)) for r in rows]

    @post("")
    async def create_chat(self, data: ChatBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        await db.execute(
            """INSERT INTO chats (id, usuario_id, nombre, modelo_id, temperatura, top_p, top_k, seed, num_ctx, instruccion, creado_en, actualizado)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                now,
                uid,
                data.nombre,
                data.modelo_id,
                data.temperatura,
                data.top_p,
                data.top_k,
                data.seed,
                data.num_ctx,
                data.instruccion,
                now,
                now,
            ),
        )
        await db.commit()
        return {
            "id": now,
            "chat_id": now,
            "nombre": data.nombre,
            "modelo_id": data.modelo_id,
            "modelo": data.modelo_id or "",
            "actualizado": now,
            "updatedAt": now * 1000,
        }

    @get("/{chat_id:int}/mensajes")
    async def get_mensajes(self, chat_id: int, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id FROM chats WHERE id=? AND usuario_id=?", (chat_id, uid)
        ) as cur:
            if not await cur.fetchone():
                raise NotFoundException("Chat no encontrado")
        async with db.execute(
            "SELECT id, rol, contenido, tokens_est, creado_en, fijado FROM mensajes WHERE chat_id=? ORDER BY id ASC",
            (chat_id,),
        ) as cur:
            rows = await cur.fetchall()

        out = []
        for r in rows:
            item = dict(r)
            item["role"] = item.get("rol")
            item["content"] = item.get("contenido")
            item["ts"] = (item.get("creado_en") or int(time.time())) * 1000
            out.append(item)
        return out

    @post("/mensajes")
    async def add_mensaje(self, data: MensajeBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id FROM chats WHERE id=? AND usuario_id=?", (data.chat_id, uid)
        ) as cur:
            if not await cur.fetchone():
                raise NotFoundException("Chat no encontrado")
        cur = await db.execute(
            "INSERT INTO mensajes (chat_id, rol, contenido, tokens_est) VALUES (?,?,?,?)",
            (data.chat_id, data.rol, data.contenido, data.tokens_est),
        )
        now = int(time.time())
        await db.execute(
            "UPDATE chats SET actualizado=? WHERE id=?",
            (now, data.chat_id),
        )
        await db.commit()
        return {
            "ok": True,
            "id": cur.lastrowid,
            "chat_id": data.chat_id,
            "rol": data.rol,
            "contenido": data.contenido,
            "role": data.rol,
            "content": data.contenido,
            "ts": now * 1000,
        }

    @patch("/mensajes/{mensaje_id:int}/pin")
    async def toggle_pin(self, mensaje_id: int, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            """SELECT m.fijado FROM mensajes m
               JOIN chats c ON c.id=m.chat_id
               WHERE m.id=? AND c.usuario_id=?""",
            (mensaje_id, uid),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            raise NotFoundException("Mensaje no encontrado")
        nuevo = 0 if row["fijado"] else 1
        await db.execute("UPDATE mensajes SET fijado=? WHERE id=?", (nuevo, mensaje_id))
        await db.commit()
        return {"ok": True, "id": mensaje_id, "fijado": nuevo}

    @delete("/mensajes/{mensaje_id:int}", status_code=200)
    async def delete_mensaje(self, mensaje_id: int, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            """SELECT m.chat_id FROM mensajes m
               JOIN chats c ON c.id=m.chat_id
               WHERE m.id=? AND c.usuario_id=?""",
            (mensaje_id, uid),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            raise NotFoundException("Mensaje no encontrado")
        await db.execute("DELETE FROM mensajes WHERE id=?", (mensaje_id,))
        await db.execute("UPDATE chats SET actualizado=? WHERE id=?", (int(time.time()), row["chat_id"]))
        await db.commit()
        return {"ok": True, "id": mensaje_id}

    @get("/{chat_id:int}/fijados")
    async def get_fijados(self, chat_id: int, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id FROM chats WHERE id=? AND usuario_id=?", (chat_id, uid)
        ) as cur:
            if not await cur.fetchone():
                raise NotFoundException("Chat no encontrado")
        async with db.execute(
            "SELECT id, rol, contenido, creado_en FROM mensajes WHERE chat_id=? AND fijado=1 ORDER BY id",
            (chat_id,),
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]

    async def _update_chat(self, chat_id: int, data: ChatUpdateBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id FROM chats WHERE id=? AND usuario_id=?", (chat_id, uid)
        ) as cur:
            if not await cur.fetchone():
                raise NotFoundException("Chat no encontrado")

        fields = []
        params = []

        if data.nombre is not None:
            fields.append("nombre=?")
            params.append(data.nombre)

        modelo_id = data.modelo_id if data.modelo_id is not None else data.modelo
        if modelo_id is not None:
            fields.append("modelo_id=?")
            params.append(modelo_id)

        for attr in ("temperatura", "top_p", "top_k", "seed", "num_ctx", "instruccion"):
            value = getattr(data, attr)
            if value is not None:
                fields.append(attr + "=?")
                params.append(value)

        fields.append("actualizado=?")
        params.append(int(time.time()))
        params.extend([chat_id, uid])

        await db.execute(
            "UPDATE chats SET " + ", ".join(fields) + " WHERE id=? AND usuario_id=?",
            params,
        )
        await db.commit()
        return {"ok": True, "id": chat_id, "chat_id": chat_id}

    @put("/{chat_id:int}")
    async def update_chat_put(self, chat_id: int, data: ChatUpdateBody, request: Request) -> dict:
        return await self._update_chat(chat_id, data, request)

    @patch("/{chat_id:int}")
    async def update_chat_patch(self, chat_id: int, data: ChatUpdateBody, request: Request) -> dict:
        return await self._update_chat(chat_id, data, request)

    @delete("/{chat_id:int}", status_code=200)
    async def delete_chat(self, chat_id: int, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM chats WHERE id=? AND usuario_id=?", (chat_id, uid)
        )
        await db.commit()
        return {"ok": True}
