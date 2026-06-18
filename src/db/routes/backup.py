import time

from litestar import Controller, get
from litestar.connection import Request
from litestar.response import Response

from ..connection import get_db
from ..auth import auth_guard

TABLAS_USUARIO = [
    "ajustes", "ash_descargas", "ash_prompts_capturados", "ash_proyectos",
    "bc_sesiones", "chats", "cloud_conversaciones", "eventos",
    "llm_adapters", "llm_iframe_history", "nav_capturas", "nav_log",
    "nav_sesiones", "nexus_approvals", "prompts", "prompts_historial",
    "scratchpad_imagenes", "sesiones", "token_analisis", "urls_custom",
    "wiki_indice", "yt_extracciones",
]


class BackupController(Controller):
    path = "/db/backup"
    guards = [auth_guard]

    @get("")
    async def exportar(self, request: Request) -> Response:
        uid = request.state.usuario_id
        db = await get_db()

        async def rows(q, *p):
            async with db.execute(q, p) as cur:
                return [dict(r) for r in await cur.fetchall()]

        datos: dict = {
            "version": 1,
            "exportado_en": int(time.time()),
            "usuario_id": uid,
            "tablas": {},
        }

        for t in TABLAS_USUARIO:
            try:
                datos["tablas"][t] = await rows(
                    f"SELECT * FROM {t} WHERE usuario_id=?", uid
                )
            except Exception:
                datos["tablas"][t] = []

        datos["tablas"]["mensajes"] = await rows(
            """SELECT m.* FROM mensajes m
               JOIN chats c ON c.id=m.chat_id WHERE c.usuario_id=?""",
            uid,
        )
        datos["tablas"]["cloud_mensajes"] = await rows(
            """SELECT cm.* FROM cloud_mensajes cm
               JOIN cloud_conversaciones cc ON cc.id=cm.conv_id
               WHERE cc.usuario_id=?""",
            uid,
        )

        fname = f"aurora-backup-u{uid}-{datos['exportado_en']}.json"
        return Response(
            content=datos,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )

    @get("/resumen")
    async def resumen(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()

        async def scalar(q, *p):
            async with db.execute(q, p) as cur:
                r = await cur.fetchone()
                return r[0] if r else 0

        conteos = {}
        for t in TABLAS_USUARIO:
            try:
                conteos[t] = await scalar(f"SELECT COUNT(*) FROM {t} WHERE usuario_id=?", uid)
            except Exception:
                conteos[t] = 0
        conteos["mensajes"] = await scalar(
            "SELECT COUNT(*) FROM mensajes m JOIN chats c ON c.id=m.chat_id WHERE c.usuario_id=?", uid
        )
        return {"usuario_id": uid, "conteos": {k: v for k, v in conteos.items() if v}}
