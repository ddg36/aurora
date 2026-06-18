import json

from tools.registry import list_tools, run_tool


def list_resources() -> list[dict]:
    return [
        {
            "uri": "aurora://tools",
            "name": "Aurora Tool Registry",
            "description": "Tools internas expuestas por Aurora.",
            "mimeType": "application/json",
        },
        {
            "uri": "aurora://services",
            "name": "Aurora Services",
            "description": "Estado de servicios y providers LLM.",
            "mimeType": "application/json",
        },
        {
            "uri": "aurora://workspace/files",
            "name": "Workspace files",
            "description": "Listado raíz del workspace permitido.",
            "mimeType": "application/json",
        },
        {
            "uri": "aurora://productividad/capturas",
            "name": "Productividad capturas",
            "description": "Capturas web guardadas por Aurora Productivity.",
            "mimeType": "application/json",
        },
        {
            "uri": "aurora://productividad/tasks",
            "name": "Productividad tasks",
            "description": "Tareas accionables creadas desde contexto web.",
            "mimeType": "application/json",
        },
        {
            "uri": "aurora://productividad/prices",
            "name": "Productividad prices",
            "description": "Productos vigilados y ultimo estado conocido.",
            "mimeType": "application/json",
        },
    ]


async def read_resource(uri: str) -> dict:
    if uri == "aurora://tools":
        data = {"tools": list_tools()}
    elif uri == "aurora://services":
        data = await run_tool("aurora.services.health", {}, {"kind": "internal", "source": "mcp-resource"})
    elif uri == "aurora://workspace/files":
        data = await run_tool("aurora.workspace.list", {"path": "."}, {"kind": "internal", "source": "mcp-resource"})
    elif uri == "aurora://productividad/capturas":
        data = await _db_rows("SELECT id, tipo, titulo, url, capturado_en FROM productividad_capturas ORDER BY id DESC LIMIT 50")
    elif uri == "aurora://productividad/tasks":
        data = await _db_rows("SELECT id, titulo, estado, prioridad, url, actualizado FROM productividad_tasks ORDER BY actualizado DESC LIMIT 50")
    elif uri == "aurora://productividad/prices":
        data = await _db_rows("SELECT id, nombre, url, moneda, precio_objetivo, activo, actualizado FROM productividad_price_items ORDER BY actualizado DESC LIMIT 50")
    else:
        return {"ok": False, "error": f"Resource no encontrado: {uri}"}
    return {
        "ok": True,
        "contents": [{
            "uri": uri,
            "mimeType": "application/json",
            "text": json.dumps(data, ensure_ascii=False, indent=2),
        }],
    }


async def _db_rows(query: str) -> dict:
    from db.connection import get_db
    db = await get_db()
    async with db.execute(query) as cur:
        rows = await cur.fetchall()
    return {"rows": [dict(r) for r in rows]}
