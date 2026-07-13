"""Lyra → bus → Cloud Duo → Tool Forge → Lyra."""

import asyncio
import uuid

from litestar import post
from litestar.connection import Request

from eventos_ws import emitir

from .contract import ToolContract, schema
from .registry import register


_PENDIENTES: dict[str, asyncio.Future] = {}
TIMEOUT_S = 10 * 60


async def forge_build(args: dict, caller: dict) -> dict:
    objective = str(args.get("objective") or "").strip()
    if len(objective) < 12:
        return {"ok": False, "error": "objective debe describir una herramienta verificable."}
    uid = caller.get("usuario_id")
    if uid is None:
        return {"ok": False, "error": "Sin usuario en contexto."}
    req_id = uuid.uuid4().hex
    fut = asyncio.get_running_loop().create_future()
    _PENDIENTES[req_id] = fut
    spec = {
        "objective": objective,
        "name_hint": args.get("name_hint"),
        "requirements": args.get("requirements") or [],
        "acceptance_tests": args.get("acceptance_tests") or [],
    }
    try:
        await emitir(uid, "forge_build", {"reqId": req_id, "spec": spec})
        try:
            result = await asyncio.wait_for(fut, TIMEOUT_S)
        except asyncio.TimeoutError:
            return {"ok": False, "error": "Tool Forge agotó 10 minutos sin entregar un paquete.", "reason": "timeout"}
        return result if isinstance(result, dict) else {"ok": False, "error": "Respuesta Forge inválida."}
    finally:
        _PENDIENTES.pop(req_id, None)


@post("/tools/forge/build/answer")
async def forge_build_answer(request: Request, data: dict) -> dict:
    req_id = str(data.get("reqId") or "")
    fut = _PENDIENTES.get(req_id)
    if fut and not fut.done():
        fut.set_result(data.get("result") or {"ok": False, "error": "El navegador no devolvió resultado."})
        return {"ok": True}
    return {"ok": False, "error": "reqId desconocido o ya resuelto"}


FORGE_BUILD_ROUTES = [forge_build_answer]


register(ToolContract(
    name="forge_build",
    description=(
        "Convoca el Duo Cloud de Aurora para diseñar, implementar y probar una nueva herramienta para Lyra. "
        "Entrega un draft tested; la instalación siempre requiere aprobación humana posterior."
    ),
    input_schema=schema({
        "objective": {"type": "string", "description": "Capacidad concreta y verificable que necesita Lyra."},
        "name_hint": {"type": "string", "description": "Nombre sugerido forge.nombre."},
        "requirements": {"type": "array", "items": {"type": "string"}},
        "acceptance_tests": {"type": "array", "items": {"type": "string"}},
    }, ["objective"]),
    handler=forge_build,
    risk="low",
    tags=["forge", "cloud", "orchestration"],
    timeout=TIMEOUT_S + 30,
))
