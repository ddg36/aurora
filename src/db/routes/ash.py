import time
from dataclasses import dataclass
from typing import Optional

from litestar import Controller, get, post, patch, delete
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class ProyectoActivarBody:
    nombre: str
    path: str


@dataclass
class ContextoBody:
    contexto: str


@dataclass
class DescargaBody:
    filename: str
    path: Optional[str] = None
    url_origen: Optional[str] = None
    tamanio: Optional[int] = None


@dataclass
class PromptCapturadoBody:
    plataforma: str
    plataforma_k: str
    prompt: str
    status: str = "pending"


@dataclass
class PromptCapturadoPatchBody:
    status: str = "completed"
    response: Optional[str] = None
    code_blocks: Optional[str] = None


@dataclass
class ApprovalPatchBody:
    status: str


class AshController(Controller):
    path = "/db/ash"
    guards = [auth_guard]

    # ── Proyectos ──────────────────────────────────────────────────────────────

    @get("/proyectos")
    async def list_proyectos(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM ash_proyectos WHERE usuario_id=? ORDER BY ultima_actividad DESC",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("/proyectos/activar")
    async def activar_proyecto(self, request: Request, data: ProyectoActivarBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time())
        await db.execute(
            "UPDATE ash_proyectos SET activo=0 WHERE usuario_id=?",
            (uid,),
        )
        await db.execute(
            "INSERT OR IGNORE INTO ash_proyectos (usuario_id, nombre, path, activo, ultima_actividad) VALUES (?,?,?,0,?)",
            (uid, data.nombre, data.path, now),
        )
        await db.execute(
            "UPDATE ash_proyectos SET activo=1, ultima_actividad=? WHERE usuario_id=? AND nombre=? AND path=?",
            (now, uid, data.nombre, data.path),
        )
        await db.commit()
        return {"ok": True}

    @patch("/proyectos/desactivar-todos")
    async def desactivar_todos(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "UPDATE ash_proyectos SET activo=0 WHERE usuario_id=?",
            (uid,),
        )
        await db.commit()
        return {"ok": True}

    @patch("/proyectos/{id:int}/contexto")
    async def update_contexto(self, request: Request, id: int, data: ContextoBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "UPDATE ash_proyectos SET contexto=? WHERE id=? AND usuario_id=?",
            (data.contexto, id, uid),
        )
        await db.commit()
        return {"ok": True}

    # ── Descargas ──────────────────────────────────────────────────────────────

    @get("/descargas")
    async def list_descargas(self, request: Request, limit: int = 50) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM ash_descargas WHERE usuario_id=? ORDER BY descargado_en DESC LIMIT ?",
            (uid, limit),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("/descargas")
    async def create_descarga(self, request: Request, data: DescargaBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "INSERT INTO ash_descargas (usuario_id, filename, path, url_origen, tamanio) VALUES (?,?,?,?,?)",
            (uid, data.filename, data.path, data.url_origen, data.tamanio),
        )
        await db.commit()
        return {"ok": True}

    @delete("/descargas", status_code=200)
    async def delete_all_descargas(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM ash_descargas WHERE usuario_id=?",
            (uid,),
        )
        await db.commit()
        return {"ok": True}

    @delete("/descargas/{id:int}", status_code=200)
    async def delete_descarga(self, request: Request, id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "DELETE FROM ash_descargas WHERE id=? AND usuario_id=?",
            (id, uid),
        )
        await db.commit()
        return {"ok": True}

    # ── Prompts capturados ─────────────────────────────────────────────────────

    @get("/prompts-capturados")
    async def list_prompts_capturados(
        self,
        request: Request,
        limit: int = 50,
        plataforma_k: Optional[str] = None,
    ) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        if plataforma_k:
            async with db.execute(
                "SELECT * FROM ash_prompts_capturados WHERE usuario_id=? AND plataforma_k=? ORDER BY id DESC LIMIT ?",
                (uid, plataforma_k, limit),
            ) as cur:
                rows = await cur.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM ash_prompts_capturados WHERE usuario_id=? ORDER BY id DESC LIMIT ?",
                (uid, limit),
            ) as cur:
                rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("/prompts-capturados")
    async def create_prompt_capturado(self, request: Request, data: PromptCapturadoBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now_ms = int(time.time() * 1000)
        record_id = f"apc_{now_ms}"
        await db.execute(
            "INSERT INTO ash_prompts_capturados (id, usuario_id, plataforma, plataforma_k, prompt, status) VALUES (?,?,?,?,?,?)",
            (record_id, uid, data.plataforma, data.plataforma_k, data.prompt, data.status),
        )
        await db.commit()
        return {"id": record_id}

    @patch("/prompts-capturados/{id:str}")
    async def update_prompt_capturado(self, request: Request, id: str, data: PromptCapturadoPatchBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "UPDATE ash_prompts_capturados SET response=?, code_blocks=?, status=? WHERE id=? AND usuario_id=?",
            (data.response, data.code_blocks, data.status, id, uid),
        )
        await db.commit()
        return {"ok": True}

    # ── Nexus approvals ────────────────────────────────────────────────────────

    @get("/nexus/approvals")
    async def list_approvals(self, request: Request, status: Optional[str] = None) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        if status:
            async with db.execute(
                "SELECT * FROM nexus_approvals WHERE usuario_id=? AND status=? ORDER BY id DESC",
                (uid, status),
            ) as cur:
                rows = await cur.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM nexus_approvals WHERE usuario_id=? ORDER BY id DESC",
                (uid,),
            ) as cur:
                rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @patch("/nexus/approvals/{id:str}")
    async def update_approval(self, request: Request, id: str, data: ApprovalPatchBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        now = int(time.time()) if data.status != "pending" else None
        await db.execute(
            "UPDATE nexus_approvals SET status=?, resuelto_en=? WHERE id=? AND usuario_id=?",
            (data.status, now, id, uid),
        )
        await db.commit()
        return {"ok": True}
