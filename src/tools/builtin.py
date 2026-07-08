import pathlib
import re
import time

from db.connection import get_db
from ext.router import ext_cmd
from llm.providers import discover_providers
from nexus.config import SKIP_DIRS, clip
from nexus.shell import ejecutar_shell
from nexus.workspace import rel, safe

from .contract import ToolContract, schema
from .registry import register


async def workspace_list(args: dict, caller: dict) -> dict:
    target = safe(args.get("path", "."))
    if not target.is_dir():
        return {"ok": False, "error": f"No es directorio: {args.get('path', '.')}"}
    entries = []
    for item in sorted(target.iterdir(), key=lambda x: x.name.lower()):
        if item.name in SKIP_DIRS:
            continue
        entries.append({
            "name": item.name,
            "path": rel(item),
            "type": "dir" if item.is_dir() else "file",
            "size": item.stat().st_size if item.is_file() else 0,
        })
    return {"ok": True, "data": {"path": rel(target), "entries": entries}, "text": "\n".join(i["path"] for i in entries)}


async def workspace_read(args: dict, caller: dict) -> dict:
    target = safe(args.get("path", ""))
    if not target.is_file():
        return {"ok": False, "error": f"No es archivo: {args.get('path', '')}"}
    content, truncated = clip(target.read_text(encoding="utf-8", errors="replace"))
    return {"ok": True, "data": {"path": rel(target), "content": content, "truncated": truncated}, "text": content}


async def workspace_search(args: dict, caller: dict) -> dict:
    pattern = str(args.get("pattern") or args.get("q") or "")
    if not pattern:
        return {"ok": False, "error": "Falta pattern"}
    root = safe(args.get("path", "."))
    max_results = int(args.get("max_results") or 40)
    results = []
    for fp in root.rglob("*"):
        if len(results) >= max_results:
            break
        try:
            parts = fp.relative_to(root).parts
            if any(part in SKIP_DIRS for part in parts):
                continue
            if not fp.is_file() or fp.stat().st_size > 500_000:
                continue
            for n, line in enumerate(fp.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if re.search(pattern, line):
                    results.append({"path": rel(fp), "line": n, "text": line[:240]})
                    if len(results) >= max_results:
                        break
        except Exception:
            continue
    text = "\n".join(f"{r['path']}:{r['line']}: {r['text']}" for r in results) or "(sin resultados)"
    return {"ok": True, "data": {"results": results, "count": len(results)}, "text": text}


async def nexus_shell_run(args: dict, caller: dict) -> dict:
    result = ejecutar_shell(
        str(args.get("cmd") or ""),
        str(args.get("cwd") or "."),
        int(args["timeout"]) if args.get("timeout") else None,
        approved=bool(args.get("approved")),
    )
    text = "\n".join(filter(None, [result.get("stdout"), result.get("stderr")]))
    return {"ok": result.get("ok", False), "data": result, "text": text, "error": result.get("error")}


async def services_health(args: dict, caller: dict) -> dict:
    providers = await discover_providers(timeout_s=float(args.get("timeout_s") or 1.0))
    online = [p for p in providers if p["online"]]
    data = {
        "aurora": {"status": "online"},
        "llm": {"status": "online" if online else "offline", "providers": providers},
        "timestamp": int(time.time()),
    }
    return {"ok": True, "data": data, "text": f"LLM providers online: {len(online)}"}


def _uid(args: dict, caller: dict) -> int:
    return int(caller.get("usuario_id") or args.get("usuario_id") or 1)


async def productividad_capture_page(args: dict, caller: dict) -> dict:
    try:
        data = await ext_cmd("capture_page_context", args, timeout=12)
    except Exception:
        data = await ext_cmd("capture_active_tab", args, timeout=12)
        data = {
            "titulo": data.get("tab", {}).get("title"),
            "url": data.get("tab", {}).get("url"),
            "contenido": data.get("text"),
            "metadata": {},
        }
    db = await get_db()
    cur = await db.execute(
        """INSERT INTO productividad_capturas
           (usuario_id, tipo, titulo, url, favicon, seleccion, contenido, html_limpio, metadata_json, origen)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            _uid(args, caller), args.get("tipo") or "page", data.get("titulo") or data.get("title"),
            data.get("url"), data.get("favicon"), data.get("seleccion") or data.get("selection"),
            data.get("contenido") or data.get("text"), data.get("html_limpio") or data.get("html"),
            _json(data.get("metadata") or data.get("meta") or {}), "tool",
        ),
    )
    await db.commit()
    data["captura_id"] = cur.lastrowid
    return {"ok": True, "data": data, "text": f"Captura guardada #{cur.lastrowid}: {data.get('titulo') or data.get('url') or 'pagina'}"}


async def productividad_research_page(args: dict, caller: dict) -> dict:
    captura_id = args.get("captura_id")
    db = await get_db()
    captura = None
    if captura_id:
        async with db.execute(
            "SELECT * FROM productividad_capturas WHERE id=? AND usuario_id=?",
            (captura_id, _uid(args, caller)),
        ) as cur:
            captura = await cur.fetchone()
    text = (args.get("contenido") or (captura["contenido"] if captura else "") or "").strip()
    title = args.get("titulo") or (captura["titulo"] if captura else "") or "Pagina"
    summary = text[:600] + ("..." if len(text) > 600 else "")
    cur = await db.execute(
        """INSERT INTO productividad_research
           (usuario_id, captura_id, resumen_corto, resumen_largo, entidades_json,
            argumentos_json, decisiones_json, fuentes_json, preguntas_json, prompt)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            _uid(args, caller), captura_id, summary[:240], summary, "[]", "[]", "[]",
            _json([{"titulo": title, "url": args.get("url") or (captura["url"] if captura else None)}]),
            "[]", args.get("prompt"),
        ),
    )
    await db.commit()
    return {"ok": True, "data": {"id": cur.lastrowid, "resumen": summary}, "text": summary}


