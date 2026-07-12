import base64
import logging

from litestar import get, post
from litestar.connection import Request

from . import builtin, browser_task, cloud_ask
from .registry import get_tool, list_tools, run_tool
from pi.ocr import extraer_texto

_ = builtin, browser_task, cloud_ask

log = logging.getLogger("aurora.tools.ocr")


@get("/tools")
async def tools_list() -> dict:
    return {"ok": True, "tools": list_tools()}


@get("/tools/{name:str}")
async def tools_get(name: str) -> dict:
    tool = get_tool(name)
    if not tool:
        return {"ok": False, "error": f"Tool no encontrada: {name}"}
    return {"ok": True, "tool": tool.public()}


@post("/tools/{name:str}/run")
async def tools_run(request: Request, name: str, data: dict) -> dict:
    args = data.get("arguments", data)
    # caller lo decide el SERVIDOR: pasó el auth guard → interno.
    # Nunca se confía en data["caller"] (bypass trivial del gate de riesgo).
    caller = {
        "kind": "internal",
        "source": "aurora-api",
        "usuario_id": getattr(request.state, "usuario_id", None),
    }
    result = await run_tool(name, args, caller)
    return {"tool": name, **result}


@post("/tools/ocr")
async def tools_ocr(data: dict) -> dict:
    raw = data.get("image", "")
    if not raw:
        return {"ok": False, "error": "No image provided"}
    mime_type = "image/png"
    if raw.startswith("data:image") and ";base64," in raw:
        cabecera, b64 = raw.split(";base64,", 1)
        mime_type = cabecera[5:] or mime_type
    else:
        b64 = raw

    try:
        texto, modelo_id = await extraer_texto(b64, mime_type=mime_type)
        if not texto:
            return {"ok": False, "error": "No se detectó texto en la imagen"}
        return {"ok": True, "text": texto, "model": modelo_id}
    except Exception as e:
        log.exception("OCR failed")
        return {"ok": False, "error": str(e)}


TOOLS_ROUTES = [tools_list, tools_get, tools_run, tools_ocr] + browser_task.BROWSER_TASK_ROUTES + cloud_ask.CLOUD_ASK_ROUTES
