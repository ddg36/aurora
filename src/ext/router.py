"""
Extensión control bus.

/ext/ws      — WebSocket bidireccional. Background.js conecta aquí.
/ext/capture — POST: recibe captura (compatibilidad; BD real via /db/ext-capturas).
/ext/status  — GET: estado de conexión de la extensión.

Protocolo WS (JSON):
  server → ext: { "id": str, "type": "EXT_CMD", "cmd": str, "params": {} }
  ext → server: { "id": str, "type": "EXT_RESULT", "ok": bool, "data": any }
  ext → server: { "type": "EXT_HELLO", "extensionId": str, "extensions": [] }
  server → ext: { "type": "EXT_ACK" }
"""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from litestar import get, post, websocket
from litestar.connection import WebSocket
from litestar.response import Response, Stream

from db.connection import get_db

log = logging.getLogger("aurora.ext")

# ─── Estado global ────────────────────────────────────────
_sessions: dict[str, "ExtSession"] = {}
_pending:  dict[str, asyncio.Future] = {}

# Tab activa actual (última notificada por la extensión)
_active_tab: dict = {}
# Cola para SSE —只有一个消费者
_tab_queue: asyncio.Queue = asyncio.Queue(maxsize=64)


@dataclass
class ExtSession:
    socket: WebSocket
    session_id: str
    extension_id: str | None = None
    extensions: list[str] = field(default_factory=list)
    usuario_id: int | None = None

    async def send(self, msg: dict) -> None:
        await self.socket.send_data(json.dumps(msg))

    async def cmd(self, cmd: str, params: dict | None = None, timeout: float = 10.0) -> Any:
        req_id = str(uuid.uuid4())[:8]
        loop = asyncio.get_event_loop()
        fut: asyncio.Future = loop.create_future()
        _pending[req_id] = fut
        try:
            await self.send({"id": req_id, "type": "EXT_CMD", "cmd": cmd, "params": params or {}})
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            raise TimeoutError(f"ext cmd {cmd!r} timeout")
        finally:
            _pending.pop(req_id, None)


# ─── API pública para uso desde otros módulos ─────────────

def get_active_session() -> ExtSession | None:
    return next(iter(_sessions.values()), None)


async def ext_cmd(cmd: str, params: dict | None = None, timeout: float = 10.0) -> Any:
    sess = get_active_session()
    if not sess:
        raise RuntimeError("No hay extensión conectada")
    return await sess.cmd(cmd, params, timeout)


def get_active_tab() -> dict:
    return dict(_active_tab)


# ─── WebSocket ────────────────────────────────────────────

@websocket("/ext/ws")
async def ext_ws(socket: WebSocket) -> None:
    session_id = str(uuid.uuid4())[:8]
    sess = ExtSession(socket=socket, session_id=session_id)
    await socket.accept()
    _sessions[session_id] = sess
    log.info("ext connect session=%s", session_id)

    try:
        while True:
            raw = await socket.receive_data(mode="text")
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            mtype = msg.get("type")

            if mtype == "EXT_PING":
                await sess.send({
                    "type": "EXT_PONG",
                    "ts": msg.get("ts"),
                    "generation": msg.get("generation"),
                })
                continue

            if mtype == "EXT_HELLO":
                sess.extension_id = msg.get("extensionId")
                sess.extensions   = msg.get("extensions", [])
                token = msg.get("token")
                usuario_id = None
                if token:
                    try:
                        db = await get_db()
                        async with db.execute(
                            "SELECT id FROM usuarios WHERE token = ?", (token,)
                        ) as cur:
                            row = await cur.fetchone()
                        if row:
                            usuario_id = row["id"]
                            sess.usuario_id = usuario_id
                    except Exception as e:
                        log.warning("ext hello token lookup error: %s", e)
                ack = {"type": "EXT_ACK", "ok": True}
                if usuario_id:
                    ack["usuario_id"] = usuario_id
                    ack["token"] = token
                    ack["serverUrl"] = "http://localhost:7779"
                await sess.send(ack)
                log.info("ext hello extId=%s uid=%s ext=%s", sess.extension_id, usuario_id, sess.extensions)
                continue

            if mtype == "EXT_RESULT":
                req_id = msg.get("id")
                fut = _pending.get(req_id)
                if fut and not fut.done():
                    if msg.get("ok"):
                        fut.set_result(msg.get("data"))
                    else:
                        fut.set_exception(RuntimeError(msg.get("error", "ext error")))
                # ACK incluso si el future ya no existe: el resultado puede venir
                # de un outbox recuperado después de reiniciar el worker MV3.
                await sess.send({"type": "EXT_RESULT_ACK", "id": req_id})
                continue

            if mtype == "EXT_PUSH_CAPTURE":
                await sess.send({"type": "EXT_CAPTURE_ACK", "id": msg.get("id")})
                log.info("ext push capture tipo=%s (guardado via /db/ext-capturas)", msg.get("data", {}).get("tipo"))
                continue

            if mtype == "EXT_TAB_CHANGE":
                _update_active_tab(msg.get("data", {}))
                continue

            log.warning("ext unknown msg type=%s", mtype)

    except Exception as e:
        log.info("ext disconnect session=%s reason=%s", session_id, e)
    finally:
        _sessions.pop(session_id, None)


