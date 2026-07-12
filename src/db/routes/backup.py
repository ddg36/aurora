import time

from litestar import Controller, get, post
from litestar.connection import Request
from litestar.response import Response

from ..connection import get_db, tablas_con_usuario
from ..auth import auth_guard

# Tablas sin usuario_id directo — se exportan/borran vía JOIN con su padre.
TABLAS_HIJAS = {
    "mensajes": ("SELECT m.* FROM mensajes m JOIN chats c ON c.id=m.chat_id WHERE c.usuario_id=?",
                 "DELETE FROM mensajes WHERE chat_id IN (SELECT id FROM chats WHERE usuario_id=?)"),
    "cloud_mensajes": ("SELECT cm.* FROM cloud_mensajes cm JOIN cloud_conversaciones cc ON cc.id=cm.conv_id WHERE cc.usuario_id=?",
                       "DELETE FROM cloud_mensajes WHERE conv_id IN (SELECT id FROM cloud_conversaciones WHERE usuario_id=?)"),
}


async def _columnas(db, tabla: str) -> list[str]:
    async with db.execute(f"PRAGMA table_info({tabla})") as cur:
        return [r["name"] for r in await cur.fetchall()]


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
            "version": 2,
            "exportado_en": int(time.time()),
            "usuario_id": uid,
            "tablas": {},
        }

        # Lista derivada del schema real — nunca se desincroniza al agregar tablas.
        for t in await tablas_con_usuario(db):
            datos["tablas"][t] = await rows(f"SELECT * FROM {t} WHERE usuario_id=?", uid)
        for t, (select_sql, _) in TABLAS_HIJAS.items():
            datos["tablas"][t] = await rows(select_sql, uid)

        fname = f"aurora-backup-u{uid}-{datos['exportado_en']}.json"
        return Response(
            content=datos,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )

    @post("/restore")
    async def restaurar(self, request: Request, data: dict) -> dict:
        """Importa un backup exportado por GET /db/backup. Solo restaura sobre
        el usuario del token (usuario_id se fuerza server-side). INSERT OR
        REPLACE: idempotente, no duplica si se restaura dos veces."""
        uid = request.state.usuario_id
        db = await get_db()
        tablas_payload = data.get("tablas") or {}
        if not isinstance(tablas_payload, dict):
            return {"ok": False, "error": "Formato inválido: falta 'tablas'"}

        permitidas = set(await tablas_con_usuario(db))
        restaurados: dict[str, int] = {}
        errores: dict[str, str] = {}

        try:
            # FKs se chequean al commit — el orden de inserción deja de importar.
            await db.execute("PRAGMA defer_foreign_keys=ON")
            orden = [t for t in tablas_payload if t in permitidas] + \
                    [t for t in tablas_payload if t in TABLAS_HIJAS]
            for t in orden:
                filas = tablas_payload.get(t) or []
                if not isinstance(filas, list):
                    continue
                cols_reales = set(await _columnas(db, t))
                n = 0
                for fila in filas:
                    if not isinstance(fila, dict):
                        continue
                    fila = {k: v for k, v in fila.items() if k in cols_reales}
                    if t in permitidas:
                        fila["usuario_id"] = uid
                    if not fila:
                        continue
                    claves = list(fila.keys())
                    sql = f"INSERT OR REPLACE INTO {t} ({','.join(claves)}) VALUES ({','.join('?' * len(claves))})"
                    try:
                        await db.execute(sql, [fila[k] for k in claves])
                        n += 1
                    except Exception as e:
                        errores[t] = str(e)
                if n:
                    restaurados[t] = n
            await db.commit()
        except Exception as e:
            await db.rollback()
            return {"ok": False, "error": str(e), "restaurados": restaurados}

        return {"ok": True, "restaurados": restaurados, "errores": errores}

    @get("/resumen")
    async def resumen(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()

        async def scalar(q, *p):
            async with db.execute(q, p) as cur:
                r = await cur.fetchone()
                return r[0] if r else 0

        conteos = {}
        for t in await tablas_con_usuario(db):
            conteos[t] = await scalar(f"SELECT COUNT(*) FROM {t} WHERE usuario_id=?", uid)
        conteos["mensajes"] = await scalar(
            "SELECT COUNT(*) FROM mensajes m JOIN chats c ON c.id=m.chat_id WHERE c.usuario_id=?", uid
        )
        conteos["cloud_mensajes"] = await scalar(
            "SELECT COUNT(*) FROM cloud_mensajes cm JOIN cloud_conversaciones cc ON cc.id=cm.conv_id WHERE cc.usuario_id=?", uid
        )
        return {"usuario_id": uid, "conteos": {k: v for k, v in conteos.items() if v}}
