from litestar import Controller, get, post
from litestar.connection import Request

from ..auth import auth_guard
from ..connection import get_db
from jobs.cleanup_capturas import run_cleanup, cleanup_usuario, _config_usuario, DEFAULTS


class JobsController(Controller):
    path = "/db/jobs"
    guards = [auth_guard]

    @post("/cleanup-capturas")
    async def cleanup_capturas(self, request: Request) -> dict:
        """Dispara limpieza de ext_capturas para el usuario autenticado."""
        uid = request.state.usuario_id
        db = await get_db()
        stats = await cleanup_usuario(db, uid)
        total = stats["paso1"] + stats["paso2"] + stats["paso3"]
        return {"ok": True, "borradas": total, "detalle": stats}

    @post("/cleanup-capturas/all")
    async def cleanup_capturas_all(self, request: Request) -> dict:
        """Limpieza global — todos los usuarios. Solo útil para admin/mantenimiento."""
        resultados = await run_cleanup()
        total = sum(r["paso1"] + r["paso2"] + r["paso3"] for r in resultados)
        return {"ok": True, "usuarios": len(resultados), "borradas_total": total, "detalle": resultados}

    @get("/cleanup-capturas/config")
    async def get_config(self, request: Request) -> dict:
        """Devuelve config efectiva del usuario (defaults + overrides)."""
        uid = request.state.usuario_id
        db = await get_db()
        cfg = await _config_usuario(db, uid)
        return {"ok": True, "config": cfg, "defaults": DEFAULTS}
