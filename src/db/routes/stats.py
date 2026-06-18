from litestar import Controller, get
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


class StatsController(Controller):
    path = "/db/stats"
    guards = [auth_guard]

    @get("")
    async def get_stats(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()

        async def scalar(q, *p):
            async with db.execute(q, p) as c:
                r = await c.fetchone()
                return r[0] if r else 0

        async def rows(q, *p):
            async with db.execute(q, p) as c:
                return [dict(r) for r in await c.fetchall()]

        return {
            "chats_total":         await scalar("SELECT COUNT(*) FROM chats WHERE usuario_id=?", uid),
            "mensajes_total":      await scalar("SELECT COUNT(*) FROM mensajes m JOIN chats c ON c.id=m.chat_id WHERE c.usuario_id=?", uid),
            "tokens_total":        await scalar("SELECT COALESCE(SUM(m.tokens_est),0) FROM mensajes m JOIN chats c ON c.id=m.chat_id WHERE c.usuario_id=?", uid),
            "prompts_total":       await scalar("SELECT COUNT(*) FROM prompts WHERE usuario_id=?", uid),
            "prompts_top5":        await rows("SELECT nombre, usos FROM prompts WHERE usuario_id=? ORDER BY usos DESC LIMIT 5", uid),
            "modelos_usados":      await rows("SELECT modelo_id, COUNT(*) n FROM chats WHERE usuario_id=? AND modelo_id IS NOT NULL GROUP BY modelo_id ORDER BY n DESC", uid),
            "herramientas_top":    await rows("SELECT herramienta, COUNT(*) n FROM sesiones WHERE usuario_id=? GROUP BY herramienta ORDER BY n DESC", uid),
            "sesion_duracion_avg": await scalar("SELECT COALESCE(AVG(duracion_ms),0) FROM sesiones WHERE usuario_id=?", uid),
            "nav_acciones_total":  await scalar("SELECT COUNT(*) FROM nav_log WHERE usuario_id=?", uid),
            "cloud_convs_total":   await scalar("SELECT COUNT(*) FROM cloud_conversaciones WHERE usuario_id=?", uid),
            "ash_proyectos_total": await scalar("SELECT COUNT(*) FROM ash_proyectos WHERE usuario_id=?", uid),
            "yt_extracciones_total": await scalar("SELECT COUNT(*) FROM yt_extracciones WHERE usuario_id=?", uid),
        }
