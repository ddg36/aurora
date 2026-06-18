from dataclasses import dataclass
from typing import Optional

from litestar import Controller, get, post
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class TokenAnalisisBody:
    texto_hash: str
    chars: int
    tokens_est: int


class TokensController(Controller):
    path = "/db/token-analisis"
    guards = [auth_guard]

    @get("")
    async def get_or_list(self, request: Request, texto_hash: Optional[str] = None, limit: int = 20) -> object:
        uid = request.state.usuario_id
        db = await get_db()
        if texto_hash is not None:
            async with db.execute(
                "SELECT * FROM token_analisis WHERE usuario_id=? AND texto_hash=? LIMIT 1",
                (uid, texto_hash),
            ) as cur:
                row = await cur.fetchone()
            return dict(row) if row else None
        async with db.execute(
            "SELECT * FROM token_analisis WHERE usuario_id=? ORDER BY rowid DESC LIMIT ?",
            (uid, limit),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("")
    async def insert_token_analisis(self, request: Request, data: TokenAnalisisBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id FROM token_analisis WHERE usuario_id=? AND texto_hash=? LIMIT 1",
            (uid, data.texto_hash),
        ) as cur:
            existe = await cur.fetchone()
        if not existe:
            await db.execute(
                "INSERT INTO token_analisis (usuario_id, texto_hash, chars, tokens_est) VALUES (?,?,?,?)",
                (uid, data.texto_hash, data.chars, data.tokens_est),
            )
            await db.commit()
        return {"ok": True}
