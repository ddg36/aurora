"""AIHub operativo: transporte auditado entre agentes y acciones UI."""

import asyncio
import time
import uuid
from collections import deque

from litestar import get, post
from litestar.connection import Request

from eventos_ws import emitir

from .contract import ToolContract, schema
from .registry import register


_PENDIENTES: dict[str, tuple[asyncio.Future, int]] = {}
_AUDIT = deque(maxlen=200)
TIMEOUT_S = 20


async def _roundtrip(op: str, args: dict, caller: dict) -> dict:
    uid = caller.get("usuario_id")
    if uid is None:
        return {"ok": False, "error": "Sin usuario en contexto."}
    view = str(args.get("view") or "").strip()
    if op == "invoke" and not view:
        return {"ok": False, "error": "view es requerido."}
    action = str(args.get("action") or "").strip()
    if op == "invoke" and not action:
        return {"ok": False, "error": "action es requerido."}
    action_args = args["args"] if "args" in args else {}
    if not isinstance(action_args, dict):
        return {"ok": False, "error": "args debe ser un objeto JSON."}

    req_id = uuid.uuid4().hex
    fut = asyncio.get_running_loop().create_future()
    _PENDIENTES[req_id] = (fut, uid)
    started = time.monotonic()
    try:
        await emitir(uid, "ai_view_request", {
            "reqId": req_id, "op": op, "view": view or None,
            "action": action or None, "args": action_args,
        })
        try:
            result = await asyncio.wait_for(fut, TIMEOUT_S)
        except asyncio.TimeoutError:
            result = {"ok": False, "error": "Aurora UI no respondió a la acción semántica.", "reason": "timeout"}
        _AUDIT.appendleft({
            "request_id": req_id, "usuario_id": uid, "operation": op,
            "view": view or None, "action": action or None,
            "ok": bool(result.get("ok")), "error": result.get("error"),
            "duration_ms": round((time.monotonic() - started) * 1000),
            "ts": int(time.time()),
        })
        return result
    finally:
        _PENDIENTES.pop(req_id, None)


async def view_describe(args: dict, caller: dict) -> dict:
    return await _roundtrip("describe", args, caller)


async def view_invoke(args: dict, caller: dict) -> dict:
    return await _roundtrip("invoke", args, caller)


@post("/tools/view/action/answer")
async def view_action_answer(request: Request, data: dict) -> dict:
    req_id = str(data.get("reqId") or "")
    pending = _PENDIENTES.get(req_id)
    uid = getattr(request.state, "usuario_id", None)
    if not pending or pending[1] != uid:
        return {"ok": False, "error": "reqId desconocido, vencido o de otro usuario."}
    fut = pending[0]
    if fut.done():
        return {"ok": False, "error": "reqId ya resuelto."}
    result = data.get("result")
    fut.set_result(result if isinstance(result, dict) else {"ok": False, "error": "Resultado UI inválido."})
    return {"ok": True}


@get("/tools/view/actions/audit")
async def view_actions_audit(request: Request) -> dict:
    uid = getattr(request.state, "usuario_id", None)
    return {"ok": True, "events": [event for event in _AUDIT if event["usuario_id"] == uid]}


VIEW_ACTION_ROUTES = [view_action_answer, view_actions_audit]


register(ToolContract(
    name="view_describe",
    description="Descubre vistas y acciones semánticas de Aurora. Si se indica view, monta la vista y devuelve su contrato actualizado.",
    input_schema=schema({"view": {"type": "string", "description": "Vista opcional: canvas, scratchpad o md-reader."}}),
    handler=view_describe, risk="low", tags=["aihub", "view", "discovery"], timeout=TIMEOUT_S + 5,
))

register(ToolContract(
    name="view_invoke",
    description="Invoca una acción semántica de una vista de Aurora sin buscar botones en el DOM. Usa view_describe primero.",
    input_schema=schema({
        "view": {"type": "string"}, "action": {"type": "string"},
        "args": {"type": "object"},
    }, ["view", "action"]),
    handler=view_invoke, risk="medium", tags=["aihub", "view", "action"], timeout=TIMEOUT_S + 5,
))
