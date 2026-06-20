"""
Endpoints de navegación browser-use.

POST /nav/run       — crea sesión y lanza agente en background
GET  /nav/stream/{id} — SSE con log en tiempo real
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, AsyncGenerator

from litestar import get, post
from litestar.connection import Request
from litestar.response import Stream

from db.connection import get_db
from db.auth import auth_guard

log = logging.getLogger("aurora.browser.router")

_queues: dict[int, list[asyncio.Queue]] = {}


async def _push(sesion_id: int, event: dict) -> None:
    for q in list(_queues.setdefault(sesion_id, [])):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


@dataclass
class RunBody:
    objetivo: str
    max_steps: int = 30


_run_agent_fn = None


async def _run_agent_task(uid: int, sesion_id: int, objetivo: str, max_steps: int) -> None:
    global _run_agent_fn
    if _run_agent_fn is None:
        def _do_import():
            import os, sys, pathlib
            os.environ.setdefault("BROWSER_USE_SETUP_LOGGING", "false")
            bu_path = str(pathlib.Path(__file__).resolve().parents[4] / "browser-use")
            if bu_path not in sys.path:
                sys.path.insert(0, bu_path)
            from browser.agent import run_agent as _fn
            return _fn
        _run_agent_fn = await asyncio.get_event_loop().run_in_executor(None, _do_import)

    db = await get_db()

    async def on_log(tipo: str, mensaje: str, url: str | None) -> None:
        try:
            await db.execute(
                "INSERT INTO nav_log (usuario_id, nav_sesion_id, tipo, mensaje, url) VALUES (?,?,?,?,?)",
                (uid, sesion_id, tipo, mensaje, url),
            )
            await db.commit()
            await _push(sesion_id, {"tipo": tipo, "mensaje": mensaje, "url": url})
        except Exception as e:
            log.warning("on_log write error: %s", e)

    try:
        resultado = await _run_agent_fn(objetivo, sesion_id, on_log, max_steps)
        await db.execute(
            "UPDATE nav_sesiones SET resultado=?, fin=unixepoch() WHERE id=?",
            (resultado, sesion_id),
        )
        await db.commit()
        await _push(sesion_id, {"tipo": "done", "resultado": resultado})
    except Exception as e:
        err = f"agent error: {e}"
        log.error("agent task error sesion=%d: %s", sesion_id, e)
        await db.execute(
            "UPDATE nav_sesiones SET resultado=?, fin=unixepoch() WHERE id=?",
            (err, sesion_id),
        )
        await db.commit()
        await _push(sesion_id, {"tipo": "error", "mensaje": err})


@post("/nav/run", guards=[auth_guard])
async def nav_run(request: Request, data: RunBody) -> dict:
    uid = request.state.usuario_id
    db = await get_db()

    cur = await db.execute(
        "INSERT INTO nav_sesiones (usuario_id, objetivo) VALUES (?,?)",
        (uid, data.objetivo),
    )
    await db.commit()
    sesion_id = cur.lastrowid

    task = asyncio.create_task(_run_agent_task(uid, sesion_id, data.objetivo, data.max_steps))
    def _on_task_done(t, sid=sesion_id):
        if t.cancelled():
            log.warning("nav task %d cancelled", sid)
        elif t.exception():
            log.error("nav task %d crashed: %s", sid, t.exception())
    task.add_done_callback(_on_task_done)

    return {"id": sesion_id, "objetivo": data.objetivo}


@get("/nav/stream/{sesion_id:int}", guards=[auth_guard])
async def nav_stream(request: Request, sesion_id: int) -> Stream:
    uid = request.state.usuario_id

    async def event_gen() -> AsyncGenerator[bytes, None]:
        db = await get_db()
        async with db.execute(
            "SELECT tipo, mensaje, url FROM nav_log WHERE nav_sesion_id=? AND usuario_id=? ORDER BY id ASC",
            (sesion_id, uid),
        ) as cur:
            rows = await cur.fetchall()
        for row in rows:
            data = json.dumps({"tipo": row["tipo"], "mensaje": row["mensaje"], "url": row["url"]})
            yield f"data: {data}\n\n".encode()

        async with db.execute(
            "SELECT resultado, fin FROM nav_sesiones WHERE id=? AND usuario_id=?",
            (sesion_id, uid),
        ) as cur:
            sesion = await cur.fetchone()

        if sesion and sesion["fin"]:
            data = json.dumps({"tipo": "done", "resultado": sesion["resultado"]})
            yield f"data: {data}\n\n".encode()
            return

        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        _queues.setdefault(sesion_id, []).append(q)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps(event)}\n\n".encode()
                    if event.get("tipo") in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    yield b": keepalive\n\n"
        finally:
            try:
                _queues[sesion_id].remove(q)
            except (ValueError, KeyError):
                pass

    return Stream(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


NAV_BROWSER_ROUTES = [nav_run, nav_stream]
