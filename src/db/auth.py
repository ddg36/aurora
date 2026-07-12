import secrets

from litestar.connection import ASGIConnection
from litestar.exceptions import NotAuthorizedException
from litestar.handlers.base import BaseRouteHandler

from .connection import get_db

# Token efímero por proceso: Aurora lo inyecta como AURORA_TOKEN al spawnear
# pi (pi/proceso.py), y aurora-tools.ts lo manda de vuelta en Authorization.
# Nunca se persiste ni sale del host; muere con el proceso.
TOKEN_INTERNO = secrets.token_urlsafe(24)

# Rutas públicas: bootstrap de usuario, health y estáticos de la UI.
# Todo lo demás (incluidos /nexus/*, /tools/*, /ext/*, /voz/*, WS /lyra)
# exige token — un fetch cross-site desde una web maliciosa no lo tiene.
RUTAS_PUBLICAS = {
    "/",
    "/ping",
    "/health",
    "/favicon.ico",
    "/db/usuarios/init",
    "/db/usuarios/login",
}
PREFIJOS_PUBLICOS = ("/ui",)


def _extraer_token(connection: ASGIConnection) -> str:
    auth = connection.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth.removeprefix("Bearer ").strip()
    # WebSocket y EventSource no pueden mandar headers → token por query param.
    return connection.query_params.get("token", "") if connection.query_params else ""


async def _validar(connection: ASGIConnection) -> None:
    if getattr(connection.state, "usuario_id", None) is not None:
        return
    token = _extraer_token(connection)
    if not token:
        raise NotAuthorizedException("Token requerido")
    if token == TOKEN_INTERNO:
        # Caller interno (pi spawneado por este mismo proceso).
        # ponytail: actúa como el primer usuario — el motor pi es compartido
        # y hoy Aurora es single-user real; si multi-usuario pesa, mapear
        # sesión pi → usuario acá.
        db = await get_db()
        async with db.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1") as cur:
            row = await cur.fetchone()
        if row:
            connection.state.usuario_id = row["id"]
            return
        raise NotAuthorizedException("Sin usuarios registrados")
    db = await get_db()
    async with db.execute("SELECT id FROM usuarios WHERE token = ?", (token,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise NotAuthorizedException("Token inválido")
    connection.state.usuario_id = row["id"]


async def auth_guard(connection: ASGIConnection, _: BaseRouteHandler) -> None:
    await _validar(connection)


async def auth_guard_global(connection: ASGIConnection, _: BaseRouteHandler) -> None:
    path = connection.scope.get("path", "")
    if path in RUTAS_PUBLICAS or path.startswith(PREFIJOS_PUBLICOS):
        return
    await _validar(connection)