async def productividad_task_from_capture(args: dict, caller: dict) -> dict:
    db = await get_db()
    uid = _uid(args, caller)
    captura = None
    if args.get("captura_id"):
        async with db.execute("SELECT * FROM productividad_capturas WHERE id=? AND usuario_id=?", (args["captura_id"], uid)) as cur:
            captura = await cur.fetchone()
    titulo = args.get("titulo") or f"Revisar {captura['titulo'] if captura else 'captura web'}"
    cur = await db.execute(
        """INSERT INTO productividad_tasks
           (usuario_id, captura_id, titulo, descripcion, url, selector, prioridad, meta_json)
           VALUES (?,?,?,?,?,?,?,?)""",
        (
            uid, args.get("captura_id"), titulo, args.get("descripcion"),
            args.get("url") or (captura["url"] if captura else None), args.get("selector"),
            args.get("prioridad") or "normal", _json(args.get("meta") or {}),
        ),
    )
    await db.commit()
    return {"ok": True, "data": {"id": cur.lastrowid, "titulo": titulo}, "text": f"Tarea creada #{cur.lastrowid}: {titulo}"}


async def productividad_clipboard_save(args: dict, caller: dict) -> dict:
    text = args.get("contenido") or args.get("text") or ""
    if not text:
        try:
            out = await ext_cmd("clipboard_read", {}, timeout=5)
            text = out.get("text") or ""
        except Exception:
            pass
    tipo = args.get("tipo") or ("codigo" if "```" in text or "function " in text else "nota")
    db = await get_db()
    cur = await db.execute(
        "INSERT INTO productividad_clipboard (usuario_id, contenido, tipo, tags_json, destino, url) VALUES (?,?,?,?,?,?)",
        (_uid(args, caller), text, tipo, _json(args.get("tags") or []), args.get("destino"), args.get("url")),
    )
    await db.commit()
    return {"ok": True, "data": {"id": cur.lastrowid, "tipo": tipo, "chars": len(text)}, "text": f"Clipboard guardado como {tipo}"}


async def productividad_forms_inspect(args: dict, caller: dict) -> dict:
    data = await ext_cmd("inspect_forms", args, timeout=10)
    return {"ok": True, "data": data, "text": f"Formularios detectados: {len(data.get('forms', [])) if isinstance(data, dict) else 0}"}


async def productividad_forms_fill(args: dict, caller: dict) -> dict:
    data = await ext_cmd("fill_form_commit", args, timeout=10)
    db = await get_db()
    await db.execute(
        "INSERT INTO productividad_form_fills (usuario_id, template_id, url, resultado_json) VALUES (?,?,?,?)",
        (_uid(args, caller), args.get("template_id"), args.get("url"), _json(data)),
    )
    await db.commit()
    return {"ok": True, "data": data, "text": "Formulario rellenado"}


