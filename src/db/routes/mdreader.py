import json
from dataclasses import dataclass
from typing import Any, Optional

from litestar import Controller, get, post, put

from ..connection import get_db
from ..auth import auth_guard


def _safe_json(s: str | None, default=None):
    try:
        return json.loads(s) if s else (default if default is not None else {})
    except (json.JSONDecodeError, TypeError):
        return default if default is not None else {}


@dataclass
class PrefsBody:
    root_path: Optional[str] = None
    active_path: Optional[str] = None
    mode: Optional[str] = None
    filters: Optional[dict] = None


@dataclass
class IndexFile:
    path: str
    title: Optional[str] = None
    size: Optional[int] = None
    mtime: Optional[int] = None
    checksum: Optional[str] = None


@dataclass
class IndexNode:
    file_path: str
    node_id: str
    type: str
    label: Optional[str] = None
    uri: Optional[str] = None
    line: Optional[int] = None
    detail: Optional[str] = None
    meta: Optional[dict] = None


@dataclass
class IndexEdge:
    source_path: str
    source_node_id: str
    target_node_id: str
    edge_type: str
    label: Optional[str] = None
    source_line: Optional[int] = None
    detail: Optional[str] = None
    meta: Optional[dict] = None


@dataclass
class IndexBody:
    root: str
    files: list[IndexFile]
    nodes: list[IndexNode]
    edges: list[IndexEdge]
    stats: Optional[dict] = None


class MDReaderController(Controller):
    path = "/db/mdreader"
    guards = [auth_guard]

    @get("/prefs")
    async def get_prefs(self, request: Any) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT root_path, active_path, mode, filters_json FROM md_reader_prefs WHERE usuario_id=?",
            (uid,),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return {"ok": True, "prefs": {}}
        filters = _safe_json(row["filters_json"])
        return {
            "ok": True,
            "prefs": {
                "root_path": row["root_path"],
                "active_path": row["active_path"],
                "mode": row["mode"],
                "filters": filters,
            },
        }

    @put("/prefs")
    async def save_prefs(self, request: Any, data: PrefsBody) -> dict:
        uid = request.state.usuario_id
        filters_json = json.dumps(data.filters or {}, ensure_ascii=False)
        db = await get_db()
        await db.execute(
            """INSERT INTO md_reader_prefs
                  (usuario_id, root_path, active_path, mode, filters_json)
               VALUES (?,?,?,?,?)
               ON CONFLICT(usuario_id) DO UPDATE SET
                  root_path=excluded.root_path,
                  active_path=excluded.active_path,
                  mode=excluded.mode,
                  filters_json=excluded.filters_json,
                  actualizado=unixepoch()""",
            (uid, data.root_path, data.active_path, data.mode, filters_json),
        )
        await db.commit()
        return {"ok": True}

    @post("/index")
    async def save_index(self, request: Any, data: IndexBody) -> dict:
        uid = request.state.usuario_id
        root = data.root or ""
        db = await get_db()
        await db.execute("BEGIN")
        try:
            await db.execute(
                """INSERT INTO md_reader_index_meta
                      (usuario_id, root, file_count, node_count, edge_count)
                   VALUES (?,?,?,?,?)
                   ON CONFLICT(usuario_id, root) DO UPDATE SET
                      file_count=excluded.file_count,
                      node_count=excluded.node_count,
                      edge_count=excluded.edge_count,
                      actualizado=unixepoch()""",
                (uid, root, len(data.files or []), len(data.nodes or []), len(data.edges or [])),
            )
            await db.execute("DELETE FROM md_reader_edges WHERE usuario_id=? AND root=?", (uid, root))
            await db.execute("DELETE FROM md_reader_nodes WHERE usuario_id=? AND root=?", (uid, root))
            await db.execute("DELETE FROM md_reader_files WHERE usuario_id=? AND root=?", (uid, root))

            await db.executemany(
                """INSERT OR REPLACE INTO md_reader_files
                      (usuario_id, root, path, title, size, mtime, checksum)
                   VALUES (?,?,?,?,?,?,?)""",
                [
                    (uid, root, f.path, f.title, f.size, f.mtime, f.checksum)
                    for f in (data.files or [])
                ],
            )
            await db.executemany(
                """INSERT OR REPLACE INTO md_reader_nodes
                      (usuario_id, root, file_path, node_id, type, label, uri, line, detail, meta_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                [
                    (
                        uid, root, n.file_path, n.node_id, n.type, n.label, n.uri,
                        n.line, n.detail, json.dumps(n.meta or {}, ensure_ascii=False),
                    )
                    for n in (data.nodes or [])
                ],
            )
            await db.executemany(
                """INSERT OR REPLACE INTO md_reader_edges
                      (usuario_id, root, source_path, source_node_id, target_node_id,
                       edge_type, label, source_line, detail, meta_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                [
                    (
                        uid, root, e.source_path, e.source_node_id, e.target_node_id,
                        e.edge_type, e.label, e.source_line, e.detail,
                        json.dumps(e.meta or {}, ensure_ascii=False),
                    )
                    for e in (data.edges or [])
                ],
            )
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        return {"ok": True, "files": len(data.files or []), "nodes": len(data.nodes or []), "edges": len(data.edges or [])}

    @get("/index")
    async def get_index(self, request: Any, root: str) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        async with db.execute(
            "SELECT * FROM md_reader_index_meta WHERE usuario_id=? AND root=?",
            (uid, root),
        ) as cur:
            meta = await cur.fetchone()
        if not meta:
            return {"ok": False, "error": "No hay índice MD Reader para esta raíz"}

        async with db.execute(
            "SELECT path, title, size, mtime, checksum FROM md_reader_files WHERE usuario_id=? AND root=? ORDER BY path",
            (uid, root),
        ) as cur:
            files = [dict(r) for r in await cur.fetchall()]

        async with db.execute(
            "SELECT file_path, node_id, type, label, uri, line, detail, meta_json FROM md_reader_nodes WHERE usuario_id=? AND root=? ORDER BY file_path, node_id",
            (uid, root),
        ) as cur:
            nodes = []
            for r in await cur.fetchall():
                item = dict(r)
                item["meta"] = _safe_json(item.pop("meta_json"))
                nodes.append(item)

        async with db.execute(
            """SELECT source_path, source_node_id, target_node_id, edge_type, label,
                      source_line, detail, meta_json
                 FROM md_reader_edges
                WHERE usuario_id=? AND root=?
                ORDER BY source_path, source_node_id, edge_type""",
            (uid, root),
        ) as cur:
            edges = []
            for r in await cur.fetchall():
                item = dict(r)
                item["meta"] = _safe_json(item.pop("meta_json"))
                edges.append(item)

        return {
            "ok": True,
            "meta": dict(meta),
            "files": files,
            "graph": {
                "nodes": nodes,
                "edges": edges,
                "stats": {
                    "files": len(files),
                    "nodes": len(nodes),
                    "edges": len(edges),
                },
            },
        }
