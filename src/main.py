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

from db.connection import DB_PATH, init_db
from db.router import ALL_CONTROLLERS
from gemita.router import GEMITA_ROUTES
from gemita.providers import discover_providers
from mcp.router import MCP_ROUTES
from nexus.router import NEXUS_ROUTES
from parser.router import PARSER_ROUTES
from tools.router import TOOLS_ROUTES
from voz.router import VOZ_ROUTES
from ext.router import EXT_ROUTES
from browser.router import NAV_BROWSER_ROUTES
from jobs.cleanup_capturas import run_cleanup
from logging_config import setup_logging

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


@get("/health")
async def health() -> dict:
    providers = await discover_providers(timeout_s=1.5)
    online = [p for p in providers if p["online"]]
    modelos = sum(len(p["models"]) for p in online)

    db_bytes = 0
    db_ok = DB_PATH.exists()
    if db_ok:
        try:
            db_bytes = DB_PATH.stat().st_size
        except OSError:
            db_ok = False

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
        "db": {"ok": db_ok, "bytes": db_bytes, "path": str(DB_PATH)},
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
    log.info("Aurora Server ready")


ROUTES = [root, ping, health, favicon] + GEMITA_ROUTES + VOZ_ROUTES + NEXUS_ROUTES + PARSER_ROUTES + TOOLS_ROUTES + MCP_ROUTES + EXT_ROUTES + ALL_CONTROLLERS + NAV_BROWSER_ROUTES

if UI_DIR.exists():
    ROUTES.append(
        create_static_files_router(
            path="/ui",
            directories=[str(UI_DIR)],
            html_mode=True,
            cache_control=CacheControlHeader(no_cache=True),
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


app = Litestar(
    route_handlers=ROUTES,
    cors_config=CORSConfig(allow_origins=[chr(42)], allow_methods=[chr(42)], allow_headers=[chr(42)]),
    on_startup=[on_startup],
    openapi_config=None,
    middleware=[PrivateNetworkMiddleware],
)
