import time
from dataclasses import dataclass
from litestar import Controller, delete, get, patch, post
from litestar.exceptions import NotFoundException
from litestar.connection import Request
from litestar.params import Parameter

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class PromptBody:
    nombre: str
    contenido: str
    id: str | None = None
    tipo: str = "manual"
    subtipo: str | None = None
    categoria: str | None = None
    tags: str | None = None
    destino_ai: str | None = None
    meta: str | None = None


@dataclass
class HistorialBody:
    contenido: str
    nombre: str | None = None
    destino_ai: str | None = None


@dataclass
class GuardadoBody:
    contenido: str
    tipo: str = "general"
    nombre: str | None = None
    meta: str | None = None


class PromptsController(Controller):
    path = "/db/prompts"
    guards = [auth_guard]

    @get("")
    async def list_prompts(
        self,
        request: Request,
        tipo: str | None = None,
        subtipo: str | None = None,
        categoria: str | None = None,
        favorito: int | None = None,
        limit: int = Parameter(default=200, le=500),
    ) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        q = "SELECT * FROM prompts WHERE usuario_id=?"
        params: list = [uid]
        if tipo:
            q += " AND tipo=?"; params.append(tipo)
        if subtipo:
            q += " AND subtipo=?"; params.append(subtipo)
        if categoria:
            q += " AND categoria=?"; params.append(categoria)
        if favorito is not None:
            q += " AND favorito=?"; params.append(favorito)
        q += " ORDER BY usado_en DESC NULLS LAST, creado_en DESC LIMIT ?"
        params.append(limit)
        async with db.execute(q, params) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("")
    async def upsert_prompt(self, data: PromptBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        pid = data.id or f"p_{int(time.time() * 1000)}"
        now = int(time.time())
        await db.execute(
            """INSERT INTO prompts (id, usuario_id, nombre, contenido, tipo, subtipo, categoria, tags, destino_ai, meta, creado_en, actualizado)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 nombre=excluded.nombre, contenido=excluded.contenido,
                 tipo=excluded.tipo, subtipo=excluded.subtipo,
                 categoria=excluded.categoria, tags=excluded.tags,
                 destino_ai=excluded.destino_ai, meta=excluded.meta,
                 actualizado=excluded.actualizado""",
            (pid, uid, data.nombre, data.contenido, data.tipo, data.subtipo,
             data.categoria, data.tags, data.destino_ai, data.meta, now, now),
        )
        await db.commit()
        return {"id": pid}

    @patch("/{pid:str}/uso")
    async def incrementar_uso(self, pid: str, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "UPDATE prompts SET usos=usos+1, usado_en=? WHERE id=? AND usuario_id=?",
            (int(time.time()), pid, uid),
        )
        await db.commit()
        return {"ok": True}

    @patch("/{pid:str}/favorito")
    async def toggle_favorito(self, pid: str, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "UPDATE prompts SET favorito=1-favorito WHERE id=? AND usuario_id=?",
            (pid, uid),
        )
        await db.commit()
        return {"ok": True}

    @delete("/{pid:str}", status_code=200)
    async def delete_prompt(self, pid: str, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute("DELETE FROM prompts WHERE id=? AND usuario_id=?", (pid, uid))
        await db.commit()
        return {"ok": True}

    @post("/historial")
    async def add_historial(self, data: HistorialBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "INSERT INTO prompts_historial (usuario_id, contenido, nombre, destino_ai) VALUES (?,?,?,?)",
            (uid, data.contenido, data.nombre, data.destino_ai),
        )
        await db.commit()
        return {"ok": True}

    @get("/historial")
    async def get_historial(self, request: Request, limit: int = 50) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM prompts_historial WHERE usuario_id=? ORDER BY enviado_en DESC LIMIT ?",
            (uid, limit),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @delete("/historial", status_code=200)
    async def clear_historial(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute("DELETE FROM prompts_historial WHERE usuario_id=?", (uid,))
        await db.commit()
        return {"ok": True}

    @post("/guardados")
    async def add_guardado(self, data: GuardadoBody, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT count(*) as n FROM prompts_guardados WHERE usuario_id=?", (uid,)
        ) as cur:
            n = (await cur.fetchone())["n"]
        if n >= 200:
            async with db.execute(
                "SELECT id FROM prompts_guardados WHERE usuario_id=? ORDER BY creado_en ASC LIMIT ?",
                (uid, n - 199),
            ) as cur:
                old = [r["id"] for r in await cur.fetchall()]
            for oid in old:
                await db.execute("DELETE FROM prompts_guardados WHERE id=?", (oid,))
        cur = await db.execute(
            "INSERT INTO prompts_guardados (usuario_id, tipo, nombre, contenido, meta) VALUES (?,?,?,?,?)",
            (uid, data.tipo, data.nombre, data.contenido, data.meta),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @get("/guardados")
    async def list_guardados(self, request: Request, limit: int = 100) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM prompts_guardados WHERE usuario_id=? ORDER BY creado_en DESC LIMIT ?",
            (uid, limit),
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]

    @delete("/guardados/{gid:int}", status_code=200)
    async def delete_guardado(self, gid: int, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id FROM prompts_guardados WHERE id=? AND usuario_id=?", (gid, uid)
        ) as cur:
            if not await cur.fetchone():
                raise NotFoundException("Guardado no encontrado")
        await db.execute("DELETE FROM prompts_guardados WHERE id=?", (gid,))
        await db.commit()
        return {"ok": True}
