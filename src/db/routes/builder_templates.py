import json
import time
from dataclasses import dataclass
from litestar import Controller, delete, get, put
from litestar.connection import Request

from ..connection import get_db, json_loose
from ..auth import auth_guard


@dataclass
class BuilderTemplateBody:
    tipo: str
    datos: dict


class BuilderTemplatesController(Controller):
    path = "/db/builder-templates"
    guards = [auth_guard]

    @get("")
    async def list_templates(
        self,
        request: Request,
        tipo: str | None = None,
    ) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        q = "SELECT * FROM builder_templates WHERE usuario_id=?"
        params: list = [uid]
        if tipo:
            q += " AND tipo=?"; params.append(tipo)
        q += " ORDER BY tipo"
        async with db.execute(q, params) as cur:
            rows = await cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["datos"] = json_loose(d["datos"], {})
            result.append(d)
        return result

    @get("/{tid:str}")
    async def get_template(self, tid: str, request: Request) -> dict | None:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM builder_templates WHERE id=? AND usuario_id=?", (tid, uid)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["datos"] = json_loose(d["datos"], {})
        return d

    @put("/{tid:str}")
    async def upsert_template(self, tid: str, data: BuilderTemplateBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        await db.execute(
            """INSERT INTO builder_templates (id, usuario_id, tipo, datos, creado_en, actualizado)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 datos=excluded.datos, actualizado=excluded.actualizado""",
            (tid, uid, data.tipo, json.dumps(data.datos, ensure_ascii=False), now, now),
        )
        await db.commit()
        return {"ok": True, "id": tid}

    @delete("/{tid:str}", status_code=200)
    async def delete_template(self, tid: str, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute("DELETE FROM builder_templates WHERE id=? AND usuario_id=?", (tid, uid))
        await db.commit()
        return {"ok": True}