# ─── REST endpoints ───────────────────────────────────────

def _update_active_tab(data: dict) -> None:
    global _active_tab
    _active_tab = data
    log.info("ext tab change tipo=%s url=%.60s", data.get("tipo"), data.get("url", ""))
    try:
        _tab_queue.put_nowait(data)
    except asyncio.QueueFull:
        pass


@post("/ext/capture")
async def ext_capture(data: dict) -> dict:
    """Endpoint de compatibilidad. BD real: POST /db/ext-capturas."""
    chars = len(data.get("content", ""))
    log.info("ext capture tipo=%s chars=%d (usar /db/ext-capturas para persistencia)", data.get("tipo"), chars)
    return {"ok": True, "id": str(uuid.uuid4())[:8], "chars": chars}


@post("/ext/tab-change")
async def ext_tab_change(data: dict) -> dict:
    """Recibe notificación de cambio de tab desde la extensión (fallback REST)."""
    _update_active_tab(data)
    return {"ok": True}


@post("/ext/cmd")
async def ext_cmd_route(data: dict) -> dict:
    try:
        out = await ext_cmd(str(data.get("cmd") or ""), data.get("params") or {}, float(data.get("timeout") or 12))
        return {"ok": True, "data": out}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@get("/ext/tab")
async def ext_tab() -> dict:
    """Devuelve info de la tab activa actual."""
    return {"ok": True, "tab": _active_tab}


@get("/ext/tab-stream", media_type="text/event-stream")
async def ext_tab_stream() -> Stream:
    """
    SSE — pushea tab activa al cliente cuando cambia.
    Evento inicial inmediato con estado actual, luego solo on-demand.
    """
    async def generator():
        # Evento inicial con estado actual
        yield f"data: {json.dumps(_active_tab)}\n\n".encode()
        # Luego solo cuando cambia
        while True:
            try:
                data = await asyncio.wait_for(_tab_queue.get(), timeout=25.0)
                yield f"data: {json.dumps(data)}\n\n".encode()
            except asyncio.TimeoutError:
                # Keepalive para que el browser no cierre la conexión
                yield b": keepalive\n\n"

    return Stream(
        generator(),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@get("/ext/status")
async def ext_status() -> dict:
    sess = get_active_session()
    if not sess:
        return {"connected": False}
    return {
        "connected":    True,
        "extensionId":  sess.extension_id,
        "extensions":   sess.extensions,
        "sessionId":    sess.session_id,
        "activeTab":    _active_tab,
    }


EXT_ROUTES = [ext_ws, ext_capture, ext_tab_change, ext_cmd_route, ext_tab, ext_tab_stream, ext_status]
