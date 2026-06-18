import base64
import logging

from litestar import get, post

from . import builtin
from .registry import get_tool, list_tools, run_tool
from gemita.providers import choose_provider, complete_chat, list_models

_ = builtin

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
async def tools_run(name: str, data: dict) -> dict:
    args = data.get("arguments", data)
    caller = data.get("caller") or {"kind": "internal", "source": "aurora-api"}
    result = await run_tool(name, args, caller)
    return {"tool": name, **result}


@post("/tools/ocr")
async def tools_ocr(data: dict) -> dict:
    raw = data.get("image", "")
    if not raw:
        return {"ok": False, "error": "No image provided"}
    b64 = raw.split(",", 1)[1] if raw.startswith("data:image") else raw

    models = await list_models()
    vision = [m for m in models if m.capabilities.get("vision")]
    if not vision:
        return {"ok": False, "error": "No hay modelo con visión disponible"}

    model = vision[0]
    provider, model_name = await choose_provider(model.id)

    prompt = "Extraé TODO el texto visible en esta imagen. Devolvé solo el texto, sin comentarios ni descripciones."
    try:
        if provider.kind == "ollama-native":
            payload = {
                "model": model_name,
                "messages": [{"role": "user", "content": prompt, "images": [b64]}],
                "stream": False,
                "options": {"num_predict": 4096},
            }
        else:
            payload = {
                "model": model_name,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                    ],
                }],
                "max_tokens": 4096,
                "stream": False,
            }
        text = await complete_chat(model.id, payload, 120)
        return {"ok": True, "text": text.strip(), "model": model_name}
    except Exception as e:
        log.exception("OCR failed")
        return {"ok": False, "error": str(e)}


TOOLS_ROUTES = [tools_list, tools_get, tools_run, tools_ocr]
