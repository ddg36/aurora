import base64
import logging

from litestar import delete, get, post
from litestar.connection import Request

from . import builtin, browser_task, cloud_ask, forge, forge_build, view_actions
from .registry import get_tool, list_tools, run_tool
from pi.ocr import extraer_texto

_ = builtin, browser_task, cloud_ask, forge, forge_build, view_actions

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


@post("/tools/{name:str}/approve-run")
async def tools_approve_run(request: Request, name: str, data: dict) -> dict:
    """Aprobación humana, explícita y ligada a una única ejecución.

    No genera un token reutilizable: el servidor ejecuta una vez y descarta la
    confirmación. Así Lyra/Cloud no pueden autoaprobar llamadas posteriores.
    """
    confirmation = str(data.get("confirmation") or "")
    expected = f"RUN {name}"
    if confirmation != expected:
        return {
            "tool": name, "ok": False, "approval_required": True,
            "error": f"Confirmación inválida. Escribí exactamente {expected}",
        }
    tool = get_tool(name)
    if not tool:
        return {"tool": name, "ok": False, "error": f"Tool no encontrada: {name}"}
    args = data.get("arguments", {})
    caller = {
        "kind": "internal", "source": "aurora-human-approval",
        "usuario_id": getattr(request.state, "usuario_id", None),
    }
    result = await run_tool(name, args, caller, approved=True)
    return {"tool": name, "approved_once": True, **result}


@get("/tools/forge/packages")
async def forge_list() -> dict:
    return {"ok": True, "packages": forge.list_packages()}


@get("/tools/forge/packages/{name:str}/{version:str}")
async def forge_get(name: str, version: str) -> dict:
    try:
        package = forge._public(forge._package_dir(name, version))
        if not package.get("name"):
            return {"ok": False, "error": "Paquete no encontrado."}
        return {"ok": True, "package": package}
    except forge.ForgeError as exc:
        return {"ok": False, "error": str(exc)}


@post("/tools/forge/drafts")
async def forge_draft(data: dict) -> dict:
    try:
        package = await forge.create_draft(data.get("manifest") or {}, str(data.get("code") or ""))
        return {"ok": True, "package": package}
    except forge.ForgeError as exc:
        return {"ok": False, "error": str(exc)}


@post("/tools/forge/packages/{name:str}/{version:str}/test")
async def forge_test(name: str, version: str) -> dict:
    try:
        report = await forge.test_package(name, version)
        return {"ok": report["passed"], "report": report}
    except forge.ForgeError as exc:
        return {"ok": False, "error": str(exc)}


@post("/tools/forge/packages/{name:str}/{version:str}/approve")
async def forge_approve(request: Request, name: str, version: str, data: dict) -> dict:
    try:
        package = await forge.approve_package(
            name, version, str(data.get("confirmation") or ""),
            getattr(request.state, "usuario_id", None),
        )
        return {"ok": True, "package": package}
    except forge.ForgeError as exc:
        return {"ok": False, "error": str(exc)}


@post("/tools/forge/packages/{name:str}/{version:str}/activate")
async def forge_activate(name: str, version: str) -> dict:
    try:
        return {"ok": True, "package": await forge.activate_package(name, version)}
    except forge.ForgeError as exc:
        return {"ok": False, "error": str(exc)}


@post("/tools/forge/packages/{name:str}/{version:str}/rollback")
async def forge_rollback(name: str, version: str) -> dict:
    try:
        return {"ok": True, "package": await forge.rollback_package(name, version)}
    except forge.ForgeError as exc:
        return {"ok": False, "error": str(exc)}


@delete("/tools/forge/packages/{name:str}/{version:str}", status_code=200)
async def forge_delete(name: str, version: str) -> dict:
    try:
        return await forge.delete_package(name, version)
    except forge.ForgeError as exc:
        return {"ok": False, "error": str(exc)}


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


TOOLS_ROUTES = [
    *view_actions.VIEW_ACTION_ROUTES,
    tools_list, forge_list, forge_get, forge_draft, forge_test, forge_approve,
    forge_activate, forge_rollback, forge_delete, tools_get, tools_approve_run,
    tools_run, tools_ocr,
] + browser_task.BROWSER_TASK_ROUTES + cloud_ask.CLOUD_ASK_ROUTES + forge_build.FORGE_BUILD_ROUTES
