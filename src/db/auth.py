from litestar.connection import ASGIConnection
from litestar.exceptions import NotAuthorizedException
from litestar.handlers.base import BaseRouteHandler

from .connection import get_db


async def auth_guard(connection: ASGIConnection, _: BaseRouteHandler) -> None:
    auth = connection.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise NotAuthorizedException("Token requerido")
    token = auth.removeprefix("Bearer ").strip()
    db = await get_db()
    async with db.execute("SELECT id FROM usuarios WHERE token = ?", (token,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise NotAuthorizedException("Token inválido")
    connection.state.usuario_id = row["id"]
