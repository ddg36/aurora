import json
import time
from typing import Any, Optional

from litestar import Controller, delete, get, patch, post
from litestar.connection import Request

from ..auth import auth_guard
from ..connection import get_db, json_loose


# ponytail: these 5 helpers are called ~40 times in this file only — keep them local
_j = lambda d: json.dumps(d if d is not None else {}, ensure_ascii=False)
_pj = lambda t, fb: json_loose(t, fb)  # tolerante ante JSON malformado
_d = lambda r: dict(r) if r else {}


async def _fo(db, q, args=()):
    async with db.execute(q, args) as c:
        r = await c.fetchone()
    return _d(r) if r else None


async def _fa(db, q, args=()):
    async with db.execute(q, args) as c:
        return [_d(r) for r in await c.fetchall()]


class ProductividadController(Controller):
    path = "/db/productividad"
    guards = [auth_guard]

    @get("/overview")
    async def overview(self, request: Request) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        counts = {}
        for key, table in {
            "capturas": "productividad_capturas",
            "research": "productividad_research",
            "tasks": "productividad_tasks",
            "clipboard": "productividad_clipboard",
            "meetings": "productividad_meetings",
            "tab_sessions": "productividad_tab_sessions",
            "prices": "productividad_price_items",
        }.items():
            row = await _fo(db, f"SELECT COUNT(*) AS n FROM {table} WHERE usuario_id=?", (uid,))
            counts[key] = row["n"] if row else 0
        recent = await _fa(
            db,
            """SELECT id, tipo, titulo, url, capturado_en
               FROM productividad_capturas
               WHERE usuario_id=?
               ORDER BY id DESC LIMIT 8""",
            (uid,),
        )
        return {"ok": True, "counts": counts, "recent_capturas": recent}

    @post("/capturas")
    async def crear_captura(self, request: Request, data: dict) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO productividad_capturas
               (usuario_id, tipo, titulo, url, favicon, seleccion, contenido,
                html_limpio, metadata_json, screenshot, origen)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                uid,
                data.get("tipo") or "page",
                data.get("titulo") or data.get("title"),
                data.get("url"),
                data.get("favicon"),
                data.get("seleccion") or data.get("selection"),
                data.get("contenido") or data.get("content"),
                data.get("html_limpio") or data.get("html"),
                _j(data.get("metadata") or data.get("meta")),
                data.get("screenshot"),
                data.get("origen") or "aurora-productivity",
            ),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @get("/capturas")
    async def listar_capturas(self, request: Request, tipo: Optional[str] = None, limit: int = 100, offset: int = 0) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        if tipo:
            rows = await _fa(
                db,
                """SELECT id, tipo, titulo, url, favicon, seleccion, capturado_en, origen,
                          length(coalesce(contenido,'')) AS chars
                   FROM productividad_capturas
                   WHERE usuario_id=? AND tipo=?
                   ORDER BY id DESC LIMIT ? OFFSET ?""",
                (uid, tipo, limit, offset),
            )
        else:
            rows = await _fa(
                db,
                """SELECT id, tipo, titulo, url, favicon, seleccion, capturado_en, origen,
                          length(coalesce(contenido,'')) AS chars
                   FROM productividad_capturas
                   WHERE usuario_id=?
                   ORDER BY id DESC LIMIT ? OFFSET ?""",
                (uid, limit, offset),
            )
        return rows

    @get("/capturas/{id:int}")
    async def obtener_captura(self, request: Request, id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        row = await _fo(db, "SELECT * FROM productividad_capturas WHERE id=? AND usuario_id=?", (id, uid))
        if not row:
            return {"ok": False, "error": "not found"}
        row["metadata"] = _parse_j(row.pop("metadata_json", None), {})
        return {"ok": True, "captura": row}

    @delete("/capturas/{id:int}", status_code=200)
    async def eliminar_captura(self, request: Request, id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        await db.execute("DELETE FROM productividad_capturas WHERE id=? AND usuario_id=?", (id, uid))
        await db.commit()
        return {"ok": True}

    @post("/research")
    async def crear_research(self, request: Request, data: dict) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO productividad_research
               (usuario_id, captura_id, resumen_corto, resumen_largo, entidades_json,
                argumentos_json, decisiones_json, fuentes_json, preguntas_json, prompt)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                uid,
                data.get("captura_id"),
                data.get("resumen_corto"),
                data.get("resumen_largo"),
                _j(data.get("entidades") or []),
                _j(data.get("argumentos") or []),
                _j(data.get("decisiones") or []),
                _j(data.get("fuentes") or []),
                _j(data.get("preguntas") or []),
                data.get("prompt"),
            ),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @get("/research")
    async def listar_research(self, request: Request, limit: int = 100) -> list:
        rows = await _fa(
            await get_db(),
            """SELECT r.id, r.captura_id, r.resumen_corto, r.creado_en, c.titulo, c.url
               FROM productividad_research r
               LEFT JOIN productividad_capturas c ON c.id=r.captura_id
               WHERE r.usuario_id=?
               ORDER BY r.id DESC LIMIT ?""",
            (request.state.usuario_id, limit),
        )
        return rows

    @post("/tasks")
    async def crear_task(self, request: Request, data: dict) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO productividad_tasks
               (usuario_id, captura_id, titulo, descripcion, url, selector, estado, prioridad, meta_json)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                uid,
                data.get("captura_id"),
                data.get("titulo") or data.get("title") or "Tarea web",
                data.get("descripcion") or data.get("description"),
                data.get("url"),
                data.get("selector"),
                data.get("estado") or "open",
                data.get("prioridad") or "normal",
                _j(data.get("meta")),
            ),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @get("/tasks")
    async def listar_tasks(self, request: Request, estado: Optional[str] = None, limit: int = 100) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        if estado:
            return await _fa(db, "SELECT * FROM productividad_tasks WHERE usuario_id=? AND estado=? ORDER BY actualizado DESC LIMIT ?", (uid, estado, limit))
        return await _fa(db, "SELECT * FROM productividad_tasks WHERE usuario_id=? ORDER BY actualizado DESC LIMIT ?", (uid, limit))

    @patch("/tasks/{id:int}")
    async def actualizar_task(self, request: Request, id: int, data: dict) -> dict:
        uid = request.state.usuario_id
        allowed = ["titulo", "descripcion", "url", "selector", "estado", "prioridad"]
        fields, args = [], []
        for key in allowed:
            if key in data:
                fields.append(f"{key}=?")
                args.append(data[key])
        if "meta" in data:
            fields.append("meta_json=?")
            args.append(_j(data["meta"]))
        fields.append("actualizado=?")
        args.append(int(time.time()))
        args.extend([id, uid])
        db = await get_db()
        await db.execute(f"UPDATE productividad_tasks SET {', '.join(fields)} WHERE id=? AND usuario_id=?", tuple(args))
        await db.commit()
        return {"ok": True, "id": id}

    @delete("/tasks/{id:int}", status_code=200)
    async def eliminar_task(self, request: Request, id: int) -> dict:
        db = await get_db()
        await db.execute("DELETE FROM productividad_tasks WHERE id=? AND usuario_id=?", (id, request.state.usuario_id))
        await db.commit()
        return {"ok": True}

    @post("/clipboard")
    async def crear_clipboard(self, request: Request, data: dict) -> dict:
        uid = request.state.usuario_id
        contenido = data.get("contenido") or data.get("text") or ""
        tipo = data.get("tipo") or _infer_clipboard_tipo(contenido)
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO productividad_clipboard
               (usuario_id, contenido, tipo, tags_json, destino, url)
               VALUES (?,?,?,?,?,?)""",
            (uid, contenido, tipo, _j(data.get("tags") or []), data.get("destino"), data.get("url")),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid, "tipo": tipo}

    @get("/clipboard")
    async def listar_clipboard(self, request: Request, limit: int = 100) -> list:
        return await _fa(await get_db(), "SELECT * FROM productividad_clipboard WHERE usuario_id=? ORDER BY id DESC LIMIT ?", (request.state.usuario_id, limit))

    @delete("/clipboard/{id:int}", status_code=200)
    async def eliminar_clipboard(self, request: Request, id: int) -> dict:
        db = await get_db()
        await db.execute("DELETE FROM productividad_clipboard WHERE id=? AND usuario_id=?", (id, request.state.usuario_id))
        await db.commit()
        return {"ok": True}

    @post("/forms/profiles")
    async def crear_form_profile(self, request: Request, data: dict) -> dict:
        db = await get_db()
        cur = await db.execute(
            "INSERT INTO productividad_form_profiles (usuario_id, nombre, datos_json) VALUES (?,?,?)",
            (request.state.usuario_id, data.get("nombre") or "Perfil", _j(data.get("datos") or data.get("data") or {})),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @get("/forms/profiles")
    async def listar_form_profiles(self, request: Request) -> list:
        rows = await _fa(await get_db(), "SELECT * FROM productividad_form_profiles WHERE usuario_id=? ORDER BY id DESC", (request.state.usuario_id,))
        for row in rows:
            row["datos"] = _parse_j(row.pop("datos_json", None), {})
        return rows

    @post("/forms/templates")
    async def crear_form_template(self, request: Request, data: dict) -> dict:
        db = await get_db()
        cur = await db.execute(
            "INSERT INTO productividad_form_templates (usuario_id, dominio, nombre, campos_json) VALUES (?,?,?,?)",
            (request.state.usuario_id, data.get("dominio") or data.get("domain") or "", data.get("nombre"), _j(data.get("campos") or [])),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @get("/forms/templates")
    async def listar_form_templates(self, request: Request, dominio: Optional[str] = None) -> list:
        db = await get_db()
        if dominio:
            rows = await _fa(db, "SELECT * FROM productividad_form_templates WHERE usuario_id=? AND dominio=? ORDER BY id DESC", (request.state.usuario_id, dominio))
        else:
            rows = await _fa(db, "SELECT * FROM productividad_form_templates WHERE usuario_id=? ORDER BY id DESC", (request.state.usuario_id,))
        for row in rows:
            row["campos"] = _parse_j(row.pop("campos_json", None), [])
        return rows

    @post("/forms/fills")
    async def registrar_form_fill(self, request: Request, data: dict) -> dict:
        db = await get_db()
        cur = await db.execute(
            "INSERT INTO productividad_form_fills (usuario_id, template_id, url, resultado_json) VALUES (?,?,?,?)",
            (request.state.usuario_id, data.get("template_id"), data.get("url"), _j(data.get("resultado") or {})),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @post("/meetings")
    async def crear_meeting(self, request: Request, data: dict) -> dict:
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO productividad_meetings
               (usuario_id, titulo, url, plataforma, participantes_json, transcript, chat,
                resumen, decisiones_json, pendientes_json, timeline_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                request.state.usuario_id,
                data.get("titulo") or data.get("title"),
                data.get("url"),
                data.get("plataforma"),
                _j(data.get("participantes") or []),
                data.get("transcript"),
                data.get("chat"),
                data.get("resumen"),
                _j(data.get("decisiones") or []),
                _j(data.get("pendientes") or []),
                _j(data.get("timeline") or []),
            ),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @get("/meetings")
    async def listar_meetings(self, request: Request, limit: int = 100) -> list:
        return await _fa(await get_db(), "SELECT id, titulo, url, plataforma, resumen, creado_en FROM productividad_meetings WHERE usuario_id=? ORDER BY id DESC LIMIT ?", (request.state.usuario_id, limit))

    @post("/tabs/sessions")
    async def crear_tab_session(self, request: Request, data: dict) -> dict:
        uid = request.state.usuario_id
        tabs = data.get("tabs") or []
        db = await get_db()
        cur = await db.execute(
            "INSERT INTO productividad_tab_sessions (usuario_id, nombre, resumen, meta_json) VALUES (?,?,?,?)",
            (uid, data.get("nombre") or data.get("name") or "Sesion de tabs", data.get("resumen"), _j(data.get("meta"))),
        )
        session_id = cur.lastrowid
        await db.executemany(
            """INSERT INTO productividad_tab_items
               (usuario_id, session_id, title, url, favicon, active, window_id, group_id, preview, abierto_en)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            [
                (
                    uid, session_id, t.get("title"), t.get("url"), t.get("favicon") or t.get("favIconUrl"),
                    1 if t.get("active") else 0, t.get("windowId"), t.get("groupId"), t.get("preview"),
                    int((t.get("lastAccessed") or 0) / 1000) if t.get("lastAccessed") else None,
                )
                for t in tabs
            ],
        )
        await db.commit()
        return {"ok": True, "id": session_id, "tabs": len(tabs)}

    @get("/tabs/sessions")
    async def listar_tab_sessions(self, request: Request, limit: int = 50) -> list:
        return await _fa(await get_db(), "SELECT * FROM productividad_tab_sessions WHERE usuario_id=? ORDER BY id DESC LIMIT ?", (request.state.usuario_id, limit))

    @get("/tabs/sessions/{id:int}")
    async def obtener_tab_session(self, request: Request, id: int) -> dict:
        uid = request.state.usuario_id
        db = await get_db()
        session = await _fo(db, "SELECT * FROM productividad_tab_sessions WHERE id=? AND usuario_id=?", (id, uid))
        if not session:
            return {"ok": False, "error": "not found"}
        tabs = await _fa(db, "SELECT * FROM productividad_tab_items WHERE session_id=? AND usuario_id=? ORDER BY id", (id, uid))
        return {"ok": True, "session": session, "tabs": tabs}

    @post("/prices")
    async def crear_price_item(self, request: Request, data: dict) -> dict:
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO productividad_price_items
               (usuario_id, nombre, url, tienda, moneda, precio_objetivo, selector_precio, selector_stock, imagen)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                request.state.usuario_id,
                data.get("nombre") or data.get("title") or "Producto",
                data.get("url"),
                data.get("tienda") or data.get("store"),
                data.get("moneda"),
                data.get("precio_objetivo"),
                data.get("selector_precio"),
                data.get("selector_stock"),
                data.get("imagen"),
            ),
        )
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @get("/prices")
    async def listar_price_items(self, request: Request, active: Optional[int] = None) -> list:
        uid = request.state.usuario_id
        db = await get_db()
        q = """SELECT p.*,
                      (SELECT precio FROM productividad_price_checks c WHERE c.item_id=p.id ORDER BY c.id DESC LIMIT 1) AS ultimo_precio,
                      (SELECT stock FROM productividad_price_checks c WHERE c.item_id=p.id ORDER BY c.id DESC LIMIT 1) AS ultimo_stock
               FROM productividad_price_items p WHERE p.usuario_id=?"""
        args: list = [uid]
        if active is not None:
            q += " AND p.activo=?"
            args.append(active)
        q += " ORDER BY p.actualizado DESC"
        return await _fa(db, q, tuple(args))

    @post("/prices/{id:int}/checks")
    async def crear_price_check(self, request: Request, id: int, data: dict) -> dict:
        db = await get_db()
        cur = await db.execute(
            """INSERT INTO productividad_price_checks
               (usuario_id, item_id, precio, moneda, stock, raw_json)
               VALUES (?,?,?,?,?,?)""",
            (request.state.usuario_id, id, data.get("precio"), data.get("moneda"), data.get("stock"), _j(data.get("raw") or data)),
        )
        await db.execute("UPDATE productividad_price_items SET actualizado=unixepoch() WHERE id=? AND usuario_id=?", (id, request.state.usuario_id))
        await db.commit()
        return {"ok": True, "id": cur.lastrowid}

    @post("/prices/{id:int}/scan")
    async def scan_price_item(self, request: Request, id: int) -> dict:
        from ext.router import ext_cmd
        uid = request.state.usuario_id
        db = await get_db()
        item = await _fo(db, "SELECT * FROM productividad_price_items WHERE id=? AND usuario_id=?", (id, uid))
        if not item:
            return {"ok": False, "error": "not found"}
        try:
            data = await ext_cmd("price_extract", {"url": item["url"]}, timeout=15)
        except Exception as e:
            return {"ok": False, "error": str(e)}
        cur = await db.execute(
            """INSERT INTO productividad_price_checks
               (usuario_id, item_id, precio, moneda, stock, raw_json)
               VALUES (?,?,?,?,?,?)""",
            (uid, id, data.get("precio"), data.get("moneda"), data.get("stock"), _j(data)),
        )
        await db.execute("UPDATE productividad_price_items SET actualizado=unixepoch() WHERE id=? AND usuario_id=?", (id, uid))
        await db.commit()
        return {"ok": True, "id": cur.lastrowid, "data": data}

    @get("/prices/{id:int}/checks")
    async def listar_price_checks(self, request: Request, id: int, limit: int = 100) -> list:
        return await _fa(await get_db(), "SELECT * FROM productividad_price_checks WHERE usuario_id=? AND item_id=? ORDER BY id DESC LIMIT ?", (request.state.usuario_id, id, limit))


def _infer_clipboard_tipo(text: str) -> str:
    t = (text or "").strip()
    low = t.lower()
    if "traceback" in low or "error:" in low or "exception" in low:
        return "error"
    if "```" in t or "function " in low or "def " in low or "const " in low:
        return "codigo"
    if low.startswith(("http://", "https://")):
        return "fuente"
    if any(x in low for x in ("todo", "pendiente", "comprar", "investigar", "responder")):
        return "tarea"
    if len(t) > 240:
        return "fuente"
    return "nota"
