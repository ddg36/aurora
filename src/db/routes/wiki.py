import os
import time
from typing import Optional
from dataclasses import dataclass
from litestar import Controller, get, post
from litestar.connection import Request

import pathlib
from ..connection import get_db
from ..auth import auth_guard

WIKI_DIR = str(pathlib.Path(__file__).resolve().parents[4] / "nexus" / "workspaces" / "aihub" / "wiki")


@dataclass
class IndiceBody:
    path: str
    subfolder: Optional[str] = None
    titulo: Optional[str] = None


class WikiController(Controller):
    path = "/db/wiki"
    guards = [auth_guard]

    @get("/search")
    async def search_wiki(self, request: Request, q: str = "") -> list:
        uid = request.state.usuario_id
        db = await get_db()
        like = f"%{q}%"
        async with db.execute(
            """SELECT path, titulo, resumen, tags FROM wiki_indice
               WHERE usuario_id=? AND (titulo LIKE ? OR resumen LIKE ? OR tags LIKE ?)
               ORDER BY actualizado DESC LIMIT 30""",
            (uid, like, like, like),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @get("/grep")
    async def grep_wiki(self, request: Request, q: str = "", limit: int = 20) -> list:
        q = q.strip()
        if not q or not os.path.isdir(WIKI_DIR):
            return []
        ql = q.lower()
        out = []
        for root, _, files in os.walk(WIKI_DIR):
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, encoding="utf-8", errors="ignore") as f:
                        lineas = f.readlines()
                except OSError:
                    continue
                hits = []
                for i, ln in enumerate(lineas):
                    if ql in ln.lower():
                        hits.append({"linea": i + 1, "texto": ln.strip()[:200]})
                    if len(hits) >= 3:
                        break
                if hits:
                    out.append({
                        "path": os.path.relpath(fpath, WIKI_DIR),
                        "hits": hits,
                    })
                if len(out) >= limit:
                    return out
        return out

    @post("/indice")
    async def upsert_indice(self, request: Request, data: IndiceBody) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute(
            "INSERT OR IGNORE INTO wiki_indice (usuario_id, path, subfolder, titulo) VALUES (?,?,?,?)",
            (uid, data.path, data.subfolder, data.titulo),
        )
        now = int(time.time())
        await db.execute(
            "UPDATE wiki_indice SET resumen=NULL, actualizado=? WHERE usuario_id=? AND path=?",
            (now, uid, data.path),
        )
        await db.commit()
        return {"ok": True}

    @get("/indice")
    async def list_indice(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM wiki_indice WHERE usuario_id=? ORDER BY actualizado DESC",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]

    @get("/pending")
    async def pending_indice(self, request: Request) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT path FROM wiki_indice WHERE usuario_id=? AND resumen IS NULL",
            (uid,),
        ) as cur:
            rows = await cur.fetchall()
        return [dict(r) for r in rows]
