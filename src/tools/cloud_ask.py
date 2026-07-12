# ══════════════════════════════════════════════════════
#  ASK CLOUD — tool que deja a pi (Lyra) preguntarle al LLM de la nube.
#  pi NO puede tocar el iframe (vive en el browser); el round-trip es:
#    pi → aurora-tools.ts → POST /tools/cloud/ask
#       → emitir bus {tipo:'cloud_ask', reqId} → el browser corre askCloud
#       → POST /tools/cloud/answer {reqId, text} → resuelve el Future → pi.
#  El único que tiene la sesión logueada del LLM es el browser, por eso
#  la pregunta sale y vuelve por ahí.
# ══════════════════════════════════════════════════════

import asyncio
import uuid

from litestar import post
from litestar.connection import Request

from eventos_ws import emitir

from .contract import ToolContract, schema
from .registry import register

_PENDIENTES: dict[str, asyncio.Future] = {}
TIMEOUT_S = 100


async def cloud_ask(args: dict, caller: dict) -> dict:
    prompt = str(args.get("prompt") or "").strip()
    if not prompt:
        return {"ok": False, "error": "Falta 'prompt': qué preguntarle al LLM de la nube."}
    uid = caller.get("usuario_id")
    if uid is None:
        return {"ok": False, "error": "Sin usuario en contexto."}

    req_id = uuid.uuid4().hex
    fut = asyncio.get_running_loop().create_future()
    _PENDIENTES[req_id] = fut
    try:
        # ai es una pista opcional; el browser usa el panel cloud que esté
        # abierto. Sin cloud abierto, el browser responde con error.
        await emitir(uid, "cloud_ask", {"reqId": req_id, "ai": args.get("ai"), "prompt": prompt})
        try:
            texto = await asyncio.wait_for(fut, TIMEOUT_S)
        except asyncio.TimeoutError:
            return {"ok": False, "error": "El LLM de la nube no respondió (¿está abierto el panel ☁ Cloud?)."}
        return {"ok": True, "respuesta": texto}
    finally:
        _PENDIENTES.pop(req_id, None)


@post("/tools/cloud/answer")
async def cloud_answer(request: Request, data: dict) -> dict:
    req_id = str(data.get("reqId") or "")
    fut = _PENDIENTES.get(req_id)
    if fut and not fut.done():
        fut.set_result(str(data.get("text") or ""))
        return {"ok": True}
    return {"ok": False, "error": "reqId desconocido o ya resuelto"}


CLOUD_ASK_ROUTES = [cloud_answer]


def register_cloud_ask() -> None:
    register(ToolContract(
        name="ask_cloud",
        description=(
            "Le pregunta al LLM de la nube (Gemini/ChatGPT/Claude, el que el usuario "
            "tenga abierto en el panel ☁ Cloud) y devuelve su respuesta. Usar cuando el "
            "usuario pida una segunda opinión de otro modelo, o para comparar respuestas. "
            "Requiere que el panel Cloud esté abierto."
        ),
        input_schema=schema(
            {
                "prompt": {"type": "string", "description": "Qué preguntarle al LLM de la nube."},
                "ai": {"type": "string", "description": "Pista opcional del modelo (gemini/chatgpt/claude); usa el panel abierto."},
            },
            ["prompt"],
        ),
        handler=cloud_ask,
        risk="low",
        tags=["cloud", "llm"],
        timeout=TIMEOUT_S + 10,
    ))


register_cloud_ask()