async def productividad_meeting_capture(args: dict, caller: dict) -> dict:
    try:
        data = await ext_cmd("meeting_snapshot", args, timeout=10)
    except Exception:
        data = await ext_cmd("capture_page_context", args, timeout=10)
    db = await get_db()
    cur = await db.execute(
        """INSERT INTO productividad_meetings
           (usuario_id, titulo, url, plataforma, participantes_json, transcript, chat,
            resumen, decisiones_json, pendientes_json, timeline_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            _uid(args, caller), data.get("titulo") or data.get("title"), data.get("url"),
            data.get("plataforma"), _json(data.get("participantes") or []),
            data.get("transcript") or data.get("contenido") or data.get("text"),
            data.get("chat"), data.get("resumen"), _json(data.get("decisiones") or []),
            _json(data.get("pendientes") or []), _json(data.get("timeline") or []),
        ),
    )
    await db.commit()
    return {"ok": True, "data": {"id": cur.lastrowid}, "text": f"Meeting guardada #{cur.lastrowid}"}


async def productividad_tabs_list(args: dict, caller: dict) -> dict:
    data = await ext_cmd("tabs_list", args, timeout=10)
    tabs = data.get("tabs", data if isinstance(data, list) else [])
    return {"ok": True, "data": {"tabs": tabs}, "text": f"Tabs detectadas: {len(tabs)}"}


async def productividad_tabs_archive(args: dict, caller: dict) -> dict:
    tabs = args.get("tabs") or (await productividad_tabs_list(args, caller))["data"]["tabs"]
    db = await get_db()
    cur = await db.execute(
        "INSERT INTO productividad_tab_sessions (usuario_id, nombre, resumen, meta_json) VALUES (?,?,?,?)",
        (_uid(args, caller), args.get("nombre") or "Sesion de tabs", args.get("resumen"), _json(args.get("meta") or {})),
    )
    session_id = cur.lastrowid
    await db.executemany(
        """INSERT INTO productividad_tab_items
           (usuario_id, session_id, title, url, favicon, active, window_id, group_id, preview, abierto_en)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        [(_uid(args, caller), session_id, t.get("title"), t.get("url"), t.get("favicon") or t.get("favIconUrl"),
          1 if t.get("active") else 0, t.get("windowId"), t.get("groupId"), t.get("preview"), None) for t in tabs],
    )
    await db.commit()
    return {"ok": True, "data": {"id": session_id, "tabs": len(tabs)}, "text": f"Sesion archivada con {len(tabs)} tabs"}


