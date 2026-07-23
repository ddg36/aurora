import logging
import pathlib
import time

from litestar import Litestar, get, MediaType
from litestar.config.cors import CORSConfig
from litestar.datastructures import CacheControlHeader
from litestar.response import Redirect, Response
from litestar.static_files import create_static_files_router
from litestar.types import ASGIApp, Receive, Scope, Send
from litestar.middleware import MiddlewareProtocol

from db.auth import auth_guard_global
from db.connection import DB_PATH, get_db, init_db, schema_version
from db.router import ALL_CONTROLLERS
from eventos_ws import EVENTOS_WS_ROUTES
from llm.providers import discover_providers
from pi.router import PI_ROUTES
from pi.bridge import get_proceso
from mcp.router import MCP_ROUTES
from nexus.config import SOLO_LECTURA
from nexus.router import NEXUS_ROUTES
from tools.router import TOOLS_ROUTES
from voz.router import VOZ_ROUTES
from ext.router import EXT_ROUTES, get_active_session
from browser.router import NAV_BROWSER_ROUTES, browser_use_disponible
from jobs.cleanup_capturas import run_cleanup
from jobs.db_maintenance import run_mantenimiento
from json_family import JSON_FAMILY_ROUTES
from logging_config import setup_logging
from runtime_discovery import find_node, find_pi

log = setup_logging()

ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent
UI_DIR = ROOT_DIR / "ui"
_STARTED_AT = time.time()


@get("/")
async def root() -> Redirect:
    return Redirect(path="/ui/")


@get("/ping")
async def ping() -> dict:
    return {"ok": True, "version": "0.1.0"}


@get("/setup/status")
async def setup_status() -> dict:
    """Chequeo de requisitos — público, sin auth. Lo usa el overlay de bienvenida."""
    import subprocess
    node = find_node()
    node_version: str | None = None
    if node:
        try:
            node_version = subprocess.check_output(
                [node, "--version"], timeout=3, text=True, stderr=subprocess.DEVNULL,
            ).strip()
        except Exception:
            pass

    sdk_ok = bool(find_pi())

    return {
        "ok": bool(node) and sdk_ok,
        "node": {"ok": bool(node), "version": node_version},
        "pi_sdk": {"ok": sdk_ok},
    }


@get("/health")
async def health() -> dict:
    providers = await discover_providers(timeout_s=1.5)
    online = [p for p in providers if p["online"]]
    modelos = sum(len(p["models"]) for p in online)

    db_bytes = 0
    db_version = 0
    db_ok = DB_PATH.exists()
    if db_ok:
        try:
            db_bytes = DB_PATH.stat().st_size
            db_version = await schema_version(await get_db())
        except OSError:
            db_ok = False
        except Exception:
            pass

    proceso = get_proceso()
    ext_sess = get_active_session()

    return {
        "ok": True,
        "version": "0.1.0",
        "uptime_s": round(time.time() - _STARTED_AT),
        "llama": {
            "ok": bool(online),
            "url": online[0]["base_url"] if online else "auto",
            "modelos": modelos,
        },
        "llm": {"providers": providers, "modelos": modelos},
        "pi": {"ok": bool(proceso and proceso.vivo)},
        "extension": {"conectada": ext_sess is not None,
                      "id": ext_sess.extension_id if ext_sess else None},
        "webnavigator": {"disponible": browser_use_disponible()},
        "nexus": {"solo_lectura": SOLO_LECTURA},
        "db": {"ok": db_ok, "bytes": db_bytes, "path": str(DB_PATH), "schema": db_version},
    }


@get("/favicon.ico")
async def favicon() -> Response:
    icon_path = UI_DIR / "components" / "images" / "fire-sprite.png"
    return Response(
        content=icon_path.read_bytes(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


async def on_startup() -> None:
    await init_db()
    try:
        resultados = await run_cleanup()
        total = sum(r["paso1"] + r["paso2"] + r["paso3"] for r in resultados)
        if total:
            log.info("startup cleanup: %d capturas borradas en %d usuarios", total, len(resultados))
    except Exception as e:
        log.warning("startup cleanup error: %s", e)
    try:
        await run_mantenimiento()
    except Exception as e:
        log.warning("mantenimiento DB error: %s", e)
    log.info("Aurora Server ready — LLM engine: pi")


ROUTES = [root, ping, health, setup_status, favicon] + JSON_FAMILY_ROUTES + EVENTOS_WS_ROUTES + PI_ROUTES + VOZ_ROUTES + NEXUS_ROUTES + TOOLS_ROUTES + MCP_ROUTES + EXT_ROUTES + ALL_CONTROLLERS + NAV_BROWSER_ROUTES

if UI_DIR.exists():
    ROUTES.append(
        create_static_files_router(
            path="/ui",
            directories=[str(UI_DIR)],
            html_mode=True,
            cache_control=CacheControlHeader(public=True, max_age=60),
        )
    )

class PrivateNetworkMiddleware(MiddlewareProtocol):
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            async def send_wrapper(message):
                if message["type"] == "http.response.start":
                    headers = dict(message.get("headers", []))
                    headers[b"access-control-allow-private-network"] = b"true"
                    message["headers"] = list(headers.items())
                await send(message)
            await self.app(scope, receive, send_wrapper)
        else:
            await self.app(scope, receive, send)


# CORS acotado: la UI es same-origin (no lo necesita); la extensión Chrome
# entra por el regex. Una web cualquiera ya no puede hacer drive-by a
# /nexus/* — y aunque el preflight pasara, el guard global exige token.
app = Litestar(
    route_handlers=ROUTES,
    cors_config=CORSConfig(
        allow_origins=["http://localhost:7779", "http://127.0.0.1:7779"],
        allow_origin_regex=r"^chrome-extension://[a-p]{32}$",
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    ),
    guards=[auth_guard_global],
    on_startup=[on_startup],
    openapi_config=None,
    middleware=[PrivateNetworkMiddleware],
)
