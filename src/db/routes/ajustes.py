from dataclasses import dataclass
from litestar import Controller, get, put, delete
from litestar.connection import Request

from eventos_ws import emitir

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class AjusteBody:
    valor: str | None = None


class AjustesController(Controller):
    path = "/db/ajustes"
    guards = [auth_guard]

    @get("")
    async def get_all(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT clave, valor FROM ajustes WHERE usuario_id=?", (uid,)
        ) as cur:
            rows = await cur.fetchall()
        return {r["clave"]: r["valor"] for r in rows}

    @get("/{clave:str}")
    async def get_one(self, clave: str, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT valor FROM ajustes WHERE usuario_id=? AND clave=?", (uid, clave)
        ) as cur:
            row = await cur.fetchone()
        return {"clave": clave, "valor": row["valor"] if row else None}

    @put("/{clave:str}")
    async def set_one(self, clave: str, data: AjusteBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "INSERT INTO ajustes (usuario_id, clave, valor) VALUES (?,?,?) ON CONFLICT(usuario_id, clave) DO UPDATE SET valor=excluded.valor",
            (uid, clave, data.valor),
        )
        await db.commit()
        await emitir(uid, "ajuste", {"clave": clave, "valor": data.valor})
        return {"ok": True}

    @delete("/{clave:str}", status_code=200)
    async def delete_one(self, clave: str, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM ajustes WHERE usuario_id=? AND clave=?", (uid, clave)
        )
        await db.commit()
        await emitir(uid, "ajuste", {"clave": clave, "valor": None})
        return {"ok": True}