async def productividad_price_watch(args: dict, caller: dict) -> dict:
    db = await get_db()
    cur = await db.execute(
        """INSERT INTO productividad_price_items
           (usuario_id, nombre, url, tienda, moneda, precio_objetivo, selector_precio, selector_stock, imagen)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (_uid(args, caller), args.get("nombre") or "Producto", args.get("url"), args.get("tienda"),
         args.get("moneda"), args.get("precio_objetivo"), args.get("selector_precio"), args.get("selector_stock"), args.get("imagen")),
    )
    await db.commit()
    return {"ok": True, "data": {"id": cur.lastrowid}, "text": f"Producto vigilado #{cur.lastrowid}"}


async def productividad_price_scan(args: dict, caller: dict) -> dict:
    data = await ext_cmd("price_extract", args, timeout=12)
    db = await get_db()
    cur = await db.execute(
        "INSERT INTO productividad_price_checks (usuario_id, item_id, precio, moneda, stock, raw_json) VALUES (?,?,?,?,?,?)",
        (_uid(args, caller), args.get("item_id"), data.get("precio"), data.get("moneda"), data.get("stock"), _json(data)),
    )
    await db.commit()
    return {"ok": True, "data": data | {"check_id": cur.lastrowid}, "text": f"Precio detectado: {data.get('precio') or 'n/d'}"}


def _json(data) -> str:
    import json
    return json.dumps(data if data is not None else {}, ensure_ascii=False)


def register_builtin_tools() -> None:
    register(ToolContract(
        name="aurora.workspace.list",
        description="Lista archivos y carpetas dentro del workspace permitido.",
        input_schema=schema({"path": {"type": "string", "default": "."}}),
        handler=workspace_list,
        scopes=["workspace:read"],
        tags=["workspace", "mcp"],
    ))
    register(ToolContract(
        name="aurora.workspace.read",
        description="Lee un archivo dentro del workspace permitido.",
        input_schema=schema({"path": {"type": "string"}}, ["path"]),
        handler=workspace_read,
        scopes=["workspace:read"],
        tags=["workspace", "mcp"],
    ))
    register(ToolContract(
        name="aurora.workspace.search",
        description="Busca texto o regex simple dentro del workspace permitido.",
        input_schema=schema({
            "pattern": {"type": "string"},
            "path": {"type": "string", "default": "."},
            "max_results": {"type": "integer", "default": 40},
        }, ["pattern"]),
        handler=workspace_search,
        scopes=["workspace:read"],
        tags=["workspace", "mcp"],
    ))
    register(ToolContract(
        name="aurora.nexus.shell.run",
        description="Ejecuta un comando shell dentro del workspace permitido.",
        input_schema=schema({
            "cmd": {"type": "string"},
            "cwd": {"type": "string", "default": "."},
            "timeout": {"type": "integer", "default": 30},
        }, ["cmd"]),
        handler=nexus_shell_run,
        risk="high",
        scopes=["nexus:shell"],
        requires_approval=True,
        tags=["nexus", "mcp"],
        timeout=60,
    ))
    register(ToolContract(
        name="aurora.services.health",
        description="Devuelve estado resumido de servicios internos y providers LLM.",
        input_schema=schema({"timeout_s": {"type": "number", "default": 1.0}}),
        handler=services_health,
        scopes=["services:read"],
        tags=["services", "llm", "mcp"],
    ))
    register(ToolContract(
        name="aurora.capture.page",
        description="Captura contexto limpio de la pestaña activa y lo guarda en Productividad.",
        input_schema=schema({"tipo": {"type": "string", "default": "page"}}),
        handler=productividad_capture_page,
        scopes=["capture:write"],
        tags=["productividad", "capture", "mcp"],
    ))
    register(ToolContract(
        name="aurora.research.page",
        description="Crea una entrada de research ligada a una captura o contenido web.",
        input_schema=schema({"captura_id": {"type": "integer"}, "contenido": {"type": "string"}}),
        handler=productividad_research_page,
        scopes=["research:write"],
        tags=["productividad", "research", "mcp"],
    ))
    register(ToolContract(
        name="aurora.tasks.from_capture",
        description="Crea una tarea accionable desde una captura web.",
        input_schema=schema({"captura_id": {"type": "integer"}, "titulo": {"type": "string"}}),
        handler=productividad_task_from_capture,
        scopes=["tasks:write"],
        tags=["productividad", "tasks", "mcp"],
    ))
    register(ToolContract(
        name="aurora.clipboard.save",
        description="Guarda texto de clipboard como memoria clasificada.",
        input_schema=schema({"contenido": {"type": "string"}, "tipo": {"type": "string"}}),
        handler=productividad_clipboard_save,
        scopes=["clipboard:write"],
        tags=["productividad", "clipboard", "mcp"],
    ))
    register(ToolContract(
        name="aurora.forms.inspect",
        description="Inspecciona formularios visibles en la pestaña activa.",
        input_schema=schema({}),
        handler=productividad_forms_inspect,
        risk="medium",
        scopes=["forms:read"],
        tags=["productividad", "forms", "mcp"],
    ))
    register(ToolContract(
        name="aurora.forms.fill",
        description="Rellena un formulario tras approval.",
        input_schema=schema({"form_selector": {"type": "string"}, "data": {"type": "object"}}),
        handler=productividad_forms_fill,
        risk="high",
        scopes=["forms:write"],
        requires_approval=True,
        tags=["productividad", "forms", "mcp"],
    ))
    register(ToolContract(
        name="aurora.meeting.capture",
        description="Captura transcript/chat visible de una reunion web.",
        input_schema=schema({}),
        handler=productividad_meeting_capture,
        scopes=["meeting:write"],
        tags=["productividad", "meeting", "mcp"],
    ))
    register(ToolContract(
        name="aurora.tabs.list",
        description="Lista pestañas abiertas desde la extension conectada.",
        input_schema=schema({}),
        handler=productividad_tabs_list,
        scopes=["tabs:read"],
        tags=["productividad", "tabs", "mcp"],
    ))
    register(ToolContract(
        name="aurora.tabs.archive",
        description="Archiva la sesion actual de pestañas.",
        input_schema=schema({"nombre": {"type": "string"}, "tabs": {"type": "array"}}),
        handler=productividad_tabs_archive,
        scopes=["tabs:write"],
        tags=["productividad", "tabs", "mcp"],
    ))
    register(ToolContract(
        name="aurora.price.watch",
        description="Crea un item de vigilancia de precio.",
        input_schema=schema({"nombre": {"type": "string"}, "url": {"type": "string"}}, ["url"]),
        handler=productividad_price_watch,
        scopes=["price:write"],
        tags=["productividad", "price", "mcp"],
    ))
    register(ToolContract(
        name="aurora.price.scan",
        description="Extrae precio/stock de la pestaña o URL configurada.",
        input_schema=schema({"item_id": {"type": "integer"}, "url": {"type": "string"}}),
        handler=productividad_price_scan,
        risk="medium",
        scopes=["price:scan"],
        requires_approval=True,
        tags=["productividad", "price", "mcp"],
    ))


register_builtin_tools()
