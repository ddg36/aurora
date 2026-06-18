import uuid
import platform
from dataclasses import dataclass
from litestar import Controller, get, post
from litestar.connection import Request

from ..connection import get_db
from ..auth import auth_guard


@dataclass
class InitBody:
    nombre: str = "default"
    token: str | None = None
    workspace_root: str | None = None


@dataclass
class LoginBody:
    nombre: str


@dataclass
class CrearBody:
    nombre: str
    workspace_root: str | None = None


class UsuariosController(Controller):
    path = "/db/usuarios"

    @get("/list")
    async def list_usuarios(self) -> list:
        db = await get_db()
        async with db.execute(
            "SELECT id, nombre, os, creado_en FROM usuarios ORDER BY id"
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @post("/login")
    async def login(self, data: LoginBody) -> dict:
        db = await get_db()
        async with db.execute(
            "SELECT id, token FROM usuarios WHERE nombre = ? ORDER BY id LIMIT 1",
            (data.nombre,),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return {"ok": False, "error": "usuario no encontrado"}
        return {"ok": True, "usuario_id": row["id"], "token": row["token"]}

    @post("/crear")
    async def crear(self, data: CrearBody) -> dict:
        db = await get_db()
        async with db.execute(
            "SELECT id FROM usuarios WHERE nombre = ?", (data.nombre,)
        ) as cur:
            if await cur.fetchone():
                return {"ok": False, "error": "nombre ya existe"}
        token = str(uuid.uuid4())
        os_name = "windows" if platform.system() == "Windows" else "linux"
        await db.execute(
            "INSERT INTO usuarios (nombre, token, os, workspace_root) VALUES (?,?,?,?)",
            (data.nombre, token, os_name, data.workspace_root),
        )
        await db.commit()
        async with db.execute("SELECT id FROM usuarios WHERE token = ?", (token,)) as cur:
            row = await cur.fetchone()
        return {"ok": True, "usuario_id": row["id"], "token": token}

    @post("/init")
    async def init_usuario(self, data: InitBody) -> dict:
        db = await get_db()
        os_name = "windows" if platform.system() == "Windows" else "linux"
        if data.token:
            async with db.execute(
                "SELECT id, token FROM usuarios WHERE token = ?", (data.token,)
            ) as cur:
                existing = await cur.fetchone()
            if existing:
                return {"usuario_id": existing["id"], "token": existing["token"], "nuevo": False}
        async with db.execute(
            "SELECT id, token FROM usuarios WHERE nombre = ? ORDER BY id LIMIT 1", (data.nombre,)
        ) as cur:
            by_name = await cur.fetchone()
        if by_name:
            return {"usuario_id": by_name["id"], "token": by_name["token"], "nuevo": False}
        token = data.token or str(uuid.uuid4())
        await db.execute(
            "INSERT INTO usuarios (nombre, token, os, workspace_root) VALUES (?,?,?,?)",
            (data.nombre, token, os_name, data.workspace_root),
        )
        await db.commit()
        async with db.execute("SELECT id FROM usuarios WHERE token = ?", (token,)) as cur:
            row = await cur.fetchone()
        return {"usuario_id": row["id"], "token": token, "nuevo": True}

    @get("/me", guards=[auth_guard])
    async def me(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT id, nombre, os, workspace_root, creado_en FROM usuarios WHERE id = ?", (uid,)
        ) as cur:
            row = await cur.fetchone()
        return dict(row)
